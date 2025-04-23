const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Validate environment variables
if (!process.env.BOT_TOKEN || process.env.BOT_TOKEN === 'YOUR_BOT_TOKEN') {
    console.error('Error: BOT_TOKEN environment variable is not set correctly.');
    console.error('Please set it in the .env file or environment variables.');
    process.exit(1);
}

if (!process.env.AML_API_KEY) {
    console.error('Warning: AML_API_KEY environment variable is not set.');
    console.error('AML check functionality will not work properly.');
}

// SafeExchange API authentication
if (!process.env.EXCHANGE_API_LOGIN || !process.env.EXCHANGE_API_KEY) {
    console.error('Error: EXCHANGE_API_LOGIN or EXCHANGE_API_KEY environment variables are not set.');
    console.error('Exchange rate functionality will not work properly.');
    process.exit(1);
}

// Bot configuration
const BOT_TOKEN = process.env.BOT_TOKEN;
// Updated API configuration
const EXCHANGE_API_URL = 'https://safexchange.pro/api/userapi/v1';
const EXCHANGE_API_LOGIN = process.env.EXCHANGE_API_LOGIN;
const EXCHANGE_API_KEY = process.env.EXCHANGE_API_KEY;
const AML_API_KEY = process.env.AML_API_KEY;

// Validate AML API key
if (!AML_API_KEY) {
    console.error('Error: AML_API_KEY is not set. Please check your environment variables.');
    process.exit(1);
}

// Update the API URL to the correct endpoint
const AML_API_URL = 'https://core.tr.energy/api/aml/check';

// Hardcoded commissions (can be modified directly in the code)
const USDT_RUB_COMMISSION = 1.0; // +1% for USDT → RUB
const RUB_USDT_COMMISSION = -0.8; // -0.8% for RUB → USDT

// Hardcoded direction IDs for the exchange pairs (set these to match your exchange's direction IDs)
const USDT_RUB_DIRECTION_ID = 1; // Replace with your actual direction ID for USDT→RUB
const RUB_USDT_DIRECTION_ID = 2; // Replace with your actual direction ID for RUB→USDT

// Initialize bot
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// Clear any previously set commands
bot.setMyCommands([])
    .then(() => console.log('Bot commands cleared successfully.'))
    .catch(err => console.error('Error clearing bot commands:', err));

// Cache for exchange rates
let ratesCache = { timestamp: 0, data: null };

