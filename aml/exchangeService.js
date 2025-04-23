// exchangeService.js
const axios = require('axios');
const config = require('./config'); // Import shared configuration

// Re-add cache for rates but with a shorter lifespan
// Structure: { timestamp: number, data: object | null }
let ratesCache = { timestamp: 0, data: null };
// Refresh interval in seconds
const RATES_REFRESH_INTERVAL = 60; // Refresh every 60 seconds

/**
 * Parses a commission string (e.g., "+1.0%", "-0.8%") into a calculation factor.
 * @param {string} commissionString - The commission string from config.
 * @returns {number} - The factor to multiply the base amount by.
 *                    For "+1.0%", returns 1.01 (user gets more).
 *                    For "-0.8%", returns 0.992 (user gets less).
 */
function parseCommission(commissionString) {
    if (typeof commissionString !== 'string') return 1;
    try {
        const percentage = parseFloat(commissionString.replace('%', ''));
        if (isNaN(percentage)) return 1;
        
        // Fix the interpretation of signs:
        // +X% means user gets X% more (bonus), factor = 1 + (X/100)
        // -X% means user gets X% less (fee), factor = 1 - (X/100)
        return 1 + (percentage / 100);
        
    } catch (e) {
        console.error(`[ExchangeService] Error parsing commission string "${commissionString}":`, e);
        return 1; // Default to no commission adjustment on error
    }
}

/**
 * Fetches detailed direction info from SafeExchange API.
 * @param {number} directionId - The ID of the exchange direction.
 * @returns {Promise<object|null>} - The direction data or null on error.
 */
async function fetchDirectionDetails(directionId) {
    console.log(`[ExchangeService] Fetching details for direction ID: ${directionId}`);
    try {
        const response = await axios.post(`${config.EXCHANGE_API_URL}/get_direction`,
            { direction_id: directionId },
            {
                headers: {
                    'API-LOGIN': config.EXCHANGE_API_LOGIN,
                    'API-KEY': config.EXCHANGE_API_KEY,
                    'Content-Type': 'application/json'
                }
            }
        );
        console.log(`[ExchangeService] /get_direction ID ${directionId} status: ${response.status}`);
        if (response.status === 200 && response.data) {
            return response.data;
        } else {
            console.error(`[ExchangeService] Failed to get details for direction ${directionId}: Status ${response.status}`);
            return null;
        }
    } catch (error) {
        console.error(`[ExchangeService] Error fetching details for direction ${directionId}:`, error.message);
        if (error.response) {
            console.error('API Error Status:', error.response.status);
            console.error('API Error Data:', JSON.stringify(error.response.data));
        }
        return null;
    }
}

/**
 * Fetches or returns cached exchange rate for USDT/RUB.
 * Refreshes cache if it's older than RATES_REFRESH_INTERVAL seconds.
 * @returns {Promise<object|null>} - The rate data { USDT_RUB: { rate: number, rawData: object } } or null on failure.
 */
