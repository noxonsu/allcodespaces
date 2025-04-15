const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const { sanitizeString, validateChatId, logChat } = require('./utilities');
const { CHAT_HISTORIES_DIR, USER_DATA_DIR, NAMEPROMPT, MAX_HISTORY } = require('./config');

// --- Configuration & State ---
let systemMessage;
let openaiApiKey = process.env.OPENAI_API_KEY;
let deepseekApiKey = process.env.DEEPSEEK_API_KEY;
let model = process.env.MODEL || 'openai';
const rateLimits = new Map();

// Ensure directories exist
if (!fs.existsSync(USER_DATA_DIR)) {
    fs.mkdirSync(USER_DATA_DIR, { recursive: true });
}
if (!fs.existsSync(CHAT_HISTORIES_DIR)) {
    fs.mkdirSync(CHAT_HISTORIES_DIR, { recursive: true });
}

// --- Functions ---

function setSystemMessage(content) {
    systemMessage = {
        role: 'system',
        content: [{ type: 'input_text', text: content }]
    };
    console.log("System message set.");
}

function setOpenAIKey(key) {
    openaiApiKey = key;
    console.log("OpenAI API key set.");
}

function setDeepSeekKey(key) {
    deepseekApiKey = key;
    console.log("DeepSeek API key set.");
}

function setModel(newModel) {
    model = newModel;
    console.log(`Model set to: ${model}`);
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
        canProceed: limit.count <= 15,
        remainingRequests: Math.max(0, 15 - limit.count)
    };
}

function loadUserData(chatId) {
    const userFilePath = path.join(USER_DATA_DIR, `${chatId}.json`);
    if (fs.existsSync(userFilePath)) {
        try {
            return JSON.parse(fs.readFileSync(userFilePath, 'utf8'));
        } catch (error) {
            console.error(`Ошибка чтения данных пользователя для чата ${chatId}:`, error);
            return { longMemory: '', lastLongMemoryUpdate: 0 };
        }
    }
    return { longMemory: '', lastLongMemoryUpdate: 0 };
}

function saveUserData(chatId, userData) {
    try {
        const userFilePath = path.join(USER_DATA_DIR, `${chatId}.json`);
        fs.writeFileSync(userFilePath, JSON.stringify(userData, null, 2));
    } catch (error) {
        console.error(`Ошибка сохранения данных пользователя для чата ${chatId}:`, error);
    }
}

function loadChatHistoryFromFile(chatId) {
    const chatLogPath = path.join(CHAT_HISTORIES_DIR, `chat_${chatId}.log`);
    const history = [];

    if (!fs.existsSync(chatLogPath)) {
        console.info(`[История чата ${chatId}] Файл истории не найден: ${chatLogPath}`);
        return history;
    }

    try {
        const fileContent = fs.readFileSync(chatLogPath, 'utf8');
        const lines = fileContent.split('\n').filter(Boolean);

        console.debug(`[История чата ${chatId}] Найдено ${lines.length} строк в логе`);

        for (const line of lines) {
            try {
                const entry = JSON.parse(line);
                let messageContent = null;

                // Проверяем, является ли content массивом (для сообщений user/assistant)
                if (entry.content && Array.isArray(entry.content)) {
                    messageContent = entry.content;
                }
                // Проверяем вложенный content.content (для исправления старого формата)
                else if (entry.content?.content && Array.isArray(entry.content.content)) {
                    messageContent = entry.content.content;
                }
                // Проверяем content.text как строку
                else if (entry.content?.text && typeof entry.content.text === 'string' && entry.content.text.trim() !== '') {
                    messageContent = [{ type: entry.role === 'user' ? 'input_text' : 'output_text', text: entry.content.text }];
                }

                if ((entry.role === 'user' || entry.role === 'assistant') && messageContent) {
                    history.push({ role: entry.role, content: messageContent });
                    console.debug(`[История чата ${chatId}] Добавлено сообщение:`, { role: entry.role, content: messageContent });
                }
            } catch (parseError) {
                console.warn(`[Загрузка истории ${chatId}] Пропуск некорректной строки: ${parseError.message}. Строка: "${line}"`);
            }
        }
    } catch (readError) {
        console.error(`Ошибка чтения файла истории для чата ${chatId}:`, readError);
        return [];
    }

    console.debug(`[История чата ${chatId}] Загружено ${history.length} сообщений`);
    return history.slice(-MAX_HISTORY);
}

