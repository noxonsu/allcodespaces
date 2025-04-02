console.log('this is allCodeSpacesImageparse.js file');
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');
const { sanitizeString, validateChatId, logChat, validateImageResponse, validateMimeTypeImg, validateMimeTypeAudio } = require('./utilities');
const { setSystemMessage, setOpenAIKey, callOpenAI, clearConversation, transcribeAudio, updateLongMemory } = require('./openai');

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

// --- Вспомогательная функция для отправки сообщения и логирования ---
async function sendAndLogResponse(chatId, assistantText) {
    await bot.sendMessage(chatId, assistantText);
    logChat(chatId, { text: assistantText }, 'assistant');
}

// --- Обработка голосовых сообщений ---
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

    logChat(chatId, {
        type: 'voice',
        mimeType: mimeType,
        hasCaption: Boolean(caption),
        timestamp: new Date().toISOString()
    });

    return userMessageContent;
}

// --- Обработка фото ---
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

    const imageResponse = await axios.get(fileUrl, {
        responseType: 'arraybuffer',
        timeout: 30000,
        maxContentLength: 10 * 1024 * 1024
    });

    validateImageResponse(imageResponse);

    const imageBase64 = Buffer.from(imageResponse.data).toString('base64');
    console.log(`Successfully downloaded and encoded image. Mime type: ${mimeType}, Base64 length: ${imageBase64.length}`);

    if (imageBase64.length > 10 * 1024 * 1024) {
        throw new Error('Encoded image size exceeds maximum allowed');
    }

    const imageUrl = `data:${mimeType};base64,${imageBase64}`;
    const userMessageContent = [];
    
    if (caption) {
        userMessageContent.push({ type: 'input_text', text: sanitizeString(caption) });
    }
    
    userMessageContent.push({ type: 'input_image', image_url: imageUrl });

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
        const userDataDir = path.join(__dirname, 'user_data');
        if (!fs.existsSync(userDataDir)) {
            fs.mkdirSync(userDataDir, { recursive: true });
        }

        const userFilePath = path.join(userDataDir, `${chatId}.json`);
        let startParam = match?.[1] || null;
        if (startParam) {
            startParam = sanitizeString(startParam);
        }

        const howPassed = startParam ? `via parameter: ${startParam}` : 'direct via /start command';

        let userData = {};
        if (fs.existsSync(userFilePath)) {
            userData = JSON.parse(fs.readFileSync(userFilePath, 'utf8'));
            if (startParam && (!userData.startParameter || startParam !== userData.startParameter)) {
                userData.lastStartParam = startParam;
            }
        } else {
            userData = {
                chatId: chatId.toString(),
                firstVisit: Date.now(),
                startParameter: startParam,
                howPassed: howPassed,
                username: msg.from?.username || null,
                firstName: msg.from?.first_name || null,
                lastName: msg.from?.last_name || null,
                languageCode: msg.from?.language_code || null,
                longMemory: '',
                lastLongMemoryUpdate: 0
            };
            console.log(`User data recorded for chat ${chatId}:`, userData);
        }

        fs.writeFileSync(userFilePath, JSON.stringify(userData, null, 2));

        clearConversation(chatId);
        
        const chatLogPath = path.join(chatHistoriesDir, `chat_${chatId}.log`);
        if (fs.existsSync(chatLogPath)) {
            fs.unlinkSync(chatLogPath);
            console.log(`Removed chat log for ${chatId}`);
        }

        await updateLongMemory(chatId);

        logChat(chatId, {
            type: 'system',
            text: 'Chat initiated',
            timestamp: new Date().toISOString(),
            howPassed: howPassed
        });

        await bot.sendMessage(chatId, 'Как вас зовут?');
    } catch (error) {
        console.error(`Error handling /start for chat ${chatId}:`, error);
        await bot.sendMessage(chatId, 'Произошла ошибка при запуске бота. Пожалуйста, попробуйте ещё раз.');
    }
});

// Обработчик текстовых сообщений
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const userText = msg.text;

    if (msg.photo || msg.voice || !userText) {
        return;
    }

    if (userText.startsWith('/start')) {
        return;
    }

    try {
        const userDataDir = path.join(__dirname, 'user_data');
        const userDataPath = path.join(userDataDir, `${chatId}.json`);
        
        if (!fs.existsSync(userDataPath)) {
            await bot.sendMessage(
                chatId, 
                'Мы обновили бота, пожалуйста нажмите /start еще раз. Приносим извинения за неудобства.'
            );
            return;
        }

        const chatLogPath = path.join(chatHistoriesDir, `chat_${chatId}.log`);
        
        if (!fs.existsSync(chatLogPath)) {
            await bot.sendMessage(
                chatId, 
                'Пожалуйста, начните разговор с команды /start.'
            );
            return;
        }

        const restartTimestamp = fs.existsSync(restartFilePath) 
            ? parseInt(fs.readFileSync(restartFilePath, 'utf8'), 10)
            : Date.now();

        const logMtime = fs.statSync(chatLogPath).mtime.getTime();

        if (logMtime < restartTimestamp) {
            console.log(`Chat history for ${chatId} is outdated`);
            await bot.sendMessage(
                chatId, 
                'Бот был обновлён (исправили ошибки, добавили новых). Пожалуйста, перезапустите бота командой /start. Приносим извинения за неудобства.'
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
            logChat(chatId, { 
                type: 'name_provided',
                name: userText,
                timestamp: new Date().toISOString()
            });
        
            const answer = await callOpenAI(chatId, [{
                type: 'input_text',
                text: `Меня зовут ${userText}`
            }]);
        
            await sendAndLogResponse(chatId, answer);
            return;
        }

        // Обычная обработка сообщений
        // Убрано: logChat(chatId, { text: userText });
        const assistantText = await callOpenAI(chatId, [{
            type: 'input_text',
            text: userText
        }]);
        await sendAndLogResponse(chatId, assistantText);

    } catch (error) {
        console.error(`Error processing message from ${chatId}:`, error);
        await bot.sendMessage(
            chatId, 
            `Произошла ошибка при обработке вашего сообщения: ${error.message}. Пожалуйста, попробуйте ещё раз.`
        );
    }
});

// Обработчик фото-сообщений
bot.on('photo', async (msg) => {
    const chatId = msg.chat.id;

    try {
        const userMessageContent = await processPhoto(msg);
        const assistantText = await callOpenAI(chatId, userMessageContent);
        await sendAndLogResponse(chatId, assistantText);
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
        await sendAndLogResponse(chatId, assistantText);
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