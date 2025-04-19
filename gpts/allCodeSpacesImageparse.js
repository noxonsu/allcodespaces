const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');
const { NAMEPROMPT, USER_DATA_DIR, CHAT_HISTORIES_DIR } = require('./config');
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
    transcribeAudio
} = require('./openai');

// --- Configuration ---
const result = dotenv.config({ path: path.join(__dirname, `.env.${NAMEPROMPT}`) });
if (result.error) {
    console.error(`Ошибка загрузки файла .env.${NAMEPROMPT}:`, result.error);
    process.exit(1);
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

// --- Helper Functions ---

function escapeMarkdown(text) {
    return text.replace(/[_[\]()~`>#|{}.!-]/g, '\\$&');
}

async function sendAndLogResponse(chatId, assistantText) {
    try {
        await bot.sendChatAction(chatId, 'typing');
        const escapedText = escapeMarkdown(assistantText);
        
        // Отправляем сообщение в Telegram
        await bot.sendMessage(chatId, escapedText, { parse_mode: 'MarkdownV2' });
        
        // УДАЛИТЕ СЛЕДУЮЩУЮ СТРОКУ, так как логирование уже выполняется в callOpenAI/callDeepSeek
        // logChat(chatId, { role: 'assistant', content: [{ type: 'output_text', text: assistantText }] }, 'assistant');
        
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
                userData = JSON.parse(fs.readFileSync(userFilePath, 'utf8'));
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

    try {
        console.info(`[Сообщение ${chatId}] Обработка текстового сообщения. Длина: ${userText.length}`);
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

            const assistantResponse = await callLLM(chatId, [{
                type: 'input_text',
                text: `Пользователь только что сказал мне, что его зовут "${userText}". Подтверди это и продолжи разговор естественно.`
            }]);
            await sendAndLogResponse(chatId, assistantResponse);
            return;
        }

        const userMessageContent = [{ type: 'input_text', text: userText }];
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