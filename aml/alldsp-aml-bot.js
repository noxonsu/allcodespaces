require('dotenv-vault').config();

// Добавьте этот блок для проверки среды
if (process.env.DOTENV_KEY) {
    console.log(`Using environment key: ${process.env.DOTENV_KEY}`);
    // Ключ обычно содержит имя среды, например: dotenv://:key_.../vault/.env.vault?environment=development
    // Вы можете попытаться извлечь имя среды из ключа, если это необходимо
    const match = process.env.DOTENV_KEY.match(/environment=([^&]+)/);
    if (match && match[1]) {
        console.log(`Detected environment: ${match[1]}`);
    } else {
        console.log('Could not automatically detect environment name from DOTENV_KEY.');
    }
} else {
    console.log('DOTENV_KEY is not set. Loading default .env file (likely development environment).');
}

const TelegramBot = require('node-telegram-bot-api');
const config = require('./config');
const exchangeService = require('./exchangeService');
const amlService = require('./amlService');

console.log('Bot starting...');

// --- Bot Initialization ---
const bot = new TelegramBot(config.BOT_TOKEN, { polling: true });

// --- Clear and Set Bot Commands (Optional but good practice) ---
const botCommands = [
    { command: 'start', description: 'Показать приветственное сообщение и помощь' },
    { command: 'usdt_rub', description: '[сумма] - Курс и конвертация USDT → RUB' },
    { command: 'rub_usdt', description: '[сумма] - Курс и конвертация RUB → USDT' },
    { command: 'aml', description: '[адрес] - Проверить кошелек (TRON/BTC) по AML' },
    { command: 'amls', description: 'Показать последние AML отчеты' },
];

bot.setMyCommands(botCommands)
    .then(() => console.log('Bot commands updated successfully.'))
    .catch(err => console.error('Error setting bot commands:', err));

// --- Command Handlers ---

// Handle /start command
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    // Escaped characters for MarkdownV2: '.', '-', '(', ')', '!', '+', '%'
    const helpText = `*🤖 Добро пожаловать в Crypto Exchange Bot\\!*

*Доступные команды:*
• \`/USDT_RUB [сумма] [\\+/\\-процент%]\` \\- Показать курс или рассчитать конвертацию USDT → RUB\\.
• \`/RUB_USDT [сумма] [\\+/\\-процент%]\` \\- Показать курс или рассчитать конвертацию RUB → USDT\\.
• \`/aml [адрес кошелька]\` \\- Проверить TRON или Bitcoin кошелек по базам AML\\.
• \`/amls\` \\- Показать список последних проверок AML \\(${config.AML_LIST_LIMIT} макс\\)\\.

*Примеры:*
• \`/USDT_RUB\` \\- Текущий курс USDT → RUB
• \`/USDT_RUB \\+1%\` \\- Курс USDT → RUB с бонусом 1%
• \`/USDT_RUB 100\` \\- Рассчитать 100 USDT в RUB
• \`/USDT_RUB 100 \\+1%\` \\- Рассчитать 100 USDT в RUB с бонусом 1%
• \`/RUB_USDT\` \\- Текущий курс RUB → USDT
• \`/RUB_USDT \\-0\\.5%\` \\- Курс RUB → USDT со скидкой 0\\.5%
• \`/RUB_USDT 10000\` \\- Рассчитать 10000 RUB в USDT
• \`/RUB_USDT 10000 \\-0\\.5%\` \\- Рассчитать 10000 RUB в USDT со скидкой 0\\.5%
• \`/aml T\\.\\.\\. \` \\- Проверить TRON адрес
• \`/aml 1\\.\\.\\.\` или \`/aml 3\\.\\.\\.\` или \`/aml bc1\\.\\.\\.\` \\- Проверить Bitcoin адрес
• \`/amls\` \\- Показать историю проверок

_Курсы обмена обновляются примерно раз в ${config.RATES_CACHE_TTL_SECONDS} секунд\\._
_Результаты AML проверки кэшируются на стороне сервиса\\._`;

    // Use MarkdownV2 for better formatting control
    bot.sendMessage(chatId, helpText, { parse_mode: 'MarkdownV2' });
});

