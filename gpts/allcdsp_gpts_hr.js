const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');
const express = require('express');

// Log NAMEPROMPT early to see what .env file will be targeted
const NAMEPROMPT_FROM_ENV = process.env.NAMEPROMPT || 'hr';
console.log(`[Debug] NAMEPROMPT for .env file: ${NAMEPROMPT_FROM_ENV}`);
const envFilePath = path.join(__dirname, `.env.${NAMEPROMPT_FROM_ENV}`);
console.log(`[Debug] Attempting to load .env file from: ${envFilePath}`);

const config = require('./config'); // Import config first
const { NAMEPROMPT, USER_DATA_DIR, CHAT_HISTORIES_DIR, FREE_MESSAGE_LIMIT } = config;

// Log FREE_MESSAGE_LIMIT from config right after import
console.log(`[Debug] FREE_MESSAGE_LIMIT from config.js: ${FREE_MESSAGE_LIMIT}`);
console.log(`[Debug] Raw process.env.FREE_MESSAGE_LIMIT before dotenv.config: ${process.env.FREE_MESSAGE_LIMIT}`);

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
    // Update the destructured FREE_MESSAGE_LIMIT if it changed
    if (FREE_MESSAGE_LIMIT !== reloadedConfig.FREE_MESSAGE_LIMIT) {
        console.log(`[Debug] FREE_MESSAGE_LIMIT updated after dotenv load from ${FREE_MESSAGE_LIMIT} to ${reloadedConfig.FREE_MESSAGE_LIMIT}`);
        // It's tricky to re-assign to a const, so it's better if config.js is structured to always provide the latest
        // For this debug, we'll just log. In a real scenario, ensure config always reflects current env.
    }
}

// Follow-up message configuration
const FOLLOW_UP_DELAY_MS = 30 * 1000; // 30 sec for testing
const VACANCY_CLOSED_TRIGGER_PHRASE = "к сожалению"; 
const FOLLOW_UP_VACANCY_MESSAGE = "Давно ищите оффер?";
const STOP_DIALOG_MESSAGE = "человеку";
const TYPING_DELAY_MS = 10000; // 10 seconds for typing simulation

// Admin and Server Configuration
const ADMIN_TELEGRAM_ID = process.env.ADMIN_TELEGRAM_ID;
const BOT_SERVER_BASE_URL = process.env.BOT_SERVER_BASE_URL; // e.g., http://yourdomain.com or http://your_ip:15656
const SERVER_PORT = 15656;

// Ensure directories exist
fs.mkdirSync(USER_DATA_DIR, { recursive: true });
fs.mkdirSync(CHAT_HISTORIES_DIR, { recursive: true });

// --- Initialize Bot ---
const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
    console.error(`Ошибка: TELEGRAM_BOT_TOKEN не определен в файле .env.${NAMEPROMPT}`);
    process.exit(1);
}

const openaiApiKey = process.env.OPENAI_API_KEY;
const deepseekApiKey = process.env.DEEPSEEK_API_KEY;
const ACTIVATION_CODE = process.env.ACTIVATION_CODE; // e.g., "KEY-SOMEKEY123"
const PAYMENT_URL_TEMPLATE = process.env.PAYMENT_URL_TEMPLATE || 'https://noxon.wpmix.net/counter.php?tome=1&msg={NAMEPROMPT}_{chatid}&cal=1';

if (!openaiApiKey && !deepseekApiKey) {
    console.error(`Ошибка: Ни OPENAI_API_KEY, ни DEEPSEEK_API_KEY не определены в файле .env.${NAMEPROMPT}`);
    process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });

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