// Updated function to fetch exchange rates from SafeExchange API
async function fetchExchangeRates() {
    const currentTime = Date.now() / 1000; // Convert to seconds
    console.log('[fetchExchangeRates] Checking cache...');

    // Update rates if cache is older than 60 seconds
    if (currentTime - ratesCache.timestamp > 60 || !ratesCache.data) {
        console.log('[fetchExchangeRates] Cache miss or expired. Fetching new rates...');
        try {
            // Get all exchange directions
            console.log(`[fetchExchangeRates] POST ${EXCHANGE_API_URL}/get_directions`);
            const response = await axios.post(`${EXCHANGE_API_URL}/get_directions`, {}, {
                headers: {
                    'API-LOGIN': EXCHANGE_API_LOGIN,
                    'API-KEY': EXCHANGE_API_KEY,
                    'Content-Type': 'application/json'
                }
            });
            console.log(`[fetchExchangeRates] /get_directions status: ${response.status}`);

            if (response.status === 200) {
                const directions = response.data;
                console.log(`[fetchExchangeRates] Received ${directions?.length || 0} directions.`);
                
                // Get detailed information for USDT/RUB direction
                console.log(`[fetchExchangeRates] POST ${EXCHANGE_API_URL}/get_direction for ID ${USDT_RUB_DIRECTION_ID}`);
                const usdtRubResponse = await axios.post(`${EXCHANGE_API_URL}/get_direction`, {
                    direction_id: USDT_RUB_DIRECTION_ID
                }, {
                    headers: {
                        'API-LOGIN': EXCHANGE_API_LOGIN,
                        'API-KEY': EXCHANGE_API_KEY,
                        'Content-Type': 'application/json'
                    }
                });
                console.log(`[fetchExchangeRates] /get_direction USDT/RUB status: ${usdtRubResponse.status}`);
                
                // Get detailed information for RUB/USDT direction
                console.log(`[fetchExchangeRates] POST ${EXCHANGE_API_URL}/get_direction for ID ${RUB_USDT_DIRECTION_ID}`);
                const rubUsdtResponse = await axios.post(`${EXCHANGE_API_URL}/get_direction`, {
                    direction_id: RUB_USDT_DIRECTION_ID
                }, {
                    headers: {
                        'API-LOGIN': EXCHANGE_API_LOGIN,
                        'API-KEY': EXCHANGE_API_KEY,
                        'Content-Type': 'application/json'
                    }
                });
                console.log(`[fetchExchangeRates] /get_direction RUB/USDT status: ${rubUsdtResponse.status}`);
                
                // Format the data to match our requirements
                const formattedData = [
                    {
                        pair: 'USDT/RUB',
                        rate: parseFloat(usdtRubResponse.data.course_give),
                        usdtRubData: usdtRubResponse.data
                    },
                    {
                        pair: 'RUB/USDT', 
                        rate: parseFloat(rubUsdtResponse.data.course_give),
                        rubUsdtData: rubUsdtResponse.data
                    }
                ];
                
                ratesCache = {
                    timestamp: currentTime,
                    data: formattedData
                };
                
                console.log('[fetchExchangeRates] Exchange rates updated successfully in cache.');
                return formattedData;
            } else {
                console.error(`[fetchExchangeRates] Failed to fetch rates: ${response.status}`);
                return ratesCache.data; // Return stale data if available
            }
        } catch (error) {
            console.error(`[fetchExchangeRates] Error fetching rates: ${error.message}`);
            if (error.response) {
                console.error('[fetchExchangeRates] API response error status:', error.response.status);
                console.error('[fetchExchangeRates] API response error data:', JSON.stringify(error.response.data));
            } else if (error.request) {
                 console.error('[fetchExchangeRates] API request error:', error.request);
            } else {
                 console.error('[fetchExchangeRates] General error:', error);
            }
            return ratesCache.data; // Return stale data if available
        }
    } else {
        console.log('[fetchExchangeRates] Cache hit. Returning cached rates.');
    }
    return ratesCache.data;
}

function calculateRate(amount, direction, rate, commission) {
    if (direction === 'USDT_RUB') {
        // For USDT → RUB: add commission
        return amount * rate * (1 + commission / 100);
    } else {
        // For RUB → USDT: subtract commission
        return amount / rate * (1 - commission / 100);
    }
}

// Updated calculation function that can use the calculator API
async function calculateExchangeAmount(direction, amount, calcAction) {
    console.log(`[calculateExchangeAmount] Calculating for direction: ${direction}, amount: ${amount}, action: ${calcAction}`);
    try {
        const directionId = direction === 'USDT_RUB' ? USDT_RUB_DIRECTION_ID : RUB_USDT_DIRECTION_ID;
        console.log(`[calculateExchangeAmount] Using direction ID: ${directionId}`);
        
        const requestPayload = {
            direction_id: directionId,
            calc_amount: amount,
            calc_action: calcAction
        };
        const requestHeaders = {
            'API-LOGIN': EXCHANGE_API_LOGIN,
            'API-KEY': EXCHANGE_API_KEY,
            'Content-Type': 'application/json'
        };

        console.log(`[calculateExchangeAmount] POST ${EXCHANGE_API_URL}/get_calc with payload:`, JSON.stringify(requestPayload));
        const response = await axios.post(`${EXCHANGE_API_URL}/get_calc`, requestPayload, { headers: requestHeaders });
        
        console.log(`[calculateExchangeAmount] /get_calc status: ${response.status}`);
        console.log(`[calculateExchangeAmount] /get_calc response data:`, JSON.stringify(response.data));

        if (response.status === 200) {
            console.log('[calculateExchangeAmount] Calculation successful.');
            return response.data;
        } else {
            console.error(`[calculateExchangeAmount] Failed to calculate exchange: ${response.status}`);
            return null;
        }
    } catch (error) {
        console.error(`[calculateExchangeAmount] Error calculating exchange: ${error.message}`);
        if (error.response) {
            console.error('[calculateExchangeAmount] API response error status:', error.response.status);
            console.error('[calculateExchangeAmount] API response error data:', JSON.stringify(error.response.data));
        } else if (error.request) {
             console.error('[calculateExchangeAmount] API request error:', error.request);
        } else {
             console.error('[calculateExchangeAmount] General error:', error);
        }
        return null;
    }
}

