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
        console.warn('[Debug] telegramEventsModule.NewMessage does NOT exist or telegramEventsModule is null/undefined.');
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
    callLLM,
    loadUserData, 
    saveUserData,
    getUserMessageCount
} = require('./openai');

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
const GREETING_PHRASES = ["здравствуйте", "привет", "добрый день", "доброе утро", "добрый вечер", "салам", "хелло", "хай", "hello", "hi", "доброго времени суток"];

// Admin and Server Configuration
const ADMIN_TELEGRAM_ID = process.env.ADMIN_TELEGRAM_ID;
const BOT_SERVER_BASE_URL = process.env.BOT_SERVER_BASE_URL; // e.g., http://yourdomain.com or http://your_ip:15656
const SERVER_PORT = 15656;

// Ensure directories exist
fs.mkdirSync(USER_DATA_DIR, { recursive: true });
fs.mkdirSync(CHAT_HISTORIES_DIR, { recursive: true });

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

if (ADMIN_TELEGRAM_ID && BOT_SERVER_BASE_URL) {
    // Ensure CHAT_HISTORIES_DIR is absolute or resolve it correctly
    const absoluteChatHistoriesDir = path.resolve(__dirname, CHAT_HISTORIES_DIR);
    console.log(`[Express] Serving chat logs from: ${absoluteChatHistoriesDir}`);
    app.use('/chatlogs', express.static(absoluteChatHistoriesDir));
    
    app.listen(SERVER_PORT, () => {
        console.log(`[Express] Server for chat logs listening on port ${SERVER_PORT}.`);
        console.log(`[Express] Example log URL: ${BOT_SERVER_BASE_URL}/chatlogs/chat_<chatId>.log`);
    });

} else {
    console.warn('[Express] ADMIN_TELEGRAM_ID or BOT_SERVER_BASE_URL not set. Chat log web server will be disabled.');
    // Start a minimal server if no admin features, just to keep process alive if only express is running.
    // However, GramJS will keep it alive. If GramJS is also disabled, then the script might exit.
    // For now, if no admin server, Express won't listen unless other routes are added.
}


