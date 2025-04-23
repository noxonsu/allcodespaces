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

// Bot configuration
const BOT_TOKEN = process.env.BOT_TOKEN;
const API_URL = 'https://abcex.io/api/v1/rates';
const AML_API_KEY = process.env.AML_API_KEY;
// Validate API key

if (!AML_API_KEY) {
    console.error('Error: AML_API_KEY is not set. Please check your environment variables.');
    process.exit(1);
}

// Update the API URL to the correct endpoint
const AML_API_URL = 'https://core.tr.energy/api/aml/check';

// Hardcoded commissions (can be modified directly in the code)
const USDT_RUB_COMMISSION = 1.0; // +1% for USDT → RUB
const RUB_USDT_COMMISSION = -0.8; // -0.8% for RUB → USDT

// Initialize bot
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// Clear any previously set commands
bot.setMyCommands([])
    .then(() => console.log('Bot commands cleared successfully.'))
    .catch(err => console.error('Error clearing bot commands:', err));

// Cache for exchange rates
let ratesCache = { timestamp: 0, data: null };

async function fetchExchangeRates() {
    const currentTime = Date.now() / 1000; // Convert to seconds

    // Update rates if cache is older than 60 seconds
    if (currentTime - ratesCache.timestamp > 60 || !ratesCache.data) {
        try {
            const response = await axios.get(API_URL);
            if (response.status === 200) {
                ratesCache = {
                    timestamp: currentTime,
                    data: response.data
                };
                return response.data;
            } else {
                console.error(`Failed to fetch rates: ${response.status}`);
                return ratesCache.data;
            }
        } catch (error) {
            console.error(`Error fetching rates: ${error.message}`);
            return ratesCache.data;
        }
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

// Handle /USDT_RUB command
bot.onText(/\/USDT_RUB(?:\s+(\d+\.?\d*))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const rates = await fetchExchangeRates();

    if (!rates) {
        bot.sendMessage(chatId, 'Failed to fetch exchange rates. Please try again later.');
        return;
    }

    // Find USDT to RUB rate
    const rateData = rates.find(r => r.pair === 'USDT/RUB');
    if (!rateData) {
        bot.sendMessage(chatId, 'USDT/RUB rate not available.');
        return;
    }

    const rate = parseFloat(rateData.rate);
    const commission = USDT_RUB_COMMISSION; // +1% commission for USDT → RUB

    let response;
    if (!match[1]) {
        // Show only rate
        response = `USDT → RUB Rate: ${rate.toFixed(2)} RUB\n` +
                   `Commission: +${commission}% (fixed)\n` +
                   `Last updated: ${new Date().toISOString()}`;
    } else {
        try {
            const amount = parseFloat(match[1]);
            if (amount <= 0) throw new Error('Amount must be positive');

            const result = calculateRate(amount, 'USDT_RUB', rate, commission);
            response = `USDT → RUB Conversion\n` +
                       `Amount: ${amount.toFixed(2)} USDT\n` +
                       `Rate: ${rate.toFixed(2)} RUB\n` +
                       `Commission: +${commission}% (fixed)\n` +
                       `Result: ${result.toFixed(2)} RUB\n` +
                       `Last updated: ${new Date().toISOString()}`;
        } catch (error) {
            response = 'Please provide a valid amount. Example: /USDT_RUB 100';
        }
    }

    bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
});

// Handle /RUB_USDT command
bot.onText(/\/RUB_USDT(?:\s+(\d+\.?\d*))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const rates = await fetchExchangeRates();

    if (!rates) {
        bot.sendMessage(chatId, 'Failed to fetch exchange rates. Please try again later.');
        return;
    }

    // Find RUB to USDT rate (inverse of USDT/RUB)
    const rateData = rates.find(r => r.pair === 'USDT/RUB');
    if (!rateData) {
        bot.sendMessage(chatId, 'RUB/USDT rate not available.');
        return;
    }

    const rate = parseFloat(rateData.rate);
    const commission = RUB_USDT_COMMISSION; // -0.8% commission for RUB → USDT

    let response;
    if (!match[1]) {
        // Show only rate
        response = `RUB → USDT Rate: ${(1/rate).toFixed(6)} USDT\n` +
                   `Commission: ${commission}% (fixed)\n` +
                   `Last updated: ${new Date().toISOString()}`;
    } else {
        try {
            const amount = parseFloat(match[1]);
            if (amount <= 0) throw new Error('Amount must be positive');

            const result = calculateRate(amount, 'RUB_USDT', rate, commission);
            response = `RUB → USDT Conversion\n` +
                       `Amount: ${amount.toFixed(2)} RUB\n` +
                       `Rate: ${(1/rate).toFixed(6)} USDT\n` +
                       `Commission: ${commission}% (fixed)\n` +
                       `Result: ${result.toFixed(2)} USDT\n` +
                       `Last updated: ${new Date().toISOString()}`;
        } catch (error) {
            response = 'Please provide a valid amount. Example: /RUB_USDT 1000';
        }
    }

    bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
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

// Formats the AML report data into a user-friendly message
function formatReportMessage(reportData, walletAddress) {
    if (!reportData) {
        // This case might happen if called after a failed list check
        return `Не удалось получить данные для адреса ${walletAddress}. Попробуйте позже.`;
    }

    const riskScore = reportData.context?.riskScore ?? 'N/A';
    const entities = reportData.context?.entities || [];

    let entityDetails = '';
    if (entities.length > 0) {
        entityDetails = '\n\n*Обнаруженные риски:*\n';
        entities.forEach(entity => {
            const score = typeof entity.riskScore === 'number' ? entity.riskScore.toFixed(3) : 'N/A';
            const level = entity.level || 'N/A';
            entityDetails += `- ${entity.entity || 'Unknown'}: ${score} (${level})\n`;
        });
    } else if (riskScore !== 'N/A') {
        entityDetails = '\n\n*Детали по рискам не предоставлены.*';
    }

    return `*AML Проверка кошелька*\n` +
           `Адрес: \`${walletAddress}\`\n` +
           `Итоговый риск: *${riskScore}*${entityDetails}`;
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
            const responseText = formatReportMessage(existingReport, walletAddress);
            bot.sendMessage(chatId, responseText, { parse_mode: 'Markdown' });
            return; // Exit if found in the list
        }

        // *** Step 2: If not found, create a new report via POST ***
        // Send a "thinking" message
        const processingMsg = await bot.sendMessage(
            chatId, 
            `Запрашиваю новый AML отчет для адреса \`${walletAddress}\`...`, 
            { parse_mode: 'Markdown' }
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
                        parse_mode: 'Markdown'
                    }
                );
                
                // Wait 5 seconds
                await new Promise(resolve => setTimeout(resolve, 5000));
                
                // Update user that we're checking the list
                await bot.editMessageText(
                    `Проверяю обновленный статус для адреса \`${walletAddress}\`...`, 
                    { 
                        chat_id: chatId, 
                        message_id: processingMsg.message_id,
                        parse_mode: 'Markdown'
                    }
                );

                // Check the list again after waiting
                const updatedReport = await getExistingReport(walletAddress);
                
                if (updatedReport) {
                    const responseText = formatReportMessage(updatedReport, walletAddress);
                    // Send a new message with the results
                    bot.sendMessage(chatId, responseText, { parse_mode: 'Markdown' });
                } else {
                    // Still not found in the list after waiting
                    bot.sendMessage(chatId, `Отчет для \`${walletAddress}\` все еще обрабатывается. Пожалуйста, используйте команду /aml ${walletAddress} через несколько секунд для получения результатов.`, { parse_mode: 'Markdown' });
                }
                
                // Delete the "processing" message
                bot.deleteMessage(chatId, processingMsg.message_id).catch(err => console.error('Error deleting message:', err));
            } else {
                // Status is not pending, format and send result directly
                const responseText = formatReportMessage(responseData, walletAddress);
                // Delete the "processing" message
                bot.deleteMessage(chatId, processingMsg.message_id).catch(err => console.error('Error deleting message:', err));
                // Send the result
                bot.sendMessage(chatId, responseText, { parse_mode: 'Markdown' });
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

            let responseText = '*Список AML Отчетов:*\n\n';
            reports.slice(0, 10).forEach((report, index) => { // Limit to first 10 reports for brevity
                const address = report.address || 'N/A';
                const riskScore = report.context?.riskScore ?? 'N/A';
                responseText += `${index + 1}. Адрес: \`${address}\` - Риск: ${riskScore}\n`;
            });

            if (reports.length > 10) {
                responseText += `\n_(Показаны первые 10 из ${reports.length} отчетов)_`;
            }

            bot.sendMessage(chatId, responseText, { parse_mode: 'Markdown' });

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