// Handle /USDT_RUB command
bot.onText(/\/USDT_RUB(?:\s+(\d+\.?\d*))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    
    try {
        let response;
        const amount = match[1] ? parseFloat(match[1]) : null;
        
        if (!amount) {
            // Just show the current rate
            const rates = await fetchExchangeRates();
            if (!rates) {
                bot.sendMessage(chatId, 'Failed to fetch exchange rates. Please try again later.');
                return;
            }
            
            const rateData = rates.find(r => r.pair === 'USDT/RUB');
            if (!rateData) {
                bot.sendMessage(chatId, 'USDT/RUB rate not available.');
                return;
            }
            
            const rate = parseFloat(rateData.rate);
            response = `USDT → RUB Rate: ${rate.toFixed(2)} RUB\n` +
                       `Commission: +${USDT_RUB_COMMISSION}% (fixed)\n` +
                       `Last updated: ${new Date().toISOString()}`;
        } else {
            // Calculate conversion
            if (amount <= 0) {
                bot.sendMessage(chatId, 'Please provide a valid amount. Example: /USDT_RUB 100');
                return;
            }
            
            // Use the API calculator
            const calcResult = await calculateExchangeAmount('USDT_RUB', amount, 1); // 1 = amount in USDT
            
            if (!calcResult) {
                bot.sendMessage(chatId, 'Failed to calculate exchange. Please try again later.');
                return;
            }
            
            response = `USDT → RUB Conversion\n` +
                       `Amount: ${amount.toFixed(2)} USDT\n` +
                       `Rate: ${calcResult.course_give.toFixed(2)} RUB\n` +
                       `Commission: ${calcResult.com_give}\n` +
                       `Result: ${calcResult.sum_get.toFixed(2)} RUB\n` +
                       `Last updated: ${new Date().toISOString()}`;
        }
        
        bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
    } catch (error) {
        console.error('Error in USDT_RUB command:', error);
        bot.sendMessage(chatId, 'An error occurred while processing your request. Please try again later.');
    }
});

