const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');
const { sanitizeString, validateChatId, logChat, validateImageResponse, validateMimeTypeImg, validateMimeTypeAudio } = require('./utilities');
const { setSystemMessage, setOpenAIKey, callOpenAI, clearConversation, transcribeAudio } = require('./openai');

// --- Конфигурация ---
let nameprompt = 'calories';
const result = dotenv.config({ path: `.env.${nameprompt}` });
if (result.error) {
    console.error(`Error loading .env.${nameprompt} file:`, result.error);
    process.exit(1);
}

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
    console.error(`Error: TELEGRAM_BOT_TOKEN is not defined in .env.${nameprompt} file`);
    process.exit(1);
}

const openaiApiKey = process.env.OPENAI_API_KEY;
if (!openaiApiKey) {
    console.error(`Error: OPENAI_API_KEY is not defined in .env.${nameprompt} file`);
    process.exit(1);
}

let systemPromptContent = 'You are a helpful assistant.';
try {
    const promptPath = `.env.${nameprompt}_prompt`;
    if (fs.existsSync(promptPath)) {
        const promptData = fs.readFileSync(promptPath, 'utf8');
        systemPromptContent = promptData;
    } else {
        systemPromptContent = process.env.SYSTEM_PROMPT || systemPromptContent;
    }
    
    if (!systemPromptContent) {
        throw new Error('System prompt is empty or undefined');
    }
} catch (error) {
    console.error('Error loading system prompt:', error);
    process.exit(1);
}

// Установка системного сообщения и ключа API для OpenAI
setSystemMessage(systemPromptContent);
setOpenAIKey(openaiApiKey);

// Инициализация бота
const bot = new TelegramBot(token, { polling: true });

// Initialize restart time tracking
const restartFilePath = path.join(__dirname, 'lastrestarttime.txt');
const lastRestartTime = new Date();

// Ensure chat_histories directory exists
const chatHistoriesDir = path.join(__dirname, 'chat_histories');
if (!fs.existsSync(chatHistoriesDir)) {
    fs.mkdirSync(chatHistoriesDir, { recursive: true });
}

// Write restart time as Unix timestamp
try {
    fs.writeFileSync(restartFilePath, lastRestartTime.getTime().toString());
    console.log(`Restart time recorded: ${lastRestartTime.getTime()}`);
} catch (error) {
    console.error('Failed to write restart time:', error);
}

// --- Обработка голосовых сообщений ---
/**
 * Обрабатывает голосовое сообщение, транскрибирует его и готовит содержимое для OpenAI.
 * @param {Object} msg - Сообщение от Telegram
 * @returns {Array} - Содержимое сообщения для OpenAI
 */
async function processVoice(msg) {
    const chatId = msg.chat.id;
    if (!validateChatId(chatId)) {
        console.error('Invalid chat ID in voice message');
        throw new Error('Invalid chat ID');
    }

    const caption = msg.caption ? sanitizeString(msg.caption) : '';
    const voice = msg.voice;
    if (!voice || !voice.file_id) {
        console.error('Invalid voice data received');
        throw new Error('Invalid voice data');
    }

    const file = await bot.getFile(voice.file_id);
    if (!file || !file.file_path) {
        throw new Error('Invalid file data received');
    }

    const filePath = file.file_path;
    const fileUrl = `https://api.telegram.org/file/bot${token}/${filePath}`;
    console.log(`Processing voice file from URL: ${fileUrl}`);

    // Валидация MIME-типа (голосовые сообщения обычно 'audio/ogg')
    const mimeType = voice.mime_type;
    if (!mimeType || !validateMimeTypeAudio(mimeType)) {
        throw new Error('Invalid voice MIME type');
    }

    const text = await transcribeAudio(fileUrl, 'ru');
    console.log(`Transcribed voice: ${text}`);

    const userMessageContent = [];
    if (caption) {
        userMessageContent.push({ type: 'input_text', text: sanitizeString(caption) });
    }
    userMessageContent.push({ type: 'input_text', text: text });

    // Логирование обработки голосового сообщения
    logChat(chatId, {
        type: 'voice',
        mimeType: mimeType,
        hasCaption: Boolean(caption),
        timestamp: new Date().toISOString()
    });

    return userMessageContent;
}

// --- Обработка фото ---
/**
 * Обрабатывает фото-сообщение, загружает изображение и готовит содержимое для OpenAI.
 * @param {Object} msg - Сообщение от Telegram
 * @returns {Array} - Содержимое сообщения для OpenAI
 */
