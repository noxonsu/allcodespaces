console.log('this is gpt4osearch.js');
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

// --- Configuration ---
let nameprompt = 'logist'; // Убедись, что это правильное имя для загрузки .env
const result = dotenv.config({ path: path.join(__dirname, `.env.${nameprompt}`) });
if (result.error) {
    console.error(`Ошибка загрузки файла .env.${nameprompt}:`, result.error);
    process.exit(1); // Exit if config fails
}
// Create instance-specific directories based on nameprompt
const BASE_USER_DATA_DIR = path.join(__dirname, 'user_data');
const USER_DATA_DIR = path.join(BASE_USER_DATA_DIR, nameprompt);
const CHAT_HISTORIES_DIR = path.join(USER_DATA_DIR, 'chat_histories');

// Ensure directories exist BEFORE any other operations
fs.mkdirSync(BASE_USER_DATA_DIR, { recursive: true });
fs.mkdirSync(USER_DATA_DIR, { recursive: true });
fs.mkdirSync(CHAT_HISTORIES_DIR, { recursive: true });

// Import necessary functions from utilities, including CHAT_HISTORIES_DIR
const {
    sanitizeString,
    validateChatId,
    logChat,
    validateImageResponse,
    validateMimeTypeImg,
    validateMimeTypeAudio
} = require('./utilities');
// Import functions from openai module
const {
    setSystemMessage,
    setOpenAIKey,
    setDeepSeekKey, // Добавляем для DeepSeek
    callLLM, // Используем callLLM единообразно
    // callOpenAI, // Можно убрать, если не используется напрямую
    transcribeAudio,
    updateLongMemory // Keep for /start potentially
} = require('./openai');




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
if (!fs.existsSync(CHAT_HISTORIES_DIR)) {
    fs.mkdirSync(CHAT_HISTORIES_DIR, { recursive: true });
}
if (!fs.existsSync(USER_DATA_DIR)) {
    fs.mkdirSync(USER_DATA_DIR, { recursive: true });
}

// --- Helper Functions ---