// --- Helper Functions ---

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

    if (!validateChatId(consistentChatId)) {
        console.error(`[handleIncomingMessage] Некорректный chat ID: ${consistentChatId}`);
        return { action: 'sendError', context: 'system', specificErrorMsg: 'Invalid chat ID.' };
    }

    const isStartCommand = rawUserText.startsWith('/start');
    let startParam = null;
    let userTextForLogic = rawUserText;

    if (isStartCommand) {
        const match = rawUserText.match(/\/start(?:\s+(.+))?/);
        startParam = match?.[1] ? sanitizeString(match[1]) : null;
        userTextForLogic = '/start'; // Normalized for the /start block
        console.info(`[handleIncomingMessage ${consistentChatId}] Processing /start command. Param: ${startParam}`);
    } else {
        userTextForLogic = sanitizeString(rawUserText); // Sanitize for regular messages
        if (!userTextForLogic) {
            console.info(`[handleIncomingMessage ${consistentChatId}] Игнорирование пустого текстового сообщения после очистки.`);
            return { action: 'noReplyNeeded' };
        }
    }
    
    // --- /start command logic ---
    if (userTextForLogic === '/start') {
        try {
            const userFilePath = path.join(USER_DATA_DIR, `${consistentChatId}.json`);
            let howPassed = startParam ? `через параметр: ${startParam}` : 'прямая команда /start';

            const userDataOnStart = {
                chatId: consistentChatId,
                firstVisit: new Date().toISOString(),
                startParameter: startParam,
                howPassed: howPassed,
                username: fromUserDetails?.username || null, // fromUserDetails is the sender object
                firstName: fromUserDetails?.first_name || fromUserDetails?.firstName || null, // Adapt to GramJS sender properties
                lastName: fromUserDetails?.last_name || fromUserDetails?.lastName || null,
                languageCode: fromUserDetails?.language_code || fromUserDetails?.langCode || null,
                longMemory: '',
                lastLongMemoryUpdate: 0,
                isPaid: false,
                providedName: startParam || null,
                lastRestartTime: new Date().toISOString(),
                lastMessageTimestamp: null,
                followUpSent: false,
                dialogStopped: false,
                pendingBotQuestion: null,
                awaitingFirstMessageAfterStart: true,
                dialogMovedToUnclear: false
            };
            
            if (startParam) {
                userDataOnStart.howPassed = `через параметр: ${startParam}, который был принят за имя при старте.`;
                logChat(consistentChatId, {
                    type: 'name_inferred_from_start_param_on_start',
                    name: startParam,
                    timestamp: new Date().toISOString()
                }, 'system');
            }
            
            fs.writeFileSync(userFilePath, JSON.stringify(userDataOnStart, null, 2));
            console.info(`[handleIncomingMessage ${consistentChatId}] Профиль пользователя пересоздан и сохранен.`);

            const chatLogPath = path.join(CHAT_HISTORIES_DIR, `chat_${consistentChatId}.log`);
            if (fs.existsSync(chatLogPath)) {
                try {
                    fs.unlinkSync(chatLogPath);
                    console.info(`[handleIncomingMessage ${consistentChatId}] Лог чата очищен из-за команды /start.`);
                } catch (unlinkError) {
                    console.error(`Ошибка удаления лога чата для ${consistentChatId}:`, unlinkError);
                }
            }
            logChat(consistentChatId, {
                type: 'system_event',
                event: 'start_command_profile_recreated_awaiting_message',
                howPassed: userDataOnStart.howPassed,
                startParam: startParam,
                timestamp: messageDate.toISOString()
            }, 'system');
            
            return { action: 'profileResetOk' };
        } catch (error) {
            console.error(`Критическая ошибка при обработке /start для чата ${consistentChatId} в handleIncomingMessage:`, error);
            return { action: 'sendError', context: 'обработки команды /start', specificErrorMsg: error.message };
        }
    }

    // --- Regular message logic ---
    let userData = loadUserData(consistentChatId);
    const userDataPath = path.join(USER_DATA_DIR, `${consistentChatId}.json`);

    if (!fs.existsSync(userDataPath) || !userData || Object.keys(userData).length === 0) {
        console.info(`[handleIncomingMessage ${consistentChatId}] Файл данных пользователя не найден или пуст. Предлагаем /start.`);
        logChat(consistentChatId, { type: 'user_message_received_no_profile', text: userTextForLogic, timestamp: messageDate.toISOString() }, 'user');
        logChat(consistentChatId, { type: 'system_event', event: 'prompted_start_no_userdata_on_message' }, 'system');
        return { action: 'sendMessage', text: 'Пожалуйста, используйте команду /start, чтобы начать.' };
    }
    
    if (userData.dialogStopped) {
        console.info(`[handleIncomingMessage ${consistentChatId}] Диалог ранее остановлен. Сообщение "${userTextForLogic}" игнорируется.`);
        logChat(consistentChatId, { event: 'user_messaged_after_dialog_stopped_ignored', user_text: userTextForLogic }, 'system');
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
                 // Log that payment prompt details were generated, actual sending is up to caller
                logChat(consistentChatId, { event: 'payment_prompt_details_forwarded_for_sending', user_text: userTextForLogic }, 'system');
                return { action: 'promptPayment', text: payment.prompt.text, options: payment.prompt.options };
            }
            return { action: 'noReplyNeeded' }; // Should ideally not happen if prompt is always returned
        }

        let assistantText;
        let performLlmCall = true;

        if (userData.awaitingFirstMessageAfterStart) {
            console.info(`[handleIncomingMessage ${consistentChatId}] Это первое сообщение после /start. Анализ: "${userTextForLogic}"`);
            const classificationPrompt = `Проанализируй следующее сообщение пользователя. Связано ли оно с поиском работы, трудоустройством, резюме или вакансиями? Ответь только "да" или "нет". Сообщение пользователя: "${userTextForLogic}"`;
            const classificationResponse = await callLLM(consistentChatId, [{ type: 'input_text', text: classificationPrompt }]);
            logChat(consistentChatId, { event: 'first_message_classification_attempt', user_text: userTextForLogic, llm_raw_classification: classificationResponse }, 'system');

            const lowerUserText = userTextForLogic.toLowerCase();
            const isGreeting = GREETING_PHRASES.some(phrase => lowerUserText.startsWith(phrase));

            if (classificationResponse && classificationResponse.toLowerCase().includes('да')) {
                console.info(`[handleIncomingMessage ${consistentChatId}] Первое сообщение LLM-классифицировано как связанное с работой.`);
                let initialContextPrefix = userData.providedName ? `Пользователь ${userData.providedName} только что запустил диалог (профиль был сброшен). Его первое сообщение после сброса (определено как связанное с работой): ` : "Пользователь только что запустил диалог (профиль был сброшен). Его первое сообщение после сброса (определено как связанное с работой): ";
                const llmInputTextForJobRelated = newDayPrefix + initialContextPrefix + userTextForLogic;
                assistantText = await callLLM(consistentChatId, [{ type: 'input_text', text: llmInputTextForJobRelated }]);
            } else if (isGreeting) {
                console.info(`[handleIncomingMessage ${consistentChatId}] Первое сообщение - приветствие: "${userTextForLogic}".`);
                assistantText = "Здравствуйте!";
                logChat(consistentChatId, { event: 'first_message_is_greeting_reply', user_text: userTextForLogic, bot_response: assistantText }, 'system');
            } else {
                console.info(`[handleIncomingMessage ${consistentChatId}] Первое сообщение не по теме и не приветствие. Перемещение в "Непонятное".`);
                logChat(consistentChatId, { event: 'first_message_not_job_related_not_greeting', user_text: userTextForLogic, action: 'move_to_unclear' }, 'system');
                userData.dialogMovedToUnclear = true;
                performLlmCall = false;
                if (ADMIN_TELEGRAM_ID) {
                    const logFileName = `chat_${consistentChatId}.log`;
                    const logUrl = BOT_SERVER_BASE_URL ? `${BOT_SERVER_BASE_URL}/chatlogs/${logFileName}` : `(логи локально)`;
                    const adminMessage = `Диалог с пользователем ${consistentChatId} (${userData.username || 'нет username'}) перемещен в "Непонятное" после первого сообщения (не по теме и не приветствие).\nСообщение: "${userTextForLogic}"\nЛог: ${logUrl}`;
                    saveUserData(consistentChatId, userData); // Save before returning
                    return { action: 'adminNotifyAndNoReply', adminMessageText: adminMessage, adminTelegramId: ADMIN_TELEGRAM_ID };
                }
            }
            userData.awaitingFirstMessageAfterStart = false;
        } else {
            // Regular message processing
            let llmInputTextRegular = newDayPrefix + userTextForLogic;
            if (userData.pendingBotQuestion) {
                const contextPrefix = `[Контекст предыдущего вопроса бота: ${userData.pendingBotQuestion}] `;
                llmInputTextRegular = newDayPrefix + contextPrefix + userTextForLogic;
                logChat(consistentChatId, { event: 'user_reply_with_follow_up_context', original_user_text: userTextForLogic, bot_question_context: userData.pendingBotQuestion }, 'system');
                userData.pendingBotQuestion = null;
            }
            assistantText = await callLLM(consistentChatId, [{ type: 'input_text', text: llmInputTextRegular }]);
        }
        
        saveUserData(consistentChatId, userData);

        if (performLlmCall && assistantText) {
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
                    
                    // Follow-up messages will now be attempted via GramJS if it's active.
                    if (gramJsClient && gramJsClient.connected) {
                        setTimeout(async () => {
                            try {
                                const freshUserData = loadUserData(consistentChatId);
                                if (freshUserData.followUpSent || freshUserData.dialogStopped || freshUserData.dialogMovedToUnclear) {
                                    logChat(consistentChatId, { event: 'follow_up_skipped_conditions_not_met_at_send_time_gramjs' }, 'system'); return;
                                }
                                console.info(`[GramJS ${consistentChatId}] Sending scheduled follow-up: "${FOLLOW_UP_VACANCY_MESSAGE}"`);
                                // GramJS typing action is more involved, skipping for now.
                                // await gramJsClient.invoke(new Api.messages.SetTyping({ peer: consistentChatId, action: new Api.SendMessageTypingAction() }));
                                // await new Promise(resolve => setTimeout(resolve, TYPING_DELAY_MS / 2 )); // Shorter delay maybe

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
        } else if (!performLlmCall && userData.dialogMovedToUnclear) {
            return { action: 'noReplyNeeded' };
        } else if (!performLlmCall) {
             console.info(`[handleIncomingMessage ${consistentChatId}] No LLM call performed or no assistant text. No response.`);
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
            await gramJsClient.sendMessage(gramJsPeerId, { message: result.text });
            console.log(`${logPrefix} Sent GramJS reply successfully.`);
        } else if (result.action === 'activationResult' || result.action === 'promptPayment') {
            console.log(`${logPrefix} Attempting to send GramJS message (activation/payment): "${result.text.substring(0,50)}..."`);
            await gramJsClient.sendMessage(gramJsPeerId, { message: result.text }); // GramJS options for inline kbd are different
            console.log(`${logPrefix} Sent GramJS message (activation/payment) successfully.`);
            logChat(chatId, { event: `${result.action}_sent_by_${clientType}`, text: result.text }, 'system');
        } else if (result.action === 'sendError') {
            const errorMsgToSend = `Sorry, an error occurred: ${result.specificErrorMsg || result.context || 'Unknown error'}`;
            console.log(`${logPrefix} Attempting to send GramJS error message: "${errorMsgToSend.substring(0,70)}..."`);
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
