const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto'); // Add after existing imports

// Add logging setup
const CHAT_HISTORIES_DIR = path.join(__dirname, 'chat_histories');
if (!fs.existsSync(CHAT_HISTORIES_DIR)) {
    fs.mkdirSync(CHAT_HISTORIES_DIR, { recursive: true });
}

function logChat(chatId, message, type = 'user') {
    if (!validateChatId(chatId)) {
        console.error('Invalid chat ID detected:', chatId);
        return;
    }

    const timestamp = new Date().toISOString();
    const logFile = path.join(CHAT_HISTORIES_DIR, `chat_${chatId}.log`);
    
    // Sanitize and validate message content
    const sanitizedMessage = typeof message === 'object' ? 
        JSON.parse(JSON.stringify(message, (key, value) => {
            if (typeof value === 'string') return sanitizeString(value);
            return value;
        })) : 
        { text: sanitizeString(String(message)) };

    const messageHash = generateMessageHash(chatId, timestamp);
    const logEntry = `[${timestamp}] ${type}: ${JSON.stringify(sanitizedMessage)} hash=${messageHash}\n`;
    
    try {
        fs.appendFileSync(logFile, logEntry, { mode: 0o600 }); // Secure file permissions
    } catch (error) {
        console.error('Error writing to log file:', error);
    }
}

// Security utility functions
function sanitizeString(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/[<>'"`;]/g, '');
}

function validateChatId(chatId) {
    // Ensure chatId is a positive number and within reasonable bounds
    return Number.isInteger(chatId) && 
           chatId > 0 && 
           chatId < Number.MAX_SAFE_INTEGER;
}

function validateImageResponse(response, maxSizeInBytes = 10 * 1024 * 1024) { // 10MB limit
    if (!response || !response.data) {
        throw new Error('Invalid image response');
    }
    if (response.data.length > maxSizeInBytes) {
        throw new Error('Image size exceeds maximum allowed');
    }
    return true;
}

function validateMimeType(mimeType) {
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp'];
    return allowedMimeTypes.includes(mimeType);
}

// Add hash verification for messages
function generateMessageHash(chatId, timestamp) {
    const secret = process.env.MESSAGE_HASH_SECRET || 'default-secret-change-me';
    return crypto
        .createHmac('sha256', secret)
        .update(`${chatId}:${timestamp}`)
        .digest('hex');
}

let nameprompt = 'calories';
// --- Configuration Loading ---
const result = dotenv.config({ path: `.env.${nameprompt}` });
if (result.error) {
    console.error("Error loading .env.${nameprompt} file:", result.error);
    process.exit(1);
}

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
    console.error('Error: TELEGRAM_BOT_TOKEN is not defined in .env.${nameprompt} file');
    process.exit(1);
}

const openaiApiKey = process.env.OPENAI_API_KEY;
if (!openaiApiKey) {
    console.error('Error: OPENAI_API_KEY is not defined in .env.${nameprompt}_env file');
    process.exit(1);
}

let systemPromptContent = 'You are a helpful assistant.';
//load from process.env or .env.${nameprompt}_prompt
try {
    const promptPath = `.env.${nameprompt}_prompt`;
    if (fs.existsSync(promptPath)) {
        const promptData = fs.readFileSync(promptPath, 'utf8');
        systemPromptContent = promptData;
    } else {
        systemPromptContent = process.env.SYSTEM_PROMPT;
    }
    
    if (!systemPromptContent) {
        throw new Error('System prompt is empty or undefined');
    }
}
catch (error) {
    console.error('Error loading system prompt:', error);
    process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });

const conversations = {};

// --- System Message Format (Using input_text) ---
const systemMessage = {
    role: 'system',
    content: [
        { type: 'input_text', text: systemPromptContent } // Use endpoint-specific type
    ]
};

