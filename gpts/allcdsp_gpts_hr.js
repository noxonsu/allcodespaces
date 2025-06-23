// Set NAMEPROMPT first, before any other modules are loaded
process.env.NAMEPROMPT = 'hr';

// const TelegramBot = require('node-telegram-bot-api'); // Removed
const { TelegramClient, Api } = require('telegram');
const { StringSession } = require('telegram/sessions');
const { NewMessage } = require('telegram/events'); // Import NewMessage
// Add diagnostic logs below
console.log('[Debug] Attempting to inspect telegram/events:');
try {
    const telegramEventsModule = require('telegram/events');
    console.log('[Debug] require("telegram/events") loaded:', telegramEventsModule);
    console.log('[Debug] NewMessage from destructuring:', NewMessage);
    if (telegramEventsModule && typeof telegramEventsModule.NewMessage !== 'undefined') {
        console.log('[Debug] telegramEventsModule.NewMessage exists.');
    } else {
        console.warn('[Debug] telegramEventsModule.NewMessage does not exist or telegramEventsModule is null/undefined.');
    }
} catch (e) {
    console.error('[Debug] Error requiring or inspecting "telegram/events":', e);
}
// End of diagnostic logs
const input = require('input'); // For GramJS console prompts
// axios is not directly needed in this file anymore if bridge is removed
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');
const express = require('express');

// Log NAMEPROMPT early to see what .env file will be targeted
const NAMEPROMPT_FROM_ENV = process.env.NAMEPROMPT || 'hr'; // Ensure this is defined if used by config
console.log(`[Debug] NAMEPROMPT for .env file: ${NAMEPROMPT_FROM_ENV}`);
const envFilePath = path.join(__dirname, `.env.${NAMEPROMPT_FROM_ENV}`);
console.log(`[Debug] Attempting to load .env file from: ${envFilePath}`);

// Load .env file first before requiring other modules that might depend on it
const dotenvResult = dotenv.config({ path: envFilePath });
if (dotenvResult.error) {
    console.error(`Ошибка загрузки файла .env.${NAMEPROMPT_FROM_ENV}:`, dotenvResult.error);
} else {
    console.log(`[Debug] Successfully loaded .env file: ${envFilePath}`);
}

const config = require('./config'); // Import config
const { NAMEPROMPT, USER_DATA_DIR, CHAT_HISTORIES_DIR } = config; // FREE_MESSAGE_LIMIT is now read directly in getPaymentStatus
let { FREE_MESSAGE_LIMIT } = config; // Allow reassignment after dotenv reload

// Log the actual USER_DATA_DIR being used
console.log(`[Debug] USER_DATA_DIR from config: ${USER_DATA_DIR}`);
console.log(`[Debug] NAMEPROMPT from config: ${NAMEPROMPT}`);

// Log FREE_MESSAGE_LIMIT from config right after import
console.log(`[Debug] Initial FREE_MESSAGE_LIMIT from config.js: ${FREE_MESSAGE_LIMIT}`);
console.log(`[Debug] Raw process.env.FREE_MESSAGE_LIMIT after initial dotenv.config: ${process.env.FREE_MESSAGE_LIMIT}`);

const {
    sanitizeString,
    validateChatId,
    logChat,
} = require('./utilities');
const {
    setSystemMessage,
    setOpenAIKey,
    setDeepSeekKey,
    setModel,
    callLLM: originalCallLLM,
    loadUserData, 
    saveUserData,
    getUserMessageCount
} = require('./openai');

// Create a wrapper function that handles chat ID validation more permissively
async function callLLM(chatId, messages) {
    // Ensure chatId passes basic validation for positive integer
    const consistentChatId = String(chatId);
    if (!/^\d+$/.test(consistentChatId) || BigInt(consistentChatId) <= 0) {
        throw new Error(`Invalid chat ID format: ${consistentChatId}`);
    }
    
    try {
        return await originalCallLLM(consistentChatId, messages);
    } catch (error) {
        if (error.message === 'Некорректный chat ID') {
            console.warn(`[CallLLM Wrapper] Chat ID ${consistentChatId} failed openai.js validation but appears valid. This might indicate a validation mismatch between modules.`);
            throw new Error(`Chat ID validation failed in OpenAI module: ${consistentChatId}`);
        }
        throw error; // Re-throw other errors as-is
    }
}

// --- Configuration ---
const result = dotenv.config({ path: envFilePath }); // Use the already determined envFilePath
if (result.error) {
    console.error(`Ошибка загрузки файла .env.${NAMEPROMPT}:`, result.error);
    // process.exit(1); // Commenting out exit on error for debugging purposes
} else {
    console.log(`[Debug] Successfully loaded .env file: ${envFilePath}`);
    // Re-check FREE_MESSAGE_LIMIT from process.env AFTER dotenv.config has run
    console.log(`[Debug] Raw process.env.FREE_MESSAGE_LIMIT after dotenv.config: ${process.env.FREE_MESSAGE_LIMIT}`);
    // If config needs to be re-evaluated based on new .env values, you might need to reload or re-calculate it.
    // However, config.js already reads from process.env, so its values should be correct if dotenv worked.
    // Forcing a re-read from the config module to be sure:
    delete require.cache[require.resolve('./config')]; // Clear cache for config module
    const reloadedConfig = require('./config');
    console.log(`[Debug] FREE_MESSAGE_LIMIT from reloaded config.js after dotenv: ${reloadedConfig.FREE_MESSAGE_LIMIT}`);
    // Update the FREE_MESSAGE_LIMIT if it changed
    if (FREE_MESSAGE_LIMIT !== reloadedConfig.FREE_MESSAGE_LIMIT) {
        console.log(`[Debug] FREE_MESSAGE_LIMIT updated after dotenv load from ${FREE_MESSAGE_LIMIT} to ${reloadedConfig.FREE_MESSAGE_LIMIT}`);
        FREE_MESSAGE_LIMIT = reloadedConfig.FREE_MESSAGE_LIMIT; // Update the variable
    }
}