function escapeMarkdown(text) {
    // Простая функция экранирования для MarkdownV2
    // Можно улучшить, если требуется поддержка более сложных случаев
    if (typeof text !== 'string') return '';
    return text.replace(/[_[\]()~`>#+=|{}.!-]/g, '\\$&');
}

async function sendAndLogResponse(chatId, assistantText) {
    try {
        // Экранируем текст перед отправкой с parse_mode: 'MarkdownV2'
        const escapedText = escapeMarkdown(assistantText);
        await bot.sendMessage(chatId, escapedText, {
            parse_mode: 'MarkdownV2'
        });
        // Логирование ответа ассистента уже происходит внутри callLLM -> logChat
        console.log(`[Response ${chatId}] Successfully sent MarkdownV2 response.`);
    } catch (error) {
        console.error(`Ошибка отправки MarkdownV2 сообщения в чат ${chatId}:`, error.message);
        // Попытка отправить обычным текстом в случае ошибки Markdown
        try {
            console.warn(`[Response ${chatId}] Retrying send with plain text.`);
            await bot.sendMessage(chatId, assistantText); // Отправляем исходный текст без экранирования
            console.log(`[Response ${chatId}] Successfully sent plain text response after MarkdownV2 failure.`);
        } catch (nestedError) {
            console.error(`Не удалось отправить даже простое текстовое сообщение в чат ${chatId}:`, nestedError.message);
            // Логируем критическую ошибку отправки
            logChat(chatId, { error: 'send_message_failed_completely', message: nestedError.message }, 'error');
        }
    }
}


async function sendErrorMessage(chatId, specificErrorMsg, context = 'обработки вашего запроса') {
    console.error(`Ошибка во время ${context} для чата ${chatId}:`, specificErrorMsg);
    try {
        // Используем экранирование и для сообщения об ошибке
        const errorText = escapeMarkdown(`Извините, возникла проблема во время ${context}. Пожалуйста, повторите попытку. Если ошибка повторяется, попробуйте перезапустить бота командой /start.`);
        await bot.sendMessage(chatId, errorText, { parse_mode: 'MarkdownV2'});
    } catch (sendError) {
        // Если даже сообщение об ошибке в Markdown не уходит, пробуем просто текст
        try {
             await bot.sendMessage(
                chatId,
                `Извините, возникла проблема во время ${context}. Пожалуйста, повторите попытку. Если ошибка повторяется, попробуйте перезапустить бота командой /start.`
            );
        } catch (finalError) {
             console.error(`Не удалось отправить сообщение об ошибке в чат ${chatId}:`, finalError.message);
        }
    }
    // Логируем ошибку
    logChat(chatId, {
        error: `error_in_${context.replace(/\s+/g, '_')}`,
        message: specificErrorMsg, // Логируем исходное сообщение об ошибке
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
    bot.sendChatAction(chatId, 'typing').catch(err => console.warn(`[Chat ${chatId}] Failed to send typing action for voice: ${err.message}`)); // Индикатор

    const file = await bot.getFile(voice.file_id);
    if (!file || !file.file_path) throw new Error('Не удалось получить информацию о файле от Telegram');

    const fileUrl = `https://api.telegram.org/file/bot${token}/${file.file_path}`;
    const mimeType = voice.mime_type;

    if (!mimeType || !validateMimeTypeAudio(mimeType)) {
        console.warn(`[Голос ${chatId}] Некорректный MIME тип аудио: ${mimeType}`);
        throw new Error(`Неподдерживаемый формат аудио: ${mimeType || 'Unknown'}. Используйте MP3, OGG, WAV, M4A.`);
    }

    console.info(`[Голос ${chatId}] Транскрибация аудио с ${fileUrl} (MIME: ${mimeType})`);
    const transcribedText = await transcribeAudio(fileUrl, 'ru'); // Вызов функции транскрибации из openai.js

    // Формируем контент для отправки в LLM
    const userMessageContent = [];
    if (caption) userMessageContent.push({ type: 'input_text', text: caption });
    userMessageContent.push({ type: 'input_text', text: transcribedText });

    // Логируем событие получения и транскрибации голоса
    logChat(chatId, {
        type: 'voice_processed', // Изменено для ясности
        mimeType: mimeType,
        duration: voice.duration,
        fileSize: voice.file_size,
        hasCaption: Boolean(caption),
        transcribedTextLength: transcribedText.length,
        timestamp: new Date(msg.date * 1000).toISOString()
    }, 'event'); // Можно использовать 'event' или 'user_input'

    return userMessageContent;
}

async function processPhoto(msg) {
    const chatId = msg.chat.id;
    if (!validateChatId(chatId)) throw new Error('Некорректный chat ID в фото сообщении');

    const caption = msg.caption ? sanitizeString(msg.caption) : '';
    const photo = msg.photo && msg.photo.length > 0 ? msg.photo[msg.photo.length - 1] : null;
    if (!photo || !photo.file_id) throw new Error('Некорректные данные фото в сообщении');

    console.info(`[Фото ${chatId}] Обработка фото сообщения.`);
    bot.sendChatAction(chatId, 'upload_photo').catch(err => console.warn(`[Chat ${chatId}] Failed to send upload_photo action: ${err.message}`)); // Индикатор

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

    // Скачиваем изображение
    const imageResponse = await axios.get(fileUrl, {
        responseType: 'arraybuffer',
        timeout: 30000, // Таймаут на скачивание
        maxContentLength: 15 * 1024 * 1024 // Ограничение на размер скачиваемого файла
    });

    // Валидируем размер скачанного изображения
    validateImageResponse(imageResponse, 10 * 1024 * 1024); // Проверка на 10MB

    // Конвертируем в Base64 Data URL
    const imageBase64 = Buffer.from(imageResponse.data).toString('base64');
    const imageUrl = `data:${mimeType};base64,${imageBase64}`;

    // Проверка на разумный размер Base64 строки (очень приблизительно)
    // OpenAI имеет лимиты на размер запроса, включая base64
    if (imageUrl.length > 20 * 1024 * 1024 * 0.75) { // ~15MB base64
        console.warn(`[Фото ${chatId}] Закодированные данные изображения слишком велики (${imageUrl.length} символов).`);
        throw new Error('Закодированные данные изображения слишком велики для обработки.');
    }

    // Формируем контент для отправки в LLM
    const userMessageContent = [];
    if (caption) userMessageContent.push({ type: 'input_text', text: caption });
    // === ИСПРАВЛЕНО: Используем Base64 Data URL (imageUrl) ===
    userMessageContent.push({ type: 'input_image', image_url: imageUrl });
    // ========================================================

    // Логируем событие получения и обработки фото
    logChat(chatId, {
        type: 'photo_processed', // Изменено для ясности
        mimeType: mimeType,
        fileSizeOriginal: photo.file_size, // Размер из Telegram
        fileSizeDownloaded: imageResponse.data.length, // Размер скачанного
        width: photo.width,
        height: photo.height,
        hasCaption: Boolean(caption),
        timestamp: new Date(msg.date * 1000).toISOString()
    }, 'event'); // Можно использовать 'event' или 'user_input'

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
        let shouldClearHistory = true; // По умолчанию очищаем историю при /start

        if (fs.existsSync(userFilePath)) {
            try {
                userData = JSON.parse(fs.readFileSync(userFilePath, 'utf8'));
                // Если пользователь уже существует, возможно, не стоит очищать историю?
                // Реши, нужна ли очистка для существующих пользователей. Пока оставляем.
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

        // Обновляем или создаем данные пользователя
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
                longMemory: '', // Инициализация долговременной памяти
                lastLongMemoryUpdate: 0,
                lastRestartTime: new Date().toISOString(),
                // Флаг, что имя еще не предоставлено (если используется логика запроса имени)
                providedName: null // Или false, если используется булево значение
            };
            console.info(`[Start ${chatId}] Записаны данные нового пользователя.`);
        } else {
             // Можно сбросить providedName при рестарте, если это требуется
             // userData.providedName = null;
             // userData.longMemory = ''; // Опционально: сбросить память при рестарте
             // userData.lastLongMemoryUpdate = 0;
        }


        fs.writeFileSync(userFilePath, JSON.stringify(userData, null, 2));
        console.info(`[Start ${chatId}] Данные пользователя сохранены.`);

        // Очистка файла истории чата
        if (shouldClearHistory) {
            const chatLogPath = path.join(CHAT_HISTORIES_DIR, `chat_${chatId}.log`);
            if (fs.existsSync(chatLogPath)) {
                try {
                    fs.unlinkSync(chatLogPath);
                    console.info(`[Start ${chatId}] Лог чата очищен из-за команды /start.`);
                } catch (unlinkError) {
                    console.error(`Ошибка удаления лога чата для ${chatId}:`, unlinkError);
                    logChat(chatId, { error: 'log_unlink_failed', message: unlinkError.message }, 'error');
                }
            }
        }

        // Логируем событие /start
        logChat(chatId, {
            type: 'system_event',
            event: 'start_command',
            howPassed: howPassed,
            isNewUser: isNewUser,
            historyCleared: shouldClearHistory, // Логируем, была ли очистка
            timestamp: new Date(msg.date * 1000).toISOString()
        }, 'system');

        // Отправляем приветственное сообщение
        // Логика с запросом имени перенесена в основной обработчик 'message'
        // Здесь просто отправляем общее приветствие
        const welcomeMessage = isNewUser
            ? 'Добро пожаловать! Я ваш полезный ассистент. Спросите меня о чем-нибудь или отправьте фото/голосовое сообщение.'
            : 'С возвращением! Чем могу помочь сегодня?';

        const escapedWelcome = escapeMarkdown(welcomeMessage);
        await bot.sendMessage(chatId, escapedWelcome, { parse_mode: 'MarkdownV2' });
        logChat(chatId, { type: 'system_message', text: welcomeMessage }, 'system'); // Логируем оригинальный текст

    } catch (error) {
        console.error(`Критическая ошибка при обработке /start для чата ${chatId}:`, error);
        await sendErrorMessage(chatId, error.message, 'обработки команды /start');
    }
});