// Handle /RUB_USDT command
bot.onText(/\/RUB_USDT(?:\s+(\d+\.?\d*))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const commandText = msg.text;
    console.log(`[/RUB_USDT] Received command: "${commandText}" from user ${userId}`);
    
    try {
        let responseText; // Renamed from 'response' to avoid confusion with API response
        const amountStr = match[1];
        const amount = amountStr ? parseFloat(amountStr) : null;
        console.log(`[/RUB_USDT] Parsed amount: ${amount}`);
        
        if (amount === null) {
            console.log('[/RUB_USDT] No amount provided. Fetching current rate.');
            // Just show the current rate
            const rates = await fetchExchangeRates();
            if (!rates) {
                console.error('[/RUB_USDT] Failed to fetch rates for display.');
                bot.sendMessage(chatId, 'Failed to fetch exchange rates. Please try again later.');
                return;
            }
            console.log('[/RUB_USDT] Rates fetched successfully for display.');
            
            const rateData = rates.find(r => r.pair === 'RUB/USDT');
            if (!rateData || !rateData.rate) {
                 console.error('[/RUB_USDT] RUB/USDT rate data not found or invalid in fetched rates:', rateData);
                bot.sendMessage(chatId, 'RUB/USDT rate not available.');
                return;
            }
            
            const rate = parseFloat(rateData.rate);
             if (isNaN(rate) || rate === 0) {
                console.error(`[/RUB_USDT] Invalid rate value for RUB/USDT: ${rateData.rate}`);
                bot.sendMessage(chatId, 'RUB/USDT rate is currently invalid. Please try again later.');
                return;
            }
            console.log(`[/RUB_USDT] Found rate: ${rate}`);
            responseText = `RUB → USDT Rate: ${(1/rate).toFixed(6)} USDT\n` +
                           `Commission: ${RUB_USDT_COMMISSION}% (fixed)\n` + // Note: This commission might not reflect the API's calculation
                           `Last updated: ${new Date(ratesCache.timestamp * 0).toISOString()}`; // Use cache timestamp
        } else {
            console.log(`[/RUB_USDT] Amount provided: ${amount}. Calculating conversion.`);
            // Calculate conversion
            if (amount <= 0) {
                console.log('[/RUB_USDT] Invalid amount provided (<= 0).');
                bot.sendMessage(chatId, 'Please provide a valid positive amount. Example: /RUB_USDT 1000');
                return;
            }
            
            // Use the API calculator
            console.log('[/RUB_USDT] Calling calculateExchangeAmount...');
            const calcResult = await calculateExchangeAmount('RUB_USDT', amount, 1); // 1 = amount in RUB
            
            if (!calcResult) {
                console.error('[/RUB_USDT] calculateExchangeAmount returned null.');
                bot.sendMessage(chatId, 'Failed to calculate exchange. Please try again later.');
                return;
            }
            console.log('[/RUB_USDT] Calculation result received:', JSON.stringify(calcResult));

            if (isNaN(calcResult.course_give) || calcResult.course_give === 0) {
                 console.error(`[/RUB_USDT] Invalid course_give in calculation result: ${calcResult.course_give}`);
                 bot.sendMessage(chatId, 'Calculation resulted in an invalid rate. Please try again later.');
                 return;
            }
            
            responseText = `RUB → USDT Conversion\n` +
                           `Amount: ${amount.toFixed(2)} RUB\n` +
                           `Rate: ${(1/calcResult.course_give).toFixed(6)} USDT\n` + // Using the rate from calculation
                           `Commission: ${calcResult.com_give || 'N/A'}\n` + // Using commission from calculation
                           `Result: ${calcResult.sum_get.toFixed(2)} USDT\n` +
                           `Last updated: ${new Date().toISOString()}`; // Use current time for calculation result
        }
        
        console.log(`[/RUB_USDT] Sending response to chat ${chatId}: ${responseText}`);
        bot.sendMessage(chatId, responseText, { parse_mode: 'Markdown' });
        console.log('[/RUB_USDT] Response sent successfully.');

    } catch (error) {
        console.error(`[/RUB_USDT] Error processing command "${commandText}" for user ${userId}:`, error);
        // Check if it's an Axios error to log specific details
        if (axios.isAxiosError(error)) {
            if (error.response) {
                console.error('[/RUB_USDT] API Error Status:', error.response.status);
                console.error('[/RUB_USDT] API Error Data:', JSON.stringify(error.response.data));
            } else if (error.request) {
                console.error('[/RUB_USDT] API Request Error:', error.request);
            }
        }
        // Send a generic error message to the user
        bot.sendMessage(chatId, 'An error occurred while processing your request. Please try again later or contact support if the issue persists.');
    }
});

// --- Helper Functions ---

// Fetches the list of reports and finds one by address
async function getExistingReport(walletAddress) {
    try {
        const headers = {
            'Accept': 'application/json',
            'Authorization': `Bearer ${AML_API_KEY.trim()}`
        };
        const listApiUrl = 'https://core.tr.energy/api/aml'; // Base URL for listing
        console.log(`Checking existing reports for address: ${walletAddress}`);
        const response = await axios.get(listApiUrl, { headers });

        if (response.status === 200) {
            const reports = response.data.data || [];
            const foundReport = reports.find(report => report.address === walletAddress);
            if (foundReport) {
                console.log(`Found existing report for ${walletAddress}`);
                return foundReport; // Return the report object if found
            }
        } else {
            console.error(`Failed to fetch AML reports list during check: Status ${response.status}`);
        }
    } catch (error) {
        console.error(`Error fetching AML reports list during check for ${walletAddress}:`, error.message);
        // Don't throw, just return null, allowing the POST request to proceed
    }
    console.log(`No existing report found for ${walletAddress} in the list.`);
    return null; // Return null if not found or if there was an error fetching list
}