// Follow-up message configuration
const FOLLOW_UP_DELAY_MS = 30 * 1000; // 30 sec for testing
const VACANCY_CLOSED_TRIGGER_PHRASE = "к сожалению"; 
const FOLLOW_UP_VACANCY_MESSAGE = "Давно ищите оффер?";
const STOP_DIALOG_PHRASES = ["человеку", "стоп", "хватит", "остановить", "закончить"]; // Example, replace with your actual list
const TYPING_DELAY_MS = 10000; // 10 seconds for typing simulation
const MIN_RESPONSE_DELAY = 2000; // Minimum 2 seconds delay
const MAX_RESPONSE_DELAY = 10000; // Maximum 10 seconds delay
const WORDS_PER_SECOND = 3; // Average typing speed for calculating dynamic delay
const MIN_READ_DELAY = 1000; // Minimum 1 second before reading message
const MAX_READ_DELAY = 5000; // Maximum 5 seconds before reading message
const GREETING_PHRASES = ["здравствуйте", "привет", "добрый день", "добрый вечер", "салам", "хелло", "хай", "hello", "hi"];

// Admin and Server Configuration
const ADMIN_TELEGRAM_ID = process.env.ADMIN_TELEGRAM_ID;
const BOT_SERVER_BASE_URL = process.env.BOT_SERVER_BASE_URL; // e.g., http://yourdomain.com or http://your_ip:15656
const SERVER_PORT = 15656;
// const PROMPT_EDITOR_PORT = 5006; // Removed
const PROMPT_EDITOR_SECRET = process.env.PROMPT_EDITOR_SECRET || 'lalalalsecret';

// Ensure directories exist
fs.mkdirSync(USER_DATA_DIR, { recursive: true });
fs.mkdirSync(CHAT_HISTORIES_DIR, { recursive: true });

// --- Prompt Editor Server Setup --- // Combined with main Express app
// const promptApp = express(); // Removed
// promptApp.use(express.json()); // Moved to main app
// promptApp.use(express.urlencoded({ extended: true })); // Moved to main app

// Middleware to check secret
const checkSecret = (req, res, next) => {
    if (req.query.secret !== PROMPT_EDITOR_SECRET) {
        return res.status(403).send('Access denied');
    }
    next();
};

// GET route to show the form // Will be added to main app
// promptApp.get('/', checkSecret, (req, res) => { ... }); // Moved

// POST route to save the prompt // Will be added to main app
// promptApp.post('/', checkSecret, (req, res) => { ... }); // Moved

// Start prompt editor server // Removed
// promptApp.listen(PROMPT_EDITOR_PORT, () => {
//     console.log(`[Prompt Editor] Server listening on port ${PROMPT_EDITOR_PORT}`);
//     console.log(`[Prompt Editor] Access URL: http://localhost:${PROMPT_EDITOR_PORT}/?secret=${PROMPT_EDITOR_SECRET}`);
// });

// --- GramJS User Client Configuration & Initialization ---
const gramJsApiId = parseInt(process.env.TELEGRAM_API_ID || "0"); // Provide default to avoid NaN if empty
const gramJsApiHash = process.env.TELEGRAM_API_HASH || "";
let gramJsSessionString = process.env.TELEGRAM_SESSION_STRING || "";
let gramJsPhoneNumber = process.env.TELEGRAM_PHONE_NUMBER || "";
let gramJsClient;

if (gramJsApiId && gramJsApiHash) { // Check for valid apiId (not 0)
    console.log(`[GramJS] TELEGRAM_API_ID and TELEGRAM_API_HASH found. GramJS client will be configured.`);
    gramJsClient = new TelegramClient(new StringSession(gramJsSessionString), gramJsApiId, gramJsApiHash, {
        connectionRetries: 5,
    });
} else {
    console.warn(`[GramJS] TELEGRAM_API_ID or TELEGRAM_API_HASH not found or invalid. GramJS user client functionality will be disabled.`);
}

const openaiApiKey = process.env.OPENAI_API_KEY;
const deepseekApiKey = process.env.DEEPSEEK_API_KEY;
const ACTIVATION_CODE = process.env.ACTIVATION_CODE; // e.g., "KEY-SOMEKEY123"
const PAYMENT_URL_TEMPLATE = process.env.PAYMENT_URL_TEMPLATE || 'https://noxon.wpmix.net/counter.php?tome=1&msg={NAMEPROMPT}_{chatid}&cal=1';

if (!openaiApiKey && !deepseekApiKey) {
    console.error(`Ошибка: Ни OPENAI_API_KEY, ни DEEPSEEK_API_KEY не определены в файле .env.${NAMEPROMPT}. LLM функционал будет недоступен.`);
    // process.exit(1); // Don't exit if GramJS can still run for other purposes
}

// --- Load System Prompt ---
let systemPromptContent = 'You are a helpful assistant.';
try {
    const promptPath = path.join(__dirname, `.env.${NAMEPROMPT}_prompt`);
    if (fs.existsSync(promptPath)) {
        systemPromptContent = fs.readFileSync(promptPath, 'utf8').trim();
        console.log(`Системный промпт загружен из ${promptPath}`);
    } else {
        systemPromptContent = process.env.SYSTEM_PROMPT || systemPromptContent;
        console.log(`Системный промпт загружен из переменной окружения или по умолчанию.`);
    }

    if (!systemPromptContent) {
        throw new Error('Системный промпт пуст или не определен после загрузки.');
    }
} catch (error) {
    console.error('Ошибка загрузки системного промпта:', error);
    process.exit(1);
}

// --- Initialize OpenAI/DeepSeek Module ---
setSystemMessage(systemPromptContent);
if (openaiApiKey) setOpenAIKey(openaiApiKey);
if (deepseekApiKey) setDeepSeekKey(deepseekApiKey);
if (process.env.MODEL) setModel(process.env.MODEL);

// --- Express Server Setup ---
const app = express();
app.use(express.json()); // Middleware to parse JSON bodies
app.use(express.urlencoded({ extended: true })); // For prompt editor form