bot.on('message', async (msg) => {
    const chatId = msg.chat.id;

    // 1. Валидация и фильтрация
    if (!validateChatId(chatId)) {
        console.error(`Некорректный chat ID в обработчике сообщений: ${msg.chat.id}`);
        return;
    }
    // Игнорируем сообщения, которые обрабатываются другими хендлерами
    if (msg.photo || msg.voice || (msg.text && msg.text.startsWith('/'))) {
        // /start обрабатывается выше, другие команды можно добавить сюда или в onText
        return;
    }
    if (!msg.text) {
        console.info(`[Сообщение ${chatId}] Игнорирование нетекстового сообщения (тип: ${msg.document ? 'document' : msg.sticker ? 'sticker' : 'other'})`);
        // Можно отправить сообщение пользователю, что поддерживается только текст/фото/голос
        // await bot.sendMessage(chatId, 'Пожалуйста, отправьте текстовое сообщение, фото или голосовое сообщение.');
        return;
    }

    // 2. Подготовка текста и проверка данных пользователя
    const userText = sanitizeString(msg.text);
    if (!userText) {
        console.info(`[Сообщение ${chatId}] Игнорирование пустого текстового сообщения после очистки.`);
        return;
    }

    const userDataPath = path.join(USER_DATA_DIR, `${chatId}.json`);
    if (!fs.existsSync(userDataPath)) {
        // Этого не должно произойти, если /start был выполнен, но на всякий случай
        console.warn(`[Сообщение ${chatId}] Файл данных пользователя не найден. Предлагаем /start.`);
        const promptMsg = escapeMarkdown('Пожалуйста, используйте команду /start, чтобы начать.');
        await bot.sendMessage(chatId, promptMsg, { parse_mode: 'MarkdownV2' });
        logChat(chatId, { type: 'system_event', event: 'prompted_start_no_userdata_message' }, 'system');
        return;
    }

    // 3. Индикатор набора
    bot.sendChatAction(chatId, 'typing').catch(err => console.warn(`[Chat ${chatId}] Failed to send typing action: ${err.message}`));

    // 4. Основная логика обработки текста
    try {
        console.info(`[Сообщение ${chatId}] Обработка текстового сообщения. Длина: ${userText.length}`);

        // ОПЦИОНАЛЬНО: Логика запроса имени, если она нужна
        /*
        let userData = {};
        let requiresName = false;
        try {
            userData = JSON.parse(fs.readFileSync(userDataPath, 'utf8'));
            if (!userData.providedName) { // Проверяем флаг
                requiresName = true;
            }
        } catch (err) {
            console.error(`[Сообщение ${chatId}] Ошибка чтения данных пользователя для проверки имени:`, err);
            // Обработать ошибку или продолжить без проверки имени
        }

        if (requiresName) {
            console.info(`[Сообщение ${chatId}] Обработка сообщения как имени: "${userText}"`);
            // Логируем предполагаемое имя
             logChat(chatId, {
                 type: 'name_provided_attempt', // Отмечаем, что это попытка предоставить имя
                 role: 'user',
                 name_candidate: userText,
                 timestamp: new Date(msg.date * 1000).toISOString()
             }, 'user');

            // Обновляем данные пользователя
            try {
                userData.providedName = userText; // Сохраняем имя
                userData.nameLastUpdate = new Date().toISOString();
                fs.writeFileSync(userDataPath, JSON.stringify(userData, null, 2));
                console.info(`[Сообщение ${chatId}] Имя пользователя "${userText}" сохранено.`);
            } catch (err) {
                console.error(`[Сообщение ${chatId}] Не удалось обновить данные пользователя с именем:`, err);
                logChat(chatId, { error: 'user_data_name_save_failed', message: err.message }, 'error');
                // Не прерываем выполнение, но логируем ошибку
            }

            // Отправляем подтверждение LLM
            const confirmationContent = [{
                type: 'input_text',
                text: `Пользователь только что сказал мне, что его зовут "${userText}". Кратко и дружелюбно подтверди это и спроси, чем ты можешь помочь.`
            }];
            const assistantResponse = await callLLM(chatId, confirmationContent);
            await sendAndLogResponse(chatId, assistantResponse);
            return; // Завершаем обработку этого сообщения, так как это было имя
        }
        */
        // --- Конец опциональной логики имени ---

        // Если логика имени не используется или имя уже есть, обрабатываем как обычный запрос
        const userMessageContent = [{ type: 'input_text', text: userText }];
        const assistantText = await callLLM(chatId, userMessageContent); // Используем callLLM
        await sendAndLogResponse(chatId, assistantText);

    } catch (error) {
        // Обрабатываем ошибки от callLLM или другие ошибки в try блоке
        await sendErrorMessage(chatId, error.message, 'обработки текстового сообщения');
    }
});