async function updateLongMemory(chatId, userData) {
    try {
        // Read chat history
        const history = loadChatHistoryFromFile(chatId);
        if (!history || history.length === 0) {
            console.debug(`[LongMemory ${chatId}] No chat history found, skipping memory update.`);
            return false;
        }

        // Process each log entry
        const processedMessages = history.map(log => {
            // Safely extract text content - handle different content structures
            let textContent = '';
            
            if (Array.isArray(log.content)) {
                // If content is an array, look for a text field in its objects
                const textItem = log.content.find(c => c.text);
                textContent = textItem ? textItem.text : '';
            } else if (typeof log.content === 'string') {
                // If content is directly a string
                textContent = log.content;
            } else if (log.content && typeof log.content.text === 'string') {
                // If content has a direct text property
                textContent = log.content.text;
            }
            
            return {
                role: log.role,
                content: textContent
            };
        }).filter(m => m.content); // Filter out entries with empty content

        // Continue with the rest of your memory update logic...
        
        // Your existing code continues here...
    } catch (error) {
        console.error(`Ошибка обновления памяти для ${chatId}:`, error);
        return false;
    }
}

async function callLLM(chatId, userMessageContent) {
    console.info(`[LLM ${chatId}] Вызов модели: ${model}`);
    if (model === 'deepseek') {
        return callDeepSeek(chatId, userMessageContent);
    }
    return callOpenAI(chatId, userMessageContent);
}

// Для OpenAI
async function callOpenAI(chatId, userMessageContent) {
    if (!validateChatId(chatId)) {
        console.error(`Некорректный chat ID: ${chatId}`);
        throw new Error('Некорректный chat ID');
    }
    if (!openaiApiKey) {
        console.error("Ключ OpenAI API не установлен!");
        throw new Error("Ключ OpenAI API не настроен.");
    }
    if (!systemMessage) {
        console.error("Системное сообщение не установлено!");
        throw new Error("Системное сообщение не настроено.");
    }

    const rateLimit = getRateLimit(chatId);
    if (!rateLimit.canProceed) {
        console.warn(`Превышен лимит запросов для чата ${chatId}`);
        throw new Error('Превышен лимит запросов.');
    }

    const userData = loadUserData(chatId);
    const longMemory = userData.longMemory || '';
    const sanitizedContent = userMessageContent.map(content => {
        const newContent = { ...content };
        if (newContent.text) newContent.text = sanitizeString(newContent.text);
        if (newContent.image_url && !newContent.image_url.startsWith('data:image/')) {
            try {
                const parsedUrl = new URL(newContent.image_url);
                if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') throw new Error('Invalid protocol');
                newContent.image_url = parsedUrl.toString();
            } catch {
                console.warn(`Некорректный URL изображения: ${newContent.image_url}`);
                delete newContent.image_url;
            }
        }
        return newContent;
    }).filter(c => c.text || c.image_url);

    if (sanitizedContent.length === 0) {
        throw new Error("Содержимое сообщения пусто после обработки.");
    }

    // Пользовательское сообщение без служебной информации
    const userMessageForApi = {
        role: 'user',
        content: sanitizedContent
    };

    // Системное сообщение с контекстной информацией
    const contextSystemMessage = {
        role: 'system',
        content: [{ 
            type: 'input_text', 
            text: `${systemMessage.content[0].text}\n\nСлужебная информация (не упоминайте её пользователю): ChatID: ${chatId}, Текущее время: ${new Date().toISOString()}${longMemory && longMemory !== '{}' ? `, Контекст: ${longMemory}` : ''}`
        }]
    };

    logChat(chatId, { role: 'user', content: sanitizedContent }, 'user');
    const conversationHistory = loadChatHistoryFromFile(chatId);

    updateLongMemory(chatId).catch(err => console.error(`Ошибка обновления памяти для ${chatId}:`, err));

    // Используем обновленное системное сообщение с контекстом
    const apiInput = [contextSystemMessage, ...conversationHistory, userMessageForApi];
    const modelName = process.env.OPENAIMODEL || 'gpt-4o-mini';
    const payload = {
        model: modelName,
        tools: [{ type: "web_search_preview" }],
        input: apiInput,
        text: { format: { type: 'text' } },
        temperature: 1,
        max_output_tokens: 2048,
        top_p: 1,
        store: true
    };

    console.info(`[API Call ${chatId}] Отправка в OpenAI. Модель: ${modelName}. История: ${conversationHistory.length} сообщений.`);
    console.debug(`[API Call ${chatId}] Payload:`, JSON.stringify(payload, null, 2));

    try {
        const response = await axios.post(
            'https://api.openai.com/v1/responses',
            payload,
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${openaiApiKey}`
                },
                timeout: 45 * 1000,
                maxContentLength: 50 * 1024 * 1024
            }
        );

        const assistantText = response.data.output.find(output => output.type === 'message')?.content.find(c => c.type === 'output_text')?.text;
        if (!assistantText) throw new Error('Некорректный ответ от OpenAI.');

        const sanitizedAssistantText = sanitizeString(assistantText);
        logChat(chatId, { role: 'assistant', content: [{ type: 'output_text', text: sanitizedAssistantText }] }, 'assistant');

        return sanitizedAssistantText;
    } catch (error) {
        console.error(`Ошибка вызова OpenAI API для чата ${chatId}:`, error.message);
        throw new Error('Ошибка при обработке запроса.');
    }
}

// Для DeepSeek
async function callDeepSeek(chatId, userMessageContent) {
    if (!validateChatId(chatId)) {
        console.error(`Некорректный chat ID: ${chatId}`);
        throw new Error('Некорректный chat ID');
    }
    if (!deepseekApiKey) {
        console.error("Ключ DeepSeek API не установлен!");
        throw new Error("Ключ DeepSeek API не настроен.");
    }
    if (!systemMessage) {
        console.error("Системное сообщение не установлено!");
        throw new Error("Системное сообщение не настроено.");
    }

    const rateLimit = getRateLimit(chatId);
    if (!rateLimit.canProceed) {
        console.warn(`Превышен лимит запросов для чата ${chatId}`);
        throw new Error('Превышен лимит запросов.');
    }

    const userData = loadUserData(chatId);
    const longMemory = userData.longMemory || '';
    const sanitizedContent = userMessageContent.map(content => {
        const newContent = { ...content };
        if (newContent.text) newContent.text = sanitizeString(newContent.text);
        return newContent;
    }).filter(c => c.text);

    if (sanitizedContent.length === 0) {
        throw new Error("Содержимое сообщения пусто после обработки.");
    }

    // Системное сообщение с служебной информацией
    const systemMessageWithContext = `${systemMessage.content[0].text}\n\nСлужебная информация (не упоминайте её пользователю): ChatID: ${chatId}, Текущее время: ${new Date().toISOString()}${longMemory && longMemory !== '{}' ? `, Контекст: ${longMemory}` : ''}`;

    const messages = [
        { role: 'system', content: systemMessageWithContext },
        ...loadChatHistoryFromFile(chatId).map(msg => ({
            role: msg.role,
            content: msg.content.find(c => c.text)?.text || ''
        })),
        {
            role: 'user',
            content: sanitizedContent[0].text
        }
    ];

    logChat(chatId, { role: 'user', content: sanitizedContent }, 'user');

    const payload = {
        model: 'deepseek-chat',
        messages,
        temperature: 1,
        max_tokens: 2048
    };

    console.info(`[API Call ${chatId}] Отправка в DeepSeek. История: ${messages.length - 2} сообщений.`);
    console.debug(`[API Call ${chatId}] Payload:`, JSON.stringify(payload, null, 2));

    try {
        const response = await axios.post(
            'https://api.deepseek.com/v1/chat/completions',
            payload,
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${deepseekApiKey}`
                },
                timeout: 45 * 1000
            }
        );

        const assistantText = response.data.choices[0].message.content;
        if (!assistantText) throw new Error('Некорректный ответ от DeepSeek.');

        const sanitizedAssistantText = sanitizeString(assistantText);
        logChat(chatId, { role: 'assistant', content: [{ type: 'output_text', text: sanitizedAssistantText }] }, 'assistant');
        return sanitizedAssistantText;
    } catch (error) {
        console.error(`Ошибка вызова DeepSeek API для чата ${chatId}:`, error.message);
        throw new Error('Ошибка при обработке запроса через DeepSeek.');
    }
}

