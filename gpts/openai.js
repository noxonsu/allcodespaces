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

async function updateLongMemory(chatId) {
    if (chatId === 1) {
        console.info(`[LongMemory ${chatId}] Пропуск обновления для chatId = 1`);
        return;
    }

    console.info(`[LongMemory ${chatId}] Проверка необходимости обновления долговременной памяти.`);
    const chatLogPath = path.join(CHAT_HISTORIES_DIR, `chat_${chatId}.log`);
    const userData = loadUserData(chatId);
    const lastLongMemoryUpdate = userData.lastLongMemoryUpdate || 0;
    const now = Date.now();
    const updateInterval = 1 * 60 * 60 * 1000;

    if (!fs.existsSync(chatLogPath)) {
        console.info(`[LongMemory ${chatId}] Файл лога чата не существует, обновление пропускается.`);
        return;
    }

    let logs = [];
    try {
        const fileContent = fs.readFileSync(chatLogPath, 'utf8');
        logs = fileContent.split('\n').filter(Boolean).map(line => JSON.parse(line));
    } catch (error) {
        console.error(`[LongMemory ${chatId}] Ошибка чтения лога:`, error);
        return;
    }

    const textMessages = logs.filter(entry =>
        entry.role && (
            (entry.content && Array.isArray(entry.content) && entry.content.some(c => c.text?.trim())) ||
            (entry.content?.content && Array.isArray(entry.content.content) && entry.content.content.some(c => c.text?.trim())) ||
            (entry.content?.text && typeof entry.content.text === 'string' && entry.content.text.trim() !== '')
        )
    );

    const userMessageCount = textMessages.filter(m => m.role === 'user').length;
    const isInitialPhase = userMessageCount > 0 && userMessageCount <= 5;
    const intervalPassed = now - lastLongMemoryUpdate >= updateInterval;

    if (!isInitialPhase && !intervalPassed) {
        console.info(`[LongMemory ${chatId}] Обновление не требуется.`);
        return;
    }

    if (textMessages.length === 0) {
        console.info(`[LongMemory ${chatId}] Нет текстовых сообщений для анализа.`);
        return;
    }

    const currentMemory = userData.longMemory || '';
    const systemPromptText = systemMessage?.content?.[0]?.text || 'You are a helpful assistant.';
    const analysisConversation = [
        {
            role: 'system',
            content: [{
                type: 'input_text',
                text: `Current long-term memory: ${currentMemory}\n\nAnalyze recent messages and update the memory. Output ONLY JSON with fields like name, city, interests. Recent Messages:`
            }]
        },
        {
            role: 'system',
            content: [{
                type: 'input_text',
                text: textMessages.slice(-20).map(log => {
                    const textContent = log.content?.find(c => c.text)?.text || log.content?.content?.find(c => c.text)?.text || log.content?.text || '[non-text content]';
                    return `${log.role}: ${textContent}`;
                }).join('\n')
            }]
        }
    ];

    const payload = {
        model: 'gpt-4o-mini',
        input: analysisConversation,
        text: { format: { type: 'json_object' } },
        temperature: 0.1,
        max_output_tokens: 512
    };

    try {
        const response = await axios.post(
            'https://api.openai.com/v1/responses',
            payload,
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${openaiApiKey}`
                },
                timeout: 30 * 1000
            }
        );

        const jsonObject = response.data.output.find(output => output.type === 'message')?.content.find(c => c.type === 'output_json_object')?.json_object ||
                          JSON.parse(response.data.output.find(output => output.type === 'message')?.content.find(c => c.type === 'output_text')?.text || '{}');
        const newLongMemoryString = JSON.stringify(jsonObject);

        if (newLongMemoryString !== currentMemory) {
            userData.longMemory = newLongMemoryString;
            userData.lastLongMemoryUpdate = now;
            saveUserData(chatId, userData);
            console.info(`[LongMemory ${chatId}] Память обновлена: ${newLongMemoryString}`);
        } else {
            userData.lastLongMemoryUpdate = now;
            saveUserData(chatId, userData);
            console.info(`[LongMemory ${chatId}] Память не изменилась, обновлен timestamp.`);
        }
    } catch (error) {
        console.error(`[LongMemory ${chatId}] Ошибка API:`, error.message);
    }
}

async function callLLM(chatId, userMessageContent) {
    console.info(`[LLM ${chatId}] Вызов модели: ${model}`);
    if (model === 'deepseek') {
        return callDeepSeek(chatId, userMessageContent);
    }
    return callOpenAI(chatId, userMessageContent);
}

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

    const userMessageForApi = {
        role: 'user',
        content: [
            ...sanitizedContent,
            {
                type: 'input_text',
                text: `ChatID: ${chatId}, Текущее время: ${new Date().toISOString()}`
            },
            ...(longMemory && longMemory !== '{}' ? [{ type: 'input_text', text: `Контекст: ${longMemory}` }] : [])
        ]
    };

    logChat(chatId, { role: 'user', content: sanitizedContent }, 'user');
    const conversationHistory = loadChatHistoryFromFile(chatId);

    updateLongMemory(chatId).catch(err => console.error(`Ошибка обновления памяти для ${chatId}:`, err));

    const apiInput = [JSON.parse(JSON.stringify(systemMessage)), ...conversationHistory, userMessageForApi];
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

    const messages = [
        { role: 'system', content: systemMessage.content[0].text },
        ...loadChatHistoryFromFile(chatId).map(msg => ({
            role: msg.role,
            content: msg.content.find(c => c.text)?.text || ''
        })),
        {
            role: 'user',
            content: sanitizedContent[0].text +
                     ` ChatID: ${chatId},` +
                     ` Текущее время: ${new Date().toISOString()}` +
                     (longMemory && longMemory !== '{}' ? ` Контекст: ${longMemory}` : '')
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