bot.on('photo', async (msg) => {
    const chatId = msg.chat.id;
    if (!validateChatId(chatId)) return;

    const userDataPath = path.join(USER_DATA_DIR, `${chatId}.json`);
    if (!fs.exists(userDataPath)) {
        console.info(`[Фото ${chatId}] Файл данных пользователя не найден при обработке фото. Предлагаем /start.`);
        const promptMsg = escapeMarkdown('Пожалуйста, используйте команду /start перед отправкой фото.');
        await bot.sendMessage(chatId, promptMsg, { parse_mode: 'MarkdownV2' });
        logChat(chatId, { type: 'system_event', event: 'prompted_start_no_userdata_photo' }, 'system');
        return;
    }

    try {
        console.info(`[Фото ${chatId}] Получено фото от пользователя.`);
        // Не нужно 'upload_photo', так как мы обрабатываем и отправляем ответ текстом
        // await bot.sendChatAction(chatId, 'upload_photo');
        await bot.sendChatAction(chatId, 'typing'); // Лучше 'typing'

        const userMessageContent = await processPhoto(msg); // Обрабатываем фото (уже содержит исправление)
        // === ИСПРАВЛЕНО: Используем callLLM ===
        const assistantText = await callLLM(chatId, userMessageContent);
        // =====================================
        await sendAndLogResponse(chatId, assistantText); // Отправляем ответ

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
        const promptMsg = escapeMarkdown('Пожалуйста, используйте команду /start перед отправкой голосовых сообщений.');
        await bot.sendMessage(chatId, promptMsg, { parse_mode: 'MarkdownV2' });
        logChat(chatId, { type: 'system_event', event: 'prompted_start_no_userdata_voice' }, 'system');
        return;
    }

    try {
        console.info(`[Голос ${chatId}] Получено голосовое сообщение.`);
        await bot.sendChatAction(chatId, 'typing'); // Индикатор

        const userMessageContent = await processVoice(msg); // Обрабатываем голос
        const assistantText = await callLLM(chatId, userMessageContent); // Используем callLLM
        await sendAndLogResponse(chatId, assistantText); // Отправляем ответ

    } catch (error) {
        await sendErrorMessage(chatId, error.message, 'обработки голосового сообщения');
    }
});