// Handle /USDT_RUB command
// Updated regex to handle three cases:
// 1. /USDT_RUB (no params)
// 2. /USDT_RUB +1% (commission only)
// 3. /USDT_RUB 100 +1% (amount and commission)
bot.onText(/\/USDT_RUB(?:\s+(\d+\.?\d*))?(?:\s*([+-]?\d*\.?\d+%))?|\/USDT_RUB\s+([+-]?\d*\.?\d+%)/i, (msg, match) => {
    const chatId = msg.chat.id;
    
    // If third group matches, it's the "commission only" format
    if (match[3]) {
        const amount = null; // No amount specified
        const commissionString = match[3].trim();
        console.log(`[/USDT_RUB command] User: ${msg.from.username || msg.from.id}, Amount: ${amount}, Commission: ${commissionString}`);
        exchangeService.handleUsdtRubCommand(bot, chatId, amount, commissionString);
        return;
    }
    
    // Regular format with optional amount and commission
    const amount = match[1] ? parseFloat(match[1]) : null;
    const commissionString = match[2] ? match[2].trim() : null;
    console.log(`[/USDT_RUB command] User: ${msg.from.username || msg.from.id}, Amount: ${amount}, Commission: ${commissionString}`);
    exchangeService.handleUsdtRubCommand(bot, chatId, amount, commissionString);
});

// Handle /RUB_USDT command
// Updated regex similarly to /USDT_RUB
bot.onText(/\/RUB_USDT(?:\s+(\d+\.?\d*))?(?:\s*([+-]?\d*\.?\d+%))?|\/RUB_USDT\s+([+-]?\d*\.?\d+%)/i, (msg, match) => {
    const chatId = msg.chat.id;
    
    // If third group matches, it's the "commission only" format
    if (match[3]) {
        const amount = null; // No amount specified
        const commissionString = match[3].trim();
        console.log(`[/RUB_USDT command] User: ${msg.from.username || msg.from.id}, Amount: ${amount}, Commission: ${commissionString}`);
        exchangeService.handleRubUsdtCommand(bot, chatId, amount, commissionString);
        return;
    }
    
    // Regular format with optional amount and commission
    const amount = match[1] ? parseFloat(match[1]) : null;
    const commissionString = match[2] ? match[2].trim() : null;
    console.log(`[/RUB_USDT command] User: ${msg.from.username || msg.from.id}, Amount: ${amount}, Commission: ${commissionString}`);
    exchangeService.handleRubUsdtCommand(bot, chatId, amount, commissionString);
});

// Handle /aml command
bot.onText(/\/aml(?:\s+(.+))?/, (msg, match) => {
    const chatId = msg.chat.id;
    // match[1] contains the address or could be undefined
    const walletAddress = match?.[1]?.trim();
    console.log(`[/aml command] User: ${msg.from.username || msg.from.id}, Address: ${walletAddress}`);
    amlService.handleAmlCommand(bot, chatId, walletAddress);
});

// Handle /amls command
bot.onText(/\/amls/, (msg) => {
    const chatId = msg.chat.id;
    console.log(`[/amls command] User: ${msg.from.username || msg.from.id}`);
    amlService.handleAmlsCommand(bot, chatId);
});

// --- Basic Error Handling & Logging ---
bot.on('polling_error', (error) => {
    console.error('Polling error:', error.code, '-', error.message);
    // Consider adding logic here - e.g., exponential backoff or notification
});

bot.on('webhook_error', (error) => {
    console.error('Webhook error:', error.code, '-', error.message);
});

bot.on('error', (error) => {
    console.error('General Bot Error:', error);
});

console.log('Bot is running and listening for commands...');

// Optional: Graceful shutdown
process.once('SIGINT', () => {
    console.log('SIGINT received, stopping bot...');
    bot.stopPolling().then(() => {
        console.log('Bot polling stopped.');
        process.exit(0);
    });
});
process.once('SIGTERM', () => {
    console.log('SIGTERM received, stopping bot...');
    bot.stopPolling().then(() => {
        console.log('Bot polling stopped.');
        process.exit(0);
    });
});