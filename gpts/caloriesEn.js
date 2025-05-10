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

// --- Configuration ---
const result = dotenv.config({ path: envFilePath }); // Use the already determined envFilePath
if (result.error) {
    console.error(`Error loading .env.${NAMEPROMPT} file:`, result.error);
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
    console.error(`Error: TELEGRAM_BOT_TOKEN is not defined in .env.${NAMEPROMPT}`);
    process.exit(1);
}

const openaiApiKey = process.env.OPENAI_API_KEY;
const deepseekApiKey = process.env.DEEPSEEK_API_KEY;
const ACTIVATION_CODE = process.env.ACTIVATION_CODE; // e.g., "KEY-SOMEKEY123"
const PAYMENT_URL_TEMPLATE = process.env.PAYMENT_URL_TEMPLATE || 'https://noxon.wpmix.net/counter.php?tome=1&msg={NAMEPROMPT}_{chatid}&cal=1';

if (!openaiApiKey && !deepseekApiKey) {
    console.error(`Error: Neither OPENAI_API_KEY nor DEEPSEEK_API_KEY are defined in .env.${NAMEPROMPT}`);
    process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });

// --- Load System Prompt ---
let systemPromptContent = 'You are a helpful assistant.';
try {
    const promptPath = path.join(__dirname, `.env.${NAMEPROMPT}_prompt`);
    if (fs.existsSync(promptPath)) {
        systemPromptContent = fs.readFileSync(promptPath, 'utf8').trim();
        console.log(`System prompt loaded from ${promptPath}`);
    } else {
        systemPromptContent = process.env.SYSTEM_PROMPT || systemPromptContent;
        console.log(`System prompt loaded from environment variable or default.`);
    }

    if (!systemPromptContent) {
        throw new Error('System prompt is empty or not defined after loading.');
    }
} catch (error) {
    console.error('Error loading system prompt:', error);
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
            //await bot.sendMessage(chatId, "A new day has begun.");
            logChat(chatId, { type: 'system_message', event: 'new_day_notification_sent', timestamp: now.toISOString() }, 'system');
        } catch (error) {
            console.error(`[New Day Logic ${chatId}] Error sending new day message:`, error);
        }
        newDayPrefixForLLM = "A new day has begun. "; // This prefix will be added to the LLM prompt
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

        const messageText = escapeMarkdown(`You have used up your message limit (${reloadedConfig.FREE_MESSAGE_LIMIT}). To continue, please activate access. Counting calories and nutrients is a 100% way to become healthier and improve your life or your child's life. Shall we continue? 👍`);
        
        try {
            await bot.sendMessage(chatId, messageText, {
                parse_mode: 'MarkdownV2',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "Activate Access", url: paymentUrl }]
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

async function sendErrorMessage(chatId, specificErrorMsg, context = 'processing your request') {
    console.error(`Error during ${context} for chat ${chatId}:`, specificErrorMsg);
    try {
        await bot.sendMessage(
            chatId,
            `Sorry, there was a problem during ${context}. Please try again. If the error persists, try restarting the bot with /start command.`
        );
        logChat(chatId, {
            error: `error_in_${context.replace(/\s+/g, '_')}`,
            message: specificErrorMsg,
            timestamp: new Date().toISOString()
        }, 'error');
    } catch (sendError) {
        console.error(`Failed to send error message to chat ${chatId}:`, sendError.message);
    }
}

// --- Message Processors ---

async function processVoice(msg) {
    const chatId = msg.chat.id;
    if (!validateChatId(chatId)) throw new Error('Invalid chat ID in voice message');

    const caption = msg.caption ? sanitizeString(msg.caption) : '';
    const voice = msg.voice;
    if (!voice || !voice.file_id) throw new Error('Invalid voice message data');

    console.info(`[Voice ${chatId}] Processing voice message.`);
    const file = await bot.getFile(voice.file_id);
    if (!file || !file.file_path) throw new Error('Failed to get file info from Telegram');

    const fileUrl = `https://api.telegram.org/file/bot${token}/${file.file_path}`;
    const mimeType = voice.mime_type;

    if (!mimeType || !validateMimeTypeAudio(mimeType)) {
        console.warn(`[Voice ${chatId}] Invalid audio MIME type: ${mimeType}`);
        throw new Error(`Unsupported audio format: ${mimeType || 'Unknown'}. Use MP3, OGG, WAV, M4A.`);
    }

    console.info(`[Voice ${chatId}] Transcribing audio from ${fileUrl} (MIME: ${mimeType})`);
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
    if (!validateChatId(chatId)) throw new Error('Invalid chat ID in photo message');

    console.info(`[Photo ${chatId}] Starting photo message processing.`);
    
    const caption = msg.caption ? sanitizeString(msg.caption) : '';
    console.debug(`[Photo ${chatId}] Caption after sanitization: "${caption}"`);
    
    const photo = msg.photo && msg.photo.length > 0 ? msg.photo[msg.photo.length - 1] : null;
    if (!photo || !photo.file_id) {
        console.error(`[Photo ${chatId}] Invalid photo data:`, JSON.stringify(msg.photo));
        throw new Error('Invalid photo data in message');
    }
    console.debug(`[Photo ${chatId}] Photo size: ${photo.width}x${photo.height}, file_id: ${photo.file_id}`);

    console.info(`[Photo ${chatId}] Getting file info from Telegram API`);
    const file = await bot.getFile(photo.file_id);
    if (!file || !file.file_path) {
        console.error(`[Photo ${chatId}] Failed to get file:`, JSON.stringify(file));
        throw new Error('Failed to get file info from Telegram');
    }
    console.debug(`[Photo ${chatId}] File path obtained: ${file.file_path}`);

    const fileUrl = `https://api.telegram.org/file/bot${token}/${file.file_path}`;
    const fileExtension = path.extname(file.file_path).toLowerCase();
    console.debug(`[Photo ${chatId}] File extension: ${fileExtension}`);
    
    const mimeType = {
        '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
        '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp'
    }[fileExtension];

    if (!mimeType || !validateMimeTypeImg(mimeType)) {
        console.warn(`[Photo ${chatId}] Unsupported image type: ${fileExtension}`);
        throw new Error(`Unsupported image format (${fileExtension || 'Unknown'}). Use JPEG, PNG, GIF, WEBP, BMP.`);
    }
    console.debug(`[Photo ${chatId}] MIME type: ${mimeType}`);

    console.info(`[Photo ${chatId}] Downloading image from ${fileUrl}`);
    try {
        const imageResponse = await axios.get(fileUrl, {
            responseType: 'arraybuffer',
            timeout: 30000,
            maxContentLength: 15 * 1024 * 1024
        });
        
        console.debug(`[Photo ${chatId}] Image downloaded, size: ${imageResponse.data.length} bytes`);
        validateImageResponse(imageResponse, 10 * 1024 * 1024);
        
        const imageBase64 = Buffer.from(imageResponse.data).toString('base64');
        // Не логируем содержимое base64, только его длину
        console.debug(`[Photo ${chatId}] Image converted to base64, length: ${imageBase64.length} characters`);
        
        const imageUrl = `data:${mimeType};base64,${imageBase64}`;
        if (imageUrl.length > 20 * 1024 * 1024 * 0.75) {
            console.error(`[Photo ${chatId}] Image too large after encoding: ${imageUrl.length} bytes`);
            throw new Error('Encoded image data too large.');
        }

        const userMessageContent = [];
        if (caption) userMessageContent.push({ type: 'input_text', text: caption });
        userMessageContent.push({ type: 'input_image', image_url: imageUrl });
        
        console.info(`[Photo ${chatId}] Message prepared with ${userMessageContent.length} parts (text: ${caption ? 'yes' : 'no'}, image: yes)`);
        // Модифицируем вывод структуры, чтобы избежать логирования base64
        console.debug(`[Photo ${chatId}] Message structure:`, JSON.stringify(userMessageContent.map(c => ({ 
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
        console.error(`[Photo ${chatId}] Error downloading/processing image:`, error.message);
        throw error;
    }
}

// --- Telegram Bot Event Handlers ---

bot.onText(/\/start(?:\s+(.+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    if (!validateChatId(chatId)) {
        console.error(`Invalid chat ID in /start: ${msg.chat.id}`);
        return;
    }
    console.info(`[Start ${chatId}] Received /start command.`);

    try {
        const userFilePath = path.join(USER_DATA_DIR, `${chatId}.json`);
        let startParam = match?.[1] ? sanitizeString(match[1]) : null;
        const howPassed = startParam ? `via parameter: ${startParam}` : 'direct /start command';

        let userData = {};
        let isNewUser = false;
        if (fs.existsSync(userFilePath)) {
            try {
                const existingData = JSON.parse(fs.readFileSync(userFilePath, 'utf8'));
                userData = { ...loadUserData(chatId), ...existingData }; // Ensure defaults like isPaid are loaded
                if (startParam && startParam !== userData.startParameter) {
                    userData.lastStartParam = startParam;
                    console.info(`[Start ${chatId}] Chat restarted with new parameter: ${startParam}`);
                }
                userData.lastRestartTime = new Date().toISOString();
            } catch (parseError) {
                console.error(`Error parsing user data for ${chatId}, resetting:`, parseError);
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
            console.info(`[Start ${chatId}] New user data recorded.`);
        } else {
            // Ensure existing users have this field, defaulting if not.
            // loadUserData should ideally handle this default.
            if (userData.lastMessageTimestamp === undefined) {
                userData.lastMessageTimestamp = null;
            }
        }

        fs.writeFileSync(userFilePath, JSON.stringify(userData, null, 2));
        console.info(`[Start ${chatId}] User data saved.`);

        const chatLogPath = path.join(CHAT_HISTORIES_DIR, `chat_${chatId}.log`);
        if (fs.existsSync(chatLogPath)) {
            try {
                fs.unlinkSync(chatLogPath);
                console.info(`[Start ${chatId}] Chat log cleared due to /start command.`);
            } catch (unlinkError) {
                console.error(`Error deleting chat log for ${chatId}:`, unlinkError);
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
            await bot.sendMessage(chatId, 'Welcome! What is your name?');
            logChat(chatId, { type: 'system_message', text: 'Requested user name' }, 'system');
        } else {
            await bot.sendMessage(chatId, 'Welcome back! How can I help you today?');
            logChat(chatId, { type: 'system_message', text: 'Sent welcome back greeting' }, 'system');
        }
    } catch (error) {
        console.error(`Critical error processing /start for chat ${chatId}:`, error);
        await sendErrorMessage(chatId, error.message, 'processing /start command');
    }
});

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    if (!validateChatId(chatId)) {
        console.error(`Invalid chat ID in message handler: ${msg.chat.id}`);
        return;
    }
    if (msg.photo || msg.voice || (msg.text && msg.text.startsWith('/start'))) {
        return;
    }
    if (!msg.text) {
        console.info(`[Message ${chatId}] Ignoring non-text message (type: ${msg.document ? 'document' : msg.sticker ? 'sticker' : 'other'})`);
        return;
    }

    const userText = sanitizeString(msg.text);
    if (!userText) {
        console.info(`[Message ${chatId}] Ignoring empty text message after sanitization.`);
        return;
    }

    try {
        const newDayPrefix = await handleNewDayLogicAndUpdateTimestamp(chatId);
        console.info(`[Message ${chatId}] Processing text message. Length: ${userText.length}. NewDayPrefix: "${newDayPrefix}"`);

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
        if (!fs.existsSync(userDataPath)) {  // Changed from fs.exists to fs.existsSync
            console.info(`[Message ${chatId}] User data file not found. Prompting /start.`);
            await bot.sendMessage(chatId, 'Please use the /start command to begin.');
            logChat(chatId, { type: 'system_event', event: 'prompted_start_no_userdata' }, 'system');
            return;
        }

        let hasProvidedName = false;
        try {
            const userData = JSON.parse(fs.readFileSync(userDataPath, 'utf8'));
            if (userData.providedName) hasProvidedName = true;
        } catch (err) {
            console.error(`[Message ${chatId}] Error reading user data for name check:`, err);
        }

        if (!hasProvidedName) {
            console.info(`[Message ${chatId}] Processing message as name: "${userText}"`);
            logChat(chatId, {
                type: 'name_provided',
                role: 'user',
                name: userText,
                content: [{ type: 'input_text', text: `User provided name: ${userText}` }],
                timestamp: new Date(msg.date * 1000).toISOString()
            }, 'user');

            try {
                const userData = JSON.parse(fs.readFileSync(userDataPath, 'utf8'));
                userData.providedName = userText;
                userData.nameLastUpdate = new Date().toISOString();
                fs.writeFileSync(userDataPath, JSON.stringify(userData, null, 2));
                console.info(`[Message ${chatId}] User name saved in user data.`);
            } catch (err) {
                console.error(`[Message ${chatId}] Failed to update user data with name:`, err);
            }

            const llmInputTextForName = newDayPrefix + `User just told me their name is "${userText}". Acknowledge this and continue the conversation naturally.`;
            const assistantResponse = await callLLM(chatId, [{
                type: 'input_text',
                text: llmInputTextForName
            }]);
            await sendAndLogResponse(chatId, assistantResponse);
            return;
        }

        const llmInputTextRegular = newDayPrefix + userText;
        const userMessageContent = [{ type: 'input_text', text: llmInputTextRegular }];
        const assistantText = await callLLM(chatId, userMessageContent);
        await sendAndLogResponse(chatId, assistantText);
    } catch (error) {
        await sendErrorMessage(chatId, error.message, 'processing text message');
    }
});

bot.on('photo', async (msg) => {
    const chatId = msg.chat.id;
    if (!validateChatId(chatId)) {
        console.error(`[Photo] Invalid chat ID: ${chatId}`);
        return;
    }

    const userDataPath = path.join(USER_DATA_DIR, `${chatId}.json`);
    if (!fs.existsSync(userDataPath)) {
        console.info(`[Photo ${chatId}] User data file not found during photo processing. Prompting /start.`);
        await bot.sendMessage(chatId, 'Please use the /start command before sending photos.');
        logChat(chatId, { type: 'system_event', event: 'prompted_start_no_userdata_photo' }, 'system');
        return;
    }

    try {
        const newDayPrefix = await handleNewDayLogicAndUpdateTimestamp(chatId);
        console.info(`[Photo ${chatId}] NewDayPrefix: "${newDayPrefix}"`);

        const canProceed = await checkPaymentStatusAndPrompt(chatId);
        if (!canProceed) {
            return;
        }

        console.info(`[Photo ${chatId}] Photo received from user.`);
        await bot.sendChatAction(chatId, 'upload_photo');
        
        // Временно сохраняем текущую модель и принудительно устанавливаем OpenAI для обработки фото
        const currentModel = process.env.OPENAIMODEL;
        console.info(`[Photo ${chatId}] Current model: ${currentModel}, switching to OpenAI for images`);
        
        // Принудительно устанавливаем дефолтную модель openai из env OPENAIMODEL 
        setModel(process.env.OPENAIMODEL || 'gpt-4.1-mini');
        
        console.info(`[Photo ${chatId}] Calling processPhoto`);
        const userMessageContent = await processPhoto(msg);
        
        console.info(`[Photo ${chatId}] processPhoto result: ${userMessageContent ? userMessageContent.length + ' items' : 'null'}`);
        if (!userMessageContent || userMessageContent.length === 0) {
            console.error(`[Photo ${chatId}] Empty photo processing result`);
            throw new Error("Image processing error: empty result");
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
        
        console.info(`[Photo ${chatId}] Calling OpenAI with model gpt-4-vision-preview`);
        const assistantText = await callLLM(chatId, userMessageContent);
        
        // Восстанавливаем исходную модель после обработки изображения
        if (currentModel) {
            console.info(`[Photo ${chatId}] Restoring original model: ${currentModel}`);
            setModel(currentModel);
        }
        
        console.info(`[Photo ${chatId}] Response from LLM received, length ${assistantText ? assistantText.length : 0}`);
        await sendAndLogResponse(chatId, assistantText);
    } catch (error) {
        await sendErrorMessage(chatId, error.message, 'processing photo');
    }
});

bot.on('voice', async (msg) => {
    const chatId = msg.chat.id;
    if (!validateChatId(chatId)) return;

    try {
        const newDayPrefix = await handleNewDayLogicAndUpdateTimestamp(chatId);
        console.info(`[Voice ${chatId}] NewDayPrefix: "${newDayPrefix}"`);

        const canProceed = await checkPaymentStatusAndPrompt(chatId);
        if (!canProceed) {
            return;
        }

        const userDataPath = path.join(USER_DATA_DIR, `${chatId}.json`);
        if (!fs.existsSync(userDataPath)) {
            console.info(`[Voice ${chatId}] User data file not found during voice processing. Prompting /start.`);
            await bot.sendMessage(chatId, 'Please use the /start command before sending voice messages.');
            logChat(chatId, { type: 'system_event', event: 'prompted_start_no_userdata_voice' }, 'system');
            return;
        }

        console.info(`[Voice ${chatId}] Voice message received.`);
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
        await sendErrorMessage(chatId, error.message, 'processing voice message');
    }
});

// --- Error Handlers ---
bot.on('polling_error', (error) => {
    console.error('Polling error:', error.code, '-', error.message);
});

bot.on('webhook_error', (error) => {
    console.error('Webhook error:', error.code, '-', error.message);
});

// --- Bot Start ---
console.log('Bot configuration completed. Starting polling...');

process.on('SIGINT', () => {
    console.log('Received SIGINT. Shutting down bot...');
    bot.stopPolling().then(() => {
        console.log('Polling stopped.');
        process.exit(0);
    });
});

process.on('SIGTERM', () => {
    console.log('Received SIGTERM. Shutting down bot...');
    bot.stopPolling().then(() => {
        console.log('Polling stopped.');
        process.exit(0);
    });
});