// Helper function to escape markdown special characters
function escapeMarkdown(text) {
    // Escape special markdown characters: _ * ` [ ]
    return text.replace(/([_*\[\]`])/g, '\\$1');
}

// Formats the AML report data into a user-friendly message
function formatReportMessage(reportData, walletAddress) {
    if (!reportData) {
        return `Не удалось получить данные для адреса ${walletAddress}. Попробуйте позже.`;
    }

    const riskScore = reportData.context?.riskScore ?? 'N/A';
    const entities = reportData.context?.entities || [];

    let entityDetails = '';
    if (entities.length > 0) {
        entityDetails = '\n\nОбнаруженные риски:\n';
        entities.forEach(entity => {
            const score = typeof entity.riskScore === 'number' ? entity.riskScore.toFixed(3) : 'N/A';
            const level = entity.level || 'N/A';
            entityDetails += `• ${entity.entity || 'Unknown'}: ${score} (${level})\n`;
        });
    } else if (riskScore !== 'N/A') {
        entityDetails = '\n\nДетали по рискам не предоставлены';
    }

    // Format message using HTML instead of Markdown
    return {
        text: `<b>AML Проверка кошелька</b>\n` +
              `Адрес: <code>${walletAddress}</code>\n` +
              `Итоговый риск: <b>${riskScore}</b>${entityDetails}`,
        options: { parse_mode: 'HTML' }
    };
}

// --- Bot Command Handlers ---

// Add strict validation patterns as constants at the top of the file
const WALLET_VALIDATION = {
    TRON: {
        pattern: /^T[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]{33}$/,
        length: 34,
        example: 'T...'
    },
    BTC: {
        // Bitcoin address formats:
        // Legacy: 1... (26-35 chars)
        // P2SH: 3... (26-35 chars)
        // Bech32: bc1... (42 chars for native SegWit)
        pattern: /^(bc1[02-9ac-hj-np-z]{39}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$/,
        minLength: 26,
        maxLength: 42,
        example: '1... или 3... или bc1...'
    }
};

// Helper function to validate wallet address
function validateWalletAddress(address) {
    if (!address || typeof address !== 'string') {
        return { isValid: false, type: null, error: 'Адрес не указан или имеет неверный формат' };
    }

    // Remove any whitespace
    address = address.trim();

    // Check TRON address
    if (address.startsWith('T')) {
        if (address.length !== WALLET_VALIDATION.TRON.length) {
            return { isValid: false, type: null, error: `TRON адрес должен содержать ${WALLET_VALIDATION.TRON.length} символов` };
        }
        if (WALLET_VALIDATION.TRON.pattern.test(address)) {
            return { isValid: true, type: 'tron', error: null };
        }
    }
    
    // Check Bitcoin address
    if (address.startsWith('1') || address.startsWith('3') || address.startsWith('bc1')) {
        if (address.length < WALLET_VALIDATION.BTC.minLength || address.length > WALLET_VALIDATION.BTC.maxLength) {
            return { isValid: false, type: null, error: `Bitcoin адрес должен содержать от ${WALLET_VALIDATION.BTC.minLength} до ${WALLET_VALIDATION.BTC.maxLength} символов` };
        }
        if (WALLET_VALIDATION.BTC.pattern.test(address)) {
            return { isValid: true, type: 'btc', error: null };
        }
    }

    return { 
        isValid: false, 
        type: null, 
        error: 'Неверный формат адреса. Поддерживаются:\n' +
              `• TRON адреса (начинаются с T, ${WALLET_VALIDATION.TRON.length} символов)\n` +
              `• Bitcoin адреса (начинаются с 1, 3 или bc1, ${WALLET_VALIDATION.BTC.minLength}-${WALLET_VALIDATION.BTC.maxLength} символов)`
    };
}

// Handle /aml command
bot.onText(/\/aml(?:\s+(.+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const walletAddress = match?.[1]?.trim();

    // Check if wallet address is provided
    if (!walletAddress) {
        bot.sendMessage(chatId, 'Пожалуйста, укажите адрес кошелька (TRON или Bitcoin).\n\n' +
                              'Примеры:\n' +
                              `• TRON: /aml ${WALLET_VALIDATION.TRON.example}\n` +
                              `• BTC: /aml ${WALLET_VALIDATION.BTC.example}`, 
            { parse_mode: 'Markdown' });
        return;
    }

    // Validate wallet address
    const validation = validateWalletAddress(walletAddress);
    if (!validation.isValid) {
        bot.sendMessage(chatId, `❌ ${validation.error}`);
        return;
    }

    try {
        // *** Step 1: Check if report already exists in the list ***
        const existingReport = await getExistingReport(walletAddress);
        if (existingReport) {
            const { text, options } = formatReportMessage(existingReport, walletAddress);
            bot.sendMessage(chatId, text, options);
            return; // Exit if found in the list
        }

        // *** Step 2: If not found, create a new report via POST ***
        // Send a "thinking" message
        const processingMsg = await bot.sendMessage(
            chatId, 
            `Запрашиваю новый AML отчет для адреса <code>${walletAddress}</code>...`, 
            { parse_mode: 'HTML' }
        );

        let blockchainType = validation.type;
        const requestData = {
            address: walletAddress,
            blockchain: blockchainType
        };
        const headers = {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${AML_API_KEY.trim()}`
        };

        console.log(`Sending NEW AML check request for address: ${walletAddress}`);
        const response = await axios.post(AML_API_URL, requestData, { headers });

        // *** Step 3: Handle POST response ***
        if (response.status === 200 || response.status === 201) {
            let responseData = response.data.data || response.data;
            let status = responseData.status;

            // Check if status is pending - wait 5 seconds before checking again
            if (status === 'pending') {
                // Update the thinking message
                await bot.editMessageText(
                    `Статус проверки AML: ${status}. Пожалуйста, подождите 5 секунд...`, 
                    { 
                        chat_id: chatId, 
                        message_id: processingMsg.message_id,
                        parse_mode: 'HTML'
                    }
                );
                
                // Wait 5 seconds
                await new Promise(resolve => setTimeout(resolve, 5000));
                
                // Update user that we're checking the list
                await bot.editMessageText(
                    `Проверяю обновленный статус для адреса <code>${walletAddress}</code>...`, 
                    { 
                        chat_id: chatId, 
                        message_id: processingMsg.message_id,
                        parse_mode: 'HTML'
                    }
                );

                // Check the list again after waiting
                const updatedReport = await getExistingReport(walletAddress);
                
                if (updatedReport) {
                    const { text, options } = formatReportMessage(updatedReport, walletAddress);
                    bot.sendMessage(chatId, text, options);
                } else {
                    // Still not found in the list after waiting
                    bot.sendMessage(chatId, `Отчет для <code>${walletAddress}</code> все еще обрабатывается. Пожалуйста, используйте команду /aml ${walletAddress} через несколько секунд для получения результатов.`, { parse_mode: 'HTML' });
                }
                
                // Delete the "processing" message
                bot.deleteMessage(chatId, processingMsg.message_id).catch(err => console.error('Error deleting message:', err));
            } else {
                // Status is not pending, format and send result directly
                const { text, options } = formatReportMessage(responseData, walletAddress);
                // Delete the "processing" message
                bot.deleteMessage(chatId, processingMsg.message_id).catch(err => console.error('Error deleting message:', err));
                // Send the result
                bot.sendMessage(chatId, text, options);
            }
        } else {
            // Should not happen if axios doesn't throw for non-2xx
            console.error(`AML check POST unexpected status: ${response.status} for address ${walletAddress}`);
            bot.deleteMessage(chatId, processingMsg.message_id).catch(err => console.error('Error deleting message:', err));
            bot.sendMessage(chatId, `Ошибка AML проверки (Статус: ${response.status}). Попробуйте позже.`);
        }
    } catch (error) {
        // Generic error handling for the entire process (GET pre-check or POST)
        console.error(`AML process failed for address ${walletAddress}. Error:`, error.message);
        let userErrorMessage = 'Произошла ошибка при проверке кошелька. Пожалуйста, попробуйте позже.';

        if (axios.isAxiosError(error)) {
            if (error.response) {
                console.error('API Error Data:', error.response.data);
                const status = error.response.status;
                if (status === 422) {
                    const apiErrorMsg = error.response.data?.error || 'Неверные данные';
                    userErrorMessage = `Ошибка AML проверки: ${apiErrorMsg}. Пожалуйста, проверьте правильность адреса.`;
                } else if (status === 401) {
                     userErrorMessage = 'Ошибка авторизации при проверке AML. Обратитесь к администратору.';
                } else {
                    userErrorMessage = `Ошибка сервиса AML (Статус: ${status}). Попробуйте позже.`;
                }
            } else if (error.request) {
                console.error('Network Error:', error.message);
                userErrorMessage = 'Не удалось связаться с сервисом AML. Проверьте ваше интернет-соединение или попробуйте позже.';
            }
        } else {
             console.error('Non-API Error:', error);
        }
        bot.sendMessage(chatId, userErrorMessage);
    }
});

