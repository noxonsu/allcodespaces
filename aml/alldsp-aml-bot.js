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

// Handle /aml command
bot.onText(/\/aml(?:\s+(.+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const walletAddress = match[1];

    // Check if wallet address is provided
    if (!walletAddress) {
        bot.sendMessage(chatId, 'Пожалуйста, укажите адрес кошелька TRON. Пример: /aml T... ');
        return;
    }

    // Basic TRON address format validation (Starts with 'T', 34 chars long)
    if (!/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(walletAddress)) {
        bot.sendMessage(chatId, 'Ошибка: Неверный формат адреса кошелька TRON. Адрес должен начинаться с "T" и содержать 34 символа.');
        return;
    }

    try {
        // Use plain JSON object instead of FormData
        const requestData = {
            blockchain: 'tron',  // Default to TRON blockchain
            address: walletAddress
        };

        // Ensure proper Bearer token format in the Authorization header
        const headers = {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${AML_API_KEY.trim()}`
        };

        console.log(`Sending AML check request for address: ${walletAddress}`);

        const response = await axios.post(AML_API_URL, requestData, { headers });

        if (response.status === 200 || response.status === 201) {
            // Update response handling to match API structure
            const responseData = response.data.data || response.data;
            // Handle cases where context might be missing or null
            const riskScore = responseData.context?.riskScore ?? 'N/A'; // Use nullish coalescing
            const entities = responseData.context?.entities || [];

            let entityDetails = '';
            if (entities.length > 0) {
                entityDetails = '\n\n*Обнаруженные риски:*\n';
                entities.forEach(entity => {
                    // Format risk score and level nicely
                    const score = typeof entity.riskScore === 'number' ? entity.riskScore.toFixed(3) : 'N/A';
                    const level = entity.level || 'N/A';
                    entityDetails += `- ${entity.entity || 'Unknown'}: ${score} (${level})\n`;
                });
            } else if (riskScore !== 'N/A') {
                 // Add message if risk score is available but no specific entities listed
                 entityDetails = '\n\n*Детали по рискам не предоставлены.*';
            }


            const responseText = `*AML Проверка кошелька*\n` +
                               `Адрес: \`${walletAddress}\`\n` +
                               `Итоговый риск: *${riskScore}*${entityDetails}`;

            bot.sendMessage(chatId, responseText, { parse_mode: 'Markdown' });
        } else {
             // Should not happen if axios doesn't throw for non-2xx, but good practice
            console.error(`AML check unexpected status: ${response.status} for address ${walletAddress}`);
            bot.sendMessage(chatId, `Ошибка AML проверки (Статус: ${response.status}). Попробуйте позже.`);
        }
    } catch (error) {
        console.error(`AML check failed for address ${walletAddress}. Error:`, error.message);
        let userErrorMessage = 'Произошла ошибка при проверке кошелька. Пожалуйста, попробуйте позже.';

        if (axios.isAxiosError(error)) {
            if (error.response) {
                // API returned an error status code (4xx, 5xx)
                console.error('API Error Data:', error.response.data);
                if (error.response.status === 422) {
                    // Specific error for invalid data (likely address)
                    const apiErrorMsg = error.response.data?.error || 'Неверные данные';
                    userErrorMessage = `Ошибка AML проверки: ${apiErrorMsg}. Пожалуйста, проверьте правильность адреса.`;
                } else if (error.response.status === 401) {
                     userErrorMessage = 'Ошибка авторизации при проверке AML. Обратитесь к администратору.';
                } else {
                    userErrorMessage = `Ошибка сервиса AML (Статус: ${error.response.status}). Попробуйте позже.`;
                }
            } else if (error.request) {
                // Request was made but no response received (network error, timeout)
                console.error('Network Error:', error.message);
                userErrorMessage = 'Не удалось связаться с сервисом AML. Проверьте ваше интернет-соединение или попробуйте позже.';
            }
        } else {
            // Non-axios error (e.g., programming error before request)
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

*Примеры:*
• /USDT_RUB - Показать текущий курс USDT → RUB
• /USDT_RUB 100 - Рассчитать конвертацию 100 USDT в RUB
• /RUB_USDT - Показать текущий курс RUB → USDT
• /RUB_USDT 10000 - Рассчитать конвертацию 10000 RUB в USDT
• /aml Tr... - Проверить адрес кошелька tron по базе AML

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