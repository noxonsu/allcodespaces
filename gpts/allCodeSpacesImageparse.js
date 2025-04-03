console.log('this is allCodeSpacesImageparse.js file');
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');
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
    callOpenAI,
    transcribeAudio,
    updateLongMemory // Keep for /start potentially
    // clearConversation is removed
} = require('./openai');

// --- Configuration ---
let nameprompt = 'calories'; // Example, ensure this is set correctly
const result = dotenv.config({ path: `.env.${nameprompt}` });
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
if (!openaiApiKey) {
    console.error(`Ошибка: OPENAI_API_KEY не определен в файле .env.${nameprompt}`);
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
        // Fallback to environment variable if file doesn't exist
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

// --- Initialize OpenAI Module ---
setSystemMessage(systemPromptContent);
setOpenAIKey(openaiApiKey);

// --- Initialize Bot ---
const bot = new TelegramBot(token, { polling: true });

// --- Ensure Directories Exist (Redundant check, but safe) ---
const USER_DATA_DIR = path.join(__dirname, 'user_data');
if (!fs.existsSync(CHAT_HISTORIES_DIR)) {
    fs.mkdirSync(CHAT_HISTORIES_DIR, { recursive: true });
}
if (!fs.existsSync(USER_DATA_DIR)) {
    fs.mkdirSync(USER_DATA_DIR, { recursive: true });
}

// --- Helper Functions ---

/**
 * Sends a response message via Telegram and logs it to the chat history.
 * @param {number} chatId The chat ID.
 * @param {string} assistantText The text response from the assistant.
 */
async function sendAndLogResponse(chatId, assistantText) {
    try {
        await bot.sendMessage(chatId, assistantText);
        // Logging is now handled inside callOpenAI *after* successful response.
    } catch (error) {
        console.error(`Ошибка отправки сообщения в чат ${chatId}:`, error.message);
        // Attempt to notify user of send failure
        try {
            await bot.sendMessage(chatId, "Извините, не удалось отправить предыдущий ответ. Пожалуйста, попробуйте еще раз или перезапустите бота командой /start.");
        } catch (nestedError) {
            console.error(`Не удалось отправить уведомление об ошибке в чат ${chatId}:`, nestedError.message);
        }
        // Log the failure to send
        logChat(chatId, { error: 'send_message_failed', message: error.message }, 'error');
    }
}

/**
 * Sends a generic error message to the user, suggesting a restart.
 * @param {number} chatId The chat ID.
 * @param {string} specificErrorMsg The error message from the caught exception (for logging).
 * @param {string} context E.g., 'обработки текста', 'обработки фото'.
 */
async function sendErrorMessage(chatId, specificErrorMsg, context = 'обработки вашего запроса') {
     console.error(`Ошибка во время ${context} для чата ${chatId}:`, specificErrorMsg);
     try {
         // Send a user-friendly message including the restart suggestion
         await bot.sendMessage(
             chatId,
             `Извините, возникла проблема во время ${context}. Пожалуйста, повторите попытку. Если ошибка повторяется, попробуйте перезапустить бота командой /start.`
         );
     } catch (sendError) {
         console.error(`Не удалось отправить сообщение об ошибке в чат ${chatId}:`, sendError.message);
     }
     // Log the detailed error internally
     logChat(chatId, {
         error: `error_in_${context.replace(/\s+/g, '_')}`,
         message: specificErrorMsg, // Log the actual error message here
         timestamp: new Date().toISOString()
     }, 'error');
}


// --- Message Processors ---

/**
 * Processes voice messages: downloads, transcribes, and prepares content for OpenAI.
 * @param {object} msg The Telegram message object.
 * @returns {Promise<Array<object>>} A promise resolving to the user message content array.
 * @throws {Error} If processing fails.
 */
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
    const mimeType = voice.mime_type; // Get mime type from voice object

    // Validate mime type *before* transcription attempt
    if (!mimeType || !validateMimeTypeAudio(mimeType)) {
        console.warn(`[Голос ${chatId}] Некорректный или отсутствующий MIME тип аудио: ${mimeType}`);
        throw new Error(`Неподдерживаемый формат аудио: ${mimeType || 'Unknown'}. Пожалуйста, отправьте стандартные форматы (MP3, OGG, WAV, M4A).`);
    }

    console.info(`[Голос ${chatId}] Попытка транскрибации аудио с ${fileUrl} (MIME: ${mimeType})`);
    const transcribedText = await transcribeAudio(fileUrl, 'ru'); // Request Russian transcription
    console.info(`[Голос ${chatId}] Голос транскрибирован. Длина: ${transcribedText.length}`);

    const userMessageContent = [];
    if (caption) {
        userMessageContent.push({ type: 'input_text', text: caption });
    }
    userMessageContent.push({ type: 'input_text', text: transcribedText }); // Add transcribed text

     // Log the voice event details (excluding the actual audio data)
    logChat(chatId, {
        type: 'voice_received',
        mimeType: mimeType,
        duration: voice.duration,
        fileSize: voice.file_size,
        hasCaption: Boolean(caption),
        transcribedTextLength: transcribedText.length, // Log length, not full text
        timestamp: new Date(msg.date * 1000).toISOString() // Use message timestamp
    }, 'event');


    return userMessageContent; // Return content for callOpenAI
}

