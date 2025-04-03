console.log("this is file openai.js");

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const { sanitizeString, validateChatId, logChat } = require('./utilities');

// --- Configuration & State ---
let systemMessage;
let openaiApiKey;
const rateLimits = new Map(); // Keep rate limiting for API protection
const USER_DATA_DIR = path.join(__dirname, 'user_data');
const CHAT_HISTORIES_DIR = path.join(__dirname, 'chat_histories'); // Define globally
const MAX_HISTORY = 20; // Max history messages to load (excluding system/current user message)

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

function getRateLimit(chatId) {
    const now = Date.now();
    const limit = rateLimits.get(chatId) || { count: 0, timestamp: now };

    if (now - limit.timestamp > 60000) { // Reset every minute
        limit.count = 0;
        limit.timestamp = now;
    }

    limit.count++;
    rateLimits.set(chatId, limit);

    return {
        canProceed: limit.count <= 10, // Allow 10 requests per minute per user
        remainingRequests: Math.max(0, 10 - limit.count)
    };
}

function loadUserData(chatId) {
    const userFilePath = path.join(USER_DATA_DIR, `${chatId}.json`);
    if (fs.existsSync(userFilePath)) {
        try {
            return JSON.parse(fs.readFileSync(userFilePath, 'utf8'));
        } catch (error) {
            console.error(`Ошибка чтения данных пользователя для чата ${chatId}:`, error);
            // Return default structure on error to prevent crashes
            return { longMemory: '', lastLongMemoryUpdate: 0 };
        }
    }
    // Return default structure if file doesn't exist
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

// --- Chat History Loading ---
function loadChatHistoryFromFile(chatId) {
    const chatLogPath = path.join(CHAT_HISTORIES_DIR, `chat_${chatId}.log`);
    const history = [];

    if (!fs.existsSync(chatLogPath)) {
        console.info(`[История чата ${chatId}] Файл истории не найден. Начинаем новую историю.`);
        return history; // Return empty history if no file
    }

    try {
        const fileContent = fs.readFileSync(chatLogPath, 'utf8');
        const lines = fileContent.split('\n').filter(Boolean); // Split lines and remove empty ones

        for (const line of lines) {
            try {
                const entry = JSON.parse(line);
                let messageContent = null;

                // Prioritize new 'content' format if it exists and is valid
                if (entry.content && Array.isArray(entry.content) && entry.content.length > 0) {
                    messageContent = entry.content;
                }
                // Fallback to legacy 'text' format if 'content' is missing/invalid
                else if (typeof entry.text === 'string' && entry.text.trim() !== '') {
                    // Construct the content array from the legacy 'text' field
                    messageContent = [{ type: entry.role === 'user' ? 'input_text' : 'output_text', text: entry.text }];
                    // Add a warning if role is missing but text exists (potential data issue)
                    if (!entry.role) {
                         console.warn(`[Загрузка истории ${chatId}] Запись лога содержит 'text', но отсутствует 'role': ${line}`);
                    }
                }

                // Push to history only if we have a valid role (user/assistant) and valid content
                if ((entry.role === 'user' || entry.role === 'assistant') && messageContent) {
                    history.push({
                        role: entry.role,
                        content: messageContent
                    });
                } else if (entry.role && entry.role !== 'user' && entry.role !== 'assistant') {
                     // Ignore non-user/assistant roles for history reconstruction (e.g., 'system', 'event', 'error')
                } else if (!messageContent && (entry.role === 'user' || entry.role === 'assistant')) {
                    // Warn if role is correct but content/text is missing/empty
                    console.warn(`[Загрузка истории ${chatId}] Запись User/Assistant пропущена из-за отсутствия/пустого content/text: ${line}`);
                }

            } catch (parseError) {
                console.warn(`[Загрузка истории ${chatId}] Пропуск некорректной строки в логе чата: ${parseError.message}. Строка: "${line}"`);
            }
        }
        // Only log loaded count if history was actually loaded
        if (history.length > 0) {
            console.info(`[История чата ${chatId}] Загружено ${history.length} сообщений из файла истории.`);
        }
    } catch (readError) {
        console.error(`Ошибка чтения файла истории для чата ${chatId}:`, readError);
        // Return empty history on error to prevent crashes
        return [];
    }

    // Apply history limit
    if (history.length > MAX_HISTORY) {
        console.info(`[История чата ${chatId}] История превышает лимит (${history.length} > ${MAX_HISTORY}). Обрезаем.`);
        return history.slice(-MAX_HISTORY);
    }

    return history;
}


// --- Long Memory Update ---
async function updateLongMemory(chatId) { // Removed lastUserMessageText as it's read from logs now
    console.info(`[LongMemory ${chatId}] Проверка необходимости обновления долговременной памяти.`);
    const chatLogPath = path.join(CHAT_HISTORIES_DIR, `chat_${chatId}.log`);
    const userData = loadUserData(chatId);
    const lastLongMemoryUpdate = userData.lastLongMemoryUpdate || 0;
    const now = Date.now();
    const updateInterval = 1 * 60 * 60 * 1000; // 1 час в миллисекундах

    if (!fs.existsSync(chatLogPath)) {
        console.info(`[LongMemory ${chatId}] Файл лога чата не существует, обновление пропускается.`);
        return;
    }

    let logs = [];
    try {
        const fileContent = fs.readFileSync(chatLogPath, 'utf8');
        logs = fileContent.split('\n')
            .filter(Boolean) // Remove empty lines potentially caused by split
            .map(line => JSON.parse(line)); // Parse each line as JSON
        console.info(`[LongMemory ${chatId}] Успешно прочитано ${logs.length} записей из лога.`);
    } catch (error) {
        console.error(`[LongMemory ${chatId}] Ошибка чтения/парсинга файла лога для обновления:`, error);
        return; // Don't proceed if logs can't be read
    }

    // Filter for entries that have textual content for analysis (checking both formats)
     const textMessages = logs.filter(entry =>
        entry.role && // Ensure role exists
        (
            // Check new format: content is array and has at least one item with non-empty text
            (entry.content && Array.isArray(entry.content) && entry.content.some(c => typeof c.text === 'string' && c.text.trim() !== '')) ||
            // Check old format: text is a non-empty string
            (typeof entry.text === 'string' && entry.text.trim() !== '')
        )
    );

    // Count only user messages for the initial update logic
    const userMessageCount = textMessages.filter(m => m.role === 'user').length;
    console.info(`[LongMemory ${chatId}] Найдено ${textMessages.length} текстовых сообщений, из них ${userMessageCount} от пользователя.`);

    // Update logic: Update on first 5 USER messages OR after interval has passed since last update
    const isInitialPhase = userMessageCount > 0 && userMessageCount <= 5;
    const intervalPassed = now - lastLongMemoryUpdate >= updateInterval;

    const shouldUpdate = isInitialPhase || intervalPassed;

    if (!shouldUpdate) {
        const timeSinceLastUpdate = Math.round((now - lastLongMemoryUpdate) / 1000 / 60); // minutes
        console.info(`[LongMemory ${chatId}] Обновление не требуется: Сообщений пользователя=${userMessageCount} (не в начальной фазе <=5), Интервал не прошел (${timeSinceLastUpdate} мин < ${updateInterval / 1000 / 60} мин).`);
        return;
    }

    if (textMessages.length === 0) { // Check if there are any text messages at all to analyze
        console.info(`[LongMemory ${chatId}] Нет текстовых сообщений для анализа, обновление пропускается.`);
        return;
    }

    console.info(`[LongMemory ${chatId}] Требуется обновление. Причина: ${isInitialPhase ? 'Начальная фаза (' + userMessageCount + ' <= 5)' : 'Прошел интервал'}.`);

    const currentMemory = userData.longMemory || '';
    // Ensure systemMessage is loaded before accessing its content
    const systemPromptText = systemMessage?.content?.[0]?.text || 'You are a helpful assistant.';

    // Prepare conversation for analysis API call
    const analysisConversation = [{
        role: 'system',
        content: [{
            type: 'input_text',
            // Updated prompt for clarity and JSON output request
            text: `Current long-term memory about the user: ${currentMemory}\n\nAnalyze the following recent messages (user, assistant, system) and update the long-term memory. Focus on key facts like name, location, preferences, goals, etc. Output ONLY the updated long-term memory as a JSON object containing relevant fields (e.g., name, city, interests, timezone). If no significant new information is found, you can return the existing memory or an empty JSON object {}. Do not add explanations or prefixes like "longMemory:".\n\nRecent Messages:`
        }]
    }];

    // Add recent logs (last 20 text messages) for context
    const lastLogs = textMessages.slice(-20); // Get the last 20 relevant messages
    analysisConversation.push({
        role: 'system', // Using 'system' role to provide the log data as context
        content: [{
            type: 'input_text',
            // Extract text from the content array (new) or text field (old), handle non-text content gracefully
             text: lastLogs.map(log => {
                 // Prioritize text from content array, fallback to legacy text field
                 const textContent = log.content?.find(c => c.text)?.text || log.text || '[non-text content]';
                 return `${log.role}: ${textContent}`;
             }).join('\n')
        }]
    });


    const payload = {
        model: 'gpt-4o-mini', // Use a capable model for analysis
        input: analysisConversation,
        text: { format: { type: 'json_object' } }, // Request JSON output directly
        temperature: 0.1, // Low temperature for factual summary
        max_output_tokens: 512 // Limit output size
    };

    console.info(`[LongMemory ${chatId}] Отправка запроса на анализ (${analysisConversation.length} сообщений в контексте).`);

    try {
        const response = await axios.post(
            'https://api.openai.com/v1/responses',
            payload,
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${openaiApiKey}`,
                },
                timeout: 30 * 1000, // 30 seconds timeout
                validateStatus: status => status === 200 // Only 200 is success
            }
        );

        // --- Improved JSON Parsing Logic ---
        const messageOutput = response.data?.output?.find(output => output.type === 'message');
        let parsedJson = null;

        // 1. Try to get the structured JSON object first
        const jsonObjectOutput = messageOutput?.content?.find(c => c.type === 'output_json_object')?.json_object;

        if (typeof jsonObjectOutput === 'object' && jsonObjectOutput !== null) {
            parsedJson = jsonObjectOutput;
            console.info(`[LongMemory ${chatId}] Успешно получен структурированный JSON из 'output_json_object'.`);
        } else {
            // 2. If structured JSON is missing, try parsing the text output
            const textOutput = messageOutput?.content?.find(c => c.type === 'output_text')?.text;
            if (textOutput) {
                console.warn(`[LongMemory ${chatId}] Не найден 'output_json_object', попытка парсинга 'output_text'. Raw text: ${textOutput}`);
                try {
                    parsedJson = JSON.parse(textOutput);
                    // Double-check if parsing resulted in a valid object
                    if (typeof parsedJson !== 'object' || parsedJson === null) {
                         console.error(`[LongMemory ${chatId}] Парсинг 'output_text' не дал валидный объект JSON.`);
                         parsedJson = null; // Reset if parsing didn't yield an object
                    } else {
                         console.info(`[LongMemory ${chatId}] Успешно распарсен JSON из 'output_text'.`);
                    }
                } catch (parseError) {
                    console.error(`[LongMemory ${chatId}] Ошибка парсинга JSON из 'output_text': ${parseError.message}. Raw text: ${textOutput}`);
                    parsedJson = null; // Ensure it's null on parse error
                }
            } else {
                 console.warn(`[LongMemory ${chatId}] Не найдены ни 'output_json_object', ни 'output_text' в ответе.`);
            }
        }

        // Check if we successfully got a parsed JSON object
        if (parsedJson === null) {
             console.error(`[LongMemory ${chatId}] Не удалось получить валидный JSON ни одним из способов. Обновление памяти пропущено.`);
            return; // Don't update if we couldn't get valid JSON
        }
        // --- End of Improved JSON Parsing Logic ---


        // Convert the successfully parsed JSON object back to a string for storage
        const newLongMemoryString = JSON.stringify(parsedJson);


        // Avoid saving empty "{}" string if memory was previously populated, unless it was already "{}"
        if (newLongMemoryString === '{}' && currentMemory && currentMemory !== '{}') {
            console.info(`[LongMemory ${chatId}] Анализ вернул пустую память, сохраняем предыдущее значение: ${currentMemory}`);
            // Still update timestamp to avoid immediate re-analysis after interval
            userData.lastLongMemoryUpdate = now;
            saveUserData(chatId, userData);
            return;
        }


        // Update only if the memory content has actually changed
        if (newLongMemoryString !== currentMemory) {
            userData.longMemory = newLongMemoryString;
            userData.lastLongMemoryUpdate = now; // Update timestamp only on successful change
            saveUserData(chatId, userData);
            console.info(`[LongMemory ${chatId}] Долговременная память успешно обновлена: ${newLongMemoryString}`);
        } else {
            // If memory hasn't changed, still update the timestamp to respect the update interval
            userData.lastLongMemoryUpdate = now;
            saveUserData(chatId, userData);
            console.info(`[LongMemory ${chatId}] Содержимое долговременной памяти не изменилось, обновлен только timestamp.`);
        }

    } catch (error) {
        // Log detailed error information
        const errorDetails = error.response ? JSON.stringify(error.response.data) : error.message;
        console.error(`[LongMemory ${chatId}] Ошибка API при обновлении долговременной памяти: ${errorDetails}`);
        // Do not update timestamp on failure, allow retry sooner based on interval.
    }
}


// --- Main OpenAI Call ---
async function callOpenAI(chatId, userMessageContent) {
    // --- Pre-checks ---
    if (!validateChatId(chatId)) {
        console.error(`Некорректный chat ID предоставлен в callOpenAI: ${chatId}`);
        throw new Error('Некорректный chat ID'); // Fail early
    }
    if (!openaiApiKey) {
        console.error("Ключ OpenAI API не установлен!");
        throw new Error("Ключ OpenAI API не настроен."); // Fail early
    }
     if (!systemMessage) {
        console.error("Системное сообщение не установлено!");
        throw new Error("Системное сообщение не настроено."); // Fail early
    }


    // 1. Rate Limiting
    const rateLimit = getRateLimit(chatId);
    if (!rateLimit.canProceed) {
        console.warn(`Превышен лимит запросов для чата ${chatId}`);
        // Provide a user-friendly error message
        throw new Error('Превышен лимит запросов. Пожалуйста, подождите немного перед отправкой новых сообщений.');
    }

    // 2. Load User Data (for long memory)
    const userData = loadUserData(chatId);
    const longMemory = userData.longMemory || ''; // Use empty string if no memory

    // 3. Sanitize incoming message content defensively
     const sanitizedContent = userMessageContent.map(content => {
        const newContent = { ...content }; // Clone content to avoid modifying original
        if (newContent.text) {
            newContent.text = sanitizeString(newContent.text);
        }
        // Basic URL validation - allow data URIs, validate http/https
        if (newContent.image_url && !newContent.image_url.startsWith('data:image/')) {
             try {
                 const parsedUrl = new URL(newContent.image_url);
                 if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
                     throw new Error('Invalid protocol');
                 }
                 newContent.image_url = parsedUrl.toString();
             } catch {
                 console.warn(`Некорректный формат URL изображения проигнорирован для чата ${chatId}: ${newContent.image_url}`);
                 delete newContent.image_url;
             }
        }
         if (newContent.audio_url) { // Assuming audio URLs are always http/https
             try {
                 const parsedUrl = new URL(newContent.audio_url);
                  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
                     throw new Error('Invalid protocol');
                 }
                 newContent.audio_url = parsedUrl.toString();
             } catch {
                 console.warn(`Некорректный формат URL аудио проигнорирован для чата ${chatId}: ${newContent.audio_url}`);
                 delete newContent.audio_url;
             }
         }
         // Filter out content parts that became invalid (e.g., bad URLs) or empty text
         if (newContent.text && newContent.text.trim() === '') delete newContent.text;
         return newContent.image_url || newContent.audio_url || newContent.text ? newContent : null;
    }).filter(Boolean); // Remove null entries resulting from invalid content parts

    // If all content parts were invalid/empty after sanitization, don't proceed
    if (sanitizedContent.length === 0) {
        console.log(`Содержимое сообщения пользователя стало пустым после очистки для чата ${chatId}.`);
        throw new Error("Содержимое вашего сообщения некорректно или пусто после обработки.");
    }


    // 4. Construct the user message for the API call, adding context
    const currentTimestamp = new Date().toISOString();
    const userMessageForApi = {
        role: 'user',
        content: [
            ...sanitizedContent,
            // Add context implicitly for the model
            { type: 'input_text', text: `Текущее время: ${currentTimestamp}` },
             // Only add long memory context if it's not empty or just '{}'
            ...(longMemory && longMemory !== '{}' ? [{ type: 'input_text', text: `Контекст пользователя (Долговременная память): ${longMemory}` }] : []),
            // { type: 'input_text', text: `Internal chatId: ${chatId}` } // Keep commented unless needed for debugging
        ]
    };

    // 5. Log the *original* user message to the history file *before* the API call
    // This ensures the log reflects exactly what the user sent.
    logChat(chatId, { role: 'user', content: userMessageContent }, 'user');


    // 6. Load historical messages from the file (now handles both formats)
    const conversationHistory = loadChatHistoryFromFile(chatId);

    // 7. Trigger Long Memory Update (asynchronously, don't wait for it)
    // Update is now called without passing text, it reads from the log file itself
    updateLongMemory(chatId).catch(err => {
        // Log background errors, but don't let them block the main flow
        console.error(`Фоновое обновление долговременной памяти не удалось для чата ${chatId}:`, err);
    });


    // 8. Prepare the full input for the API
    // Use a deep copy of systemMessage if modifications are needed per-call
    let currentSystemMessage = JSON.parse(JSON.stringify(systemMessage));

    const apiInput = [
        currentSystemMessage,   // The system prompt
        ...conversationHistory, // Historical messages loaded from file
        userMessageForApi       // The current user message with added context
    ];

    // 9. Construct the API Payload
    const payload = {
        model: 'gpt-4o-mini', // Or your preferred model like 'gpt-4o'
        input: apiInput,
        text: { format: { type: 'text' } }, // Expect standard text response
        reasoning: {}, // Optional: include if you want reasoning steps from the model
        tools: [ // Optional: include tools like web search if needed by the assistant's capabilities
            {
                type: 'web_search_preview',
                user_location: { type: 'approximate', country: 'RU' }, // Example location context for search
                search_context_size: 'medium' // Control search result detail
            }
        ],
        temperature: 1, // Controls randomness (1 is creative, lower is more deterministic)
        max_output_tokens: 2048, // Max length of the response
        top_p: 1, // Nucleus sampling parameter
        store: true // Optional: store interaction details with OpenAI for debugging/analysis
    };

    console.info(`[API Call ${chatId}] Отправка запроса в OpenAI. Длина истории (из файла): ${conversationHistory.length}, Всего сообщений в input: ${apiInput.length}`);

    // 10. Call the OpenAI API
    try {
        const response = await axios.post(
            'https://api.openai.com/v1/responses', // Ensure endpoint is correct
            payload,
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${openaiApiKey}`,
                },
                timeout: 45 * 1000, // Increased timeout for potentially longer responses
                maxContentLength: 50 * 1024 * 1024, // Limit response download size
                validateStatus: status => status === 200 // Expect HTTP 200 OK
            }
        );

        // 11. Process the response
        if (!response.data || !Array.isArray(response.data.output)) {
            console.error(`Некорректная структура ответа API для чата ${chatId}:`, response.data);
            throw new Error('Некорректная структура ответа от OpenAI.');
        }

        // Find the primary message output from the potentially multi-part response
        const messageOutput = response.data.output.find(output => output.type === 'message');
        // Extract the text content, preferring 'output_text' if available
        const assistantText = messageOutput?.content?.find(c => c.type === 'output_text')?.text ||
                             messageOutput?.content?.find(c => c.type === 'text')?.text;

        if (typeof assistantText !== 'string' || assistantText.trim() === '') {
            console.error(`Не найдено корректное или непустое сообщение в ответе OpenAI для чата ${chatId}:`, response.data.output);
            throw new Error('Получен пустой или некорректный ответ от ассистента.');
        }

        // Sanitize the assistant's response before logging or sending
        const sanitizedAssistantText = sanitizeString(assistantText);

        // 12. Log the assistant's response to the history file (using the new 'content' format)
        logChat(chatId, {
            role: 'assistant',
            // Store the response in the standard content format
            content: [{ type: 'output_text', text: sanitizedAssistantText }]
        }, 'assistant');

        console.info(`[API Call ${chatId}] Успешно получен и записан ответ.`);
        return sanitizedAssistantText; // Return the processed response text

    } catch (error) {
        // Log detailed error information for debugging
        const errorStatus = error.response?.status;
        const errorData = error.response?.data;
        console.error(`Ошибка вызова OpenAI API для чата ${chatId}: Status=${errorStatus}, Data=${JSON.stringify(errorData)}, Message=${error.message}`);

        // Log the specific error to the chat log file
        logChat(chatId, {
            error: 'openai_api_error',
            message: error.message,
            status: errorStatus,
            data: errorData, // Log response data if available
            timestamp: new Date().toISOString()
        }, 'error');

        // Provide a user-friendly error message without exposing internal details
        const safeErrorMessage = 'К сожалению, произошла ошибка при обработке вашего запроса. Пожалуйста, повторите попытку позже или попробуйте перезапустить бота командой /start.';
        // Re-throw a generic error for the calling function (e.g., bot message handler)
        throw new Error(safeErrorMessage);
    }
}