async function getExchangeRates() {
    const currentTime = Date.now() / 1000; // Current time in seconds
    
    // Check if cache is valid (less than 60 seconds old and contains data)
    if (currentTime - ratesCache.timestamp < RATES_REFRESH_INTERVAL && ratesCache.data && ratesCache.data.USDT_RUB) {
        console.log(`[ExchangeService] Using cached rate (${Math.round(currentTime - ratesCache.timestamp)}s old)`);
        return ratesCache.data;
    }
    
    console.log('[ExchangeService] Fetching fresh USDT/RUB rate from API...');
    try {
        // Fetch USDT -> RUB direction details
        const usdtRubData = await fetchDirectionDetails(config.USDT_RUB_DIRECTION_ID);

        if (!usdtRubData || !usdtRubData.data) { // Check inner data object
            console.error('[ExchangeService] Failed to fetch USDT/RUB direction details or data is missing.');
            return ratesCache.data && ratesCache.data.USDT_RUB ? ratesCache.data : null; // Return existing cache if available
        }

        // Log the raw value before parsing
        const rawCourseGive = usdtRubData.data.course_give;
        console.log(`[ExchangeService] Raw course_give from API: ${rawCourseGive} (Type: ${typeof rawCourseGive})`);

        const parsedRate = parseFloat(rawCourseGive);
        console.log(`[ExchangeService] Parsed rate: ${parsedRate}`);

        // Validate the parsed rate strictly
        if (isNaN(parsedRate) || parsedRate <= 0) {
            console.error(`[ExchangeService] Fetched invalid USDT/RUB rate (NaN or <=0): ${parsedRate}. Raw value was: ${rawCourseGive}.`);
            return ratesCache.data && ratesCache.data.USDT_RUB ? ratesCache.data : null; // Return existing cache if available
        }

        // Update cache
        const formattedData = {
            USDT_RUB: {
                pair: 'USDT/RUB',
                rate: parsedRate,
                rawData: usdtRubData.data
            }
        };
        
        ratesCache = {
            timestamp: currentTime,
            data: formattedData
        };
        
        console.log(`[ExchangeService] USDT/RUB exchange rate updated and cached at ${new Date(currentTime * 1000).toISOString()}`);
        return formattedData;

    } catch (error) {
        console.error(`[ExchangeService] Error fetching rates from API: ${error.message}`);
        // Return existing cache if available, otherwise null
        return ratesCache.data && ratesCache.data.USDT_RUB ? ratesCache.data : null;
    }
}

/**
 * Calculates exchange amount using the fetched/cached rate and configured commission.
 * @param {'USDT_RUB' | 'RUB_USDT'} direction - The direction key.
 * @param {number} amount - The amount to convert.
 * @returns {Promise<object|null>} - The calculation result or null on error.
 */
async function calculateExchangeAmount(direction, amount) {
    // Normalize direction to uppercase
    direction = direction.toUpperCase();
    console.log(`[ExchangeService] Calculating for direction: ${direction}, amount: ${amount} using live rate and commission.`);

    // Fetch the current rate directly
    const ratesData = await getExchangeRates();
    if (!ratesData || !ratesData.USDT_RUB || !(ratesData.USDT_RUB.rate > 0)) {
         console.error(`[ExchangeService] Cannot calculate ${direction}: Failed to fetch or invalid live USDT_RUB rate.`);
         return null;
    }

    const usdtRubRate = ratesData.USDT_RUB.rate;
    // Perform calculation using the fetched rate
    return calculateWithLiveRate(direction, amount, usdtRubRate); // Pass the live rate
}

/**
 * Calculation using live rate, applying configured commission. Synchronous.
 * @param {'USDT_RUB' | 'RUB_USDT'} direction - The direction key.
 * @param {number} amount - The amount to convert.
 * @param {number} usdtRubRate - The live USDT/RUB rate fetched from API.
 * @returns {object|null} - Calculation result or null if rate is invalid.
 */