/**
 * Processes photo messages: downloads, encodes, and prepares content for OpenAI.
 * @param {object} msg The Telegram message object.
 * @returns {Promise<Array<object>>} A promise resolving to the user message content array.
 * @throws {Error} If processing fails.
 */
async function processPhoto(msg) {
    const chatId = msg.chat.id;
    if (!validateChatId(chatId)) throw new Error('Некорректный chat ID в фото сообщении');

    const caption = msg.caption ? sanitizeString(msg.caption) : '';
    // Get the largest available photo
    const photo = msg.photo && msg.photo.length > 0 ? msg.photo[msg.photo.length - 1] : null;
    if (!photo || !photo.file_id) throw new Error('Некорректные данные фото в сообщении');

    console.info(`[Фото ${chatId}] Обработка фото сообщения.`);
    const file = await bot.getFile(photo.file_id);
    if (!file || !file.file_path) throw new Error('Не удалось получить информацию о файле от Telegram');

    const fileUrl = `https://api.telegram.org/file/bot${token}/${file.file_path}`;
    console.info(`[Фото ${chatId}] Загрузка изображения с ${fileUrl}`);

    // Determine MIME type from file extension (less reliable) or fetch headers (better)
    const fileExtension = path.extname(file.file_path).toLowerCase();
    const mimeType = {
        '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
        '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp'
    }[fileExtension];

    if (!mimeType || !validateMimeTypeImg(mimeType)) {
        console.warn(`[Фото ${chatId}] Неподдерживаемый тип изображения по расширению: ${fileExtension}`);
        throw new Error(`Неподдерживаемый формат изображения (${fileExtension || 'Unknown'}). Пожалуйста, отправьте JPEG, PNG, GIF, WEBP, или BMP.`);
    }

    // Download the image
    const imageResponse = await axios.get(fileUrl, {
        responseType: 'arraybuffer',
        timeout: 30000, // 30 seconds timeout for download
        maxContentLength: 15 * 1024 * 1024 // Allow slightly larger download (e.g., 15MB)
    });

    // Validate downloaded size before encoding
    validateImageResponse(imageResponse, 10 * 1024 * 1024); // Validate against 10MB limit

    // Encode to Base64
    const imageBase64 = Buffer.from(imageResponse.data).toString('base64');
    const imageUrl = `data:${mimeType};base64,${imageBase64}`;
    console.info(`[Фото ${chatId}] Изображение загружено и закодировано. Длина Base64: ${imageBase64.length}`);

    // Check encoded size (Base64 is larger than binary) - OpenAI has its own limits too (e.g., 20MB total payload)
    if (imageUrl.length > 20 * 1024 * 1024 * 0.75) { // Estimate max base64 size for ~20MB limit
         throw new Error('Закодированные данные изображения слишком велики.');
    }

    const userMessageContent = [];
    if (caption) {
        userMessageContent.push({ type: 'input_text', text: caption });
    }
    userMessageContent.push({ type: 'input_image', image_url: imageUrl }); // Use the base64 data URI

     // Log photo event details
    logChat(chatId, {
        type: 'photo_received',
        mimeType: mimeType,
        fileSize: photo.file_size, // From Telegram metadata
        width: photo.width,
        height: photo.height,
        hasCaption: Boolean(caption),
        timestamp: new Date(msg.date * 1000).toISOString() // Use message timestamp
    }, 'event');


    return userMessageContent; // Return content for callOpenAI
}