// Handle /amls command - List AML reports
bot.onText(/\/amls/, async (msg) => {
    const chatId = msg.chat.id;

    try {
        const headers = {
            'Accept': 'application/json',
            'Authorization': `Bearer ${AML_API_KEY.trim()}`
        };

        console.log('Fetching AML reports list...');
        // Use the base URL for listing reports, not the check URL
        const listApiUrl = 'https://core.tr.energy/api/aml';
        const response = await axios.get(listApiUrl, { headers });

        if (response.status === 200) {
            const reports = response.data.data || [];

            if (reports.length === 0) {
                bot.sendMessage(chatId, 'Нет доступных AML отчетов.');
                return;
            }

            let responseText = '<b>Список AML Отчетов:</b>\n\n';
            reports.slice(0, 10).forEach((report, index) => { // Limit to first 10 reports for brevity
                const address = report.address || 'N/A';
                const riskScore = report.context?.riskScore ?? 'N/A';
                responseText += `${index + 1}. Адрес: <code>${address}</code> - Риск: ${riskScore}\n`;
            });

            if (reports.length > 10) {
                responseText += `\n<i>Показаны первые 10 из ${reports.length} отчетов</i>`;
            }

            bot.sendMessage(chatId, responseText, { parse_mode: 'HTML' });

        } else {
            console.error(`Failed to fetch AML reports list: Status ${response.status}`);
            bot.sendMessage(chatId, `Не удалось получить список отчетов (Статус: ${response.status}).`);
        }
    } catch (error) {
        console.error('Error fetching AML reports list:', error.message);
        let userErrorMessage = 'Произошла ошибка при получении списка AML отчетов.';
        if (axios.isAxiosError(error)) {
            if (error.response) {
                console.error('API Error Data:', error.response.data);
                 if (error.response.status === 401) {
                     userErrorMessage = 'Ошибка авторизации при получении списка AML. Обратитесь к администратору.';
                 } else {
                    userErrorMessage = `Ошибка сервиса AML при получении списка (Статус: ${error.response.status}).`;
                 }
            } else if (error.request) {
                userErrorMessage = 'Не удалось связаться с сервисом AML для получения списка.';
            }
        } else {
             console.error('Non-API Error:', error);
        }
        bot.sendMessage(chatId, userErrorMessage);
    }
});

