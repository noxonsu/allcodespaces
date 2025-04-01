const axios = require('axios');
const fs = require('fs'); // Добавляем модуль для работы с файлами
const FormData = require('form-data'); // Для отправки multipart/form-data
const { sanitizeString, validateChatId, logChat } = require('./utilities');

// Переменные для хранения состояния
let systemMessage;
let openaiApiKey;
const conversations = {};
const rateLimits = new Map();

/**
 * Устанавливает системное сообщение для всех новых бесед.
 * @param {string} content - Текст системного сообщения
 */
function setSystemMessage(content) {
    systemMessage = {
        role: 'system',
        content: [{ type: 'input_text', text: content }]
    };
}

/**
 * Устанавливает ключ API OpenAI для запросов.
 * @param {string} key - Ключ API OpenAI
 */
function setOpenAIKey(key) {
    openaiApiKey = key;
}

/**
 * Проверяет и возвращает статус ограничения скорости для указанного chatId.
 * @param {number} chatId - ID чата
 * @returns {Object} - Объект с полями canProceed и remainingRequests
 */
function getRateLimit(chatId) {
    const now = Date.now();
    const limit = rateLimits.get(chatId) || { count: 0, timestamp: now };
    
    if (now - limit.timestamp > 60000) { // Сброс через 1 минуту
        limit.count = 0;
        limit.timestamp = now;
    }
    
    limit.count++;
    rateLimits.set(chatId, limit);
    
    return {
        canProceed: limit.count <= 10, // Максимум 10 запросов в минуту
        remainingRequests: Math.max(0, 10 - limit.count)
    };
}

/**
 * Вызывает API OpenAI, отправляет сообщение и возвращает ответ ассистента.
 * @param {number} chatId - ID чата
 * @param {Array} userMessageContent - Содержимое сообщения пользователя
 * @returns {string} - Текст ответа ассистента
 */
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

        if (!response.data || 
            typeof response.data !== 'object' || 
            !Array.isArray(response.data.output)) {
            throw new Error('Invalid API response structure');
        }

        const messageOutput = response.data.output.find(
            output => output.type === 'message'
        );

        let assistantText = null;
        const outputTextContent = messageOutput?.content?.find(c => c.type === 'output_text');
        const textContent = messageOutput?.content?.find(c => c.type === 'text');

        if (outputTextContent && outputTextContent.text) {
            assistantText = outputTextContent.text;
        } else if (textContent && textContent.text) {
            assistantText = textContent.text;
        }

        if (!assistantText) {
            console.warn(`No 'output_text' or 'text' content found in assistant response for chat ${chatId}:`, messageOutput?.content);
            if (messageOutput && messageOutput.content && messageOutput.content.length > 0) {
                throw new Error('Assistant responded with non-text content (type not output_text or text).');
            } else {
                throw new Error('No valid message content found in OpenAI response');
            }
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
        logChat(chatId, { 
            error: error.message,
            timestamp: new Date().toISOString()
        }, 'error');
        throw new Error(safeErrorMessage);
    }
}

/**
 * Транскрибирует аудиофайл с помощью Whisper API от OpenAI.
 * @param {string} audioPath - Путь к аудиофайлу (локальный файл или URL)
 * @param {string} [language='ru'] - Язык аудио (по умолчанию русский)
 * @returns {string} - Транскрибированный текст
 */
async function transcribeAudio(audioPath, language = 'ru') {
    if (!openaiApiKey) {
        throw new Error('OpenAI API key is not set');
    }

    const formData = new FormData();

    // Проверка, является ли audioPath локальным файлом или URL
    if (audioPath.startsWith('http://') || audioPath.startsWith('https://')) {
        // Если это URL, скачиваем файл
        const audioResponse = await axios.get(audioPath, { responseType: 'stream' });
        formData.append('file', audioResponse.data, 'audio.mp3');
    } else {
        // Если это локальный файл, читаем его
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
                timeout: 60000 // Тайм-аут 60 секунд для обработки аудио
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

/**
 * Очищает историю беседы для указанного chatId.
 * @param {number} chatId - ID чата
 */
function clearConversation(chatId) {
    delete conversations[chatId];
    console.log(`Cleared conversation history for chat ID: ${chatId}`);
}

// Экспорт функций
module.exports = {
    setSystemMessage,
    setOpenAIKey,
    callOpenAI,
    transcribeAudio, // Добавлена новая функция
    clearConversation
};