// --- Telegram Bot Event Handlers ---

// Handler for /start command
bot.onText(/\/start(?:\s+(.+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    if (!validateChatId(chatId)) {
         console.error(`Некорректный chat ID получен в /start: ${msg.chat.id}`);
        return;
    }
    console.info(`[Start ${chatId}] Получена команда /start.`);

    try {
        // --- User Data Handling (Keep this part) ---
        const userFilePath = path.join(USER_DATA_DIR, `${chatId}.json`);
        let startParam = match?.[1] ? sanitizeString(match[1]) : null; // Sanitize start parameter
        const howPassed = startParam ? `через параметр: ${startParam}` : 'прямая команда /start';

        let userData = {};
        let isNewUser = false;
        if (fs.existsSync(userFilePath)) {
            try {
                userData = JSON.parse(fs.readFileSync(userFilePath, 'utf8'));
                // Update start parameter info if changed
                if (startParam && startParam !== userData.startParameter) {
                    userData.lastStartParam = startParam; // Record the new param
                    console.info(`[Start ${chatId}] Чат перезапущен с новым параметром: ${startParam}`);
                }
                 userData.lastRestartTime = new Date().toISOString(); // Record restart time
            } catch (parseError) {
                 console.error(`Ошибка парсинга существующих данных пользователя для ${chatId}, сброс:`, parseError);
                 // Reset data if parsing fails
                 isNewUser = true; // Treat as new user if data is corrupted
                 userData = {}; // Start fresh
            }
        } else {
            isNewUser = true;
        }

        // If new user or data was reset, initialize fields
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
                longMemory: '', // Initialize empty long memory
                lastLongMemoryUpdate: 0, // Initialize update timestamp
                lastRestartTime: new Date().toISOString() // Record first start/restart
            };
            console.info(`[Start ${chatId}] Записаны данные нового пользователя.`);
        }

        // Save updated/new user data
        fs.writeFileSync(userFilePath, JSON.stringify(userData, null, 2));
        console.info(`[Start ${chatId}] Данные пользователя сохранены.`);

        // --- History Handling ---
        // Clear the existing chat log file to start fresh conversation
        const chatLogPath = path.join(CHAT_HISTORIES_DIR, `chat_${chatId}.log`);
        if (fs.existsSync(chatLogPath)) {
            try {
                fs.unlinkSync(chatLogPath);
                console.info(`[Start ${chatId}] Лог чата очищен из-за команды /start.`);
            } catch (unlinkError) {
                console.error(`Ошибка удаления лога чата для ${chatId}:`, unlinkError);
                // Continue execution, but log the error
            }
        } else {
             console.info(`[Start ${chatId}] Существующий лог чата для очистки не найден.`);
        }


        // Log the /start event itself
        logChat(chatId, {
            type: 'system_event',
            event: 'start_command',
            howPassed: howPassed,
            isNewUser: isNewUser, // Log if it was the first time
            timestamp: new Date(msg.date * 1000).toISOString()
        }, 'system');

        // --- Optional: Trigger initial long memory update (if needed) ---
        // updateLongMemory(chatId).catch(err => console.error(`Initial long memory update failed for ${chatId}:`, err));

        // --- Send Welcome Message ---
        // Ask for name only if it's the very first interaction (or data was reset)
        if (isNewUser) {
             await bot.sendMessage(chatId, 'Добро пожаловать! Я ваш полезный ассистент. Для начала, не могли бы вы сказать, как вас зовут?');
             logChat(chatId, { type: 'system_message', text: 'Запрошено имя пользователя' }, 'system');
        } else {
            // Welcome back message for returning users
             await bot.sendMessage(chatId, 'С возвращением! Чем могу помочь сегодня?');
             logChat(chatId, { type: 'system_message', text: 'Отправлено приветствие "С возвращением"' }, 'system');
        }


    } catch (error) {
        console.error(`Критическая ошибка при обработке /start для чата ${chatId}:`, error);
        // Try to send an error message, but avoid complex logic here
        try {
            // Add restart suggestion here too
            await bot.sendMessage(chatId, 'Извините, что-то пошло не так во время инициализации. Пожалуйста, попробуйте /start еще раз позже или перезапустите бота командой /start.');
        } catch (sendError) {
             console.error(`Не удалось отправить сообщение об ошибке /start в чат ${chatId}:`, sendError.message);
        }
         logChat(chatId, { error: 'start_command_critical', message: error.message }, 'error');
    }
});


