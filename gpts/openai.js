const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const { sanitizeString, validateChatId, logChat } = require('./utilities');

// Переменные для хранения состояния
let systemMessage;
let openaiApiKey;
const conversations = {};
const rateLimits = new Map();

const USER_DATA_DIR = path.join(__dirname, 'user_data');

function setSystemMessage(content) {
    systemMessage = {
        role: 'system',
        content: [{ type: 'input_text', text: content }]
    };
}

function setOpenAIKey(key) {
    openaiApiKey = key;
}

function getRateLimit(chatId) {
    const now = Date.now();
    const limit = rateLimits.get(chatId) || { count: 0, timestamp: now };
    
    if (now - limit.timestamp > 60000) {
        limit.count = 0;
        limit.timestamp = now;
    }
    
    limit.count++;
    rateLimits.set(chatId, limit);
    
    return {
        canProceed: limit.count <= 10,
        remainingRequests: Math.max(0, 10 - limit.count)
    };
}

function loadUserData(chatId) {
    const userFilePath = path.join(USER_DATA_DIR, `${chatId}.json`);
    if (fs.existsSync(userFilePath)) {
        try {
            return JSON.parse(fs.readFileSync(userFilePath, 'utf8'));
        } catch (error) {
            console.error(`Error parsing user data for chat ${chatId}:`, error);
            return {};
        }
    }
    return {};
}

function saveUserData(chatId, userData) {
    const userFilePath = path.join(USER_DATA_DIR, `${chatId}.json`);
    fs.writeFileSync(userFilePath, JSON.stringify(userData, null, 2));
}

async function updateLongMemory(chatId) {
    const chatLogPath = path.join(__dirname, 'chat_histories', `chat_${chatId}.log`);
    const userData = loadUserData(chatId);
    const lastLongMemoryUpdate = userData.lastLongMemoryUpdate || 0;
    const now = Date.now();
    const oneDay = 60 * 1000; //24 * 60 * 60 * 1000;

    // Если longMemory ещё не установлено и есть имя в логах, используем его
    if (!userData.longMemory && fs.existsSync(chatLogPath)) {
        const logs = fs.readFileSync(chatLogPath, 'utf8')
            .split('\n')
            .filter(Boolean)
            .map(line => JSON.parse(line));
        const nameEntry = logs.find(entry => entry.type === 'name_provided');
        if (nameEntry && nameEntry.name) {
            userData.longMemory = `Пользователь представился как ${sanitizeString(nameEntry.name)}.`;
            userData.lastLongMemoryUpdate = now;
            saveUserData(chatId, userData);
            console.log(`Initialized longMemory with name for chat ${chatId}: ${userData.longMemory}`);
            return;
        }
    }

    // Обычное обновление раз в день
    if (now - lastLongMemoryUpdate < oneDay || !fs.existsSync(chatLogPath)) return;

    const logs = fs.readFileSync(chatLogPath, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map(line => JSON.parse(line))
        .filter(entry => entry.role === 'user' && entry.text);

    if (logs.length === 0) return;

    const recentMessages = logs.slice(-20).map(entry => entry.text).join('\n');

    const analysisPrompt = {
        role: 'system',
        content: [{ type: 'input_text', text: 'Анализируй последние сообщения пользователя и обнови его долгосрочную память (краткое описание интересов, предпочтений, характера). Верни только обновлённый текст longMemory.' }]
    };
    const userMessages = {
        role: 'user',
        content: [{ type: 'input_text', text: recentMessages }]
    };

    const payload = {
        model: 'gpt-4o-mini',
        input: [analysisPrompt, userMessages],
        text: { format: { type: 'text' } },
        temperature: 1,
        max_output_tokens: 512,
    };

    try {
        const response = await axios.post(
            'https://api.openai.com/v1/responses',
            payload,
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${openaiApiKey}`,
                },
                timeout: 30000,
            }
        );

        const newLongMemory = sanitizeString(response.data.output.find(o => o.type === 'message')?.content.find(c => c.type === 'text')?.text || '');
        userData.longMemory = newLongMemory;
        userData.lastLongMemoryUpdate = now;
        saveUserData(chatId, userData);
        console.log(`Updated longMemory for chat ${chatId}: ${newLongMemory}`);
    } catch (error) {
        console.error(`Failed to update longMemory for chat ${chatId}:`, error.message);
    }
}

async function callOpenAI(chatId, userMessageContent) {
    if (!validateChatId(chatId)) {
        throw new Error('Invalid chat ID');
    }

    const sanitizedContent = userMessageContent.map(content => ({
        ...content,
        text: content.text ? sanitizeString(content.text) : content.text,
        image_url: content.image_url ? new URL(content.image_url).toString() : undefined,
        audio_url: content.audio_url ? new URL(content.audio_url).toString() : undefined
    }));

    const rateLimit = getRateLimit(chatId);
    if (!rateLimit.canProceed) {
        throw new Error('Rate limit exceeded');
    }

    if (!conversations[chatId]) {
        conversations[chatId] = [systemMessage];
        console.log(`Initialized conversation history for chat ID: ${chatId}`);
    }

    await updateLongMemory(chatId);

    const userMessage = {
        role: 'user',
        content: sanitizedContent
    };
    conversations[chatId].push(userMessage);

    const MAX_HISTORY = 20;
    if (conversations[chatId].length > MAX_HISTORY + 1) {
        conversations[chatId] = [
            conversations[chatId][0],
            ...conversations[chatId].slice(-(MAX_HISTORY))
        ];
    }

    const userData = loadUserData(chatId);
    conversations[chatId] = conversations[chatId].map((message, index) => {
        if (message.role === 'system' && index === 0) {
            let text = message.content[0].text;
            if (!text.includes('chatId')) {
                text += `\nchatId: ${chatId}`;
            }
            if (!text.includes('timestamp')) {
                text += `\ntimestamp: ${new Date().toISOString()}`;
            }
            if (userData.longMemory && !text.includes('longMemory')) {
                text += `\nlongMemory: ${userData.longMemory}`;
            }
            return {
                role: 'system',
                content: [{ type: 'input_text', text }]
            };
        }
        return message;
    });

    const payload = {
        model: 'gpt-4o-mini',
        input: conversations[chatId],
        text: { format: { type: 'text' } },
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

    try {
        const response = await axios.post(
            'https://api.openai.com/v1/responses',
            payload,
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${openaiApiKey}`,
                },
                timeout: 30000,
                maxContentLength: 50 * 1024 * 1024,
                validateStatus: status => status === 200
            }
        );

        if (!response.data || !Array.isArray(response.data.output)) {
            throw new Error('Invalid API response structure');
        }

        const messageOutput = response.data.output.find(output => output.type === 'message');
        const assistantText = messageOutput?.content?.find(c => c.type === 'output_text')?.text ||
                             messageOutput?.content?.find(c => c.type === 'text')?.text;

        if (!assistantText) {
            throw new Error('No valid message content found in OpenAI response');
        }

        const sanitizedAssistantText = sanitizeString(assistantText);
        logChat(chatId, { text: sanitizedAssistantText }, 'assistant');
        conversations[chatId].push({
            role: 'assistant',
            content: sanitizedAssistantText
        });

        return sanitizedAssistantText;

    } catch (error) {
        const safeErrorMessage = 'Произошла ошибка при обработке запроса.';
        logChat(chatId, { error: error.message, timestamp: new Date().toISOString() }, 'error');
        throw new Error(safeErrorMessage);
    }
}

