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
    loadUserData, // Ensure loadUserData provides lastMessageTimestamp, defaulting to null
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
        await bot.sendChatAction(chatId, 'typing');
        
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
        const howPassed = startParam ? `через параметр: ${startParam}` : 'прямая команда /start';

        // Всегда пересоздаем профиль пользователя при команде /start
        const userData = {
            chatId: chatId.toString(),
            firstVisit: new Date().toISOString(), // firstVisit обновляется, так как профиль пересоздается
            startParameter: startParam,
            howPassed: howPassed,
            username: msg.from?.username || null,
            firstName: msg.from?.first_name || null,
            lastName: msg.from?.last_name || null,
            languageCode: msg.from?.language_code || null,
            longMemory: '',
            lastLongMemoryUpdate: 0,
            isPaid: false, // Сбрасываем isPaid при пересоздании профиля
            providedName: null, // Сбрасываем providedName
            lastRestartTime: new Date().toISOString(),
            lastMessageTimestamp: null, // Инициализируем lastMessageTimestamp
            followUpSent: false, // Initialize followUpSent flag
            dialogStopped: false, // Initialize dialogStopped flag
            pendingBotQuestion: null // Initialize pendingBotQuestion flag
        };
        
        fs.writeFileSync(userFilePath, JSON.stringify(userData, null, 2));
        console.info(`[Start ${chatId}] Профиль пользователя пересоздан и сохранен.`);

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
            event: 'start_command_profile_recreated', // Изменено имя события
            howPassed: howPassed,
            startParam: startParam,
            timestamp: new Date(msg.date * 1000).toISOString()
        }, 'system');

        // Removed hardcoded welcome messages. Proceed to LLM interaction.

        const newDayPrefix = await handleNewDayLogicAndUpdateTimestamp(chatId);

        const canProceed = await checkPaymentStatusAndPrompt(chatId);
        if (!canProceed) {
            return; // Payment required, message already sent
        }

        await bot.sendChatAction(chatId, 'typing');

        let initialLLMInputText;
        const currentData = loadUserData(chatId); // Load fresh (recreated) data

        if (startParam) {
            // Поскольку профиль пересоздан, providedName будет null
            // Логика ниже обработает startParam как имя, если оно предоставлено
            currentData.providedName = startParam; // Рассматриваем startParam как имя при пересоздании профиля
            currentData.nameLastUpdate = new Date().toISOString();
            saveUserData(chatId, currentData); // Сохраняем имя из startParam
            logChat(chatId, {
                type: 'name_provided_via_start_param',
                role: 'system_inferred',
                name: startParam,
                content: `User started with parameter "${startParam}" after profile reset, inferred as name.`,
                timestamp: new Date().toISOString()
            }, 'system');
            initialLLMInputText = newDayPrefix + `Пользователь только что присоединился (профиль пересоздан) и представился как "${startParam}" через параметр запуска. Подтверди это и начни общение естественно.`;
        } else {
            // No startParam. LLM should initiate based on system prompt.
            initialLLMInputText = newDayPrefix + "Пользователь только что запустил диалог командой /start (профиль пересоздан). Пожалуйста, поприветствуй его согласно своей роли и системным инструкциям и начни общение.";
        }

        const assistantResponse = await callLLM(chatId, [{ type: 'input_text', text: initialLLMInputText }]);
        await sendAndLogResponse(chatId, assistantResponse);

        // Check for STOP_DIALOG_MESSAGE first
        if (assistantResponse && assistantResponse.includes(STOP_DIALOG_MESSAGE)) {
            console.info(`[Bot ${chatId} /start] STOP_DIALOG_MESSAGE detected: "${STOP_DIALOG_MESSAGE}". Stopping dialog and notifying admin.`);
            const currentData = loadUserData(chatId);
            currentData.dialogStopped = true;
            saveUserData(chatId, currentData);
            logChat(chatId, {
                event: 'dialog_stopped_by_llm_on_start',
                trigger_phrase: STOP_DIALOG_MESSAGE,
                admin_notified: !!(ADMIN_TELEGRAM_ID && BOT_SERVER_BASE_URL)
            }, 'system');

            if (ADMIN_TELEGRAM_ID && BOT_SERVER_BASE_URL) {
                try {
                    const logFileName = `chat_${chatId}.log`;
                    const logUrl = `${BOT_SERVER_BASE_URL}/chatlogs/${logFileName}`;
                    await bot.sendMessage(ADMIN_TELEGRAM_ID, `Диалог с пользователем ${chatId} (начатый через /start) был остановлен LLM (фраза "${STOP_DIALOG_MESSAGE}").\nЛог: ${logUrl}`);
                } catch (adminNotifyError) {
                    console.error(`[Bot ${chatId} /start] Error notifying admin about stopped dialog:`, adminNotifyError);
                }
            }
            return; // Stop further processing, including follow-ups
        }

        // Check for vacancy closed trigger and schedule follow-up
        if (assistantResponse && assistantResponse.includes(VACANCY_CLOSED_TRIGGER_PHRASE)) {
            const currentUserData = loadUserData(chatId); // Load data to check followUpSent status
            if (!currentUserData.followUpSent) {
                console.info(`[Bot ${chatId} /start] Vacancy closed message detected. Scheduling follow-up: "${FOLLOW_UP_VACANCY_MESSAGE}" in ${FOLLOW_UP_DELAY_MS / 1000 / 60} minutes.`);
                logChat(chatId, { 
                    event: 'follow_up_scheduled_on_start', 
                    trigger_phrase_detected: VACANCY_CLOSED_TRIGGER_PHRASE,
                    follow_up_message: FOLLOW_UP_VACANCY_MESSAGE,
                    delay_ms: FOLLOW_UP_DELAY_MS
                }, 'system');

                setTimeout(async () => {
                    try {
                        // Re-check before sending, in case status changed or to avoid double send from other logic paths (though unlikely here)
                        const freshUserData = loadUserData(chatId);
                        if (freshUserData.followUpSent) {
                            console.info(`[Bot ${chatId} /start] Follow-up already sent, skipping scheduled message.`);
                            logChat(chatId, { event: 'follow_up_skipped_already_sent_on_start', message: FOLLOW_UP_VACANCY_MESSAGE }, 'system');
                            return;
                        }

                        console.info(`[Bot ${chatId} /start] Sending scheduled follow-up message: "${FOLLOW_UP_VACANCY_MESSAGE}"`);
                        await sendAndLogResponse(chatId, FOLLOW_UP_VACANCY_MESSAGE);
                        
                        freshUserData.followUpSent = true;
                        freshUserData.pendingBotQuestion = FOLLOW_UP_VACANCY_MESSAGE; // Set pending question
                        saveUserData(chatId, freshUserData);

                        logChat(chatId, { 
                            event: 'follow_up_sent_on_start', 
                            message: FOLLOW_UP_VACANCY_MESSAGE 
                        }, 'system');
                        logChat(chatId, {
                            event: 'follow_up_context_set_on_start',
                            question: FOLLOW_UP_VACANCY_MESSAGE
                        }, 'system');
                    } catch (error) {
                        console.error(`[Bot ${chatId} /start] Error sending scheduled follow-up message:`, error);
                        logChat(chatId, { 
                            event: 'follow_up_send_error_on_start', 
                            message: FOLLOW_UP_VACANCY_MESSAGE,
                            error: error.message 
                        }, 'error');
                    }
                }, FOLLOW_UP_DELAY_MS);
            } else {
                console.info(`[Bot ${chatId} /start] Vacancy closed message detected, but follow-up already sent. Skipping.`);
                logChat(chatId, { 
                    event: 'follow_up_skipped_already_sent_on_start_check', 
                    trigger_phrase_detected: VACANCY_CLOSED_TRIGGER_PHRASE
                }, 'system');
            }
        }

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

    try {
        const userDataOnMessage = loadUserData(chatId); // Load user data at the beginning
        if (userDataOnMessage.dialogStopped) {
            console.info(`[Сообщение ${chatId}] Диалог ранее остановлен. Сообщение от пользователя игнорируется.`);
            logChat(chatId, { event: 'user_messaged_after_dialog_stopped_ignored', user_text: userText }, 'system');
            return; // Silently ignore the message
        }

        const newDayPrefix = await handleNewDayLogicAndUpdateTimestamp(chatId);
        console.info(`[Сообщение ${chatId}] Обработка текстового сообщения. Длина: ${userText.length}. NewDayPrefix: "${newDayPrefix}"`);

        // Handle activation code input
        if (ACTIVATION_CODE && userText.startsWith('KEY-')) {
            if (userText === ACTIVATION_CODE) {
                const userData = loadUserData(chatId); // Reload data as it might have been updated by handleNewDayLogic
                userData.isPaid = true;
                saveUserData(chatId, userData);
                await bot.sendMessage(chatId, escapeMarkdown("Activation successful! You can now use the bot without limits."), { parse_mode: 'MarkdownV2' });
                logChat(chatId, { event: 'activation_success', code_entered: userText }, 'system');
            } else {
                await bot.sendMessage(chatId, escapeMarkdown("Invalid activation code."), { parse_mode: 'MarkdownV2' });
                logChat(chatId, { event: 'activation_failed', code_entered: userText }, 'system');
            }
            return; // Stop further processing for this message
        }

        const canProceed = await checkPaymentStatusAndPrompt(chatId);
        if (!canProceed) {
            return;
        }

        await bot.sendChatAction(chatId, 'typing');

        const userDataPath = path.join(USER_DATA_DIR, `${chatId}.json`);
        if (!fs.existsSync(userDataPath)) {
            console.info(`[Сообщение ${chatId}] Файл данных пользователя не найден. Предлагаем /start.`);
            await bot.sendMessage(chatId, 'Пожалуйста, используйте команду /start, чтобы начать.');
            logChat(chatId, { type: 'system_event', event: 'prompted_start_no_userdata' }, 'system');
            return;
        }

        let hasProvidedName = false;
        try {
            const userData = JSON.parse(fs.readFileSync(userDataPath, 'utf8'));
            if (userData.providedName) hasProvidedName = true;
        } catch (err) {
            console.error(`[Сообщение ${chatId}] Ошибка чтения данных пользователя для проверки имени:`, err);
        }

        
        let llmInputTextRegular = newDayPrefix + userText;
        
        // Check for and apply pending bot question context
        let currentUserDataForContext = loadUserData(chatId);
        if (currentUserDataForContext.pendingBotQuestion) {
            const botQuestionContext = currentUserDataForContext.pendingBotQuestion;
            const contextPrefix = `[Контекст предыдущего вопроса бота: ${botQuestionContext}] `;
            llmInputTextRegular = newDayPrefix + contextPrefix + userText; // Add newDayPrefix, then context, then user text

            logChat(chatId, {
                event: 'user_reply_with_follow_up_context',
                original_user_text: userText,
                bot_question_context: botQuestionContext,
            }, 'system');
            
            currentUserDataForContext.pendingBotQuestion = null; // Clear the flag
            saveUserData(chatId, currentUserDataForContext); 
        }
        
        const userMessageContent = [{ type: 'input_text', text: llmInputTextRegular }];
        const assistantText = await callLLM(chatId, userMessageContent);
        await sendAndLogResponse(chatId, assistantText);

        // Check for STOP_DIALOG_MESSAGE first
        if (assistantText && assistantText.includes(STOP_DIALOG_MESSAGE)) {
            console.info(`[Bot ${chatId}] STOP_DIALOG_MESSAGE detected: "${STOP_DIALOG_MESSAGE}". Stopping dialog and notifying admin.`);
            const currentData = loadUserData(chatId); // Reload to be safe, though userDataOnMessage should be recent
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
                    const logUrl = `${BOT_SERVER_BASE_URL}/chatlogs/${logFileName}`; // Ensure this matches the Express route
                    await bot.sendMessage(ADMIN_TELEGRAM_ID, `Диалог с пользователем ${chatId} был остановлен LLM (фраза "${STOP_DIALOG_MESSAGE}").\nЛог: ${logUrl}`);
                } catch (adminNotifyError) {
                    console.error(`[Bot ${chatId}] Error notifying admin about stopped dialog:`, adminNotifyError);
                }
            }
            return; // Stop further processing, including follow-ups
        }

        // Check for vacancy closed trigger and schedule follow-up
        if (assistantText && assistantText.includes(VACANCY_CLOSED_TRIGGER_PHRASE)) {
            const currentUserData = loadUserData(chatId); // Load data to check followUpSent status
            if (!currentUserData.followUpSent) {
                console.info(`[Bot ${chatId}] Vacancy closed message detected. Scheduling follow-up: "${FOLLOW_UP_VACANCY_MESSAGE}" in ${FOLLOW_UP_DELAY_MS / 1000 / 60} minutes.`);
                logChat(chatId, { 
                    event: 'follow_up_scheduled', 
                    trigger_phrase_detected: VACANCY_CLOSED_TRIGGER_PHRASE,
                    follow_up_message: FOLLOW_UP_VACANCY_MESSAGE,
                    delay_ms: FOLLOW_UP_DELAY_MS
                }, 'system');

                setTimeout(async () => {
                    try {
                        // Re-check before sending
                        const freshUserData = loadUserData(chatId);
                        if (freshUserData.followUpSent) {
                            console.info(`[Bot ${chatId}] Follow-up already sent, skipping scheduled message.`);
                            logChat(chatId, { event: 'follow_up_skipped_already_sent', message: FOLLOW_UP_VACANCY_MESSAGE }, 'system');
                            return;
                        }
                        console.info(`[Bot ${chatId}] Sending scheduled follow-up message: "${FOLLOW_UP_VACANCY_MESSAGE}"`);
                        await sendAndLogResponse(chatId, FOLLOW_UP_VACANCY_MESSAGE);

                        freshUserData.followUpSent = true;
                        freshUserData.pendingBotQuestion = FOLLOW_UP_VACANCY_MESSAGE; // Set pending question
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
                console.info(`[Bot ${chatId}] Vacancy closed message detected, but follow-up already sent. Skipping.`);
                logChat(chatId, { 
                    event: 'follow_up_skipped_already_sent_check', 
                    trigger_phrase_detected: VACANCY_CLOSED_TRIGGER_PHRASE
                }, 'system');
            }
        }

    } catch (error) {
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