if (ADMIN_TELEGRAM_ID && BOT_SERVER_BASE_URL) {
    // Ensure CHAT_HISTORIES_DIR is absolute or resolve it correctly
    const absoluteChatHistoriesDir = path.resolve(__dirname, CHAT_HISTORIES_DIR);
    console.log(`[Express] Serving chat logs from: ${absoluteChatHistoriesDir}`);
    app.use('/chatlogs', express.static(absoluteChatHistoriesDir)); // Chat logs accessible without secret

    // GET route for prompt editor
    app.get('/edit-prompt', checkSecret, (req, res) => {
        const promptFilePath = path.join(__dirname, `.env.${NAMEPROMPT}_prompt`);
        let currentPromptValue = ''; // Renamed to avoid conflict with systemPromptContent
        
        try {
            if (fs.existsSync(promptFilePath)) {
                currentPromptValue = fs.readFileSync(promptFilePath, 'utf8');
            }
        } catch (error) {
            console.error('[Prompt Editor] Error reading prompt file:', error);
        }
        
        const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>HR Prompt Editor</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 40px; }
                textarea { width: 100%; height: 400px; margin: 10px 0; }
                button { padding: 10px 20px; background: #007bff; color: white; border: none; cursor: pointer; }
                button:hover { background: #0056b3; }
                .status { margin: 10px 0; padding: 10px; border-radius: 4px; }
                .success { background: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
                .error { background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }
                nav a { margin-right: 15px; }
            </style>
        </head>
        <body>
            <nav>
                <a href="/chatlogs/?secret=${req.query.secret}">View Chat Logs (if configured)</a>
                <a href="/edit-prompt?secret=${req.query.secret}">Edit Prompt</a>
            </nav>
            <h1>HR System Prompt Editor</h1>
            <form method="POST" action="/edit-prompt?secret=${PROMPT_EDITOR_SECRET}">
                <label for="prompt">System Prompt:</label><br>
                <textarea id="prompt" name="prompt" placeholder="Enter the system prompt here...">${currentPromptValue.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</textarea><br>
                <button type="submit">Save Prompt</button>
            </form>
            <p><small>File: .env.${NAMEPROMPT}_prompt</small></p>
        </body>
        </html>
        `;
        
        res.send(html);
    });

    // POST route to save the prompt
    app.post('/edit-prompt', checkSecret, (req, res) => {
        const promptFilePath = path.join(__dirname, `.env.${NAMEPROMPT}_prompt`);
        const newPrompt = req.body.prompt || '';
        let statusMessage = '';
        let statusClass = '';
        
        try {
            fs.writeFileSync(promptFilePath, newPrompt, 'utf8');
            console.log(`[Prompt Editor] Prompt file updated: ${promptFilePath}`);
            
            // Update the system prompt in the LLM module
            systemPromptContent = newPrompt; // Update global variable
            setSystemMessage(systemPromptContent); // Update in openai.js module
            console.log('[Prompt Editor] System prompt reloaded in LLM module.');

            statusMessage = 'Prompt saved successfully and reloaded!';
            statusClass = 'success';
        } catch (error) {
            console.error('[Prompt Editor] Error saving prompt file:', error);
            statusMessage = `Error saving prompt: ${error.message}`;
            statusClass = 'error';
        }

        const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>HR Prompt Editor</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 40px; }
                textarea { width: 100%; height: 400px; margin: 10px 0; }
                button { padding: 10px 20px; background: #007bff; color: white; border: none; cursor: pointer; }
                button:hover { background: #0056b3; }
                .status { margin: 10px 0; padding: 10px; border-radius: 4px; }
                .success { background: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
                .error { background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }
                nav a { margin-right: 15px; }
            </style>
        </head>
        <body>
            <nav>
                <a href="/chatlogs/?secret=${req.query.secret}">View Chat Logs (if configured)</a>
                <a href="/edit-prompt?secret=${req.query.secret}">Edit Prompt</a>
            </nav>
            <h1>HR System Prompt Editor</h1>
            <div class="status ${statusClass}">${statusMessage}</div>
            <form method="POST" action="/edit-prompt?secret=${PROMPT_EDITOR_SECRET}">
                <label for="prompt">System Prompt:</label><br>
                <textarea id="prompt" name="prompt" placeholder="Enter the system prompt here...">${newPrompt.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</textarea><br>
                <button type="submit">Save Prompt</button>
            </form>
            <p><small>File: .env.${NAMEPROMPT}_prompt</small></p>
        </body>
        </html>
        `;
        res.send(html);
    });
    
    app.listen(SERVER_PORT, () => {
        console.log(`[Express] Server for chat logs and prompt editor listening on port ${SERVER_PORT}.`);
        console.log(`[Express] Example log URL: ${BOT_SERVER_BASE_URL}/chatlogs/`);
        console.log(`[Express] Prompt Editor URL: ${BOT_SERVER_BASE_URL}/edit-prompt?secret=${PROMPT_EDITOR_SECRET}`);
    });

} else {
    console.warn('[Express] ADMIN_TELEGRAM_ID or BOT_SERVER_BASE_URL not set. Chat log web server will be disabled.');
    // Start a minimal server if no admin features, just to keep process alive if only express is running.
    // However, GramJS will keep it alive. If GramJS is also disabled, then the script might exit.
    // For now, if no admin server, Express won't listen unless other routes are added.
}


// --- Helper Functions ---

// Calculate human-like typing delay based on message length
function calculateTypingDelay(messageText) {
    if (!messageText) return MIN_RESPONSE_DELAY;
    
    const wordCount = messageText.split(' ').length;
    const baseDelay = (wordCount / WORDS_PER_SECOND) * 1000; // Convert to milliseconds
    const randomFactor = 0.5 + Math.random(); // Random factor between 0.5 and 1.5
    const calculatedDelay = baseDelay * randomFactor;
    
    // Ensure delay is within reasonable bounds
    return Math.max(MIN_RESPONSE_DELAY, Math.min(calculatedDelay, MAX_RESPONSE_DELAY));
}

// Simulate typing action via GramJS
async function simulateTyping(peerId, duration = 3000) {
    if (!gramJsClient || !gramJsClient.connected) {
        return;
    }
    
    try {
        console.log(`[GramJS Typing] Starting typing simulation for ${duration}ms`);
        await gramJsClient.invoke(new Api.messages.SetTyping({
            peer: peerId,
            action: new Api.SendMessageTypingAction()
        }));
        
        // Keep typing indicator active for the duration
        const typingInterval = setInterval(async () => {
            try {
                await gramJsClient.invoke(new Api.messages.SetTyping({
                    peer: peerId,
                    action: new Api.SendMessageTypingAction()
                }));
            } catch (e) {
                console.error('[GramJS Typing] Error maintaining typing indicator:', e.message);
                clearInterval(typingInterval);
            }
        }, 2000); // Refresh typing indicator every 2 seconds
        
        // Stop typing after duration
        setTimeout(() => {
            clearInterval(typingInterval);
            console.log(`[GramJS Typing] Typing simulation ended`);
        }, duration);
        
    } catch (error) {
        console.error('[GramJS Typing] Error starting typing simulation:', error.message);
    }
}

// Calculate human-like reading delay
function calculateReadDelay() {
    return Math.random() * (MAX_READ_DELAY - MIN_READ_DELAY) + MIN_READ_DELAY;
}

// Mark messages as read with human-like delay
async function markMessagesAsRead(peerId, maxId = null) {
    if (!gramJsClient || !gramJsClient.connected) {
        return;
    }
    
    try {
        const readDelay = calculateReadDelay();
        console.log(`[GramJS Read] Scheduling message read for peer ${peerId} in ${readDelay}ms`);
        
        setTimeout(async () => {
            try {
                await gramJsClient.invoke(new Api.messages.ReadHistory({
                    peer: peerId,
                    maxId: maxId || 0 // Read all messages if maxId is not specified
                }));
                console.log(`[GramJS Read] Messages marked as read for peer ${peerId}`);
            } catch (error) {
                console.error(`[GramJS Read] Error marking messages as read for peer ${peerId}:`, error.message);
            }
        }, readDelay);
        
    } catch (error) {
        console.error('[GramJS Read] Error scheduling message read:', error.message);
    }
}

async function handleNewDayLogicAndUpdateTimestamp(chatId) {
    const userData = loadUserData(chatId); // Load fresh data each time
    const now = new Date();
    const lastMsgDateObj = userData.lastMessageTimestamp ? new Date(userData.lastMessageTimestamp) : null;
    let isNewDay = false;
    let newDayPrefixForLLM = "";

    if (!lastMsgDateObj) {
        // First message ever, or first since timestamp tracking began. Consider it a "new day" for context.
        isNewDay = true;
    } else {
        // Compare dates in UTC
        const lastDayUTC = new Date(lastMsgDateObj.getUTCFullYear(), lastMsgDateObj.getUTCMonth(), lastMsgDateObj.getUTCDate());
        const currentDayUTC = new Date(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());

        if (currentDayUTC.getTime() > lastDayUTC.getTime()) {
            isNewDay = true;
        }
    }

    // Update timestamp for this current interaction, regardless of new day status
    userData.lastMessageTimestamp = now.getTime();
    saveUserData(chatId, userData);

    if (isNewDay) {
        try {
            //await bot.sendMessage(chatId, "Настал новый день.");
            logChat(chatId, { type: 'system_message', event: 'new_day_notification_sent', timestamp: now.toISOString() }, 'system');
        } catch (error) {
            console.error(`[New Day Logic ${chatId}] Error sending new day message:`, error);
        }
        newDayPrefixForLLM = "Настал новый день. "; // This prefix will be added to the LLM prompt
    }
    return newDayPrefixForLLM;
}

async function getPaymentStatus(chatId) {
    const userData = loadUserData(chatId);
    if (userData.isPaid) {
        return { proceed: true };
    }

    // Get fresh FREE_MESSAGE_LIMIT from reloaded config
    // It's important that config.js always provides the latest value,
    // especially after .env might have been reloaded.
    // The initial dotenv load and config reload at the top should handle this.
    const currentConfig = require('./config'); // Get potentially reloaded config
    const currentFreeMessageLimit = currentConfig.FREE_MESSAGE_LIMIT;
    
    console.log(`[Debug GetPaymentStatus ${chatId}] Current FREE_MESSAGE_LIMIT from config: ${currentFreeMessageLimit}`);


    if (currentFreeMessageLimit === null || typeof currentFreeMessageLimit === 'undefined') { // null or undefined means unlimited
        console.log(`[Debug GetPaymentStatus ${chatId}] Free message limit is null or undefined, proceeding.`);
        return { proceed: true };
    }

    const userMessageCount = getUserMessageCount(chatId);
    console.log(`[Debug GetPaymentStatus ${chatId}] User message count: ${userMessageCount}, Limit: ${currentFreeMessageLimit}`);

    if (userMessageCount >= currentFreeMessageLimit) {
        const paymentUrl = PAYMENT_URL_TEMPLATE
            .replace('{NAMEPROMPT}', NAMEPROMPT) // NAMEPROMPT should be from the top-level scope
            .replace('{chatid}', chatId.toString());

        const messageText = escapeMarkdown(`Вы использовали лимит сообщений (${currentFreeMessageLimit}). Для продолжения оплатите доступ. Подсчет КБЖУ это 100% способ стать здоровее и улучшить свою или жизнь ребенка. Продолжим? 👍`);
        
        logChat(chatId, {
            event: 'payment_prompt_details_generated', // Changed from 'payment_prompted' as it's not sent here
            limit: currentFreeMessageLimit,
            current_count: userMessageCount,
            url: paymentUrl
        }, 'system');

        return { 
            proceed: false, 
            prompt: { 
                text: messageText, 
                options: {
                    parse_mode: 'MarkdownV2',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: "Оплатить доступ", url: paymentUrl }]
                        ]
                    }
                }
            } 
        };
    }
    return { proceed: true };
}