// Handler for text messages (and potentially others if not caught by specific handlers)
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;

    // --- Basic Validation and Ignore Non-Text ---
    if (!validateChatId(chatId)) {
        console.error(`Некорректный chat ID в обработчике сообщений: ${msg.chat.id}`);
        return; // Ignore messages with invalid chat IDs
    }
    // Ignore messages handled by specific handlers (photo, voice, /start command)
    if (msg.photo || msg.voice || (msg.text && msg.text.startsWith('/start'))) {
        return;
    }
     // Ignore messages without text content if they weren't caught by other handlers
    if (!msg.text) {
        console.info(`[Сообщение ${chatId}] Игнорирование нетекстового сообщения (тип: ${msg.document ? 'document' : msg.sticker ? 'sticker' : 'other'})`);
        return;
    }


    // --- Main Text Message Processing ---
    const userText = sanitizeString(msg.text); // Sanitize user input
    if (!userText) {
         console.info(`[Сообщение ${chatId}] Игнорирование пустого текстового сообщения после очистки.`);
        return; // Ignore empty messages after sanitization
    }


    try {
        console.info(`[Сообщение ${chatId}] Обработка текстового сообщения. Длина: ${userText.length}`);

        // --- Check if User Data Exists (Required after /start) ---
        // This ensures the user has run /start at least once to create their data file.
        const userDataPath = path.join(USER_DATA_DIR, `${chatId}.json`);
        if (!fs.existsSync(userDataPath)) {
            console.info(`[Сообщение ${chatId}] Файл данных пользователя не найден. Предлагаем /start.`);
            await bot.sendMessage(
                chatId,
                'Кажется, вышло крупное обновление бота! Пожалуйста, используйте команду /start, чтобы начать наш разговор.'
            );
             logChat(chatId, { type: 'system_event', event: 'prompted_start_no_userdata' }, 'system');
            return; // Stop processing until /start is used
        }

        // --- REMOVED Restart Check ---
        // The logic checking restartFilePath and logMtime has been removed.

        // --- Check if Name has been Provided (Example Logic) ---
        // This logic depends on how you store the name (in user_data.json or chat log)
        let hasProvidedName = false;
        try {
            const userData = JSON.parse(fs.readFileSync(userDataPath, 'utf8'));
            if (userData.providedName) { // Check if name exists in user data
                hasProvidedName = true;
            }
        } catch(err) {
             console.error(`[Сообщение ${chatId}] Ошибка чтения данных пользователя для проверки имени:`, err);
             // Proceed cautiously, assume name not provided if data is unreadable
        }


        // If name hasn't been provided yet, treat this message as the name.
        if (!hasProvidedName) {
            console.info(`[Сообщение ${chatId}] Обработка сообщения как имени пользователя: "${userText}"`);
            // Log that the name was provided
            logChat(chatId, {
                type: 'name_provided', // Specific type for this event
                role: 'user', // Logged as a user action
                name: userText, // Log the provided name
                content: [{ type: 'input_text', text: `Пользователь предоставил имя: ${userText}` }], // Content for potential history use
                timestamp: new Date(msg.date * 1000).toISOString()
            }, 'user'); // Log type 'user'

             // Update user_data.json with the name
             try {
                const userData = JSON.parse(fs.readFileSync(userDataPath, 'utf8'));
                userData.providedName = userText; // Add a field for the name
                userData.nameLastUpdate = new Date().toISOString();
                fs.writeFileSync(userDataPath, JSON.stringify(userData, null, 2));
                console.info(`[Сообщение ${chatId}] Имя пользователя сохранено в данных пользователя.`);
             } catch (err) {
                 console.error(`[Сообщение ${chatId}] Не удалось обновить данные пользователя с именем:`, err);
             }


            // Call OpenAI with context that the user provided their name
            const assistantResponse = await callOpenAI(chatId, [{
                type: 'input_text',
                // Frame it clearly for the AI
                text: `Пользователь только что сказал мне, что его зовут "${userText}". Пожалуйста, подтверди это и продолжи разговор естественно.`
            }]);

            await sendAndLogResponse(chatId, assistantResponse);
            return; // Stop further processing for this message
        }


        // --- Normal Message Handling ---
        // Prepare content for OpenAI call
        const userMessageContent = [{ type: 'input_text', text: userText }];

        // Logging of the user message is now handled *inside* callOpenAI before the API call.

        // Call OpenAI
        const assistantText = await callOpenAI(chatId, userMessageContent);

        // Send response (logging of assistant response is handled inside callOpenAI)
        await sendAndLogResponse(chatId, assistantText);

    } catch (error) {
        // Use the helper function to send a standardized error message
        await sendErrorMessage(chatId, error.message, 'обработки текстового сообщения');
    }
});


