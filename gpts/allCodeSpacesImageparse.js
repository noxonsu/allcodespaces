console.log('this is allCodeSpacesImageparse.js file');
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

// --- Configuration ---
let nameprompt = 'calories'; // Example, ensure this is set correctly
const result = dotenv.config({ path: `.env.${nameprompt}` });

// Import necessary functions from utilities, including CHAT_HISTORIES_DIR
const {
    sanitizeString,
    validateChatId,
    logChat,
    validateImageResponse,
    validateMimeTypeImg,
    validateMimeTypeAudio,
    CHAT_HISTORIES_DIR // Use the exported path
} = require('./utilities');
// Import functions from openai module
const {
    setSystemMessage,
    setOpenAIKey,
    setDeepSeekKey, // Добавляем для DeepSeek
    callLLM, // Заменяем callOpenAI на callLLM
    callOpenAI,
    transcribeAudio,
    updateLongMemory // Keep for /start potentially
} = require('./openai');


if (result.error) {
    console.error(`Ошибка загрузки файла .env.${nameprompt}:`, result.error);
    process.exit(1); // Exit if config fails
}

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
    console.error(`Ошибка: TELEGRAM_BOT_TOKEN не определен в файле .env.${nameprompt}`);
    process.exit(1);
}

const openaiApiKey = process.env.OPENAI_API_KEY;
const deepseekApiKey = process.env.DEEPSEEK_API_KEY; // Добавляем ключ для DeepSeek
if (!openaiApiKey && !deepseekApiKey) {
    console.error(`Ошибка: Ни OPENAI_API_KEY, ни DEEPSEEK_API_KEY не определены в файле .env.${nameprompt}`);
    process.exit(1);
}

// Load system prompt from file or env
let systemPromptContent = 'You are a helpful assistant.'; // Default prompt
try {
    const promptPath = `.env.${nameprompt}_prompt`;
    if (fs.existsSync(promptPath)) {
        const promptData = fs.readFileSync(promptPath, 'utf8');
        systemPromptContent = promptData.trim(); // Trim whitespace
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
    process.exit(1); // Exit if prompt loading fails
}

// --- Initialize OpenAI/DeepSeek Module ---
setSystemMessage(systemPromptContent);
if (openaiApiKey) setOpenAIKey(openaiApiKey); // Устанавливаем ключ OpenAI, если есть
if (deepseekApiKey) setDeepSeekKey(deepseekApiKey); // Устанавливаем ключ DeepSeek, если есть

// --- Initialize Bot ---
const bot = new TelegramBot(token, { polling: true });

// --- Ensure Directories Exist ---
const USER_DATA_DIR = path.join(__dirname, 'user_data');
if (!fs.existsSync(CHAT_HISTORIES_DIR)) {
    fs.mkdirSync(CHAT_HISTORIES_DIR, { recursive: true });
}
if (!fs.existsSync(USER_DATA_DIR)) {
    fs.mkdirSync(USER_DATA_DIR, { recursive: true });
}

// --- Helper Functions ---

function escapeMarkdown(text) {
    return text.replace(/[_[\]()~`>#+=|{}.!-]/g, '\\$&');
}

async function sendAndLogResponse(chatId, assistantText) {
    try {
        // Start typing indication
        
        
        const escapedText = escapeMarkdown(assistantText);
        await bot.sendMessage(chatId, escapedText, {
            parse_mode: 'MarkdownV2'
        });
    } catch (error) {
        console.error(`Ошибка отправки сообщения в чат ${chatId}:`, error.message);
        try {
            const errorText = escapeMarkdown("Извините, не удалось отправить предыдущий ответ. Попробуйте еще раз или перезапустите бота командой /start.");
            await bot.sendMessage(chatId, errorText, {
                parse_mode: 'MarkdownV2'
            });
        } catch (nestedError) {
            console.error(`Не удалось отправить уведомление об ошибке в чат ${chatId}:`, nestedError.message);
        }
        logChat(chatId, { error: 'send_message_failed', message: error.message }, 'error');
    }
}

async function sendErrorMessage(chatId, specificErrorMsg, context = 'обработки вашего запроса') {
    console.error(`Ошибка во время ${context} для чата ${chatId}:`, specificErrorMsg);
    try {
        await bot.sendMessage(
            chatId,
            `Извините, возникла проблема во время ${context}. Пожалуйста, повторите попытку. Если ошибка повторяется, попробуйте перезапустить бота командой /start.`
        );
    } catch (sendError) {
        console.error(`Не удалось отправить сообщение об ошибке в чат ${chatId}:`, sendError.message);
    }
    logChat(chatId, {
        error: `error_in_${context.replace(/\s+/g, '_')}`,
        message: specificErrorMsg,
        timestamp: new Date().toISOString()
    }, 'error');
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
    if (!file || !file.file_path) throw new Error('Не удалось получить информацию о файле от Telegram');

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

    const caption = msg.caption ? sanitizeString(msg.caption) : '';
    const photo = msg.photo && msg.photo.length > 0 ? msg.photo[msg.photo.length - 1] : null;
    if (!photo || !photo.file_id) throw new Error('Некорректные данные фото в сообщении');

    console.info(`[Фото ${chatId}] Обработка фото сообщения.`);
    const file = await bot.getFile(photo.file_id);
    if (!file || !file.file_path) throw new Error('Не удалось получить информацию о файле от Telegram');

    const fileUrl = `https://api.telegram.org/file/bot${token}/${file.file_path}`;
    const fileExtension = path.extname(file.file_path).toLowerCase();
    const mimeType = {
        '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
        '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp'
    }[fileExtension];

    if (!mimeType || !validateMimeTypeImg(mimeType)) {
        console.warn(`[Фото ${chatId}] Неподдерживаемый тип изображения: ${fileExtension}`);
        throw new Error(`Неподдерживаемый формат изображения (${fileExtension || 'Unknown'}). Используйте JPEG, PNG, GIF, WEBP, BMP.`);
    }

    const imageResponse = await axios.get(fileUrl, {
        responseType: 'arraybuffer',
        timeout: 30000,
        maxContentLength: 15 * 1024 * 1024
    });

    validateImageResponse(imageResponse, 10 * 1024 * 1024);
    const imageBase64 = Buffer.from(imageResponse.data).toString('base64');
    const imageUrl = `data:${mimeType};base64,${imageBase64}`;

    if (imageUrl.length > 20 * 1024 * 1024 * 0.75) {
        throw new Error('Закодированные данные изображения слишком велики.');
    }

    const userMessageContent = [];
    if (caption) userMessageContent.push({ type: 'input_text', text: caption });
    userMessageContent.push({ type: 'input_image', image_url: fileUrl });

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
                userData = JSON.parse(fs.readFileSync(userFilePath, 'utf8'));
                if (startParam && startParam !== userData.startParameter) {
                    userData.lastStartParam = startParam;
                    console.info(`[Start ${chatId}] Чат перезапущен с новым параметром: ${startParam}`);
                }
                userData.lastRestartTime = new Date().toISOString();
            } catch (parseError) {
                console.error(`Ошибка парсинга данных пользователя для ${chatId}, сброс:`, parseError);
                isNewUser = true;
                userData = {};
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
                lastRestartTime: new Date().toISOString()
            };
            console.info(`[Start ${chatId}] Записаны данные нового пользователя.`);
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
            await bot.sendMessage(chatId, 'Добро пожаловать! Я ваш полезный ассистент. Как вас зовут?');
            logChat(chatId, { type: 'system_message', text: 'Запрошено имя пользователя' }, 'system');
        } else {
            await bot.sendMessage(chatId, 'С возвращением! Чем могу помочь сегодня?');
            logChat(chatId, { type: 'system_message', text: 'Отправлено приветствие "С возвращением"' }, 'system');
        }
    } catch (error) {
        console.error(`Критическая ошибка при обработке /start для чата ${chatId}:`, error);
        try {
            await bot.sendMessage(chatId, 'Извините, что-то пошло не так. Попробуйте /start еще раз.');
        } catch (sendError) {
            console.error(`Не удалось отправить сообщение об ошибке /start в чат ${chatId}:`, sendError.message);
        }
        logChat(chatId, { error: 'start_command_critical', message: error.message }, 'error');
    }
});

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;

    if (!validateChatId(chatId)) {
        console.error(`Некорректный chat ID в обработчике сообщений: ${msg.chat.id}`);
        return;
    }
    if (msg.photo || msg.voice || (msg.text && msg.text.startsWith('/start'))) {
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
    await bot.sendChatAction(chatId, 'typing');
    try {
        console.info(`[Сообщение ${chatId}] Обработка текстового сообщения. Длина: ${userText.length}`);

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

            const assistantResponse = await callLLM(chatId, [{
                type: 'input_text',
                text: `Пользователь только что сказал мне, что его зовут "${userText}". Подтверди это и продолжи разговор естественно.`
            }]);
            await sendAndLogResponse(chatId, assistantResponse);
            return;
        }

        const userMessageContent = [{ type: 'input_text', text: userText }];
        const assistantText = await callLLM(chatId, userMessageContent); // Заменяем callOpenAI на callLLM
        await sendAndLogResponse(chatId, assistantText);

    } catch (error) {
        await sendErrorMessage(chatId, error.message, 'обработки текстового сообщения');
    }
});