async function transcribeAudio(audioPath, language = 'ru') {
    if (!openaiApiKey) {
        throw new Error('OpenAI API key is not set');
    }

    const formData = new FormData();
    if (audioPath.startsWith('http://') || audioPath.startsWith('https://')) {
        const audioResponse = await axios.get(audioPath, { responseType: 'stream' });
        formData.append('file', audioResponse.data, 'audio.mp3');
    } else {
        if (!fs.existsSync(audioPath)) {
            throw new Error('Audio file does not exist');
        }
        formData.append('file', fs.createReadStream(audioPath));
    }

    formData.append('model', 'whisper-1');
    formData.append('language', language);

    try {
        const response = await axios.post(
            'https://api.openai.com/v1/audio/transcriptions',
            formData,
            {
                headers: {
                    ...formData.getHeaders(),
                    'Authorization': `Bearer ${openaiApiKey}`
                },
                timeout: 60000
            }
        );

        if (!response.data || !response.data.text) {
            throw new Error('Invalid response from Whisper API');
        }

        const transcribedText = sanitizeString(response.data.text);
        console.log(`Audio transcribed successfully: ${transcribedText}`);
        return transcribedText;

    } catch (error) {
        console.error(`Error transcribing audio: ${error.message}`);
        throw new Error('Failed to transcribe audio');
    }
}

function clearConversation(chatId) {
    delete conversations[chatId];
    console.log(`Cleared conversation history for chat ID: ${chatId}`);
}

module.exports = {
    setSystemMessage,
    setOpenAIKey,
    callOpenAI,
    transcribeAudio,
    clearConversation,
    updateLongMemory
};