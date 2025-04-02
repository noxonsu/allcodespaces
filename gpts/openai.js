console.log("this is file openai.js");

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

async function updateLongMemory(chatId, lastUserMessage = null) {
    const debug = true; // Включение отладочных логов
    const chatLogPath = path.join(__dirname, 'chat_histories', `chat_${chatId}.log`);
    const userData = loadUserData(chatId);
    const lastLongMemoryUpdate = userData.lastLongMemoryUpdate || 0;
    const now = Date.now();
    const updateInterval = 60 * 1000; // 60 секунд для отладки

    if (debug) {
        console.log(`Checking longMemory update for chat ${chatId}: last update at ${new Date(lastLongMemoryUpdate).toISOString()}, now ${new Date(now).toISOString()}`);
    }

    // Ensure chat_histories directory exists
    const chatHistoryDir = path.dirname(chatLogPath);
    if (!fs.existsSync(chatHistoryDir)) {
        fs.mkdirSync(chatHistoryDir, { recursive: true });
    }

    // Add last user message to log if provided
    if (lastUserMessage) {
        const logEntry = {
            role: 'user',
            text: lastUserMessage,
            timestamp: new Date().toISOString()
        };
        fs.appendFileSync(chatLogPath, JSON.stringify(logEntry) + '\n');
        if (debug) console.log(`Added last user message to log: ${JSON.stringify(logEntry)}`);
    }

    if (!fs.existsSync(chatLogPath)) {
        if (debug) console.log(`No chat log exists for chat ${chatId}, skipping update`);
        return;
    }

    const logs = fs.readFileSync(chatLogPath, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map(line => JSON.parse(line));

    // Учитываем все записи с текстом, независимо от роли
    const textMessages = logs.filter(entry => entry.text);
    const messageCount = textMessages.length;

    if (debug) {
        console.log(`Found ${messageCount} text messages for chat ${chatId}`);
        console.log(`Messages: ${JSON.stringify(textMessages.map(m => ({ role: m.role, text: m.text, timestamp: m.timestamp })))}`);
    }

    // Обновляем при каждом из первых 5 сообщений или после интервала
    const shouldUpdate = (messageCount > 0 && messageCount <= 5) || 
                        (now - lastLongMemoryUpdate >= updateInterval) || 
                        (messageCount >= 2 && lastLongMemoryUpdate === 0);

    if (!shouldUpdate) {
        if (debug) console.log(`No update needed for chat ${chatId}: time elapsed ${Math.round((now - lastLongMemoryUpdate) / 1000)}s < ${updateInterval / 1000}s and messages > 5`);
        return;
    }

    if (messageCount === 0) {
        if (debug) console.log(`No text messages to analyze for chat ${chatId}, skipping update`);
        return;
    }

    // Подготовка истории разговора для анализа
    if (!conversations[chatId]) {
        conversations[chatId] = [systemMessage];
        if (debug) console.log(`Initialized conversation history for chat ${chatId} in updateLongMemory`);
    }

    const currentMemory = userData.longMemory || '';
    const systemPrompt = systemMessage?.content[0]?.text || 'Вы полезный ассистент.';
    const analysisConversation = [{
        role: 'system',
        content: [{
            type: 'input_text',
            text: `Текущая долгосрочная память о пользователе: ${currentMemory}\n\nВыполни только анализ всех логов (включая пользователя, ассистента и другие записи) и обнови долгосрочную память. Верни только чистый текст longMemory без префикса "longMemory:". Используй существующую информацию из долгосрочной памяти, если она актуальна. Выдавай формат json где будут name,city,timezone и другие \n\n Последние сообщения: `
        }]
    }];

    // Добавляем логи из файла (последние 20 записей)
    const lastLogs = textMessages.slice(-20);
    
    analysisConversation.push({
        role: 'system',
        content: [{
            type: 'input_text',
            text: lastLogs.map(log => `${log.role}: ${log.text}`).join('\n')
        }]
    });
    
    const payload = {
        model: 'gpt-4o',
        input: analysisConversation,
        text: { format: { type: 'text' } },
        temperature: 0,
        max_output_tokens: 512
    };

    if (debug) console.log(`Sending payload to OpenAI for chat ID: ${chatId} in updateLongMemory. History length: ${analysisConversation.length}`);

    try {
        const response = await axios.post(
            'https://api.openai.com/v1/responses',
            payload,
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${openaiApiKey}`,
                },
                timeout: 30 * 1000,
                maxContentLength: 50 * 1024 * 1024,
                validateStatus: status => status === 200
            }
        );

        if (!response.data || !Array.isArray(response.data.output)) {
            throw new Error('Invalid API response structure');
        }

        const messageOutput = response.data.output.find(output => output.type === 'message');
        const rawText = messageOutput?.content?.find(c => c.type === 'output_text')?.text ||
                        messageOutput?.content?.find(c => c.type === 'text')?.text || '';
        if (debug) console.log(`Raw response from OpenAI for chat ${chatId}: ${JSON.stringify(response.data.output)}`);

        // Убираем префикс "longMemory:" если он есть
        let newLongMemory = sanitizeString(rawText.replace(/^longMemory:\s*/i, ''));
        if (!newLongMemory) {
            console.warn(`Empty longMemory received for chat ${chatId} after processing, keeping previous value`);
            return;
        }

        userData.longMemory = newLongMemory;
        userData.lastLongMemoryUpdate = now;
        saveUserData(chatId, userData);
        console.log(`Updated longMemory for chat ${chatId}: ${newLongMemory}`);
        if (debug) console.log(`Successfully updated longMemory for chat ${chatId} at ${new Date(now).toISOString()}`);
    } catch (error) {
        console.error(`Failed to update longMemory for chat ${chatId}:`, error.message);
        if (debug) console.log(`Error details: ${JSON.stringify(error, null, 2)}`);
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

    const userData = loadUserData(chatId);
    const currentTimestamp = new Date().toISOString();
    const longMemory = userData.longMemory || '';

    // Добавляем timestamp и longMemory в сообщение пользователя
    const userMessage = {
        role: 'user',
        content: [
            ...sanitizedContent,
            { type: 'input_text', text: `Текущее время: ${currentTimestamp}` },
            { type: 'input_text', text: `Долгосрочная память о пользователе: ${longMemory}` },
            { type: 'input_text', text: `chatId: ${chatId}` }
        ]
    };
    conversations[chatId].push(userMessage);

    // Get the text content from sanitizedContent for longMemory update
    const lastUserMessage = sanitizedContent.find(c => c.text)?.text;
    await updateLongMemory(chatId, lastUserMessage);

    const MAX_HISTORY = 20;
    if (conversations[chatId].length > MAX_HISTORY + 1) {
        conversations[chatId] = [
            conversations[chatId][0],
            ...conversations[chatId].slice(-(MAX_HISTORY))
        ];
    }

    // Обновляем системное сообщение с chatId (без timestamp и longMemory, они уже в userMessage)
    conversations[chatId] = conversations[chatId].map((message, index) => {
        if (message.role === 'system' && index === 0) {
            let text = message.content[0].text;
            if (!text.includes('chatId')) {
                text += `\nchatId: ${chatId}`;
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
                timeout: 30 * 1000,
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
                timeout: 60 * 1000
            }
        );

        if (!response.data || !response.data.text) {
            throw new Error('Invalid response from Whisper API');
        }

        const transcribedText = sanitizeString(response.data.text);
        console.log(`Audio transcribed successfully: ${transcribedText}`);
        return transcribedText;

    } catch (error) {
        console.error(`Error transcribing audio:`, error.message);
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