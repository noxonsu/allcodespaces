const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

// Log NAMEPROMPT early to see what .env file will be targeted
const NAMEPROMPT_FROM_ENV = process.env.NAMEPROMPT || 'calories';
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
    validateImageResponse,
    validateMimeTypeImg,
    validateMimeTypeAudio
} = require('./utilities');
const {
    setSystemMessage,
    setOpenAIKey,
    setDeepSeekKey,
    setModel,
    callLLM,
    transcribeAudio,
    loadUserData, // Ensure loadUserData provides lastMessageTimestamp, defaulting to null
    saveUserData,
    getUserMessageCount
} = require('./openai');

// Safe import of cost tracker with fallback
let costTracker = null;
try {
    costTracker = require('./costTracker');
    console.log('[Bot] Cost tracking commands enabled');
} catch (error) {
    console.warn('[Bot] Cost tracking commands disabled - costTracker module not found');
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
    // Update the destructured FREE_MESSAGE_LIMIT if it changed
    if (FREE_MESSAGE_LIMIT !== reloadedConfig.FREE_MESSAGE_LIMIT) {
        console.log(`[Debug] FREE_MESSAGE_LIMIT updated after dotenv load from ${FREE_MESSAGE_LIMIT} to ${reloadedConfig.FREE_MESSAGE_LIMIT}`);
        // It's tricky to re-assign to a const, so it's better if config.js is structured to always provide the latest
        // For this debug, we'll just log. In a real scenario, ensure config always reflects current env.
    }
}

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

let BOT_USERNAME;
bot.getMe().then(me => {
    BOT_USERNAME = me.username;
    console.log(`[Debug] Bot username: ${BOT_USERNAME}`);
});