// --- Error Handlers ---
bot.on('polling_error', (error) => {
    console.error('Ошибка опроса (Polling):', error.code, '-', error.message);
    logChat(0, { error: 'polling_error', code: error.code, message: error.message }, 'error');
});

bot.on('webhook_error', (error) => {
    console.error('Ошибка Webhook:', error.code, '-', error.message);
    logChat(0, { error: 'webhook_error', code: error.code, message: error.message }, 'error');
});

// --- Bot Start ---
console.log('Конфигурация бота завершена. Запуск опроса...');

// --- Graceful Shutdown ---
const gracefulShutdown = (signal) => {
    console.log(`\nПолучен сигнал ${signal}. Завершение работы бота...`);
    bot.stopPolling({ cancel: true }) // Отменяем текущие запросы при остановке
        .then(() => {
            console.log('Опрос остановлен.');
            // Здесь можно добавить закрытие других ресурсов, если они есть (например, БД)
            process.exit(0);
        })
        .catch(err => {
            console.error("Ошибка при остановке опроса:", err);
            process.exit(1);
        });
};

process.on('SIGINT', () => gracefulShutdown('SIGINT')); // Ctrl+C
process.on('SIGTERM', () => gracefulShutdown('SIGTERM')); // Сигнал завершения (например, от systemd или Docker)