function calculateWithLiveRate(direction, amount, usdtRubRate) {
    // Direction should already be uppercase
    console.log(`[ExchangeService] Performing live rate calculation for ${direction}`);

    if (!(usdtRubRate > 0)) { // Check if rate is valid positive number
        console.error('[ExchangeService] Invalid live USDT_RUB rate (<=0 or NaN) provided for calculation.');
        return null;
    }

    let result = null;

    if (direction === 'USDT_RUB') {
        // Calculate USDT -> RUB using live rate and commission
        const baseConvertedAmount = amount * usdtRubRate; // Base RUB amount
        const commissionFactor = parseCommission(config.USDT_RUB_DISPLAY_COMMISSION);
        const finalAmount = baseConvertedAmount * commissionFactor; // Apply commission

        console.log(`[ExchangeService] USDT_RUB Live Calc: Base=${baseConvertedAmount.toFixed(2)}, CommFactor=${commissionFactor}, Final=${finalAmount.toFixed(2)}`);

        result = {
            sum_get: finalAmount.toFixed(2), // Final RUB amount after commission
            course_give: usdtRubRate.toString(), // Live rate (RUB per USDT)
            com_give: config.USDT_RUB_DISPLAY_COMMISSION || 'N/A',
            // is_fallback_calculation removed
        };
    }
    else if (direction === 'RUB_USDT') {
        // Convert RUB to USDT using the live USDT_RUB rate and apply commission
        const baseConvertedAmount = amount / usdtRubRate; // Base USDT amount
        const commissionFactor = parseCommission(config.RUB_USDT_DISPLAY_COMMISSION);
        const finalAmount = baseConvertedAmount * commissionFactor; // Apply commission

        console.log(`[ExchangeService] RUB_USDT Live Calc: Base=${baseConvertedAmount.toFixed(6)}, CommFactor=${commissionFactor}, Final=${finalAmount.toFixed(2)}`);

        result = {
            sum_get: finalAmount.toFixed(2), // Final USDT amount after commission
            course_give: (1 / usdtRubRate).toFixed(6), // Live inverse rate for display (USDT per RUB)
            com_give: config.RUB_USDT_DISPLAY_COMMISSION || 'N/A',
             // is_fallback_calculation removed
        };
    }

    console.log('[ExchangeService] Live calculation result (commission applied):', result);
    return result;
}

/**
 * Handles the /USDT_RUB command logic.
 * @param {object} bot - The Telegram bot instance.
 * @param {number} chatId - The chat ID.
 * @param {number|null} amount - The amount provided by the user, or null.
 */
async function handleUsdtRubCommand(bot, chatId, amount) {
    try {
        let responseText;
        // Always fetch the latest rate
        const rates = await getExchangeRates();

        // Check if rate fetch was successful and rate is valid
        if (!rates || !rates.USDT_RUB || !(rates.USDT_RUB.rate > 0)) {
            console.error('[ExchangeService] handleUsdtRubCommand: Failed to fetch or invalid live USDT_RUB rate.');
            bot.sendMessage(chatId, 'Не удалось получить актуальный курс USDT/RUB. Пожалуйста, проверьте позже.');
            return;
        }

        const rateData = rates.USDT_RUB;
        const displayRate = rateData.rate.toFixed(2); // How many RUB for 1 USDT

        if (amount === null) {
            // Just show the current rate - remove timestamp
             responseText = `*USDT → RUB*\n\n` +
                           `Текущий курс: *1 USDT ≈ ${displayRate} RUB*\n` +
                           `Комиссия (ориентировочно): ${config.USDT_RUB_DISPLAY_COMMISSION}`;
                           // Removed timestamp line
        } else {
             // Validate amount
            if (amount <= 0) {
                bot.sendMessage(chatId, 'Пожалуйста, укажите положительную сумму. Пример: `/USDT_RUB 100`');
                return;
            }
            // Calculate conversion using live rate and commission
            const calcResult = await calculateExchangeAmount('USDT_RUB', amount);

            if (!calcResult) {
                bot.sendMessage(chatId, 'Не удалось рассчитать обмен по текущему курсу. Попробуйте позже.');
                return;
            }

            // Use the live USDT/RUB rate for display consistency
            const calculatedRateDisplay = parseFloat(rateData.rate).toFixed(2);
            const resultAmount = parseFloat(calcResult.sum_get).toFixed(2);
            const commissionInfo = config.USDT_RUB_DISPLAY_COMMISSION ? `Комиссия: ${config.USDT_RUB_DISPLAY_COMMISSION}` : '';
            // Removed fallbackNotice

            responseText = `*Конвертация USDT → RUB*\n\n` +
                           `Отдаете: ${amount.toFixed(2)} USDT\n` +
                           `Курс: *1 USDT ≈ ${calculatedRateDisplay} RUB*\n` +
                           (commissionInfo ? `${commissionInfo}\n` : '') +
                           `Получаете: *${resultAmount} RUB*\n` +
                           `_Расчет актуален на момент запроса._`; // Removed fallback notice
        }
        bot.sendMessage(chatId, responseText, { parse_mode: 'Markdown' });

    } catch (error) {
        console.error('[ExchangeService] Error in handleUsdtRubCommand:', error);
        bot.sendMessage(chatId, 'Произошла внутренняя ошибка при обработке команды USDT_RUB. Попробуйте позже.');
    }
}