// Handle /start command - Show usage documentation in Russian
bot.onText(/\/start.*/, (msg) => {
    const chatId = msg.chat.id;
    const helpText = `🤖 *Добро пожаловать в Crypto Exchange Bot!*

*Доступные команды:*
• /USDT_RUB [сумма] - Конвертация USDT в RUB
• /RUB_USDT [сумма] - Конвертация RUB в USDT
• /aml [адрес кошелька] - Проверка кошелька по AML
• /amls - Показать последние AML отчеты

*Примеры:*
• /USDT_RUB - Показать текущий курс USDT → RUB
• /USDT_RUB 100 - Рассчитать конвертацию 100 USDT в RUB
• /RUB_USDT - Показать текущий курс RUB → USDT
• /RUB_USDT 10000 - Рассчитать конвертацию 10000 RUB в USDT
• /aml Tr... или 1... - Проверить адрес кошелька tron или bitcoin по базе AML
• /amls - Показать список последних проверок AML

_Курсы обновляются каждые 60 секунд._`;

    bot.sendMessage(chatId, helpText, { parse_mode: 'Markdown' });
});

// Logging helper function
function logMessage(type, userId, username, message) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${type} | User: ${userId} (${username || 'Unknown'}) | Message: ${message.substring(0, 100)}${message.length > 100 ? '...': ''}`);
}

// Log all incoming messages
bot.on('message', (msg) => {
    const userId = msg.from.id;
    const username = msg.from.username;
    const text = msg.text || '<non-text content>';
    
    logMessage('RECEIVED', userId, username, text);
});

// Override the sendMessage method to log outgoing messages
const originalSendMessage = bot.sendMessage;
bot.sendMessage = function(chatId, text, options) {
    logMessage('SENT', chatId, 'N/A', text);
    return originalSendMessage.call(this, chatId, text, options);
};

// Error handling
bot.on('polling_error', (error) => {
    console.error(`Polling error: ${error.message}`);
});

// Log bot startup
console.log('Bot started');