// --- Load System Prompt ---
let systemPromptContent = 'You are a helpful assistant.';
let landingContent = null;
let landingButtons = null;

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

    // Load landing page content if exists
    const landingPath = path.join(__dirname, `.env.${NAMEPROMPT}_landing`);
    if (fs.existsSync(landingPath)) {
        const rawLandingContent = fs.readFileSync(landingPath, 'utf8').trim();
        console.log(`Лендинг контент загружен из ${landingPath}`);
        
        // Parse buttons from content
        const buttonMatch = rawLandingContent.match(/\[([^/]+)\s*\/\s*([^\]]+)\]/);
        if (buttonMatch) {
            landingContent = rawLandingContent.replace(/\[([^/]+)\s*\/\s*([^\]]+)\]/, '').trim();
            landingButtons = {
                button1: buttonMatch[1].trim(),
                button2: buttonMatch[2].trim()
            };
            console.log(`Обнаружены кнопки лендинга: "${landingButtons.button1}" / "${landingButtons.button2}"`);
        } else {
            landingContent = rawLandingContent;
            console.log('Лендинг загружен без кнопок');
        }
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

        let messageText, replyMarkup;

        // Use landing content if available, otherwise use default
        if (landingContent && landingButtons) {
            messageText = escapeMarkdown(landingContent);
            replyMarkup = {
                inline_keyboard: [
                    [
                        { text: landingButtons.button1, url: paymentUrl },
                        { text: landingButtons.button2, callback_data: `try_free_${chatId}` }
                    ]
                ]
            };
        } else {
            messageText = escapeMarkdown(`Вы использовали лимит сообщений (${reloadedConfig.FREE_MESSAGE_LIMIT}). Для продолжения оплатите доступ. Подсчет КБЖУ это 100% способ стать здоровее и улучшить свою или жизнь ребенка. Продолжим? 👍`);
            replyMarkup = {
                inline_keyboard: [
                    [{ text: "Оплатить доступ", url: paymentUrl }]
                ]
            };
        }
        
        try {
            await bot.sendMessage(chatId, messageText, {
                parse_mode: 'MarkdownV2',
                reply_markup: replyMarkup
            });
            logChat(chatId, {
                event: 'payment_prompted',
                limit: reloadedConfig.FREE_MESSAGE_LIMIT,
                current_count: userMessageCount,
                url: paymentUrl,
                used_landing: Boolean(landingContent)
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

// --- Message Processors ---

async function processVoice(msg) {
    const chatId = msg.chat.id;
    if (!validateChatId(chatId)) throw new Error('Некорректный chat ID в голосовом сообщении');

    const caption = msg.caption ? sanitizeString(msg.caption) : '';
    const voice = msg.voice;
    if (!voice || !voice.file_id) throw new Error('Некорректные данные голосового сообщения');

    console.info(`[Голос ${chatId}] Обработка голосового сообщения.`);
    const file = await bot.getFile(voice.file_id);
    if (!file || !file.file_path) throw new Error('Не удалось получить информацию о файло от Telegram');

    const fileUrl = `https://api.telegram.org/file/bot${token}/${file.file_path}`;
    const mimeType = voice.mime_type;

    if (!mimeType || !validateMimeTypeAudio(mimeType)) {
        console.warn(`[Голос ${chatId}] Некорректный MIME тип аудио: ${mimeType}`);
        throw new Error(`Неподдерживаемый формат аудио: ${mimeType || 'Unknown'}. Используйте MP3, OGG, WAV, M4A.`);
    }

    console.info(`[Голос ${chatId}] Транскрибация аудио с ${fileUrl} (MIME: ${mimeType})`);
    const transcribedText = await transcribeAudio(fileUrl, 'ru');

    const userMessageContent = [];
    if (caption) userMessageContent.push({ type: 'input_text', text: caption });
    userMessageContent.push({ type: 'input_text', text: transcribedText });

    logChat(chatId, {
        type: 'voice_received',
        mimeType: mimeType,
        duration: voice.duration,
        fileSize: voice.file_size,
        hasCaption: Boolean(caption),
        transcribedTextLength: transcribedText.length,
        timestamp: new Date(msg.date * 1000).toISOString()
    }, 'event');

    return userMessageContent;
}

async function processPhoto(msg) {
    const chatId = msg.chat.id;
    if (!validateChatId(chatId)) throw new Error('Некорректный chat ID в фото сообщении');

    console.info(`[Фото ${chatId}] Начало обработки фото сообщения.`);
    
    const caption = msg.caption ? sanitizeString(msg.caption) : '';
    console.debug(`[Фото ${chatId}] Caption после санитизации: "${caption}"`);
    
    const photo = msg.photo && msg.photo.length > 0 ? msg.photo[msg.photo.length - 1] : null;
    if (!photo || !photo.file_id) {
        console.error(`[Фото ${chatId}] Некорректные данные фото:`, JSON.stringify(msg.photo));
        throw new Error('Некорректные данные фото в сообщении');
    }
    console.debug(`[Фото ${chatId}] Размер фото: ${photo.width}x${photo.height}, file_id: ${photo.file_id}`);

    console.info(`[Фото ${chatId}] Получение информации о файле от Telegram API`);
    const file = await bot.getFile(photo.file_id);
    if (!file || !file.file_path) {
        console.error(`[Фото ${chatId}] Не удалось получить файл:`, JSON.stringify(file));
        throw new Error('Не удалось получить информацию о файле от Telegram');
    }
    console.debug(`[Фото ${chatId}] Получен путь к файлу: ${file.file_path}`);

    const fileUrl = `https://api.telegram.org/file/bot${token}/${file.file_path}`;
    const fileExtension = path.extname(file.file_path).toLowerCase();
    console.debug(`[Фото ${chatId}] Расширение файла: ${fileExtension}`);
    
    const mimeType = {
        '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
        '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp'
    }[fileExtension];

    if (!mimeType || !validateMimeTypeImg(mimeType)) {
        console.warn(`[Фото ${chatId}] Неподдерживаемый тип изображения: ${fileExtension}`);
        throw new Error(`Неподдерживаемый формат изображения (${fileExtension || 'Unknown'}). Используйте JPEG, PNG, GIF, WEBP, BMP.`);
    }
    console.debug(`[Фото ${chatId}] MIME тип: ${mimeType}`);

    console.info(`[Фото ${chatId}] Загрузка изображения с ${fileUrl}`);
    try {
        const imageResponse = await axios.get(fileUrl, {
            responseType: 'arraybuffer',
            timeout: 30000,
            maxContentLength: 15 * 1024 * 1024
        });
        
        console.debug(`[Фото ${chatId}] Изображение загружено, размер: ${imageResponse.data.length} байт`);
        validateImageResponse(imageResponse, 10 * 1024 * 1024);
        
        const imageBase64 = Buffer.from(imageResponse.data).toString('base64');
        // Не логируем содержимое base64, только его длину
        console.debug(`[Фото ${chatId}] Изображение конвертировано в base64, длина: ${imageBase64.length} символов`);
        
        const imageUrl = `data:${mimeType};base64,${imageBase64}`;
        if (imageUrl.length > 20 * 1024 * 1024 * 0.75) {
            console.error(`[Фото ${chatId}] Изображение слишком большое после кодирования: ${imageUrl.length} байт`);
            throw new Error('Закодированные данные изображения слишком велики.');
        }

        const userMessageContent = [];
        if (caption) userMessageContent.push({ type: 'input_text', text: caption });
        userMessageContent.push({ type: 'input_image', image_url: imageUrl });
        
        console.info(`[Фото ${chatId}] Подготовлено сообщение с ${userMessageContent.length} частями (текст: ${caption ? 'да' : 'нет'}, изображение: да)`);
        // Модифицируем вывод структуры, чтобы избежать логирования base64
        console.debug(`[Фото ${chatId}] Структура сообщения:`, JSON.stringify(userMessageContent.map(c => ({ 
            type: c.type, 
            hasContent: c.type === 'input_image' ? 'yes (data:image/... base64 data)' : (c.text ? 'yes' : 'no') 
        }))));

        logChat(chatId, {
            type: 'photo_received',
            mimeType: mimeType,
            fileSize: photo.file_size,
            width: photo.width,
            height: photo.height,
            hasCaption: Boolean(caption),
            timestamp: new Date(msg.date * 1000).toISOString()
        }, 'event');

        return userMessageContent;
    } catch (error) {
        console.error(`[Фото ${chatId}] Ошибка при загрузке/обработке изображения:`, error.message);
        throw error;
    }
}

// --- Telegram Bot Event Handlers ---

bot.onText(/\/start(?:\s+(.+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    if (!validateChatId(chatId)) {
        console.error(`Некорректный chat ID в /start: ${msg.chat.id}`);
        return;
    }
    console.info(`[Start ${chatId}] Получена команда /start.`);

    try {
        const userFilePath = path.join(USER_DATA_DIR, `${chatId}.json`);
        let startParam = match?.[1] ? sanitizeString(match[1]) : null;
        const howPassed = startParam ? `через параметр: ${startParam}` : 'прямая команда /start';

        let userData = {};
        let isNewUser = false;
        if (fs.existsSync(userFilePath)) {
            try {
                const existingData = JSON.parse(fs.readFileSync(userFilePath, 'utf8'));
                userData = { ...loadUserData(chatId), ...existingData }; // Ensure defaults like isPaid are loaded
                if (startParam && startParam !== userData.startParameter) {
                    userData.lastStartParam = startParam;
                    console.info(`[Start ${chatId}] Чат перезапущен с новым параметром: ${startParam}`);
                }
                userData.lastRestartTime = new Date().toISOString();
            } catch (parseError) {
                console.error(`Ошибка парсинга данных пользователя для ${chatId}, сброс:`, parseError);
                isNewUser = true;
            }
        } else {
            isNewUser = true;
        }

        if (isNewUser) {
            userData = {
                chatId: chatId.toString(),
                firstVisit: new Date().toISOString(),
                startParameter: startParam,
                howPassed: howPassed,
                username: msg.from?.username || null,
                firstName: msg.from?.first_name || null,
                lastName: msg.from?.last_name || null,
                languageCode: msg.from?.language_code || null,
                longMemory: '',
                lastLongMemoryUpdate: 0,
                isPaid: userData.isPaid || false, 
                providedName: userData.providedName || null, 
                lastRestartTime: new Date().toISOString(),
                lastMessageTimestamp: null // Initialize lastMessageTimestamp
            };
            console.info(`[Start ${chatId}] Записаны данные нового пользователя.`);
        } else {
            // Ensure existing users have this field, defaulting if not.
            // loadUserData should ideally handle this default.
            if (userData.lastMessageTimestamp === undefined) {
                userData.lastMessageTimestamp = null;
            }
        }

        fs.writeFileSync(userFilePath, JSON.stringify(userData, null, 2));
        console.info(`[Start ${chatId}] Данные пользователя сохранены.`);

        const chatLogPath = path.join(CHAT_HISTORIES_DIR, `chat_${chatId}.log`);
        if (fs.existsSync(chatLogPath)) {
            try {
                fs.unlinkSync(chatLogPath);
                console.info(`[Start ${chatId}] Лог чата очищен из-за команды /start.`);
            } catch (unlinkError) {
                console.error(`Ошибка удаления лога чата для ${chatId}:`, unlinkError);
            }
        }

        logChat(chatId, {
            type: 'system_event',
            event: 'start_command',
            howPassed: howPassed,
            isNewUser: isNewUser,
            timestamp: new Date(msg.date * 1000).toISOString()
        }, 'system');

        if (isNewUser) {
            await bot.sendMessage(chatId, 'Добро пожаловать! Как вас зовут?');
            logChat(chatId, { type: 'system_message', text: 'Запрошено имя пользователя' }, 'system');
        } else {
            await bot.sendMessage(chatId, 'С возвращением! Чем могу помочь сегодня?');
            logChat(chatId, { type: 'system_message', text: 'Отправлено приветствие "С возвращением"' }, 'system');
        }
    } catch (error) {
        console.error(`Критическая ошибка при обработке /start для чата ${chatId}:`, error);
        await sendErrorMessage(chatId, error.message, 'обработки команды /start');
    }
});

// Add /clear command to delete profile and chat history
bot.onText(/\/clear/, async (msg) => {
    const chatId = msg.chat.id;
    if (!validateChatId(chatId)) {
        console.error(`Некорректный chat ID в /clear: ${msg.chat.id}`);
        return;
    }
    
    console.info(`[Clear ${chatId}] Получена команда /clear.`);
    
    try {
        const userFilePath = path.join(USER_DATA_DIR, `${chatId}.json`);
        const chatLogPath = path.join(CHAT_HISTORIES_DIR, `chat_${chatId}.log`);
        
        let deletedFiles = [];
        
        // Delete user data file
        if (fs.existsSync(userFilePath)) {
            try {
                fs.unlinkSync(userFilePath);
                deletedFiles.push('профиль пользователя');
                console.info(`[Clear ${chatId}] Файл данных пользователя удален.`);
            } catch (error) {
                console.error(`[Clear ${chatId}] Ошибка удаления файла данных пользователя:`, error);
            }
        }
        
        // Delete chat history
        if (fs.existsSync(chatLogPath)) {
            try {
                fs.unlinkSync(chatLogPath);
                deletedFiles.push('история сообщений');
                console.info(`[Clear ${chatId}] Лог чата удален.`);
            } catch (error) {
                console.error(`[Clear ${chatId}] Ошибка удаления лога чата:`, error);
            }
        }
        
        // Log the clear action
        logChat(chatId, {
            type: 'system_event',
            event: 'clear_command',
            deleted_files: deletedFiles,
            timestamp: new Date(msg.date * 1000).toISOString()
        }, 'system');
        
        if (deletedFiles.length > 0) {
            const deletedText = deletedFiles.join(' и ');
            await bot.sendMessage(chatId, `✅ Удалено: ${deletedText}.\n\nДля продолжения работы используйте команду /start`);
        } else {
            await bot.sendMessage(chatId, 'Нет данных для удаления.\n\nДля начала работы используйте команду /start');
        }
        
        console.info(`[Clear ${chatId}] Команда /clear успешно выполнена.`);
    } catch (error) {
        console.error(`[Clear ${chatId}] Критическая ошибка при обработке /clear:`, error);
        await sendErrorMessage(chatId, error.message, 'очистки данных');
    }
});

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    if ((msg.chat.type === 'group' || msg.chat.type === 'supergroup') && !msg.text?.includes(`@${BOT_USERNAME}`)) {
        console.info(`[Ignored] Message in group ${chatId} without mention of @${BOT_USERNAME}`);
        return;
    }
    if (!validateChatId(chatId)) {
        console.error(`Некорректный chat ID в обработчике сообщений: ${msg.chat.id}`);
        return;
    }
    if (msg.photo || msg.voice || (msg.text && (msg.text.startsWith('/start') || msg.text.startsWith('/clear') || msg.text.startsWith('/cost')))) {
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

        if (!hasProvidedName) {
            console.info(`[Сообщение ${chatId}] Обработка сообщения как имени: "${userText}"`);
            logChat(chatId, {
                type: 'name_provided',
                role: 'user',
                name: userText,
                content: [{ type: 'input_text', text: `Пользователь предоставил имя: ${userText}` }],
                timestamp: new Date(msg.date * 1000).toISOString()
            }, 'user');

            try {
                const userData = JSON.parse(fs.readFileSync(userDataPath, 'utf8'));
                userData.providedName = userText;
                userData.nameLastUpdate = new Date().toISOString();
                fs.writeFileSync(userDataPath, JSON.stringify(userData, null, 2));
                console.info(`[Сообщение ${chatId}] Имя пользователя сохранено в данных пользователя.`);
            } catch (err) {
                console.error(`[Сообщение ${chatId}] Не удалось обновить данные пользователя с именем:`, err);
            }

            // Show landing page if available, otherwise use LLM response
            if (landingContent) {
                let messageText = escapeMarkdown(landingContent);
                let replyMarkup = null;

                if (landingButtons) {
                    const paymentUrl = PAYMENT_URL_TEMPLATE
                        .replace('{NAMEPROMPT}', NAMEPROMPT)
                        .replace('{chatid}', chatId.toString());
                    
                    replyMarkup = {
                        inline_keyboard: [
                            [
                                { text: landingButtons.button1, url: paymentUrl },
                                { text: landingButtons.button2, callback_data: `try_free_${chatId}` }
                            ]
                        ]
                    };
                }

                try {
                    await bot.sendMessage(chatId, messageText, {
                        parse_mode: 'MarkdownV2',
                        reply_markup: replyMarkup
                    });
                    logChat(chatId, {
                        type: 'landing_shown',
                        trigger: 'after_name_provided',
                        has_buttons: Boolean(landingButtons)
                    }, 'system');
                } catch (error) {
                    console.error(`Error sending landing message to ${chatId}:`, error);
                    // Fallback to plain text
                    await bot.sendMessage(chatId, landingContent);
                }
            } else {
                // Use LLM response as before
                const llmInputTextForName = newDayPrefix + `Пользователь только что сказал мне, что его зовут "${userText}". Подтверди это и продолжи разговор естественно.`;
                const assistantResponse = await callLLM(chatId, [{
                    type: 'input_text',
                    text: llmInputTextForName
                }]);
                await sendAndLogResponse(chatId, assistantResponse);
            }
            return;
        }

        const llmInputTextRegular = newDayPrefix + userText;
        const userMessageContent = [{ type: 'input_text', text: llmInputTextRegular }];
        const assistantText = await callLLM(chatId, userMessageContent);
        await sendAndLogResponse(chatId, assistantText);
    } catch (error) {
        await sendErrorMessage(chatId, error.message, 'обработки текстового сообщения');
    }
});

bot.on('photo', async (msg) => {
    const chatId = msg.chat.id;
    if (!validateChatId(chatId)) {
        console.error(`[Фото] Некорректный chat ID: ${chatId}`);
        return;
    }

    const userDataPath = path.join(USER_DATA_DIR, `${chatId}.json`);
    if (!fs.existsSync(userDataPath)) {
        console.info(`[Фото ${chatId}] Файл данных пользователя не найден при обработке фото. Предлагаем /start.`);
        await bot.sendMessage(chatId, 'Пожалуйста, используйте команду /start перед отправкой фото.');
        logChat(chatId, { type: 'system_event', event: 'prompted_start_no_userdata_photo' }, 'system');
        return;
    }

    try {
        const newDayPrefix = await handleNewDayLogicAndUpdateTimestamp(chatId);
        console.info(`[Фото ${chatId}] NewDayPrefix: "${newDayPrefix}"`);

        const canProceed = await checkPaymentStatusAndPrompt(chatId);
        if (!canProceed) {
            return;
        }

        console.info(`[Фото ${chatId}] Получено фото от пользователя.`);
        await bot.sendChatAction(chatId, 'upload_photo');
        
        // Временно сохраняем текущую модель и принудительно устанавливаем OpenAI для обработки фото
        const currentModel = process.env.OPENAIMODEL;
        console.info(`[Фото ${chatId}] Текущая модель: ${currentModel}, переключение на OpenAI для изображений`);
        
        // Принудительно устанавливаем дефолтную модель openai из env OPENAIMODEL 
        setModel(process.env.OPENAIMODEL || 'gpt-4.1-mini');
        
        console.info(`[Фото ${chatId}] Вызываем processPhoto`);
        const userMessageContent = await processPhoto(msg);
        
        console.info(`[Фото ${chatId}] Результат processPhoto: ${userMessageContent ? userMessageContent.length + ' элементов' : 'null'}`);
        if (!userMessageContent || userMessageContent.length === 0) {
            console.error(`[Фото ${chatId}] Пустой результат обработки фото`);
            throw new Error("Ошибка обработки изображения: пустой результат");
        }

        if (newDayPrefix) {
            let textPartFound = false;
            for (const part of userMessageContent) {
                if (part.type === 'input_text') {
                    part.text = newDayPrefix + (part.text || "");
                    textPartFound = true;
                    break;
                }
            }
            if (!textPartFound) {
                userMessageContent.unshift({ type: 'input_text', text: newDayPrefix.trim() });
            }
        }
        
        console.info(`[Фото ${chatId}] Вызываем OpenAI с моделью gpt-4-vision-preview`);
        const assistantText = await callLLM(chatId, userMessageContent);
        
        // Восстанавливаем исходную модель после обработки изображения
        if (currentModel) {
            console.info(`[Фото ${chatId}] Восстанавливаем исходную модель: ${currentModel}`);
            setModel(currentModel);
        }
        
        console.info(`[Фото ${chatId}] Получен ответ от LLM длиной ${assistantText ? assistantText.length : 0}`);
        await sendAndLogResponse(chatId, assistantText);
    } catch (error) {
        await sendErrorMessage(chatId, error.message, 'обработки фото');
    }
});

bot.on('voice', async (msg) => {
    const chatId = msg.chat.id;
    if (!validateChatId(chatId)) return;

    try {
        const newDayPrefix = await handleNewDayLogicAndUpdateTimestamp(chatId);
        console.info(`[Голос ${chatId}] NewDayPrefix: "${newDayPrefix}"`);

        const canProceed = await checkPaymentStatusAndPrompt(chatId);
        if (!canProceed) {
            return;
        }

        const userDataPath = path.join(USER_DATA_DIR, `${chatId}.json`);
        if (!fs.existsSync(userDataPath)) {
            console.info(`[Голос ${chatId}] Файл данных пользователя не найден при обработке голоса. Предлагаем /start.`);
            await bot.sendMessage(chatId, 'Пожалуйста, используйте команду /start перед отправкой голосовых сообщений.');
            logChat(chatId, { type: 'system_event', event: 'prompted_start_no_userdata_voice' }, 'system');
            return;
        }

        console.info(`[Голос ${chatId}] Получено голосовое сообщение.`);
        await bot.sendChatAction(chatId, 'typing');
        const userMessageContent = await processVoice(msg);

        if (newDayPrefix) {
            if (userMessageContent.length > 0 && userMessageContent[0].type === 'input_text') {
                userMessageContent[0].text = newDayPrefix + (userMessageContent[0].text || "");
            } else { // Fallback if processVoice structure changes or is empty
                userMessageContent.unshift({ type: 'input_text', text: newDayPrefix.trim() });
            }
        }

        const assistantText = await callLLM(chatId, userMessageContent);
        await sendAndLogResponse(chatId, assistantText);
    } catch (error) {
        await sendErrorMessage(chatId, error.message, 'обработки голосового сообщения');
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
console.log('Конфигурация бота завершена. Запуск опроса...');

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

// Add cost tracking command (only if cost tracker is available)
if (costTracker) {
    bot.onText(/\/cost/, async (msg) => {
        const chatId = msg.chat.id;
        if (!validateChatId(chatId)) {
            console.error(`Некорректный chat ID в /cost: ${msg.chat.id}`);
            return;
        }

        try {
            const chatCosts = costTracker.getChatCosts(chatId);
            const dailyCosts = costTracker.getDailyCosts();
            const botSummary = costTracker.getBotCostsSummary();
            
            let message = `💰 Статистика расходов:\n\n`;
            message += `Ваш чат: $${chatCosts.totalCost.toFixed(4)} (${chatCosts.requests} запросов)\n`;
            message += `Сегодня всего: $${dailyCosts.totalCost.toFixed(4)} (${dailyCosts.requests} запросов)\n\n`;
            
            if (Object.keys(botSummary).length > 0) {
                message += `📊 По ботам:\n`;
                for (const [bot, stats] of Object.entries(botSummary)) {
                    message += `${bot}: $${stats.totalCost.toFixed(4)} (${stats.requests} запросов, ${stats.uniqueChats} чатов)\n`;
                }
            } else {
                message += `📊 Данные по ботам пока недоступны.\n`;
            }
            
            await bot.sendMessage(chatId, escapeMarkdown(message), { parse_mode: 'MarkdownV2' });
            
            logChat(chatId, {
                type: 'system_event',
                event: 'cost_command',
                timestamp: new Date(msg.date * 1000).toISOString()
            }, 'system');
        } catch (error) {
            console.error(`Ошибка при обработке /cost для чата ${chatId}:`, error);
            await sendErrorMessage(chatId, error.message, 'получения статистики расходов');
        }
    });
} else {
    // Fallback /cost command when cost tracker is not available
    bot.onText(/\/cost/, async (msg) => {
        const chatId = msg.chat.id;
        if (!validateChatId(chatId)) {
            console.error(`Некорректный chat ID в /cost: ${msg.chat.id}`);
            return;
        }

        try {
            const message = `💰 Статистика расходов недоступна.\n\nДанная функция не активирована в этом боте.`;
            await bot.sendMessage(chatId, escapeMarkdown(message), { parse_mode: 'MarkdownV2' });
            
            logChat(chatId, {
                type: 'system_event',
                event: 'cost_command_unavailable',
                timestamp: new Date(msg.date * 1000).toISOString()
            }, 'system');
        } catch (error) {
            console.error(`Ошибка при обработке /cost для чата ${chatId}:`, error);
        }
    });
}

// Handle callback queries for landing buttons
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;

    try {
        await bot.answerCallbackQuery(query.id);

        if (data.startsWith('try_free_')) {
            // Handle "try free" button - send the button text back to the bot
            if (landingButtons && landingButtons.button2) {
                logChat(chatId, {
                    type: 'callback_query',
                    action: 'try_free_clicked',
                    button_text: landingButtons.button2
                }, 'system');

                // Process the button text as if user sent it
                const userMessageContent = [{ type: 'input_text', text: landingButtons.button2 }];
                const assistantText = await callLLM(chatId, userMessageContent);
                await sendAndLogResponse(chatId, assistantText);
            }
        }
    } catch (error) {
        console.error(`Error handling callback query from ${chatId}:`, error);
    }
});
