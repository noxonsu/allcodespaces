// bot.js
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
    const helpText = `*🤖 Добро пожаловать в Crypto Exchange Bot!*

*Доступные команды:*
• /USDT_RUB [сумма] - Показать курс или рассчитать конвертацию USDT в RUB.
• /RUB_USDT [сумма] - Показать курс или рассчитать конвертацию RUB в USDT.
• /aml [адрес кошелька] - Проверить TRON или Bitcoin кошелек по базам AML.
• /amls - Показать список последних проверок AML (${config.AML_LIST_LIMIT} макс.).

*Примеры:*
• \`/USDT_RUB\` - Текущий курс USDT → RUB
• \`/USDT_RUB 100\` - Рассчитать 100 USDT в RUB
• \`/RUB_USDT\` - Текущий курс RUB → USDT
• \`/RUB_USDT 10000\` - Рассчитать 10000 RUB в USDT
• \`/aml T... \` - Проверить TRON адрес
• \`/aml 1...\` или \`/aml 3...\` или \`/aml bc1...\` - Проверить Bitcoin адрес
• \`/amls\` - Показать историю проверок

_Курсы обмена обновляются примерно раз в ${config.RATES_CACHE_TTL_SECONDS} секунд._
_Результаты AML проверки кэшируются на стороне сервиса._`;

    bot.sendMessage(chatId, helpText, { parse_mode: 'Markdown' });
});

// Handle /USDT_RUB command
bot.onText(/\/USDT_RUB(?:\s+(\d+\.?\d*))?/i, (msg, match) => { // Added 'i' flag for case-insensitivity
    const chatId = msg.chat.id;
    const amount = match[1] ? parseFloat(match[1]) : null;
    console.log(`[/USDT_RUB command] User: ${msg.from.username || msg.from.id}, Amount: ${amount}`);
    exchangeService.handleUsdtRubCommand(bot, chatId, amount);
});

// Handle /RUB_USDT command
bot.onText(/\/RUB_USDT(?:\s+(\d+\.?\d*))?/i, (msg, match) => { // Added 'i' flag for case-insensitivity
    const chatId = msg.chat.id;
    const amount = match[1] ? parseFloat(match[1]) : null;
    console.log(`[/RUB_USDT command] User: ${msg.from.username || msg.from.id}, Amount: ${amount}`);
    exchangeService.handleRubUsdtCommand(bot, chatId, amount);
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