// --- Audio Transcription ---
async function transcribeAudio(audioUrlOrPath, language = 'ru') { // Default language Russian
    if (!openaiApiKey) {
        throw new Error('Ключ OpenAI API не установлен для транскрипции.');
    }

    const formData = new FormData();

    try {
        // Handle URL input
        if (audioUrlOrPath.startsWith('http://') || audioUrlOrPath.startsWith('https://')) {
             console.info(`[Transcribe ${language}] Транскрибация аудио из URL: ${audioUrlOrPath}`);
             // Download the audio stream
            const audioResponse = await axios.get(audioUrlOrPath, {
                responseType: 'stream',
                timeout: 20000 // 20 seconds timeout for download
            });
            // Append the stream to FormData. Provide a filename hint if possible, otherwise generic.
            formData.append('file', audioResponse.data, 'audio_from_url.mp3'); // Hint filename
        }
        // Handle local file path input
        else {
             console.info(`[Transcribe ${language}] Транскрибация аудио из пути: ${audioUrlOrPath}`);
            if (!fs.existsSync(audioUrlOrPath)) {
                throw new Error(`Аудиофайл не существует по пути: ${audioUrlOrPath}`);
            }
            // Create a read stream and append it
            formData.append('file', fs.createReadStream(audioUrlOrPath));
        }

        // Add other required parameters
        formData.append('model', 'whisper-1'); // Specify the Whisper model
        if (language) {
            formData.append('language', language); // Specify language if provided
        }
        formData.append('response_format', 'text'); // Request plain text response for simplicity

        // Make the API call to OpenAI Transcriptions endpoint
        const response = await axios.post(
            'https://api.openai.com/v1/audio/transcriptions',
            formData,
            {
                headers: {
                    // Let axios set the correct Content-Type for FormData
                    ...formData.getHeaders(),
                    'Authorization': `Bearer ${openaiApiKey}`
                },
                timeout: 60 * 1000 // 60 seconds timeout for the transcription process itself
            }
        );

        // Validate the response format (expecting plain text)
        if (typeof response.data !== 'string') {
             console.error("Некорректный формат ответа от Whisper API:", response.data);
            throw new Error('Некорректный формат ответа получен от Whisper API.');
        }


        const transcribedText = sanitizeString(response.data); // Sanitize the transcribed text
        console.info(`[Transcribe ${language}] Аудио успешно транскрибировано. Длина: ${transcribedText.length}`);
        return transcribedText;

    } catch (error) {
        // Log detailed error and throw a user-friendly one
        const errorDetails = error.response ? JSON.stringify(error.response.data) : error.message;
        console.error(`Ошибка транскрибации аудио: ${errorDetails}`);
        // Include restart suggestion in the error message
        throw new Error('Не удалось расшифровать аудио. Убедитесь, что звук четкий, формат поддерживается (MP3, WAV, M4A, OGG) и запись не слишком длинная. Вы также можете попробовать перезапустить бота командой /start.');
    }
}


module.exports = {
    setSystemMessage,
    setOpenAIKey,
    callOpenAI,
    transcribeAudio,
    // clearConversation is no longer needed as history is file-based
    updateLongMemory // Exported in case explicit triggering is needed elsewhere
};