function escapeMarkdown(text) {
    // Escape all MarkdownV2 reserved characters: _ * [ ] ( ) ~ ` > # + - = | { } . !
    // GramJS uses its own Markdown parsing, which is different from Bot API's MarkdownV2.
    // For simplicity, we might need to send plain text or use HTML with GramJS if complex formatting is needed.
    // This function might need adjustment if sending Markdown to GramJS.
    return text.replace(/[_[\]()~`>#+\-=|{}.!]/g, '\\$&');
}

// formatReferralLink might not be used if bot client is removed.
// function formatReferralLink(botUsername, referralCode) {
//     // Ensure the equals sign is included after "start"
//     return `https://t.me/${botUsername}/?start=${referralCode}`;
// }

// sendAndLogResponse and sendErrorMessage are effectively replaced by logic within processHandlerResult

// --- Core Message Processing Function ---
async function handleIncomingMessage(chatId, rawUserText, fromUserDetails, messageDate) {
    // fromUserDetails: { id, username, first_name, last_name, language_code } - This is an object representing the sender.
    // messageDate: Date object of the message

    // Ensure chatId is a string for consistency, as GramJS might provide BigInt
    const consistentChatId = String(chatId); 

    let isValidId = validateChatId(consistentChatId);

    if (!isValidId) {
        // If the primary validation fails, check if it's a string representation of a positive integer.
        // This is a common format for user IDs from GramJS (sender.id).
        if (/^\d+$/.test(consistentChatId) && BigInt(consistentChatId) > 0) {
            console.warn(`[handleIncomingMessage] Chat ID ${consistentChatId} failed validateChatId but appears to be a valid positive integer user ID. Proceeding.`);
            isValidId = true; // Override validation based on this basic check
        }
    }

    if (!isValidId) {
        console.error(`[handleIncomingMessage] Некорректный chat ID: ${consistentChatId}`);
        return { action: 'sendError', context: 'system', specificErrorMsg: 'Invalid chat ID.' };
    }

    // Check for /clear command
    const isClearCommand = rawUserText.trim() === '/clear';
    
    if (isClearCommand) {
        try {
            const userFilePath = path.join(USER_DATA_DIR, `${consistentChatId}.json`);
            
            const newUserData = {
                chatId: consistentChatId,
                firstVisit: new Date().toISOString(),
                username: fromUserDetails?.username || null,
                firstName: fromUserDetails?.first_name || fromUserDetails?.firstName || null,
                lastName: fromUserDetails?.last_name || fromUserDetails?.lastName || null,
                languageCode: fromUserDetails?.language_code || fromUserDetails?.langCode || null,
                longMemory: '',
                lastMemoryUpdate: 0,
                isPaid: false,
                lastMessageTimestamp: null,
                followUpSent: false,
                dialogStopped: false,
                pendingBotQuestion: null,
                dialogMovedToUnclear: false
            };
            
            fs.writeFileSync(userFilePath, JSON.stringify(newUserData, null, 2));
            console.info(`[handleIncomingMessage ${consistentChatId}] Профиль пользователя очищен командой /clear.`);

            const chatLogPath = path.join(CHAT_HISTORIES_DIR, `chat_${consistentChatId}.log`);
            if (fs.existsSync(chatLogPath)) {
                try {
                    fs.unlinkSync(chatLogPath);
                    console.info(`[handleIncomingMessage ${consistentChatId}] Лог чата очищен командой /clear.`);
                } catch (unlinkError) {
                    console.error(`Ошибка удаления лога чата для ${consistentChatId}:`, unlinkError);
                }
            }
            
            logChat(consistentChatId, {
                type: 'system_event',
                event: 'clear_command_profile_and_history_reset',
                timestamp: messageDate.toISOString()
            }, 'system');
            
            return { action: 'sendMessage', text: 'История и профиль очищены. Можете начать общение заново.' };
        } catch (error) {
            console.error(`Критическая ошибка при обработке /clear для чата ${consistentChatId}:`, error);
            return { action: 'sendError', context: 'обработки команды /clear', specificErrorMsg: error.message };
        }
    }

    // Sanitize user text for regular messages
    const userTextForLogic = sanitizeString(rawUserText);
    if (!userTextForLogic) {
        console.info(`[handleIncomingMessage ${consistentChatId}] Игнорирование пустого текстового сообщения после очистки.`);
        return { action: 'noReplyNeeded' };
    }
    
    // Check for greeting phrases
    const lowerUserText = userTextForLogic.toLowerCase().trim();
    const words = lowerUserText.split(/\s+/); // Разделяем на слова по пробелам
    
    // Проверяем, является ли сообщение ТОЛЬКО приветствием (одно слово)
    const isPureGreeting = words.length === 1 && GREETING_PHRASES.includes(words[0]);

    if (isPureGreeting) {
        console.info(`[handleIncomingMessage ${consistentChatId}] Обнаружено чистое приветствие: "${userTextForLogic}".`);
        logChat(consistentChatId, { 
            type: 'user_message_received', 
            text: userTextForLogic, 
            detected_as: 'pure_greeting',
            timestamp: messageDate.toISOString() 
        }, 'user');
        logChat(consistentChatId, { 
            event: 'pure_greeting_simple_response', 
            user_text: userTextForLogic 
        }, 'system');
        return { action: 'sendMessage', text: 'Здравствуйте!' };
    }
    
    // --- User data initialization ---
    let userData = loadUserData(consistentChatId);
    const userDataPath = path.join(USER_DATA_DIR, `${consistentChatId}.json`);

    // Create user profile if it doesn't exist
    if (!fs.existsSync(userDataPath) || !userData || Object.keys(userData).length === 0) {
        console.info(`[handleIncomingMessage ${consistentChatId}] Создание нового профиля пользователя.`);
        
        const newUserData = {
            chatId: consistentChatId,
            firstVisit: new Date().toISOString(),
            username: fromUserDetails?.username || null,
            firstName: fromUserDetails?.first_name || fromUserDetails?.firstName || null,
            lastName: fromUserDetails?.last_name || fromUserDetails?.lastName || null,
            languageCode: fromUserDetails?.language_code || fromUserDetails?.langCode || null,
            longMemory: '',
            lastLongMemoryUpdate: 0,
            isPaid: false,
            lastMessageTimestamp: null,
            followUpSent: false,
            dialogStopped: false,
            pendingBotQuestion: null,
            dialogMovedtoUnclear: false
        };
        
        fs.writeFileSync(userDataPath, JSON.stringify(newUserData, null, 2));
        userData = newUserData;
        console.info(`[handleIncomingMessage ${consistentChatId}] Новый профиль пользователя создан.`);
        
        logChat(consistentChatId, {
            type: 'system_event',
            event: 'new_user_profile_created',
            timestamp: messageDate.toISOString()
        }, 'system');
    }
    
    if (userData.dialogStopped) {
        console.info(`[handleIncomingMessage ${consistentChatId}] Диалог ранее остановлен. Сообщение "${userTextForLogic}" игнорируется.`);
        if (validateChatId(consistentChatId)) {
            logChat(consistentChatId, { event: 'user_messaged_after_dialog_stopped_ignored', user_text: userTextForLogic }, 'system');
        } else {
            console.warn(`[LogChat Skipped] Event: user_messaged_after_dialog_stopped_ignored for Chat ID ${consistentChatId} (text: "${userTextForLogic}") as it failed utilities.validateChatId.`);
        }
        return { action: 'noReplyNeeded' };
    }
    if (userData.dialogMovedToUnclear) {
        console.info(`[handleIncomingMessage ${consistentChatId}] Диалог ранее перемещен в "Непонятное". Сообщение "${userTextForLogic}" игнорируется.`);
        logChat(consistentChatId, { event: 'user_messaged_after_dialog_moved_to_unclear_ignored', user_text: userTextForLogic }, 'system');
        return { action: 'noReplyNeeded' };
    }
    
    logChat(consistentChatId, { type: 'user_message_received', text: userTextForLogic, timestamp: messageDate.toISOString() }, 'user');

    try {
        const newDayPrefix = await handleNewDayLogicAndUpdateTimestamp(consistentChatId);
        console.info(`[handleIncomingMessage ${consistentChatId}] Обработка. Длина: ${userTextForLogic.length}. NewDayPrefix: "${newDayPrefix}"`);

        if (ACTIVATION_CODE && userTextForLogic.startsWith('KEY-')) {
            userData = loadUserData(consistentChatId);
            if (userTextForLogic === ACTIVATION_CODE) {
                userData.isPaid = true;
                saveUserData(consistentChatId, userData);
                logChat(consistentChatId, { event: 'activation_success', code_entered: userTextForLogic }, 'system');
                return { action: 'activationResult', text: escapeMarkdown("Activation successful! You can now use the bot without limits."), options: { parse_mode: 'MarkdownV2' } };
            } else {
                logChat(consistentChatId, { event: 'activation_failed', code_entered: userTextForLogic }, 'system');
                return { action: 'activationResult', text: escapeMarkdown("Invalid activation code."), options: { parse_mode: 'MarkdownV2' } };
            }
        }

        const payment = await getPaymentStatus(consistentChatId);
        if (!payment.proceed) {
            if (payment.prompt) {
                logChat(consistentChatId, { event: 'payment_prompt_details_forwarded_for_sending', user_text: userTextForLogic }, 'system');
                return { action: 'promptPayment', text: payment.prompt.text, options: payment.prompt.options };
            }
            return { action: 'noReplyNeeded' };
        }

        // Regular message processing - direct AI interaction
        let llmInputText = newDayPrefix + userTextForLogic;
        if (userData.pendingBotQuestion) {
            const contextPrefix = `[Контекст предыдущего вопроса бота: ${userData.pendingBotQuestion}] `;
            llmInputText = newDayPrefix + contextPrefix + userTextForLogic;
            logChat(consistentChatId, { event: 'user_reply_with_follow_up_context', original_user_text: userTextForLogic, bot_question_context: userData.pendingBotQuestion }, 'system');
            userData.pendingBotQuestion = null;
        }
        
        const assistantText = await callLLM(consistentChatId, [{ type: 'input_text', text: llmInputText }]);
        
        saveUserData(consistentChatId, userData);

        if (assistantText) {
            const stopPhraseDetected = STOP_DIALOG_PHRASES.find(phrase => assistantText.toLowerCase().includes(phrase.toLowerCase()));
            if (stopPhraseDetected) {
                console.info(`[handleIncomingMessage ${consistentChatId}] STOP_DIALOG_PHRASE detected: "${stopPhraseDetected}".`);
                const currentData = loadUserData(consistentChatId);
                currentData.dialogStopped = true;
                saveUserData(consistentChatId, currentData);
                logChat(consistentChatId, { event: 'dialog_stopped_by_llm', trigger_phrase: stopPhraseDetected }, 'system');
                if (ADMIN_TELEGRAM_ID && BOT_SERVER_BASE_URL) {
                    const logFileName = `chat_${consistentChatId}.log`;
                    const logUrl = `${BOT_SERVER_BASE_URL}/chatlogs/${logFileName}`;
                    const adminMessage = `Диалог с пользователем ${consistentChatId} (${userData.username || 'нет username'}) был остановлен LLM (фраза "${stopPhraseDetected}").\nЛог: ${logUrl}`;
                    return { action: 'dialogStoppedAdminNotify', adminMessageText: adminMessage, adminTelegramId: ADMIN_TELEGRAM_ID, originalAssistantText: assistantText };
                }
                return { action: 'sendMessage', text: assistantText };
            }

            if (assistantText.includes(VACANCY_CLOSED_TRIGGER_PHRASE)) {
                const currentFollowUpData = loadUserData(consistentChatId);
                if (!currentFollowUpData.followUpSent && !currentFollowUpData.dialogStopped && !currentFollowUpData.dialogMovedToUnclear) {
                    console.info(`[handleIncomingMessage ${consistentChatId}] Vacancy closed. Scheduling follow-up.`);
                    logChat(consistentChatId, { event: 'follow_up_scheduled_by_handleIncomingMessage', delay_ms: FOLLOW_UP_DELAY_MS }, 'system');
                    
                    if (gramJsClient && gramJsClient.connected) {
                        setTimeout(async () => {
                            try {
                                const freshUserData = loadUserData(consistentChatId);
                                if (freshUserData.followUpSent || freshUserData.dialogStopped || freshUserData.dialogMovedToUnclear) {
                                    logChat(consistentChatId, { event: 'follow_up_skipped_conditions_not_met_at_send_time_gramjs' }, 'system'); return;
                                }
                                console.info(`[GramJS ${consistentChatId}] Sending scheduled follow-up: "${FOLLOW_UP_VACANCY_MESSAGE}"`);
                                
                                const followUpDelay = calculateTypingDelay(FOLLOW_UP_VACANCY_MESSAGE);
                                await simulateTyping(consistentChatId, followUpDelay);
                                await new Promise(resolve => setTimeout(resolve, followUpDelay));

                                await gramJsClient.sendMessage(consistentChatId, { message: FOLLOW_UP_VACANCY_MESSAGE });
                                
                                freshUserData.followUpSent = true;
                                freshUserData.pendingBotQuestion = FOLLOW_UP_VACANCY_MESSAGE;
                                saveUserData(consistentChatId, freshUserData);
                                logChat(consistentChatId, { event: 'follow_up_sent_by_timeout_via_gramjs' }, 'system');
                            } catch (error) {
                                console.error(`[GramJS ${consistentChatId}] Error sending scheduled follow-up:`, error);
                                logChat(consistentChatId, { event: 'follow_up_send_error_in_timeout_via_gramjs', error: error.message }, 'error');
                            }
                        }, FOLLOW_UP_DELAY_MS);
                    } else {
                        logChat(consistentChatId, { event: 'follow_up_skipped_gramjs_client_not_active'}, 'system');
                    }
                } else {
                     logChat(consistentChatId, { event: 'follow_up_skipped_already_sent_stopped_or_unclear_in_handleIncomingMessage' }, 'system');
                }
            }
            return { action: 'sendMessage', text: assistantText };
        } else {
             console.info(`[handleIncomingMessage ${consistentChatId}] No assistant text generated. No response.`);
        }
        return { action: 'noReplyNeeded' };

    } catch (error) {
        console.error(`Критическая ошибка при обработке сообщения для чата ${consistentChatId} в handleIncomingMessage:`, error);
        return { action: 'sendError', context: 'обработки текстового сообщения', specificErrorMsg: error.message };
    }
}

// --- Telegram Bot (node-telegram-bot-api) Event Handlers --- // REMOVED
// if (bot) { ... } 


// --- GramJS User Client Functions ---
async function onNewGramJsMessage(event) {
    console.log('[GramJS Event] New message event received:', JSON.stringify(event.message?.toJSON(), null, 2)); // Log raw message object
    const message = event.message;

    if (!message || !message.senderId) {
        console.log('[GramJS Event] Event does not contain a message with senderId, skipping.');
        return;
    }

    const isPrivate = message.isPrivate;
    const isOut = message.out;
    console.log(`[GramJS Event Filter] Message ID: ${message.id}, isPrivate: ${isPrivate}, isOut: ${isOut}`);

    if (isPrivate && !isOut) { // Process incoming private messages
        const sender = await message.getSender();
        
        if (!sender) {
            console.log(`[GramJS Event Filter] Could not get sender for message ID: ${message.id}, skipping.`);
            return;
        }

        const isUser = sender instanceof Api.User;
        const isBot = isUser ? sender.bot : false;
        const isSelf = isUser ? sender.self : false;
        console.log(`[GramJS Event Filter] Sender type: ${sender.className}, isUser: ${isUser}, isBot: ${isBot}, isSelf: ${isSelf}`);

        if (isUser && !isBot && !isSelf) {
            const chatId = sender.id.toString(); // User's ID
            const userText = message.text;
            
            if (!userText) {
                console.log(`[GramJS ${chatId}] Ignoring non-text message (empty text).`);
                return;
            }
            console.log(`[GramJS ${chatId}] Processing message: "${userText}" from user ${sender.username || chatId}`);

            // Mark the message as read with human-like delay
            await markMessagesAsRead(sender.id, message.id);

            const fromUserDetails = { // Standardize for handleIncomingMessage
                id: sender.id.toString(),
                username: sender.username || null,
                first_name: sender.firstName || null,
                last_name: sender.lastName || null,
                language_code: sender.langCode || null
            };
            const messageDate = new Date(message.date * 1000); // message.date is in seconds

            console.log(`[GramJS ${chatId}] Extracted UserDetails:`, fromUserDetails);
            
            const result = await handleIncomingMessage(chatId, userText, fromUserDetails, messageDate);
            console.log(`[GramJS ${chatId}] Result from handleIncomingMessage:`, result);
            await processHandlerResult(chatId, result, 'GramJS', sender.id);
        } else {
            console.log(`[GramJS Event Filter] Message from sender ID ${message.senderId} did not pass user/bot/self filters.`);
        }
    } else {
        console.log(`[GramJS Event Filter] Message ID ${message.id} was not private or was outgoing.`);
    }
}

async function startGramJsClient() {
    if (!gramJsClient) {
        console.log("[GramJS] Client not configured (e.g., missing API ID/Hash). Skipping start.");
        return false; // Indicate client was not started
    }
    console.log("[GramJS] Attempting to start Telegram User Client...");
    try {
        await gramJsClient.start({
            phoneNumber: async () => {
                console.log("[GramJS Auth] Phone number requested.");
                if (gramJsPhoneNumber) {
                    console.log(`[GramJS Auth] Using phone number from env: ${gramJsPhoneNumber.substring(0,5)}...`);
                    return gramJsPhoneNumber;
                }
                const num = await input.text("Please enter your GramJS phone number (e.g., +1234567890): ");
                console.log(`[GramJS Auth] Phone number entered: ${num.substring(0,5)}...`);
                return num;
            },
            password: async () => {
                console.log("[GramJS Auth] Password (2FA) requested.");
                return await input.text("Please enter your GramJS 2FA password: ");
            },
            phoneCode: async () => {
                console.log("[GramJS Auth] Phone code requested.");
                return await input.text("Please enter the GramJS code you received: ");
            },
            onError: (err) => console.error("[GramJS] Connection/Auth error:", err.message),
        });

        console.log("[GramJS] Successfully connected to Telegram as a user!");
        const me = await gramJsClient.getMe();
        console.log(`[GramJS] Logged in as: ${me.firstName} ${me.lastName || ''} (@${me.username || 'N/A'}, ID: ${me.id})`);

        const currentSessionString = gramJsClient.session.save();
        if (!gramJsSessionString || gramJsSessionString !== currentSessionString) { // Check if session is new or changed
            console.log("\n[GramJS] IMPORTANT: New or updated session string generated.");
            console.log("[GramJS] Please copy this entire string (it might be long) and save it in your .env file as TELEGRAM_SESSION_STRING:");
            console.log("----------------------------------------------------------------------------------");
            console.log(currentSessionString);
            console.log("----------------------------------------------------------------------------------");
            console.log("Then, restart the script. For the current run, this new session will be used.\n");
            // Update the in-memory variable so this session is used if the script continues running
            // and to prevent re-prompting if .env is not updated immediately.
            // However, for persistence, .env update is crucial.
            // process.env.TELEGRAM_SESSION_STRING = currentSessionString; // This only affects current process, not .env file
        }
        
        gramJsClient.addEventHandler(onNewGramJsMessage, new NewMessage({}));
        console.log(`[GramJS] Event handler added. Listening for new messages for the user account.`);
        return true; // Indicate client started
    } catch (err) {
        console.error("[GramJS] Critical error during client start or authentication:", err.message, err);
        if (err.message && err.message.includes("API_ID_INVALID")) {
            console.error("[GramJS] Hint: Make sure your TELEGRAM_API_ID and TELEGRAM_API_HASH are correct in the .env file.");
        } else if (err.message && (err.message.includes("PHONE_NUMBER_INVALID") || err.message.includes("PHONE_CODE_INVALID"))) {
            console.error("[GramJS] Hint: Check the phone number format or the code entered.");
        } else if (err.message && err.message.includes("SESSION_PASSWORD_NEEDED")) {
            console.error("[GramJS] Hint: 2FA is enabled, ensure you handle the password prompt or provide it if the library requires it differently.");
        }
        return false; // Indicate client failed to start
    }
}

// --- Helper to Process `handleIncomingMessage` Result (now only for GramJS) ---
async function processHandlerResult(chatId, result, clientType, gramJsPeerId = null) {
    const logPrefix = `[${clientType} ${chatId}]`; // clientType will be 'GramJS'
    console.log(`${logPrefix} Processing result from handleIncomingMessage:`, result);

    if (!gramJsClient || !gramJsClient.connected) {
        console.error(`${logPrefix} GramJS client not available or not connected for sending message. Action: ${result.action}`);
        return;
    }
    if (!gramJsPeerId && (result.action === 'sendMessage' || result.action === 'activationResult' || result.action === 'promptPayment' || result.action === 'sendError')) {
        console.error(`${logPrefix} gramJsPeerId is null, cannot send message for action: ${result.action}`);
        return;
    }

    try {
        if (result.action === 'sendMessage') {
            console.log(`${logPrefix} Attempting to send reply via GramJS: "${result.text.substring(0,50)}..."`);
            
            // Calculate human-like delay and simulate typing
            const typingDelay = calculateTypingDelay(result.text);
            console.log(`${logPrefix} Calculated typing delay: ${typingDelay}ms`);
            
            // Start typing simulation
            await simulateTyping(gramJsPeerId, typingDelay);
            
            // Wait for the calculated delay
            await new Promise(resolve => setTimeout(resolve, typingDelay));
            
            // Send the actual message
            await gramJsClient.sendMessage(gramJsPeerId, { message: result.text });
            console.log(`${logPrefix} Sent GramJS reply successfully after ${typingDelay}ms delay.`);
            
        } else if (result.action === 'activationResult' || result.action === 'promptPayment') {
            console.log(`${logPrefix} Attempting to send GramJS message (activation/payment): "${result.text.substring(0,50)}..."`);
            
            // Add slight delay for activation/payment messages too
            const quickDelay = Math.random() * 1000 + 1000; // 1-2 seconds
            await simulateTyping(gramJsPeerId, quickDelay);
            await new Promise(resolve => setTimeout(resolve, quickDelay));
            
            await gramJsClient.sendMessage(gramJsPeerId, { message: result.text }); // GramJS options for inline kbd are different
            console.log(`${logPrefix} Sent GramJS message (activation/payment) successfully.`);
            logChat(chatId, { event: `${result.action}_sent_by_${clientType}`, text: result.text }, 'system');
            
        } else if (result.action === 'sendError') {
            const errorMsgToSend = `Sorry, an error occurred: ${result.specificErrorMsg || result.context || 'Unknown error'}`;
            console.log(`${logPrefix} Attempting to send GramJS error message: "${errorMsgToSend.substring(0,70)}..."`);
            
            // Quick delay for error messages
            const errorDelay = 1500;
            await simulateTyping(gramJsPeerId, errorDelay);
            await new Promise(resolve => setTimeout(resolve, errorDelay));
            
            await gramJsClient.sendMessage(gramJsPeerId, { message: errorMsgToSend });
            console.log(`${logPrefix} Sent GramJS error message successfully.`);
        } else if (result.action === 'adminNotifyAndNoReply' || result.action === 'dialogStoppedAdminNotify') {
            console.log(`${logPrefix} Admin notification action: ${result.action}`);
            if (result.adminTelegramId && result.adminMessageText) {
                try {
                    const adminPeerId = BigInt(result.adminTelegramId);
                    console.log(`${logPrefix} Attempting to send admin notification via GramJS to ${adminPeerId}: "${result.adminMessageText.substring(0,50)}..."`);
                    await gramJsClient.sendMessage(adminPeerId, { message: result.adminMessageText });
                    console.log(`${logPrefix} Admin notification sent successfully via GramJS.`);
                    logChat(chatId, { event: `admin_notified_for_${result.action}_via_gramjs` }, 'system');
                } catch (adminError) {
                    console.error(`${logPrefix} Error sending admin notification via GramJS to ${result.adminTelegramId}:`, adminError.message);
                    console.log(`${logPrefix} Admin message was: ${result.adminMessageText}`);
                }
            }
            if (result.action === 'dialogStoppedAdminNotify' && result.originalAssistantText && gramJsPeerId) {
                console.log(`${logPrefix} Attempting to send original stop message via GramJS: "${result.originalAssistantText.substring(0,50)}..."`);
                await gramJsClient.sendMessage(gramJsPeerId, { message: result.originalAssistantText });
                console.log(`${logPrefix} Original stop message sent successfully via GramJS.`);
            }
            console.info(`${logPrefix} ${result.action} processed.`);
        } else if (result.action === 'noReplyNeeded' || result.action === 'profileResetOk') {
            console.info(`${logPrefix} Action is ${result.action}, no further reply needed.`);
        } else {
            console.warn(`${logPrefix} Unexpected action from handleIncomingMessage: ${result.action}`);
        }
    } catch (e) {
        console.error(`${logPrefix} Error in processHandlerResult for GramJS during send:`, e.message, e);
    }
}


// --- Main Application Start ---
async function main() {
    console.log("[Main] Application starting...");
    let gramJsStartedSuccessfully = false;
    if (gramJsClient) {
        console.log("[Main] GramJS client is configured, attempting to start...");
        gramJsStartedSuccessfully = await startGramJsClient();
    } else {
        console.log("[Main] GramJS client is not configured (no API_ID/Hash in .env).");
    }

    if (!gramJsStartedSuccessfully) {
        console.error("[Main] GramJS client failed to start or is not configured. The application's primary Telegram interface is not available.");
        // Decide if the app should exit or continue if only the Express log server is meant to run.
        if (ADMIN_TELEGRAM_ID && BOT_SERVER_BASE_URL && app && typeof app.listen === 'function') { // Check if Express server is set up
            console.log("[Main] Express server for logs might still be running if configured. The application will not exit.");
        } else {
            console.error("[Main] No functional components (GramJS or Log Server). Exiting.");
            process.exit(1);
        }
    } else {
        console.log("[Main] Application running with active GramJS client. Press Ctrl+C to exit.");
    }
    // Keep alive if Express server is running, or if GramJS is running.
    // If GramJS is the only thing, it keeps itself alive with its event loop.
    // If only Express, app.listen() keeps it alive.
}

main().catch(err => {
    console.error("[Main] Unhandled critical error during startup sequence:", err);
    process.exit(1);
});


// --- Graceful Shutdown ---
async function shutdown() {
    console.log('[Main] Shutdown initiated (SIGINT/SIGTERM)...');
    if (gramJsClient && gramJsClient.connected) {
        try {
            console.log('[GramJS] Attempting to disconnect GramJS client...');
            await gramJsClient.disconnect();
            console.log('[GramJS] GramJS client disconnected successfully.');
        } catch (e) {
            console.error('[GramJS] Error during disconnect:', e.message, e);
        }
    } else if (gramJsClient) {
        console.log('[GramJS] Client was configured but not connected (or already disconnected).');
    } else {
        console.log('[GramJS] Client was not configured.');
    }
    console.log('[Main] Exiting process.');
    process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