// --- Helper Function for OpenAI API Call (no changes needed here) ---
async function callOpenAI(chatId, userMessageContent) {
    if (!validateChatId(chatId)) {
        throw new Error('Invalid chat ID');
    }

    // Sanitize user message content
    const sanitizedContent = userMessageContent.map(content => ({
        ...content,
        text: content.text ? sanitizeString(content.text) : content.text,
        image_url: content.image_url ? new URL(content.image_url).toString() : undefined
    }));

    // Rate limiting
    const rateLimit = getRateLimit(chatId);
    if (!rateLimit.canProceed) {
        throw new Error('Rate limit exceeded');
    }

    if (!conversations[chatId]) {
        conversations[chatId] = [systemMessage];
        console.log(`Initialized conversation history for chat ID: ${chatId}`);
    }

    const userMessage = {
        role: 'user',
        content: sanitizedContent
    };
    conversations[chatId].push(userMessage);

    const MAX_HISTORY = 20;
    if (conversations[chatId].length > MAX_HISTORY + 1) {
       console.log(`Pruning conversation history for chat ID: ${chatId}. Old length: ${conversations[chatId].length}`);
       conversations[chatId] = [
         conversations[chatId][0],
         ...conversations[chatId].slice(-(MAX_HISTORY))
       ];
       console.log(`New length: ${conversations[chatId].length}`);
    }

    const payload = {
        model: 'gpt-4o-mini',
        input: conversations[chatId], // The history uses the 'input' key
        text: { format: { type: 'text' } }, // This part seems to define the *expected output* format
        reasoning: {},
        tools: [
            {
                type: 'web_search_preview',
                user_location: { type: 'approximate', country: 'RU' },
                search_context_size: 'medium'
            }
        ],
        temperature: 1,
        max_output_tokens: 2048,
        top_p: 1,
        store: true
    };

    console.log(`Sending payload to OpenAI for chat ID: ${chatId}. History length: ${conversations[chatId].length}`);
    // console.log('Payload Input:', JSON.stringify(payload.input, null, 2)); // Debug input structure

    try {
        const response = await axios.post(
            'https://api.openai.com/v1/responses', // Keep using this endpoint
            payload,
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${openaiApiKey}`,
                },
                timeout: 30000, // 30 second timeout
                maxContentLength: 50 * 1024 * 1024, // 50MB max response size
                validateStatus: status => status === 200 // Only accept 200 OK
            }
        );

        // Validate response structure
        if (!response.data || 
            typeof response.data !== 'object' || 
            !Array.isArray(response.data.output)) {
            throw new Error('Invalid API response structure');
        }

        // console.log('OpenAI API Full Response:', JSON.stringify(response.data, null, 2));

        if (!response.data || !response.data.output) {
            throw new Error('Unexpected API response structure from OpenAI');
        }

        const messageOutput = response.data.output.find(
            output => output.type === 'message'
        );

        // The response *might* still use 'text' or might use 'output_text'.
        // Let's check for both or prioritize 'output_text' if the API uses it.
        // Based on the error list, 'output_text' is a possible *output* type.
        let assistantText = null;
        const outputTextContent = messageOutput?.content?.find(c => c.type === 'output_text');
        const textContent = messageOutput?.content?.find(c => c.type === 'text'); // Check 'text' just in case

        if (outputTextContent && outputTextContent.text) {
            assistantText = outputTextContent.text;
        } else if (textContent && textContent.text) {
            assistantText = textContent.text; // Fallback to 'text' if 'output_text' not found
        }


        if (!assistantText) {
            console.warn(`No 'output_text' or 'text' content found in assistant response for chat ${chatId}:`, messageOutput?.content);
             if (messageOutput && messageOutput.content && messageOutput.content.length > 0) {
                 // Handle other potential output types if necessary
                 throw new Error('Assistant responded with non-text content (type not output_text or text).');
             } else {
                 throw new Error('No valid message content found in OpenAI response');
             }
        }

        // Sanitize assistant response before sending
        const sanitizedAssistantText = sanitizeString(assistantText);
        await bot.sendMessage(chatId, sanitizedAssistantText);
        
        // Add logging for assistant response
        logChat(chatId, { text: sanitizedAssistantText }, 'assistant');

        conversations[chatId].push({
            role: 'assistant',
            content: messageOutput.content // Store the full content array from response
        });

    } catch (error) {
        // Security-enhanced error handling
        const safeErrorMessage = 'Произошла ошибка при обработке запроса.';
        logChat(chatId, { 
            error: error.message,
            timestamp: new Date().toISOString(),
            hash: generateMessageHash(chatId, Date.now())
        }, 'error');
        
        await bot.sendMessage(chatId, safeErrorMessage);
        throw error; // Re-throw for higher-level handling
    }
}

// Add rate limiting
const rateLimits = new Map();

function getRateLimit(chatId) {
    const now = Date.now();
    const limit = rateLimits.get(chatId) || { count: 0, timestamp: now };
    
    if (now - limit.timestamp > 60000) { // Reset after 1 minute
        limit.count = 0;
        limit.timestamp = now;
    }
    
    limit.count++;
    rateLimits.set(chatId, limit);
    
    return {
        canProceed: limit.count <= 10, // Max 10 requests per minute
        remainingRequests: Math.max(0, 10 - limit.count)
    };
}

// --- Telegram Bot Event Handlers ---

bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    console.log(`Received /start command from chat ID: ${chatId}`);
    delete conversations[chatId];
    console.log(`Cleared conversation history for chat ID: ${chatId}`);
    bot.sendMessage(chatId, 'Как вас зовут?')
        .then(() => console.log(`Start message sent successfully to chat ID: ${chatId}`))
        .catch(error => console.error(`Error sending start message to chat ID ${chatId}:`, error));
});


// Handler for text messages
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const userText = msg.text;

    
    
    if (msg.photo) {
        console.log(`Ignoring text message handler for photo with caption from chat ID: ${chatId}`);
        return;
    }

    if (!userText || userText.startsWith('/')) {
        console.log(`Ignoring command or empty message from chat ID: ${chatId}`);
        return;
    }
    // Add logging
    logChat(chatId, { text: userText });

    console.log(`Received text message from chat ID ${chatId}: "${userText}"`);

    // --- Text Message Format (Using input_text) ---
    const userMessageContent = [{ type: 'input_text', text: userText }]; // Use endpoint-specific type

    await callOpenAI(chatId, userMessageContent);
});

// Handler for photo messages
bot.on('photo', async (msg) => {
    const chatId = msg.chat.id;
    if (!validateChatId(chatId)) {
        console.error('Invalid chat ID in photo message');
        return;
    }
    
    console.log(`Received photo message from chat ID: ${chatId}`);
    const caption = msg.caption ? sanitizeString(msg.caption) : '';
    const photo = msg.photo[msg.photo.length - 1];
    
    if (!photo || !photo.file_id) {
        console.error('Invalid photo data received');
        return;
    }

    try {
        const file = await bot.getFile(photo.file_id);
        if (!file || !file.file_path) {
            throw new Error('Invalid file data received');
        }

        const filePath = file.file_path;
        const fileUrl = `https://api.telegram.org/file/bot${token}/${filePath}`;
        console.log(`Processing image file from URL: ${fileUrl}`);

        // Validate file extension and mime type
        const fileExtension = path.extname(filePath).toLowerCase();
        const mimeType = {
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.gif': 'image/gif',
            '.webp': 'image/webp',
            '.bmp': 'image/bmp'
        }[fileExtension];

        if (!mimeType || !validateMimeType(mimeType)) {
            throw new Error('Invalid file type');
        }

        const imageResponse = await axios.get(fileUrl, {
            responseType: 'arraybuffer',
            timeout: 30000,
            maxContentLength: 10 * 1024 * 1024 // 10MB limit
        });

        validateImageResponse(imageResponse);

        const imageBase64 = Buffer.from(imageResponse.data).toString('base64');
        console.log(`Successfully downloaded and encoded image. Mime type: ${mimeType}, Base64 length: ${imageBase64.length}`);

        // Validate base64 string length
        if (imageBase64.length > 10 * 1024 * 1024) { // 10MB limit for base64
            throw new Error('Encoded image size exceeds maximum allowed');
        }

        // --- Image Message Format (Using data URL format) ---
        const imageUrl = `data:${mimeType};base64,${imageBase64}`;
        const userMessageContent = [];
        
        // Add caption first if it exists
        if (caption) {
            userMessageContent.push({ 
                type: "input_text", 
                text: sanitizeString(caption) 
            });
        }
        
        // Add image with correct format
        userMessageContent.push({
            type: "input_image",
            image_url: imageUrl
        });

        // Log image processing (excluding the base64 data for security)
        logChat(chatId, { 
            type: 'photo',
            mimeType: mimeType,
            hasCaption: Boolean(caption),
            timestamp: new Date().toISOString()
        });
        
        await callOpenAI(chatId, userMessageContent);

    } catch (error) {
        // Secure error handling
        console.error(`Secure photo processing error for chat ID ${chatId}:`, error.message);
        
        // Log the error securely
        logChat(chatId, { 
            error: 'photo_processing_error',
            message: error.message,
            timestamp: new Date().toISOString()
        }, 'error');

        try {
            await bot.sendMessage(
                chatId, 
                'Не удалось обработать изображение. Попробуйте другое изображение.'
            );
        } catch (sendError) {
            console.error(
                `Failed to send error message to chat ID ${chatId}:`, 
                sendError.message
            );
        }
    }
});

// Error Handling for Polling
bot.on('polling_error', (error) => {
    console.error('Polling error:', error.code, '-', error.message);
});

console.log('Bot started successfully and is polling for messages...');