async function transcribeAudio(audioUrlOrPath, language = 'ru') {
    if (!openaiApiKey) {
        throw new Error('Ключ OpenAI API не установлен для транскрипции.');
    }

    const formData = new FormData();

    try {
        if (audioUrlOrPath.startsWith('http://') || audioUrlOrPath.startsWith('https://')) {
            console.info(`[Transcribe ${language}] Транскрибация из URL: ${audioUrlOrPath}`);
            const audioResponse = await axios.get(audioUrlOrPath, { responseType: 'stream', timeout: 20000 });
            formData.append('file', audioResponse.data, 'audio_from_url.mp3');
        } else {
            console.info(`[Transcribe ${language}] Транскрибация из пути: ${audioUrlOrPath}`);
            if (!fs.existsSync(audioUrlOrPath)) throw new Error(`Аудиофайл не существует: ${audioUrlOrPath}`);
            formData.append('file', fs.createReadStream(audioUrlOrPath));
        }

        formData.append('model', 'whisper-1');
        if (language) formData.append('language', language);
        formData.append('response_format', 'text');

        const response = await axios.post(
            'https://api.openai.com/v1/audio/transcriptions',
            formData,
            {
                headers: { ...formData.getHeaders(), 'Authorization': `Bearer ${openaiApiKey}` },
                timeout: 60 * 1000
            }
        );

        const transcribedText = sanitizeString(response.data);
        console.info(`[Transcribe ${language}] Успешно транскрибировано. Длина: ${transcribedText.length}`);
        return transcribedText;
    } catch (error) {
        console.error(`Ошибка транскрибации аудио:`, error.message);
        throw new Error('Не удалось расшифровать аудио.');
    }
}

module.exports = {
    setSystemMessage,
    setOpenAIKey,
    setDeepSeekKey,
    setModel,
    callLLM,
    callOpenAI,
    callDeepSeek,
    transcribeAudio,
    updateLongMemory
};