// --- Express Server for Logs ---
if (ADMIN_TELEGRAM_ID && BOT_SERVER_BASE_URL) {
    const app = express();
    
    // Ensure CHAT_HISTORIES_DIR is absolute or resolve it correctly
    const absoluteChatHistoriesDir = path.resolve(__dirname, CHAT_HISTORIES_DIR);
    console.log(`[Express] Serving chat logs from: ${absoluteChatHistoriesDir}`);

    app.use('/chatlogs', express.static(absoluteChatHistoriesDir));

    app.listen(SERVER_PORT, () => {
        console.log(`[Express] Server listening on port ${SERVER_PORT} for chat logs.`);
        console.log(`[Express] Example log URL: ${BOT_SERVER_BASE_URL}/chatlogs/chat_<chatId>.log`);
    });
} else {
    console.warn('[Express] ADMIN_TELEGRAM_ID or BOT_SERVER_BASE_URL not set. Chat log server and admin notifications for stopped dialogs will be disabled.');
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

async function checkPaymentStatusAndPrompt(chatId) {
    const userData = loadUserData(chatId);
    if (userData.isPaid) {
        return true;
    }
    
    // Get fresh FREE_MESSAGE_LIMIT from reloaded config
    const reloadedConfig = require('./config');
    if (reloadedConfig.FREE_MESSAGE_LIMIT === null) { // null means unlimited
        return true;
    }

    const userMessageCount = getUserMessageCount(chatId);

    if (userMessageCount >= reloadedConfig.FREE_MESSAGE_LIMIT) {
        const paymentUrl = PAYMENT_URL_TEMPLATE
            .replace('{NAMEPROMPT}', NAMEPROMPT)
            .replace('{chatid}', chatId.toString());

        const messageText = escapeMarkdown(`Вы использовали лимит сообщений (${reloadedConfig.FREE_MESSAGE_LIMIT}). Для продолжения оплатите доступ. Подсчет КБЖУ это 100% способ стать здоровее и улучшить свою или жизнь ребенка. Продолжим? 👍`);
        
        try {
            await bot.sendMessage(chatId, messageText, {
                parse_mode: 'MarkdownV2',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "Оплатить доступ", url: paymentUrl }]
                    ]
                }
            });
            logChat(chatId, {
                event: 'payment_prompted',
                limit: reloadedConfig.FREE_MESSAGE_LIMIT,
                current_count: userMessageCount,
                url: paymentUrl
            }, 'system');
        } catch (error) {
            console.error(`Error sending payment prompt to ${chatId}:`, error);
        }
        return false; // User needs to pay
    }
    return true; // User can proceed
}