async function processPhoto(msg) {
    const chatId = msg.chat.id;
    if (!validateChatId(chatId)) {
        console.error('Invalid chat ID in photo message');
        throw new Error('Invalid chat ID');
    }

    const caption = msg.caption ? sanitizeString(msg.caption) : '';
    const photo = msg.photo[msg.photo.length - 1];
    if (!photo || !photo.file_id) {
        console.error('Invalid photo data received');
        throw new Error('Invalid photo data');
    }

    const file = await bot.getFile(photo.file_id);
    if (!file || !file.file_path) {
        throw new Error('Invalid file data received');
    }

    const filePath = file.file_path;
    const fileUrl = `https://api.telegram.org/file/bot${token}/${filePath}`;
    console.log(`Processing image file from URL: ${fileUrl}`);

    // Валидация расширения файла и MIME-типа
    const fileExtension = path.extname(filePath).toLowerCase();
    const mimeType = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.bmp': 'image/bmp'
    }[fileExtension];

    if (!mimeType || !validateMimeTypeImg(mimeType)) {
        throw new Error('Invalid file type');
    }

    // Загрузка изображения
    const imageResponse = await axios.get(fileUrl, {
        responseType: 'arraybuffer',
        timeout: 30000,
        maxContentLength: 10 * 1024 * 1024 // Лимит 10 МБ
    });

    validateImageResponse(imageResponse);

    const imageBase64 = Buffer.from(imageResponse.data).toString('base64');
    console.log(`Successfully downloaded and encoded image. Mime type: ${mimeType}, Base64 length: ${imageBase64.length}`);

    // Валидация размера закодированного изображения
    if (imageBase64.length > 10 * 1024 * 1024) {
        throw new Error('Encoded image size exceeds maximum allowed');
    }

    // Формирование содержимого сообщения
    const imageUrl = `data:${mimeType};base64,${imageBase64}`;
    const userMessageContent = [];
    
    if (caption) {
        userMessageContent.push({ type: 'input_text', text: sanitizeString(caption) });
    }
    
    userMessageContent.push({ type: 'input_image', image_url: imageUrl });

    // Логирование обработки фото (без base64 для безопасности)
    logChat(chatId, { 
        type: 'photo',
        mimeType: mimeType,
        hasCaption: Boolean(caption),
        timestamp: new Date().toISOString()
    });

    return userMessageContent;
}

// --- Обработчики событий Telegram ---

