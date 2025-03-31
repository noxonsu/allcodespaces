const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const dotenv = require('dotenv');
const fs = require('fs');

// --- Configuration Loading ---
const result = dotenv.config();
if (result.error) {
    console.error("Error loading .env file:", result.error);
    process.exit(1);
}

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
    console.error('Error: TELEGRAM_BOT_TOKEN is not defined in .env file');
    process.exit(1);
}

const openaiApiKey = process.env.OPENAI_API_KEY;
if (!openaiApiKey) {
    console.error('Error: OPENAI_API_KEY is not defined in .env file');
    process.exit(1);
}

let systemPromptContent = 'You are a helpful assistant.';
let nameprompt = 'calories';
try {
    systemPromptContent = fs.readFileSync(`gpts/.env.${nameprompt}`, 'utf8');
    console.log(`Successfully loaded system prompt from .env.${nameprompt} ${systemPromptContent}`);
} catch (err) {
    console.warn(`Warning: Could not read .env.${nameprompt}. Using default system prompt.`, err.message);
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
    if (!conversations[chatId]) {
        conversations[chatId] = [systemMessage];
        console.log(`Initialized conversation history for chat ID: ${chatId}`);
    }

    const userMessage = {
        role: 'user',
        content: userMessageContent
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
                }
            }
        );

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

        await bot.sendMessage(chatId, assistantText);
        console.log(`Sent assistant response to chat ID: ${chatId}`);

        conversations[chatId].push({
            role: 'assistant',
            content: messageOutput.content // Store the full content array from response
        });

    } catch (error) {
        const apiError = error.response?.data?.error;
        console.error(`Error interacting with OpenAI or Telegram for chat ID ${chatId}:`, apiError || (error.response ? JSON.stringify(error.response.data) : error.message));
        if (error.response) {
            console.error('API Status:', error.response.status);
            console.error('API Headers:', error.response.headers);
        } else if (error.request) {
            console.error('No response received:', error.request);
        } else {
            console.error('Error setting up request:', error.message);
        }
        try {
            const userErrorMessage = apiError?.message ? `Ошибка от OpenAI: ${apiError.message}` : 'Извините, произошла ошибка при обработке вашего запроса.';
            await bot.sendMessage(chatId, userErrorMessage);
        } catch (sendError) {
            console.error(`Failed to send error message to chat ID ${chatId}:`, sendError.message);
        }
    }
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

    if (!userText || userText.startsWith('/')) {
        console.log(`Ignoring command or empty message from chat ID: ${chatId}`);
        return;
    }
    if (msg.photo) {
        console.log(`Ignoring text message handler for photo with caption from chat ID: ${chatId}`);
        return;
     }

    console.log(`Received text message from chat ID ${chatId}: "${userText}"`);

    // --- Text Message Format (Using input_text) ---
    const userMessageContent = [{ type: 'input_text', text: userText }]; // Use endpoint-specific type

    await callOpenAI(chatId, userMessageContent);
});

// Handler for photo messages
bot.on('photo', async (msg) => {
    const chatId = msg.chat.id;
    const caption = msg.caption;

    console.log(`Received photo message from chat ID: ${chatId}${caption ? ` with caption: "${caption}"` : ''}`);

    const photo = msg.photo[msg.photo.length - 1];
    const fileId = photo.file_id;

    try {
        const file = await bot.getFile(fileId);
        const filePath = file.file_path;
        const fileUrl = `https://api.telegram.org/file/bot${token}/${filePath}`;
        console.log(`Workspaceing image file from URL: ${fileUrl}`);

        const imageResponse = await axios.get(fileUrl, {
            responseType: 'arraybuffer'
        });

        const imageBase64 = Buffer.from(imageResponse.data).toString('base64');

        let mimeType = 'image/jpeg';
        if (filePath.endsWith('.png')) mimeType = 'image/png';
        else if (filePath.endsWith('.gif')) mimeType = 'image/gif';
        else if (filePath.endsWith('.webp')) mimeType = 'image/webp';
        else if (filePath.endsWith('.bmp')) mimeType = 'image/bmp';

        console.log(`Successfully downloaded and encoded image. Mime type: ${mimeType}, Base64 length: ${imageBase64.length}`);

        // --- Image Message Format (Using data URL format) ---
        const imageUrl = `data:${mimeType};base64,${imageBase64}`;
        const userMessageContent = [];
        
        // Add caption first if it exists
        if (caption) {
            userMessageContent.push({ type: "input_text", text: caption });
        }
        
        // Add image with correct format
        userMessageContent.push({
            type: "input_image",
            image_url: imageUrl
        });
        
        await callOpenAI(chatId, userMessageContent);

    } catch (error) {
        console.error(`Error processing photo for chat ID ${chatId}:`, error.message);
         try {
            await bot.sendMessage(chatId, 'Извините, не удалось обработать изображение. Попробуйте еще раз.');
         } catch (sendError) {
             console.error(`Failed to send image processing error message to chat ID ${chatId}:`, sendError.message);
         }
    }
});

// Error Handling for Polling
bot.on('polling_error', (error) => {
    console.error('Polling error:', error.code, '-', error.message);
});

console.log('Bot started successfully and is polling for messages...');