function escapeMarkdown(text) {
    // Escape all MarkdownV2 reserved characters: _ * [ ] ( ) ~ ` > # + - = | { } . !
    return text.replace(/[_[\]()~`>#+\-=|{}.!]/g, '\\$&');
}

function formatReferralLink(botUsername, referralCode) {
    // Ensure the equals sign is included after "start"
    return `https://t.me/${botUsername}/?start=${referralCode}`;
}

async function sendAndLogResponse(chatId, assistantText) {
    try {
        // await bot.sendChatAction(chatId, 'typing'); // Removed: Typing action is now handled before LLM call
        
        let escapedText = escapeMarkdown(assistantText);
        
        // Отправляем сообщение в Telegram
        await bot.sendMessage(chatId, escapedText, { parse_mode: 'MarkdownV2' });
        
        console.info(`[Bot ${chatId}] Отправлен ответ длиной ${assistantText.length}`);
    } catch (error) {
        console.error(`Ошибка отправки сообщения для чата ${chatId}:`, error.message);
        try {
            // Попытка отправить без форматирования при ошибке
            await bot.sendMessage(chatId, assistantText);
        } catch (fallbackError) {
            console.error(`Не удалось отправить даже без форматирования:`, fallbackError.message);
        }
    }
}

async function sendErrorMessage(chatId, specificErrorMsg, context = 'обработки вашего запроса') {
    console.error(`Ошибка во время ${context} для чата ${chatId}:`, specificErrorMsg);
    try {
        await bot.sendMessage(
            chatId,
            `Извините, возникла проблема во время ${context}. Пожалуйста, повторите попытку. Если ошибка повторяется, попробуйте перезапустить бота командой /start.`
        );
        logChat(chatId, {
            error: `error_in_${context.replace(/\s+/g, '_')}`,
            message: specificErrorMsg,
            timestamp: new Date().toISOString()
        }, 'error');
    } catch (sendError) {
        console.error(`Не удалось отправить сообщение об ошибке в чат ${chatId}:`, sendError.message);
    }
}

// --- Telegram Bot Event Handlers ---

bot.onText(/\/start(?:\s+(.+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    if (!validateChatId(chatId)) {
        console.error(`Некорректный chat ID в /start: ${msg.chat.id}`);
        return;
    }
    console.info(`[Start ${chatId}] Получена команда /start. Профиль будет пересоздан, история чата удалена.`);

    try {
        const userFilePath = path.join(USER_DATA_DIR, `${chatId}.json`);
        let startParam = match?.[1] ? sanitizeString(match[1]) : null;
        let howPassed = startParam ? `через параметр: ${startParam}` : 'прямая команда /start';

        const userData = {
            chatId: chatId.toString(),
            firstVisit: new Date().toISOString(), 
            startParameter: startParam, // Store original startParam
            howPassed: howPassed,
            username: msg.from?.username || null,
            firstName: msg.from?.first_name || null,
            lastName: msg.from?.last_name || null,
            languageCode: msg.from?.language_code || null,
            longMemory: '',
            lastLongMemoryUpdate: 0,
            isPaid: false, 
            providedName: startParam || null, // If startParam exists, use it as providedName initially
            lastRestartTime: new Date().toISOString(),
            lastMessageTimestamp: null, 
            followUpSent: false, 
            dialogStopped: false, 
            pendingBotQuestion: null,
            awaitingFirstMessageAfterStart: true, // Flag to indicate bot is waiting for the first message
            dialogMovedToUnclear: false // Flag for "Непонятное"
        };
        
        if (startParam) {
            // Update howPassed if startParam is treated as a name, for logging clarity
            userData.howPassed = `через параметр: ${startParam}, который был принят за имя при старте.`;
            logChat(chatId, { // Log this assumption immediately
                type: 'name_inferred_from_start_param_on_start',
                name: startParam,
                timestamp: new Date().toISOString()
            }, 'system');
        }
        
        fs.writeFileSync(userFilePath, JSON.stringify(userData, null, 2));
        console.info(`[Start ${chatId}] Профиль пользователя пересоздан и сохранен. Ожидание первого сообщения от пользователя.`);

        const chatLogPath = path.join(CHAT_HISTORIES_DIR, `chat_${chatId}.log`);
        if (fs.existsSync(chatLogPath)) {
            try {
                fs.unlinkSync(chatLogPath);
                console.info(`[Start ${chatId}] Лог чата очищен из-за команды /start.`);
            } catch (unlinkError) {
                console.error(`Ошибка удаления лога чата для ${chatId}:`, unlinkError);
            }
        } else {
            console.info(`[Start ${chatId}] Лог чата не найден для удаления (возможно, это первый старт или предыдущий сброс).`);
        }

        logChat(chatId, {
            type: 'system_event',
            event: 'start_command_profile_recreated_awaiting_message', 
            howPassed: userData.howPassed, // Use updated howPassed
            startParam: startParam,
            timestamp: new Date(msg.date * 1000).toISOString()
        }, 'system');

        // Bot will not send any message here. It waits for the user's first message.

    } catch (error) {
        console.error(`Критическая ошибка при обработке /start для чата ${chatId}:`, error);
        await sendErrorMessage(chatId, error.message, 'обработки команды /start');
    }
});

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    if (!validateChatId(chatId)) {
        console.error(`Некорректный chat ID в обработчике сообщений: ${msg.chat.id}`);
        return;
    }
    if (msg.text && msg.text.startsWith('/start')) {
        // This is handled by bot.onText for /start, so we can ignore it here
        // or ensure that onText is processed first. Typically, specific handlers like onText run before generic 'message'.
        return;
    }
    if (!msg.text) {
        console.info(`[Сообщение ${chatId}] Игнорирование нетекстового сообщения (тип: ${msg.document ? 'document' : msg.sticker ? 'sticker' : 'other'})`);
        return;
    }

    const userText = sanitizeString(msg.text);
    if (!userText) {
        console.info(`[Сообщение ${chatId}] Игнорирование пустого текстового сообщения после очистки.`);
        return;
    }

    let userData = loadUserData(chatId); 

    const userDataPath = path.join(USER_DATA_DIR, `${chatId}.json`);
    if (!fs.existsSync(userDataPath) || !userData || Object.keys(userData).length === 0) {
        console.info(`[Сообщение ${chatId}] Файл данных пользователя не найден или пуст. Предлагаем /start.`);
        // Log the incoming message before prompting for /start
        logChat(chatId, { type: 'user_message_received_no_profile', text: userText, timestamp: new Date(msg.date * 1000).toISOString() }, 'user');
        await bot.sendMessage(chatId, 'Пожалуйста, используйте команду /start, чтобы начать.');
        logChat(chatId, { type: 'system_event', event: 'prompted_start_no_userdata_on_message' }, 'system');
        return;
    }
    
    if (userData.dialogStopped) {
        console.info(`[Сообщение ${chatId}] Диалог ранее остановлен (dialogStopped). Сообщение от пользователя "${userText}" игнорируется.`);
        logChat(chatId, { event: 'user_messaged_after_dialog_stopped_ignored', user_text: userText }, 'system');
        return; 
    }
    if (userData.dialogMovedToUnclear) {
        console.info(`[Сообщение ${chatId}] Диалог ранее перемещен в "Непонятное". Сообщение от пользователя "${userText}" игнорируется.`);
        logChat(chatId, { event: 'user_messaged_after_dialog_moved_to_unclear_ignored', user_text: userText }, 'system');
        return;
    }
    
    // Log user message early
    logChat(chatId, { type: 'user_message_received', text: userText, timestamp: new Date(msg.date * 1000).toISOString() }, 'user');

    try {
        const newDayPrefix = await handleNewDayLogicAndUpdateTimestamp(chatId);
        console.info(`[Сообщение ${chatId}] Обработка текстового сообщения. Длина: ${userText.length}. NewDayPrefix: "${newDayPrefix}"`);

        if (ACTIVATION_CODE && userText.startsWith('KEY-')) {
            if (userText === ACTIVATION_CODE) {
                userData.isPaid = true;
                saveUserData(chatId, userData);
                await bot.sendMessage(chatId, escapeMarkdown("Activation successful! You can now use the bot without limits."), { parse_mode: 'MarkdownV2' });
                logChat(chatId, { event: 'activation_success', code_entered: userText }, 'system');
            } else {
                await bot.sendMessage(chatId, escapeMarkdown("Invalid activation code."), { parse_mode: 'MarkdownV2' });
                logChat(chatId, { event: 'activation_failed', code_entered: userText }, 'system');
            }
            return; 
        }

        const canProceed = await checkPaymentStatusAndPrompt(chatId);
        if (!canProceed) {
            return;
        }

        let assistantText;
        let performLlmCall = true;

        if (userData.awaitingFirstMessageAfterStart) {
            console.info(`[Сообщение ${chatId}] Это первое сообщение после /start. Анализ тематики: "${userText}"`);
            
            // For classification, we call LLM without the 10s typing delay.
            // Note: This classification call might appear in the LLM's context history unless callLLM has a way to prevent it for specific calls.
            const classificationPrompt = `Проанализируй следующее сообщение пользователя. Связано ли оно с поиском работы, трудоустройством, резюме или вакансиями? Ответь только "да" или "нет". Сообщение пользователя: "${userText}"`;
            const classificationResponse = await callLLM(chatId, [{ type: 'input_text', text: classificationPrompt }]); 
            
            logChat(chatId, { 
                event: 'first_message_classification_attempt', 
                user_text: userText, 
                classification_prompt: classificationPrompt, 
                llm_raw_classification: classificationResponse 
            }, 'system');

            if (classificationResponse && classificationResponse.toLowerCase().includes('да')) {
                console.info(`[Сообщение ${chatId}] Первое сообщение определено как связанное с работой.`);
                
                // Typing simulation: send "typing", wait
                await bot.sendChatAction(chatId, 'typing');
                await new Promise(resolve => setTimeout(resolve, TYPING_DELAY_MS));

                let initialContextPrefix;
                if (userData.providedName) { // Name might have come from startParam
                    initialContextPrefix = `Пользователь ${userData.providedName} только что запустил диалог (профиль был сброшен). Его первое сообщение после сброса: `;
                } else {
                    initialContextPrefix = "Пользователь только что запустил диалог (профиль был сброшен). Его первое сообщение после сброса: ";
                }
                const llmInputTextForJobRelated = newDayPrefix + initialContextPrefix + userText;
                assistantText = await callLLM(chatId, [{ type: 'input_text', text: llmInputTextForJobRelated }]);
                
            } else {
                console.info(`[Сообщение ${chatId}] Первое сообщение НЕ определено как связанное с работой. Перемещение в "Непонятное".`);
                logChat(chatId, { 
                    event: 'first_message_not_job_related', 
                    user_text: userText, 
                    classification_response: classificationResponse, 
                    action: 'move_to_unclear' 
                }, 'system');
                userData.dialogMovedToUnclear = true;
                performLlmCall = false; // Do not proceed to send a message to the user

                if (ADMIN_TELEGRAM_ID) {
                    try {
                        const logFileName = `chat_${chatId}.log`;
                        const logUrl = BOT_SERVER_BASE_URL ? `${BOT_SERVER_BASE_URL}/chatlogs/${logFileName}` : `(логи локально)`;
                        await bot.sendMessage(ADMIN_TELEGRAM_ID, `Диалог с пользователем ${chatId} (${userData.username || 'нет username'}) перемещен в "Непонятное" после первого сообщения (не по теме).\nСообщение: "${userText}"\nЛог: ${logUrl}`);
                    } catch (adminNotifyError) {
                        console.error(`[Bot ${chatId}] Error notifying admin about unclear dialog:`, adminNotifyError);
                    }
                }
            }
            userData.awaitingFirstMessageAfterStart = false; // Clear the flag
        } else {
            // Regular message processing
            // Typing simulation: send "typing", wait
            await bot.sendChatAction(chatId, 'typing');
            await new Promise(resolve => setTimeout(resolve, TYPING_DELAY_MS));

            let llmInputTextRegular = newDayPrefix + userText;
            if (userData.pendingBotQuestion) {
                const botQuestionContext = userData.pendingBotQuestion;
                const contextPrefix = `[Контекст предыдущего вопроса бота: ${botQuestionContext}] `;
                llmInputTextRegular = newDayPrefix + contextPrefix + userText;
                logChat(chatId, {
                    event: 'user_reply_with_follow_up_context',
                    original_user_text: userText,
                    bot_question_context: botQuestionContext,
                }, 'system');
                userData.pendingBotQuestion = null; 
            }
            assistantText = await callLLM(chatId, [{ type: 'input_text', text: llmInputTextRegular }]);
        }
        
        saveUserData(chatId, userData); // Save changes like awaitingFirstMessageAfterStart, pendingBotQuestion, dialogMovedToUnclear

        if (performLlmCall && assistantText) { 
            await sendAndLogResponse(chatId, assistantText);

            if (assistantText.includes(STOP_DIALOG_MESSAGE)) {
                console.info(`[Bot ${chatId}] STOP_DIALOG_MESSAGE detected: "${STOP_DIALOG_MESSAGE}". Stopping dialog and notifying admin.`);
                const currentData = loadUserData(chatId); 
                currentData.dialogStopped = true;
                saveUserData(chatId, currentData);
                logChat(chatId, {
                    event: 'dialog_stopped_by_llm',
                    trigger_phrase: STOP_DIALOG_MESSAGE,
                    admin_notified: !!(ADMIN_TELEGRAM_ID && BOT_SERVER_BASE_URL)
                }, 'system');

                if (ADMIN_TELEGRAM_ID && BOT_SERVER_BASE_URL) {
                    try {
                        const logFileName = `chat_${chatId}.log`;
                        const logUrl = `${BOT_SERVER_BASE_URL}/chatlogs/${logFileName}`; 
                        await bot.sendMessage(ADMIN_TELEGRAM_ID, `Диалог с пользователем ${chatId} был остановлен LLM (фраза "${STOP_DIALOG_MESSAGE}").\nЛог: ${logUrl}`);
                    } catch (adminNotifyError) {
                        console.error(`[Bot ${chatId}] Error notifying admin about stopped dialog:`, adminNotifyError);
                    }
                }
                return; 
            }

            if (assistantText.includes(VACANCY_CLOSED_TRIGGER_PHRASE)) {
                const currentFollowUpData = loadUserData(chatId); 
                if (!currentFollowUpData.followUpSent && !currentFollowUpData.dialogStopped && !currentFollowUpData.dialogMovedToUnclear) { // Added checks
                    console.info(`[Bot ${chatId}] Vacancy closed message detected. Scheduling follow-up: "${FOLLOW_UP_VACANCY_MESSAGE}" in ${FOLLOW_UP_DELAY_MS / 1000 / 60} minutes.`);
                    logChat(chatId, { 
                        event: 'follow_up_scheduled', 
                        trigger_phrase_detected: VACANCY_CLOSED_TRIGGER_PHRASE,
                        follow_up_message: FOLLOW_UP_VACANCY_MESSAGE,
                        delay_ms: FOLLOW_UP_DELAY_MS
                    }, 'system');

                    setTimeout(async () => {
                        try {
                            const freshUserData = loadUserData(chatId);
                            if (freshUserData.followUpSent || freshUserData.dialogStopped || freshUserData.dialogMovedToUnclear) { // Re-check critical flags
                                console.info(`[Bot ${chatId}] Follow-up conditions not met (sent/stopped/unclear), skipping scheduled message: "${FOLLOW_UP_VACANCY_MESSAGE}"`);
                                logChat(chatId, { event: 'follow_up_skipped_conditions_not_met', message: FOLLOW_UP_VACANCY_MESSAGE, sent: freshUserData.followUpSent, stopped: freshUserData.dialogStopped, unclear: freshUserData.dialogMovedToUnclear }, 'system');
                                return;
                            }
                            console.info(`[Bot ${chatId}] Sending scheduled follow-up message: "${FOLLOW_UP_VACANCY_MESSAGE}"`);
                            
                            // Simulate typing for the follow-up message as well
                            await bot.sendChatAction(chatId, 'typing');
                            await new Promise(resolve => setTimeout(resolve, TYPING_DELAY_MS)); // Optional: shorter delay for automated follow-up?
                                                                                             // Using same TYPING_DELAY_MS for consistency.

                            await sendAndLogResponse(chatId, FOLLOW_UP_VACANCY_MESSAGE);

                            freshUserData.followUpSent = true;
                            freshUserData.pendingBotQuestion = FOLLOW_UP_VACANCY_MESSAGE; 
                            saveUserData(chatId, freshUserData);

                            logChat(chatId, { 
                                event: 'follow_up_sent', 
                                message: FOLLOW_UP_VACANCY_MESSAGE 
                            }, 'system');
                            logChat(chatId, {
                                event: 'follow_up_context_set',
                                question: FOLLOW_UP_VACANCY_MESSAGE
                            }, 'system');
                        } catch (error) {
                            console.error(`[Bot ${chatId}] Error sending scheduled follow-up message:`, error);
                            logChat(chatId, { 
                                event: 'follow_up_send_error', 
                                message: FOLLOW_UP_VACANCY_MESSAGE,
                                error: error.message 
                            }, 'error');
                        }
                    }, FOLLOW_UP_DELAY_MS);
                } else {
                    console.info(`[Bot ${chatId}] Vacancy closed message detected, but follow-up already sent, dialog stopped or unclear. Skipping.`);
                    logChat(chatId, { 
                        event: 'follow_up_skipped_already_sent_stopped_or_unclear_check', 
                        trigger_phrase_detected: VACANCY_CLOSED_TRIGGER_PHRASE,
                        sent: currentFollowUpData.followUpSent,
                        stopped: currentFollowUpData.dialogStopped,
                        unclear: currentFollowUpData.dialogMovedToUnclear
                    }, 'system');
                }
            }
        } else if (!performLlmCall) {
            // This case is when dialogMovedToUnclear was set, no message sent to user.
            console.info(`[Сообщение ${chatId}] No LLM call performed (e.g. dialog moved to unclear). No response sent to user.`);
        }


    } catch (error) {
        console.error(`Критическая ошибка при обработке сообщения для чата ${chatId}:`, error);
        await sendErrorMessage(chatId, error.message, 'обработки текстового сообщения');
    }
});

// --- Error Handlers ---
bot.on('polling_error', (error) => {
    console.error('Ошибка опроса (Polling):', error.code, '-', error.message);
});

bot.on('webhook_error', (error) => {
    console.error('Ошибка Webhook:', error.code, '-', error.message);
});

// --- Bot Start ---
bot.getMe().then((me) => {
    const botUsername = me.username;
    console.log(`Конфигурация бота @${botUsername} завершена. Запуск опроса...`);
    console.log(`Ссылка на бота: https://t.me/${botUsername}`);
}).catch(err => {
    console.error("Ошибка получения информации о боте для логирования ссылки:", err);
    console.log('Конфигурация бота завершена (не удалось получить имя пользователя бота). Запуск опроса...');
});

process.on('SIGINT', () => {
    console.log('Получен SIGINT. Завершение работы бота...');
    bot.stopPolling().then(() => {
        console.log('Опрос остановлен.');
        process.exit(0);
    });
});

process.on('SIGTERM', () => {
    console.log('Получен SIGTERM. Завершение работы бота...');
    bot.stopPolling().then(() => {
        console.log('Опрос остановлен.');
        process.exit(0);
    });
});