// Обработчик команды /start
bot.onText(/\/start(?:\s+(.+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    console.log(`Received /start command from chat ${chatId}`);

    try {
        // Create user_data directory if it doesn't exist
        const userDataDir = path.join(__dirname, 'user_data');
        if (!fs.existsSync(userDataDir)) {
            fs.mkdirSync(userDataDir, { recursive: true });
        }

        // Path to user's data file
        const userFilePath = path.join(userDataDir, `${chatId}.json`);

        // Get raw start parameter if provided and sanitize it
        let startParam = match?.[1] || null;
        if (startParam) {
            startParam = sanitizeString(startParam);
        }

        const howPassed = startParam ? `via parameter: ${startParam}` : 'direct via /start command';

        let userData = {};
        if (fs.existsSync(userFilePath)) {
            // Load existing data
            userData = JSON.parse(fs.readFileSync(userFilePath, 'utf8'));
            // Update lastStartParam if new parameter is provided and different from first
            if (startParam && (!userData.startParameter || startParam !== userData.startParameter)) {
                userData.lastStartParam = startParam;
            }
        } else {
            // New user, save first visit and parameter
            userData = {
                chatId: chatId.toString(),
                firstVisit: Date.now(),
                startParameter: startParam,
                howPassed: howPassed,
                username: msg.from?.username || null,
                firstName: msg.from?.first_name || null,
                lastName: msg.from?.last_name || null,
                languageCode: msg.from?.language_code || null
            };
            // Note: Telegram Bot API does not provide account registration date, so we can't save it
            console.log(`User data recorded for chat ${chatId}:`, userData);
        }

        fs.writeFileSync(userFilePath, JSON.stringify(userData, null, 2));

        // Clear conversation history
        clearConversation(chatId);

        // Remove chat log if exists
        const chatLogPath = path.join(chatHistoriesDir, `chat_${chatId}.log`);
        if (fs.existsSync(chatLogPath)) {
            fs.unlinkSync(chatLogPath);
            console.log(`Removed chat log for ${chatId}`);
        }

        // Create initial chat log
        logChat(chatId, {
            type: 'system',
            text: 'Chat initiated',
            timestamp: new Date().toISOString(),
            howPassed: howPassed
        });

        await bot.sendMessage(chatId, 'Как вас зовут?');
    } catch (error) {
        console.error(`Error handling /start for chat ${chatId}:`, error);
        await bot.sendMessage(chatId, 'Произошла ошибка. Пожалуйста, попробуйте ещё раз.');
    }
});

// Обработчик текстовых сообщений
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const userText = msg.text;

    // Skip photo/voice messages and empty text
    if (msg.photo || msg.voice || !userText) {
        return;
    }

    // Skip /start command
    if (userText === '/start') {
        return;
    }

    try {
        const chatLogPath = path.join(chatHistoriesDir, `chat_${chatId}.log`);
        
        // Check if chat log exists
        if (!fs.existsSync(chatLogPath)) {
            await bot.sendMessage(
                chatId, 
                'Please start the conversation with /start command.'
            );
            return;
        }

        // Read restart timestamp
        const restartTimestamp = fs.existsSync(restartFilePath) 
            ? parseInt(fs.readFileSync(restartFilePath, 'utf8'), 10)
            : Date.now();

        // Get chat log modification time as Unix timestamp
        const logMtime = fs.statSync(chatLogPath).mtime.getTime();

        // Debug logging
        console.log(`Chat ${chatId} timestamps - Log: ${logMtime}, Restart: ${restartTimestamp}`);

        // Compare timestamps
        if (logMtime < restartTimestamp) {
            console.log(`Chat history for ${chatId} is outdated`);
            await bot.sendMessage(
                chatId, 
                'Бот был обновлен (исправили ошибки, добавили новых). Пожалуйста перезапустите бота нажав /start . Просим прощения за доставленные неудобства.'
            );
            return;
        }

        const chatHistory = fs.readFileSync(chatLogPath, 'utf8')
            .split('\n')
            .filter(Boolean);
        
        const hasName = chatHistory.some(line => {
            try {
                const entry = JSON.parse(line);
                return entry.type === 'name_provided';
            } catch {
                return false;
            }
        });

        if (!hasName) {
            // First message after /start - handle as name
            logChat(chatId, { 
                type: 'name_provided',
                name: userText,
                timestamp: new Date().toISOString()
            });

            // Send name to OpenAI as first interaction
            answer = await callOpenAI(chatId, [{
                type: 'input_text',
                text: `Меня зовут ${userText}`
            }]);

            await bot.sendMessage(chatId, answer);
            logChat(chatId, { text: answer }, 'assistant');
            return;
        }

        // Regular message processing with restart check
        const restartTime = fs.existsSync(restartFilePath) 
            ? new Date(fs.readFileSync(restartFilePath, 'utf8'))
            : new Date();

        if (fs.statSync(chatLogPath).mtime < restartTime) {
            console.log(`Chat history for ${chatId} is outdated`);
            await bot.sendMessage(
                chatId, 
                'Мы обновили бота (исправление ошибок). Пожалуйста перезапустите бота нажав /start . Просим прощения за доставленые неудобства.'
            );
            return;
        }

        // Process regular message
        logChat(chatId, { text: userText });
        const assistantText = await callOpenAI(chatId, [{
            type: 'input_text',
            text: userText
        }]);
        await bot.sendMessage(chatId, assistantText);
        logChat(chatId, { text: assistantText }, 'assistant');

    } catch (error) {
        console.error(`Error processing message from ${chatId}:`, error);
        await bot.sendMessage(
            chatId, 
            'An error occurred processing your message. Please try again.'
        );
    }
});

// Обработчик фото-сообщений
bot.on('photo', async (msg) => {
    const chatId = msg.chat.id;

    try {
        const userMessageContent = await processPhoto(msg);
        const assistantText = await callOpenAI(chatId, userMessageContent);
        await bot.sendMessage(chatId, assistantText);
        logChat(chatId, { text: assistantText }, 'assistant');
    } catch (error) {
        console.error(`Secure photo processing error for chat ID ${chatId}:`, error.message);
        logChat(chatId, { 
            error: 'photo_processing_error',
            message: error.message,
            timestamp: new Date().toISOString()
        }, 'error');
        try {
            await bot.sendMessage(chatId, 'Не удалось обработать изображение. Попробуйте другое изображение.');
        } catch (sendError) {
            console.error(`Failed to send error message to chat ID ${chatId}:`, sendError.message);
        }
    }
});

// Обработчик голосовых сообщений
bot.on('voice', async (msg) => {
    const chatId = msg.chat.id;

    try {
        const userMessageContent = await processVoice(msg);
        const assistantText = await callOpenAI(chatId, userMessageContent);
        await bot.sendMessage(chatId, assistantText);
        logChat(chatId, { text: assistantText }, 'assistant');
    } catch (error) {
        console.error(`Secure voice processing error for chat ID ${chatId}:`, error.message);
        logChat(chatId, { 
            error: 'voice_processing_error',
            message: error.message,
            timestamp: new Date().toISOString()
        }, 'error');
        try {
            await bot.sendMessage(chatId, 'Не удалось обработать голосовое сообщение. Попробуйте отправить другое сообщение.');
        } catch (sendError) {
            console.error(`Failed to send error message to chat ID ${chatId}:`, sendError.message);
        }
    }
});

// Обработка ошибок polling
bot.on('polling_error', (error) => {
    console.error('Polling error:', error.code, '-', error.message);
});

// Запуск бота
console.log('Bot started successfully and is polling for messages...');