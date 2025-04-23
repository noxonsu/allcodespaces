// exchangeService.js
const axios = require('axios');
const config = require('./config'); // Import shared configuration

// Cache for exchange rates { timestamp: number, data: object | null }
let ratesCache = { timestamp: 0, data: null };

/**
 * Parses a commission string (e.g., "+1.0%", "-0.8%") into a calculation factor.
 * @param {string} commissionString - The commission string from config.
 * @returns {number} - The factor to multiply the base amount by (e.g., 0.99 for +1.0%, 1.008 for -0.8%). Returns 1 if parsing fails.
 */
function parseCommission(commissionString) {
    if (typeof commissionString !== 'string') return 1;
    try {
        const percentage = parseFloat(commissionString.replace('%', ''));
        if (isNaN(percentage)) return 1;
        // Factor = 1 - (commission / 100)
        // Example +1.0% -> 1 - (1.0 / 100) = 0.99 (user gets less)
        // Example -0.8% -> 1 - (-0.8 / 100) = 1 + 0.008 = 1.008 (user gets more)
        return 1 - (percentage / 100);
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
 * Fetches and caches exchange rates for USDT/RUB.
 * @returns {Promise<object|null>} - The cached rates data or null on failure.
 */
async function getExchangeRates() {
    const currentTime = Date.now() / 1000; // Seconds
    console.log('[ExchangeService] getExchangeRates: Checking cache...');

    // Check cache validity based on USDT_RUB data presence
    if (currentTime - ratesCache.timestamp > config.RATES_CACHE_TTL_SECONDS || !ratesCache.data || !ratesCache.data.USDT_RUB) {
        console.log('[ExchangeService] Cache miss or expired. Fetching new USDT/RUB rate...');
        try {
            // Only fetch USDT -> RUB direction details
            const usdtRubData = await fetchDirectionDetails(config.USDT_RUB_DIRECTION_ID);

            if (!usdtRubData) {
                console.error('[ExchangeService] Failed to fetch USDT/RUB direction details. Returning stale cache if available.');
                return ratesCache.data; // Return potentially stale data
            }

            const formattedData = {
                USDT_RUB: {
                    pair: 'USDT/RUB',
                    // course_give: How many RUB for 1 USDT
                    rate: parseFloat(usdtRubData.data.course_give) || 0,
                    rawData: usdtRubData.data
                }
                // No longer fetching or storing RUB_USDT data
            };

            // Basic validation of fetched rate
            if (formattedData.USDT_RUB.rate <= 0) {
                 console.error('[ExchangeService] Fetched zero or negative USDT/RUB rate. Returning stale cache if available.');
                 // Keep potentially valid old cache data if new fetch failed validation
                 return ratesCache.data && ratesCache.data.USDT_RUB ? ratesCache.data : null;
            }

            ratesCache = {
                timestamp: currentTime,
                data: formattedData // Only contains USDT_RUB now
            };
            console.log('[ExchangeService] USDT/RUB exchange rate updated successfully in cache.');
            return formattedData;

        } catch (error) {
            console.error(`[ExchangeService] Error updating rates cache: ${error.message}`);
            // Return stale data only if it contains USDT_RUB
            return ratesCache.data && ratesCache.data.USDT_RUB ? ratesCache.data : null;
        }
    } else {
        console.log('[ExchangeService] Cache hit. Returning cached rates.');
        return ratesCache.data;
    }
}

/**
 * Calculates exchange amount using cached rates and configured commission for both directions.
 * @param {'USDT_RUB' | 'RUB_USDT'} direction - The direction key.
 * @param {number} amount - The amount to convert.
 * @param {number} calcAction - (No longer used for API call, but kept for consistency).
 * @returns {Promise<object|null>} - The calculation result or null on error.
 */
async function calculateExchangeAmount(direction, amount, calcAction = 1) {
    // Normalize direction to uppercase to handle case-insensitive input
    direction = direction.toUpperCase();
    console.log(`[ExchangeService] Calculating for direction: ${direction}, amount: ${amount} using cached rate and commission.`);

    // Ensure rates are fetched/current before calculating
    const rates = await getExchangeRates();
    if (!rates || !rates.USDT_RUB) {
         console.error(`[ExchangeService] Cannot calculate ${direction}: Missing USDT_RUB rate in cache.`);
         return null;
    }
    // Always use the cached calculation method now
    return calculateWithCachedRates(direction, amount); // This function is synchronous
}

/**
 * Calculation using cached rates, applying configured commission. Now synchronous.
 * @param {'USDT_RUB' | 'RUB_USDT'} direction - The direction key.
 * @param {number} amount - The amount to convert.
 * @returns {object|null} - Mocked calculation result or null if cached rates unavailable
 */
function calculateWithCachedRates(direction, amount) {
    // Normalize direction to uppercase to handle case-insensitive input
    direction = direction.toUpperCase();
    console.log(`[ExchangeService] Using cached rate calculation for ${direction}`);

    // Check if we have cached rates (specifically USDT_RUB)
    if (!ratesCache.data || !ratesCache.data.USDT_RUB) {
        console.error('[ExchangeService] No USDT_RUB cached rate available for calculation');
        return null;
    }

    const rates = ratesCache.data;
    let result = null;
    const usdtRubRate = rates.USDT_RUB.rate;

    if (usdtRubRate <= 0) {
        console.error('[ExchangeService] Invalid USDT_RUB rate (<=0) in cache for calculation.');
        return null;
    }

    if (direction === 'USDT_RUB') {
        // Calculate USDT -> RUB using cached rate and commission
        const baseConvertedAmount = amount * usdtRubRate; // Base RUB amount
        const commissionFactor = parseCommission(config.USDT_RUB_DISPLAY_COMMISSION);
        const finalAmount = baseConvertedAmount * commissionFactor; // Apply commission

        console.log(`[ExchangeService] USDT_RUB Cached Calc: Base=${baseConvertedAmount.toFixed(2)}, CommFactor=${commissionFactor}, Final=${finalAmount.toFixed(2)}`);

        result = {
            sum_get: finalAmount.toFixed(2), // Final RUB amount after commission
            course_give: usdtRubRate.toString(), // Base rate (RUB per USDT)
            com_give: config.USDT_RUB_DISPLAY_COMMISSION || 'N/A',
            // Indicate calculation method - always true now for both directions
            is_fallback_calculation: true
        };
    }
    else if (direction === 'RUB_USDT') {
        // Convert RUB to USDT using the USDT_RUB rate and apply commission
        const baseConvertedAmount = amount / usdtRubRate; // Base USDT amount
        const commissionFactor = parseCommission(config.RUB_USDT_DISPLAY_COMMISSION);
        const finalAmount = baseConvertedAmount * commissionFactor; // Apply commission

        console.log(`[ExchangeService] RUB_USDT Cached Calc: Base=${baseConvertedAmount.toFixed(6)}, CommFactor=${commissionFactor}, Final=${finalAmount.toFixed(2)}`);

        result = {
            sum_get: finalAmount.toFixed(2), // Final USDT amount after commission
            course_give: (1 / usdtRubRate).toFixed(6), // Base inverse rate for display (USDT per RUB)
            com_give: config.RUB_USDT_DISPLAY_COMMISSION || 'N/A',
            // Indicate calculation method - always true now for both directions
            is_fallback_calculation: true
        };
    }

    console.log('[ExchangeService] Cached calculation result (commission applied):', result);
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
        const rates = await getExchangeRates();

        if (!rates || !rates.USDT_RUB || rates.USDT_RUB.rate <= 0) {
            bot.sendMessage(chatId, 'Не удалось получить актуальный курс USDT/RUB. Попробуйте позже.');
            return;
        }

        const rateData = rates.USDT_RUB;
        const displayRate = rateData.rate.toFixed(2); // How many RUB for 1 USDT

        if (amount === null) {
            // Just show the current rate
             responseText = `*USDT → RUB*\n\n` +
                           `Текущий курс: *1 USDT ≈ ${displayRate} RUB*\n` +
                           `Комиссия (ориентировочно): ${config.USDT_RUB_DISPLAY_COMMISSION}\n` + // Using display commission
                           `_Последнее обновление: ${new Date(ratesCache.timestamp * 1000).toISOString()}_`;
        } else {
             // Validate amount
            if (amount <= 0) {
                bot.sendMessage(chatId, 'Пожалуйста, укажите положительную сумму. Пример: `/USDT_RUB 100`');
                return;
            }
            // Calculate conversion using cached rate and commission
            const calcResult = await calculateExchangeAmount('USDT_RUB', amount, 1); // calc_action is ignored now

            if (!calcResult) {
                bot.sendMessage(chatId, 'Не удалось рассчитать обмен по текущему курсу. Попробуйте позже.');
                return;
            }

            // Use the base USDT/RUB rate for display consistency
            const calculatedRateDisplay = parseFloat(rateData.rate).toFixed(2);
            const resultAmount = parseFloat(calcResult.sum_get).toFixed(2); // Amount received in RUB (commission adjusted)
            // Use configured commission string for display
            const commissionInfo = config.USDT_RUB_DISPLAY_COMMISSION ? `Комиссия: ${config.USDT_RUB_DISPLAY_COMMISSION}` : '';

            // Notice that calculation is based on cached/approximated rate
            const fallbackNotice = '\n_Примечание: расчет произведен по кэшированному курсу._';

            responseText = `*Конвертация USDT → RUB*\n\n` +
                           `Отдаете: ${amount.toFixed(2)} USDT\n` +
                           `Курс: *1 USDT ≈ ${calculatedRateDisplay} RUB*\n` + // Display base rate
                           (commissionInfo ? `${commissionInfo}\n` : '') + // Show commission string
                           `Получаете: *${resultAmount} RUB*\n` +
                           `_Расчет актуален на момент запроса._${fallbackNotice}`; // Always show notice
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
        // Fetch rates (will now only contain USDT_RUB)
        const rates = await getExchangeRates();

        // Check if USDT_RUB rate is available
        if (!rates || !rates.USDT_RUB || rates.USDT_RUB.rate <= 0) {
            bot.sendMessage(chatId, 'Не удалось получить актуальный курс обмена. Попробуйте позже.');
            return;
        }

        // Use the USDT_RUB rate for display
        const rateData = rates.USDT_RUB;
        const displayRate = rateData.rate.toFixed(2); // How many RUB for 1 USDT

        if (amount === null) {
            // Show the current rate in USDT -> RUB format
             responseText = `*RUB → USDT*\n\n` +
                           `Текущий курс: *1 USDT ≈ ${displayRate} RUB*\n` + // Display consistent rate format
                           `Комиссия (ориентировочно): ${config.RUB_USDT_DISPLAY_COMMISSION}\n`+ // Still use configured display commission
                           `_Последнее обновление: ${new Date(ratesCache.timestamp * 1000).toISOString()}_`;
        } else {
            // Validate amount
            if (amount <= 0) {
                bot.sendMessage(chatId, 'Пожалуйста, укажите положительную сумму. Пример: `/RUB_USDT 10000`');
                return;
            }
             // Calculate conversion using cached rate and commission
            const calcResult = await calculateExchangeAmount('RUB_USDT', amount, 1); // calc_action is ignored now

            if (!calcResult) {
                bot.sendMessage(chatId, 'Не удалось рассчитать обмен по текущему курсу. Попробуйте позже.');
                return;
            }

            // Use the USDT/RUB rate for display consistency in the calculation result message
            const calculatedRateDisplay = parseFloat(rateData.rate).toFixed(2); // Use the base USDT/RUB rate for display
            const resultAmount = parseFloat(calcResult.sum_get).toFixed(2); // Amount received in USDT (commission adjusted)
            // Use configured commission string for display
            const commissionInfo = config.RUB_USDT_DISPLAY_COMMISSION ? `Комиссия: ${config.RUB_USDT_DISPLAY_COMMISSION}` : '';

            // Notice that calculation is based on cached/approximated rate
            const fallbackNotice = '\n_Примечание: расчет произведен по кэшированному курсу._';

            responseText = `*Конвертация RUB → USDT*\n\n` +
                           `Отдаете: ${amount.toFixed(2)} RUB\n` +
                           `Курс: *1 USDT ≈ ${calculatedRateDisplay} RUB*\n` + // Display rate as USDT ≈ RUB
                           (commissionInfo ? `${commissionInfo}\n` : '') + // Show commission string
                           `Получаете: *${resultAmount} USDT*\n` +
                           `_Расчет актуален на момент запроса._${fallbackNotice}`; // Always show notice
        }

        bot.sendMessage(chatId, responseText, { parse_mode: 'Markdown' });

    } catch (error) {
        console.error('[ExchangeService] Error in handleRubUsdtCommand:', error);
        bot.sendMessage(chatId, 'Произошла внутренняя ошибка при обработке команды RUB_USDT. Попробуйте позже.');
    }
}

module.exports = {
    getExchangeRates,
    calculateExchangeAmount, // Now always uses cached calculation
    handleUsdtRubCommand,
    handleRubUsdtCommand,
};