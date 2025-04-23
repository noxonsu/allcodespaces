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
 * @param {string|null|undefined} commissionString - The commission string from command or null/undefined.
 * @returns {number} - The factor to multiply the base amount by. Defaults to 1.
 */
function parseCommission(commissionString) {
    // Default to 1 (no commission) if input is not a string or is empty
    if (typeof commissionString !== 'string' || commissionString.trim() === '') return 1;
    try {
        const percentage = parseFloat(commissionString.replace('%', ''));
        if (isNaN(percentage)) return 1; // Return 1 if parsing fails

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
 * Calculation using live rate, applying provided commission factor. Synchronous.
 * @param {'USDT_RUB' | 'RUB_USDT'} direction - The direction key.
 * @param {number} amount - The amount to convert.
 * @param {number} usdtRubRate - The live USDT/RUB rate fetched from API.
 * @param {number} commissionFactor - The commission factor (e.g., 1.01 for +1%, 0.99 for -1%).
 * @returns {object|null} - Calculation result or null if rate is invalid.
 */
function calculateWithLiveRate(direction, amount, usdtRubRate, commissionFactor) {
    // Direction should already be uppercase
    console.log(`[ExchangeService] Performing live rate calculation for ${direction} with commission factor ${commissionFactor}`);

    if (!(usdtRubRate > 0)) { // Check if rate is valid positive number
        console.error('[ExchangeService] Invalid live USDT_RUB rate (<=0 or NaN) provided for calculation.');
        return null;
    }
    // Ensure commissionFactor is a valid number, default to 1 if not
    if (typeof commissionFactor !== 'number' || isNaN(commissionFactor)) {
        console.warn(`[ExchangeService] Invalid commissionFactor received: ${commissionFactor}. Defaulting to 1.`);
        commissionFactor = 1;
    }


    let result = null;

    if (direction === 'USDT_RUB') {
        // Calculate USDT -> RUB using live rate and commission factor
        const baseConvertedAmount = amount * usdtRubRate; // Base RUB amount
        const finalAmount = baseConvertedAmount * commissionFactor; // Apply commission

        console.log(`[ExchangeService] USDT_RUB Live Calc: Base=${baseConvertedAmount.toFixed(2)}, CommFactor=${commissionFactor}, Final=${finalAmount.toFixed(2)}`);

        result = {
            sum_get: finalAmount.toFixed(2), // Final RUB amount after commission
            course_give: usdtRubRate.toString(), // Live rate (RUB per USDT)
            // com_give removed - commission is now dynamic per request
        };
    }
    else if (direction === 'RUB_USDT') {
        // Convert RUB to USDT using the live USDT_RUB rate and apply commission factor
        const baseConvertedAmount = amount / usdtRubRate; // Base USDT amount
        const finalAmount = baseConvertedAmount * commissionFactor; // Apply commission

        console.log(`[ExchangeService] RUB_USDT Live Calc: Base=${baseConvertedAmount.toFixed(6)}, CommFactor=${commissionFactor}, Final=${finalAmount.toFixed(2)}`);

        result = {
            sum_get: finalAmount.toFixed(2), // Final USDT amount after commission
            course_give: (1 / usdtRubRate).toFixed(6), // Live inverse rate for display (USDT per RUB)
            // com_give removed - commission is now dynamic per request
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
 * @param {string|null} commissionString - Optional commission string (e.g., "+1%", "-0.5%").
 */
async function handleUsdtRubCommand(bot, chatId, amount, commissionString = null) {
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
        const liveRate = rateData.rate;
        
        // Parse commission string if provided
        const commissionFactor = parseCommission(commissionString);
        // Calculate the rate with commission applied
        const adjustedDisplayRate = (liveRate * commissionFactor).toFixed(2);
        
        // Commission info display removed as requested

        if (amount === null) {
            // Just show the current rate with commission applied but without explaining the commission
            responseText = `*USDT → RUB*\n\n` +
                          `Текущий курс: *1 USDT ≈ ${adjustedDisplayRate} RUB*`;
        } else {
             // Validate amount
            if (amount <= 0) {
                bot.sendMessage(chatId, 'Пожалуйста, укажите положительную сумму. Пример: `/USDT_RUB 100` или `/USDT_RUB 100 +1%`');
                return;
            }

            // Calculate conversion using live rate and parsed commission factor
            const calcResult = calculateWithLiveRate('USDT_RUB', amount, liveRate, commissionFactor);

            if (!calcResult) {
                bot.sendMessage(chatId, 'Не удалось рассчитать обмен по текущему курсу. Попробуйте позже.');
                return;
            }

            const resultAmount = parseFloat(calcResult.sum_get).toFixed(2);

            responseText = `*Конвертация USDT → RUB*\n\n` +
                           `Отдаете: ${amount.toFixed(2)} USDT\n` +
                           `Курс: *1 USDT ≈ ${adjustedDisplayRate} RUB*\n` +
                           `Получаете: *${resultAmount} RUB*\n\n` +
                           `_Расчет актуален на момент запроса._`;
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
 * @param {string|null} commissionString - Optional commission string (e.g., "+1%", "-0.5%").
 */
async function handleRubUsdtCommand(bot, chatId, amount, commissionString = null) {
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

        const rateData = rates.USDT_RUB;
        const liveRate = rateData.rate; // USDT/RUB rate
        
        // Parse commission string if provided
        const commissionFactor = parseCommission(commissionString);
        // For RUB_USDT, we still use the base rate for display
        const displayRate = liveRate.toFixed(2);
        
        // Commission info display removed as requested

        if (amount === null) {
            // Show the current rate without commission info
             responseText = `*RUB → USDT*\n\n` +
                           `Текущий курс: *1 USDT ≈ ${displayRate} RUB*`;
        } else {
            // Validate amount
            if (amount <= 0) {
                bot.sendMessage(chatId, 'Пожалуйста, укажите положительную сумму. Пример: `/RUB_USDT 10000` или `/RUB_USDT 10000 -0.5%`');
                return;
            }

             // Calculate conversion using live rate and parsed commission factor
            const calcResult = calculateWithLiveRate('RUB_USDT', amount, liveRate, commissionFactor);

            if (!calcResult) {
                bot.sendMessage(chatId, 'Не удалось рассчитать обмен по текущему курсу. Попробуйте позже.');
                return;
            }

            const resultAmount = parseFloat(calcResult.sum_get).toFixed(2);

            responseText = `*Конвертация RUB → USDT*\n\n` +
                           `Отдаете: ${amount.toFixed(2)} RUB\n` +
                           `Курс: *1 USDT ≈ ${displayRate} RUB*\n` +
                           `Получаете: *${resultAmount} USDT*\n\n` +
                           `_Расчет актуален на момент запроса._`;
        }

        bot.sendMessage(chatId, responseText, { parse_mode: 'Markdown' });

    } catch (error) {
        console.error('[ExchangeService] Error in handleRubUsdtCommand:', error);
        bot.sendMessage(chatId, 'Произошла внутренняя ошибка при обработке команды RUB_USDT. Попробуйте позже.');
    }
}

module.exports = {
    getExchangeRates,
    handleUsdtRubCommand,
    handleRubUsdtCommand,
};