// Handler for photo messages
bot.on('photo', async (msg) => {
    const chatId = msg.chat.id;
    if (!validateChatId(chatId)) return; // Basic validation

     // --- Check if User Data Exists (Required after /start) ---
     const userDataPath = path.join(USER_DATA_DIR, `${chatId}.json`);
     if (!fs.existsSync(userDataPath)) {
         console.info(`[Фото ${chatId}] Файл данных пользователя не найден при обработке фото. Предлагаем /start.`);
         await bot.sendMessage(chatId, 'Пожалуйста, используйте команду /start перед отправкой фото.');
         logChat(chatId, { type: 'system_event', event: 'prompted_start_no_userdata_photo' }, 'system');
         return;
     }


    try {
        console.info(`[Фото ${chatId}] Получено фото от пользователя.`);
        await bot.sendChatAction(chatId, 'upload_photo'); // Indicate processing

        const userMessageContent = await processPhoto(msg); // Handles download, encoding, logging event

        // Logging of the user message content for history is now handled inside callOpenAI

        const assistantText = await callOpenAI(chatId, userMessageContent);
        await sendAndLogResponse(chatId, assistantText);

    } catch (error) {
         await sendErrorMessage(chatId, error.message, 'обработки фото');
    }
});

// Handler for voice messages
bot.on('voice', async (msg) => {
    const chatId = msg.chat.id;
    if (!validateChatId(chatId)) return; // Basic validation

    // --- Check if User Data Exists (Required after /start) ---
     const userDataPath = path.join(USER_DATA_DIR, `${chatId}.json`);
     if (!fs.existsSync(userDataPath)) {
         console.info(`[Голос ${chatId}] Файл данных пользователя не найден при обработке голоса. Предлагаем /start.`);
         await bot.sendMessage(chatId, 'Пожалуйста, используйте команду /start перед отправкой голосовых сообщений.');
         logChat(chatId, { type: 'system_event', event: 'prompted_start_no_userdata_voice' }, 'system');
         return;
     }


    try {
        console.info(`[Голос ${chatId}] Получено голосовое сообщение.`);
        await bot.sendChatAction(chatId, 'typing'); // Indicate processing

        const userMessageContent = await processVoice(msg); // Handles download, transcription, logging event

        // Logging of the user message content for history is now handled inside callOpenAI

        const assistantText = await callOpenAI(chatId, userMessageContent);
        await sendAndLogResponse(chatId, assistantText);

    } catch (error) {
        await sendErrorMessage(chatId, error.message, 'обработки голосового сообщения');
    }
});

// --- Error Handlers ---
bot.on('polling_error', (error) => {
    console.error('Ошибка опроса (Polling):', error.code, '-', error.message);
    // Consider adding more robust error handling, e.g., exponential backoff or process restart
});

bot.on('webhook_error', (error) => {
    console.error('Ошибка Webhook:', error.code, '-', error.message);
    // Handle webhook specific errors if using webhooks
});

// --- Bot Start ---
console.log('Конфигурация бота завершена. Запуск опроса...');
// The bot starts polling automatically when initialized with { polling: true }

// Optional: Graceful shutdown handling
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