/**
 * Handles the /RUB_USDT command logic.
 * @param {object} bot - The Telegram bot instance.
 * @param {number} chatId - The chat ID.
 * @param {number|null} amount - The amount provided by the user, or null.
 */
async function handleRubUsdtCommand(bot, chatId, amount) {
     try {
        let responseText;
        // Always fetch the latest rate
        const rates = await getExchangeRates();

        // Check if rate fetch was successful and rate is valid
        if (!rates || !rates.USDT_RUB || !(rates.USDT_RUB.rate > 0)) {
            console.error('[ExchangeService] handleRubUsdtCommand: Failed to fetch or invalid live USDT_RUB rate.');
            bot.sendMessage(chatId, 'Не удалось получить актуальный курс обмена. Попробуйте позже.');
            return;
        }

        // Use the USDT_RUB rate for display
        const rateData = rates.USDT_RUB;
        const displayRate = rateData.rate.toFixed(2); // How many RUB for 1 USDT

        if (amount === null) {
            // Show the current rate in USDT -> RUB format - remove timestamp
             responseText = `*RUB → USDT*\n\n` +
                           `Текущий курс: *1 USDT ≈ ${displayRate} RUB*\n` +
                           `Комиссия (ориентировочно): ${config.RUB_USDT_DISPLAY_COMMISSION}`;
                           // Removed timestamp line
        } else {
            // Validate amount
            if (amount <= 0) {
                bot.sendMessage(chatId, 'Пожалуйста, укажите положительную сумму. Пример: `/RUB_USDT 10000`');
                return;
            }
             // Calculate conversion using live rate and commission
            const calcResult = await calculateExchangeAmount('RUB_USDT', amount);

            if (!calcResult) {
                bot.sendMessage(chatId, 'Не удалось рассчитать обмен по текущему курсу. Попробуйте позже.');
                return;
            }

            // Use the live USDT/RUB rate for display consistency
            const calculatedRateDisplay = parseFloat(rateData.rate).toFixed(2);
            const resultAmount = parseFloat(calcResult.sum_get).toFixed(2);
            const commissionInfo = config.RUB_USDT_DISPLAY_COMMISSION ? `Комиссия: ${config.RUB_USDT_DISPLAY_COMMISSION}` : '';
            // Removed fallbackNotice

            responseText = `*Конвертация RUB → USDT*\n\n` +
                           `Отдаете: ${amount.toFixed(2)} RUB\n` +
                           `Курс: *1 USDT ≈ ${calculatedRateDisplay} RUB*\n` +
                           (commissionInfo ? `${commissionInfo}\n` : '') +
                           `Получаете: *${resultAmount} USDT*\n` +
                           `_Расчет актуален на момент запроса._`; // Removed fallback notice
        }

        bot.sendMessage(chatId, responseText, { parse_mode: 'Markdown' });

    } catch (error) {
        console.error('[ExchangeService] Error in handleRubUsdtCommand:', error);
        bot.sendMessage(chatId, 'Произошла внутренняя ошибка при обработке команды RUB_USDT. Попробуйте позже.');
    }
}

module.exports = {
    getExchangeRates, // Fetches live rate now
    calculateExchangeAmount, // Uses live rate now
    // Renamed calculateWithCachedRates to calculateWithLiveRate internally
    handleUsdtRubCommand,
    handleRubUsdtCommand,
};