bot.on('photo', async (msg) => {
    const chatId = msg.chat.id;
    if (!validateChatId(chatId)) return;

    const userDataPath = path.join(USER_DATA_DIR, `${chatId}.json`);
    if (!fs.existsSync(userDataPath)) {
        console.info(`[Фото ${chatId}] Файл данных пользователя не найден при обработке фото. Предлагаем /start.`);
        await bot.sendMessage(chatId, 'Пожалуйста, используйте команду /start перед отправкой фото.');
        logChat(chatId, { type: 'system_event', event: 'prompted_start_no_userdata_photo' }, 'system');
        return;
    }

    try {
        console.info(`[Фото ${chatId}] Получено фото от пользователя.`);
        await bot.sendChatAction(chatId, 'upload_photo');
        const userMessageContent = await processPhoto(msg);
        const assistantText = await callOpenAI(chatId, userMessageContent); // Заменяем callOpenAI на callLLM
        await sendAndLogResponse(chatId, assistantText);
    } catch (error) {
        await sendErrorMessage(chatId, error.message, 'обработки фото');
    }
});

bot.on('voice', async (msg) => {
    const chatId = msg.chat.id;
    if (!validateChatId(chatId)) return;

    const userDataPath = path.join(USER_DATA_DIR, `${chatId}.json`);
    if (!fs.existsSync(userDataPath)) {
        console.info(`[Голос ${chatId}] Файл данных пользователя не найден при обработке голоса. Предлагаем /start.`);
        await bot.sendMessage(chatId, 'Пожалуйста, используйте команду /start перед отправкой голосовых сообщений.');
        logChat(chatId, { type: 'system_event', event: 'prompted_start_no_userdata_voice' }, 'system');
        return;
    }

    try {
        console.info(`[Голос ${chatId}] Получено голосовое сообщение.`);
        await bot.sendChatAction(chatId, 'typing');
        const userMessageContent = await processVoice(msg);
        const assistantText = await callLLM(chatId, userMessageContent); // Заменяем callOpenAI на callLLM
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