// Загружаем переменные окружения из .env файла
require('dotenv').config();

const { google } = require('googleapis');
const youtube = google.youtube('v3');
const fs = require('fs');
const fsPromises = fs.promises;
const path = require('path');
const http = require('http');

// --- Конфигурация ---
// Получаем ключ API из переменных окружения (.env файл)
const API_KEY = process.env.YOUTUBE_API_KEY;
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
// GOOGLE_APPLICATION_CREDENTIALS должен быть установлен в .env или системных переменных
// например: GOOGLE_APPLICATION_CREDENTIALS=/workspaces/allcodespaces/youtube/mycity2_key.json

// --- Новые конфигурации для чтения ключевых слов из таблицы ---
const KEYWORDS_SHEET_NAME = process.env.KEYWORDS_SHEET_NAME || 'Keywords'; // Название листа с ключевыми словами
const KEYWORDS_COLUMN_INDEX = parseInt(process.env.KEYWORDS_COLUMN_INDEX) || 0; // 0-based индекс колонки с ключевиками (A=0)
const STATUS_COLUMN_INDEX = parseInt(process.env.STATUS_COLUMN_INDEX) || 1; // 0-based индекс колонки для статуса (B=1)
const PROCESSED_STATUS_TEXT = "Processed";
const ERROR_STATUS_TEXT = "Error";
const PROCESSING_STATUS_TEXT = "Processing...";

// --- Новые конфигурации для периодического запуска и паузы по квоте ---
const PROCESSING_INTERVAL_MINUTES = parseInt(process.env.PROCESSING_INTERVAL_MINUTES) || 15;
const QUOTA_PAUSE_HOURS = parseInt(process.env.QUOTA_PAUSE_HOURS) || 24;
let quotaPauseUntil = 0; // Timestamp until which processing is paused due to quota
let sheetsClient; // Глобальный клиент для Google Sheets

// --- Конфигурация для лог сервера ---
const LOG_DIRECTORY = process.env.LOG_DIRECTORY || 'script_logs';
const LOG_SERVER_PORT = parseInt(process.env.LOG_SERVER_PORT) || 5565;
let LATEST_LOG_FILE_PATH = ""; // Будет обновляться
const GLOBALLY_PROCESSED_CHANNELS_FILE = 'globally_processed_channels.txt';
let globallyProcessedChannelUrls = new Set();

// Поисковый запрос - ТЕПЕРЬ БУДЕТ БРАТЬСЯ ИЗ ТАБЛИЦЫ
// const SEARCH_QUERY = process.env.SEARCH_QUERY || 'инвестиции'; // Удаляем или комментируем

// Максимальное количество каналов для анализа
const MAX_CHANNELS_TO_PROCESS = parseInt(process.env.MAX_CHANNELS_TO_PROCESS) || 500;

// Максимальное количество результатов на одной странице поиска (макс. 50)
const MAX_RESULTS_PER_PAGE = parseInt(process.env.MAX_RESULTS_PER_PAGE) || 50;

// Фильтр по языку канала
const TARGET_LANGUAGE = process.env.TARGET_LANGUAGE || 'ru'; // Например, 'ru' для русскогомума

// Фильтры по количеству подписчиков
const MIN_SUBSCRIBER_COUNT = parseInt(process.env.MIN_SUBSCRIBER_COUNT) || 0; // 0 - нет минимума
const MAX_SUBSCRIBER_COUNT = parseInt(process.env.MAX_SUBSCRIBER_COUNT) || Infinity; // Infinity - нет максимума

// Фильтр по возрасту видео (в днях)
const MAX_VIDEO_AGE_DAYS = parseInt(process.env.MAX_VIDEO_AGE_DAYS) || 0; // 0 - не проверять

// Фильтр по минимальной длительности видео (в минутах)
const MIN_VIDEO_DURATION_MINUTES = parseInt(process.env.MIN_VIDEO_DURATION_MINUTES) || 0; // 0 - не проверять

// Конфигурация для фильтрации шортс
const SHORTS_THRESHOLD = parseFloat(process.env.SHORTS_THRESHOLD) || 0.7; // Если более 70% последних видео - шортс
const VIDEOS_TO_CHECK_FOR_FILTERS = parseInt(process.env.VIDEOS_TO_CHECK_FOR_FILTERS) || 10; // Количество последних видео для проверки

// --- Новая переменная для пропуска анализа видео ---
const SKIP_VIDEO_ANALYSIS = process.env.SKIP_VIDEO_ANALYSIS === 'false' ? false : true;
// --- Конец новой переменной ---

// --- Новые переменные для WhatsApp ---
const EXTRACT_WHATSAPP_NUMBERS = process.env.EXTRACT_WHATSAPP_NUMBERS === 'true';
const WHATSAPP_COLUMN_NAME = process.env.WHATSAPP_COLUMN_NAME || "Телефон";
// --- Конец новых переменных для WhatsApp ---

// Файл для хранения ID уже проанализированных каналов - ТЕПЕРЬ БУДЕТ ДИНАМИЧЕСКИМ
// const ANALYZED_CHANNELS_FILE = 'analysed.txt'; // Удаляем или комментируем эту строку
let previouslyAnalyzedChannelIds = new Set();

// Регулярное выражение для поиска ссылок Telegram
const TELEGRAM_REGEX = /(https?:\/\/)?(t(elegram)?\.me)\/([a-zA-Z0-9_]{5,}|joinchat\/[a-zA-Z0-9_=-]+)/gi;

// Регулярное выражение для поиска номеров WhatsApp/телефонов
// Учитывает различные префиксы и форматы номеров
const WHATSAPP_REGEX = /([+]\d{1,3}(?:[-\s()]?\d){8,11})/gi;


// Define SHEET_HEADERS_BASE, conditionally including the phone column directly after 'Телеграм'
const SHEET_HEADERS_BASE = [
    'Название канала', 'Ссылка канала', 'Количество подписчиков', 'About', 
    'Телеграм',
    ...(EXTRACT_WHATSAPP_NUMBERS ? [WHATSAPP_COLUMN_NAME] : [])
];

const SHEET_HEADERS_SUFFIX = [
    'Дата добавления', '% шортсов в 10 видео', 'Частота видео', 'Сред. продолж. видео', 'Статус'
];

// Combine the definitive SHEET_HEADERS_BASE (which now includes phone if enabled) 
// with SHEET_HEADERS_SUFFIX to form the final list of headers.
const SHEET_HEADERS = SHEET_HEADERS_BASE.concat(SHEET_HEADERS_SUFFIX);

// Новая функция для генерации имени файла analysed.txt на основе запроса
function getAnalyzedChannelsFilePath(query) {
    // Простое преобразование: нижний регистр, замена пробелов на подчеркивания, удаление не-буквенно-цифровых символов (кроме _)
    const sanitizedQuery = query.toLowerCase();
    return `analysed_${sanitizedQuery || 'default'}.txt`;
}

function extractTelegramLinks(text) {
    if (!text) return [];
    const matches = text.match(TELEGRAM_REGEX);
    return matches ? [...new Set(matches)] : [];
}

function extractWhatsAppNumbers(text) {
    if (!text || !EXTRACT_WHATSAPP_NUMBERS) return [];
    const matches = [];
    let match;
    while ((match = WHATSAPP_REGEX.exec(text)) !== null) {
        // match[1] содержит сам номер телефона
        if (match[1]) {
            matches.push(match[1].replace(/[\s()-]/g, '')); // Очищаем номер от лишних символов
        }
    }
    return matches ? [...new Set(matches)] : [];
}

// Helper to parse ISO 8601 duration string to seconds
function parseISO8601Duration(isoDuration) {
    if (!isoDuration) return 0;
    const regex = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/;
    const matches = isoDuration.match(regex);
    if (!matches) return 0;
    const hours = parseInt(matches[1] || 0);
    const minutes = parseInt(matches[2] || 0);
    const seconds = parseInt(matches[3] || 0);
    return (hours * 3600) + (minutes * 60) + seconds;
}

async function getSheetsClient() {
    const auth = new google.auth.GoogleAuth({
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const client = await auth.getClient();
    return google.sheets({ version: 'v4', auth: client });
}

async function ensureSheetExists(sheets, spreadsheetId, sheetTitle, currentSheetHeaders) {
    try {
        const getSpreadsheetResponse = await sheets.spreadsheets.get({
            spreadsheetId,
            fields: 'sheets.properties(title,sheetId,index)', // Fetch index as well
        });
        const allSheetsProperties = getSpreadsheetResponse.data.sheets.map(s => s.properties);
        const existingSheet = allSheetsProperties.find(
            s => s.title === sheetTitle
        );

        if (!existingSheet) {
            let targetIndex = 1; // Default to position 1 (second sheet)
            const keywordsSheetInfo = allSheetsProperties.find(s => s.title === KEYWORDS_SHEET_NAME);
            
            if (keywordsSheetInfo && typeof keywordsSheetInfo.index === 'number') {
                targetIndex = keywordsSheetInfo.index + 1;
            } else {
                if (!keywordsSheetInfo) {
                    console.warn(`[ensureSheetExists] Keywords sheet "${KEYWORDS_SHEET_NAME}" not found. Adding new sheet "${sheetTitle}" at default index ${targetIndex}.`);
                } else {
                    console.warn(`[ensureSheetExists] Keywords sheet "${KEYWORDS_SHEET_NAME}" found but its index is invalid. Adding new sheet "${sheetTitle}" at default index ${targetIndex}.`);
                }
            }

            await sheets.spreadsheets.batchUpdate({
                spreadsheetId,
                requestBody: {
                    requests: [{ addSheet: { properties: { title: sheetTitle, index: targetIndex } } }], // Set index
                },
            });
            console.log(`Лист "${sheetTitle}" создан на позиции ${targetIndex}.`);
            // Add headers to the new sheet
            await sheets.spreadsheets.values.append({
                spreadsheetId,
                range: `${sheetTitle}!A1`,
                valueInputOption: 'USER_ENTERED',
                requestBody: { values: [currentSheetHeaders] },
            });
            console.log(`Заголовки добавлены в лист "${sheetTitle}".`);
        } else {
            // Check if headers exist
            // Определяем диапазон заголовков динамически
            const lastColumnLetter = String.fromCharCode(64 + currentSheetHeaders.length); // 65 is 'A'
            const headerRange = `${sheetTitle}!A1:${lastColumnLetter}1`;

            const headerResponse = await sheets.spreadsheets.values.get({
                spreadsheetId,
                range: headerRange, 
            });
            if (!headerResponse.data.values || headerResponse.data.values.length === 0) {
                await sheets.spreadsheets.values.update({ // Use update instead of append if sheet exists but headers are missing
                    spreadsheetId,
                    range: `${sheetTitle}!A1`,
                    valueInputOption: 'USER_ENTERED',
                    requestBody: { values: [currentSheetHeaders] },
                });
                console.log(`Заголовки добавлены в существующий пустой лист "${sheetTitle}".`);
            } else {
                console.log(`Лист "${sheetTitle}" уже существует с заголовками.`);
            }
        }
    } catch (error) {
        console.error(`Ошибка при проверке/создании листа "${sheetTitle}":`, error.message);
        throw error; // Re-throw to stop execution if sheet setup fails
    }
}

async function appendDataToSheet(sheets, spreadsheetId, sheetTitle, dataRow) {
    try {
        await sheets.spreadsheets.values.append({ // <<< OR SET BREAKPOINT HERE
            spreadsheetId,
            range: `${sheetTitle}!A:A`, // Append to the first column to find the next empty row
            valueInputOption: 'USER_ENTERED',
            insertDataOption: 'INSERT_ROWS',
            requestBody: {
                values: [dataRow],
            },
        });
    } catch (error) {
        console.error(`Ошибка при добавлении данных в лист "${sheetTitle}":`, error.message);
        // Decide if you want to throw or just log
    }
}

async function checkChannelVideosCriteria(channelId) {
    let estimatedQuotaUsed = 0;
    let isLikelyShortsChannel = false;
    let meetsVideoAgeCriteria = MAX_VIDEO_AGE_DAYS <= 0;
    let meetsVideoDurationCriteria = MIN_VIDEO_DURATION_MINUTES <= 0;
    let shortsPercentage = 0;
    let latestVideoTimestamp = null;
    let oldestVideoTimestamp = null;
    let videosCheckedCount = 0;
    let averageDurationMinutes = 0;
    let videoFrequencyStr = 'Н/Д';

    try {
        const searchResponse = await youtube.search.list({
            key: API_KEY,
            part: 'snippet',
            channelId: channelId,
            order: 'date',
            type: 'video',
            maxResults: VIDEOS_TO_CHECK_FOR_FILTERS
        });
        estimatedQuotaUsed += 100;
        const videos = searchResponse.data.items || [];
        videosCheckedCount = videos.length;

        if (videos.length === 0) {
            return { 
                isLikelyShortsChannel: false, 
                meetsVideoAgeCriteria: MAX_VIDEO_AGE_DAYS <= 0,
                meetsVideoDurationCriteria: MIN_VIDEO_DURATION_MINUTES <= 0,
                estimatedQuotaUsed,
                shortsPercentage: 0,
                latestVideoTimestamp: null,
                oldestVideoTimestamp: null,
                videosCheckedCount: 0,
                averageDurationMinutes: 0,
                videoFrequencyStr: 'Н/Д'
            };
        }

        let shortsCount = 0;
        const videoIds = [];
        const videoTimestamps = [];
        const ageThresholdDate = new Date();
        if (MAX_VIDEO_AGE_DAYS > 0) {
            ageThresholdDate.setDate(ageThresholdDate.getDate() - MAX_VIDEO_AGE_DAYS);
        }

        videos.forEach(video => {
            videoIds.push(video.id.videoId);
            const publishedAt = new Date(video.snippet.publishedAt);
            videoTimestamps.push(publishedAt.getTime());

            const title = video.snippet.title.toLowerCase();
            const description = video.snippet.description.toLowerCase();
            if (title.includes('#shorts') || description.includes('#shorts')) {
                shortsCount++;
            }
            if (MAX_VIDEO_AGE_DAYS > 0 && publishedAt > ageThresholdDate) {
                meetsVideoAgeCriteria = true;
            }
        });
        
        if (videoTimestamps.length > 0) {
            latestVideoTimestamp = Math.max(...videoTimestamps);
            oldestVideoTimestamp = Math.min(...videoTimestamps);
        }

        shortsPercentage = videos.length > 0 ? (shortsCount / videos.length) : 0;
        isLikelyShortsChannel = shortsPercentage >= SHORTS_THRESHOLD;

        // Calculate video frequency string
        if (oldestVideoTimestamp && latestVideoTimestamp && videosCheckedCount > 1) {
            const diffTime = Math.abs(latestVideoTimestamp - oldestVideoTimestamp);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            videoFrequencyStr = `${videosCheckedCount} видео за ~${diffDays} дн.`;
        } else if (videosCheckedCount === 1 && latestVideoTimestamp) {
            videoFrequencyStr = `1 видео`;
        }


        // Fetch video details for duration checks and average duration calculation
        if (videoIds.length > 0) {
            const videoDetailsResponse = await youtube.videos.list({
                key: API_KEY,
                part: 'contentDetails',
                id: videoIds.join(','),
                maxResults: videoIds.length
            });
            estimatedQuotaUsed += 1; // videos.list costs 1 unit

            let totalDurationSeconds = 0;
            let validVideosForAvgDuration = 0;

            for (const videoDetail of videoDetailsResponse.data.items || []) {
                const durationInSeconds = parseISO8601Duration(videoDetail.contentDetails?.duration);
                if (durationInSeconds > 0) {
                    totalDurationSeconds += durationInSeconds;
                    validVideosForAvgDuration++;
                }
                if (MIN_VIDEO_DURATION_MINUTES > 0 && durationInSeconds >= MIN_VIDEO_DURATION_MINUTES * 60) {
                    meetsVideoDurationCriteria = true; 
                    // No break here if we still need to calculate average duration for all videos
                }
            }
            if (validVideosForAvgDuration > 0) {
                averageDurationMinutes = parseFloat((totalDurationSeconds / validVideosForAvgDuration / 60).toFixed(1));
            }
            // If MIN_VIDEO_DURATION_MINUTES is 0, meetsVideoDurationCriteria is already true or will be set true later
        }
        
        if (MIN_VIDEO_DURATION_MINUTES <= 0) {
            meetsVideoDurationCriteria = true;
        }
        
    } catch (error) {
        console.error(`Ошибка при проверке видео критериев для канала ${channelId}:`, error.message);
        return { 
            isLikelyShortsChannel: true, meetsVideoAgeCriteria: false, meetsVideoDurationCriteria: false, 
            estimatedQuotaUsed, shortsPercentage: 0, latestVideoTimestamp: null, oldestVideoTimestamp: null, videosCheckedCount: 0,
            averageDurationMinutes: 0, videoFrequencyStr: 'Н/Д'
        };
    }
    
    return { 
        isLikelyShortsChannel, meetsVideoAgeCriteria, meetsVideoDurationCriteria, 
        estimatedQuotaUsed, shortsPercentage, latestVideoTimestamp, oldestVideoTimestamp, videosCheckedCount,
        averageDurationMinutes, videoFrequencyStr
    };
}

// Добавляем конфигурацию для языкового фильтра
async function isTargetLanguageChannel(channel) {
    const title = channel.snippet.title || '';
    const description = channel.snippet.description || '';
    const defaultLanguage = channel.snippet.defaultLanguage;
    
    if (defaultLanguage && defaultLanguage.toLowerCase().startsWith(TARGET_LANGUAGE.toLowerCase())) {
        return true;
    }
    // Расширенная проверка для русского языка по кириллице, если TARGET_LANGUAGE='ru'
    if (TARGET_LANGUAGE.toLowerCase() === 'ru') {
        const cyrillicPattern = /[\u0400-\u04FF]/;
        return cyrillicPattern.test(title) || cyrillicPattern.test(description);
    }
    // Для других языков можно добавить более специфичные проверки или полагаться на defaultLanguage
    return (title + description).toLowerCase().includes(TARGET_LANGUAGE.toLowerCase()); // Простая проверка по ключевому слову языка
}

function loadPreviouslyAnalyzedIds(filePath) {
    previouslyAnalyzedChannelIds.clear(); // Сбрасываем для нового ключевого слова
    if (fs.existsSync(filePath)) {
        const data = fs.readFileSync(filePath, 'utf8');
        const ids = data.split('\n').filter(id => id.trim() !== '');
        previouslyAnalyzedChannelIds = new Set(ids);
        console.log(`Загружено ${previouslyAnalyzedChannelIds.size} ID ранее проанализированных каналов из ${filePath} для текущего запроса.`);
    } else {
        console.log(`Файл ${filePath} не найден. Список ранее проанализированных каналов для текущего запроса пуст.`);
    }
}

function saveAnalyzedChannelId(channelId, filePath) {
    if (!previouslyAnalyzedChannelIds.has(channelId)) {
        fs.appendFileSync(filePath, channelId + '\n');
        previouslyAnalyzedChannelIds.add(channelId);
    }
}

async function isDuplicateInSheet(sheets, spreadsheetId, sheetTitle, channelUrl) {
    try {
        // Определяем количество заголовков, чтобы знать, где искать URL канала (предполагаем, что это вторая колонка 'B')
        const currentSheetHeaders = SHEET_HEADERS; // Replaced getSheetHeaders()
        const channelUrlColumnIndex = currentSheetHeaders.findIndex(header => header === 'Ссылка канала');
        if (channelUrlColumnIndex === -1) {
            console.warn("Не удалось определить колонку для URL канала в заголовках. Проверка на дубликаты может быть неточной.");
            return false; // Не можем проверить, считаем не дубликатом
        }
        const channelUrlColumnLetter = String.fromCharCode(65 + channelUrlColumnIndex); // A=0, B=1, etc.

        const response = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: `${sheetTitle}!${channelUrlColumnLetter}:${channelUrlColumnLetter}`,
        });
        const existingUrls = response.data.values?.flat() || [];
        return existingUrls.includes(channelUrl);
    } catch (error) {
        // Если ошибка связана с тем, что лист еще не существует или пуст (например, error.code === 400, "Unable to parse range")
        if (error.code === 400 && error.message.includes("Unable to parse range")) {
             console.log(`Лист "${sheetTitle}" вероятно пуст или колонка URL не найдена, дубликатов нет.`);
             return false;
        }
        console.error(`Ошибка при проверке дубликатов в листе "${sheetTitle}":`, error.message);
        return false; 
    }
}

// --- Новые функции для работы с ключевыми словами ---
async function getKeywordsToProcess(sheets, spreadsheetId, sheetName, keywordColIdx, statusColIdx) {
    const keywords = [];
    try {
        // Пытаемся получить данные со всего листа, чтобы определить последнюю строку
        const range = `${sheetName}!${String.fromCharCode(65 + keywordColIdx)}:${String.fromCharCode(65 + statusColIdx)}`;
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: range, // Читаем колонку с ключевиками и статусами
        });
        if (response.data.values) {
            response.data.values.forEach((row, index) => {
                const keyword = row[0]; // keywordColIdx относительно начала range, т.е. 0
                const status = row.length > (statusColIdx - keywordColIdx) ? row[statusColIdx - keywordColIdx] : ""; // statusColIdx относительно начала range
                if (keyword && keyword.trim() !== "") {
                    keywords.push({
                        text: keyword.trim(),
                        rowIndex: index + 1, // 1-based for sheet API
                        status: status ? status.trim() : ""
                    });
                }
            });
        }
    } catch (error) {
        console.error(`Ошибка при получении ключевых слов из листа "${sheetName}":`, error.message);
        // Если лист "Keywords" не существует, это критическая ошибка
        if (error.message.includes("Unable to parse range") || error.message.includes("Not Found")) {
            console.error(`Лист "${sheetName}" не найден или пуст. Убедитесь, что он существует и содержит ключевые слова.`);
            throw new Error(`Лист "${sheetName}" не найден. Пожалуйста, создайте его и добавьте ключевые слова.`);
        }
    }
    return keywords;
}

async function updateKeywordStatus(sheets, spreadsheetId, sheetName, rowIndex, statusColIdx, statusText) {
    try {
        const range = `${sheetName}!${String.fromCharCode(65 + statusColIdx)}${rowIndex}`;
        await sheets.spreadsheets.values.update({
            spreadsheetId,
            range,
            valueInputOption: 'USER_ENTERED',
            requestBody: {
                values: [[statusText]],
            },
        });
        console.log(`Статус для ключевого слова в строке ${rowIndex} обновлен на "${statusText}".`);
    } catch (error) {
        console.error(`Ошибка при обновлении статуса ключевого слова в строке ${rowIndex}:`, error.message);
    }
}
// --- Конец новых функций для работы с ключевыми словами ---

// Основная функция обработки одного ключевого слова
async function processSingleKeyword(searchQuery, currentSheetsClient, globalLogWriteStream, allProcessedChannelUrlsInThisRun) {
    // Используем currentSheetsClient, переданный из findChannelsAndProcessKeywords
    const currentSheetHeaders = SHEET_HEADERS;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const sanitizedQueryForFilename = searchQuery.toLowerCase().replace(/\s+/g, '_').replace(/[^\w-]+/g, '');
    const logFileName = `youtube_channels_${sanitizedQueryForFilename}_${timestamp}.txt`;
    const logFilePath = path.join(LOG_DIRECTORY, logFileName);
    LATEST_LOG_FILE_PATH = logFilePath; // Обновляем путь к последнему лог файлу

    // Локальная функция логирования для текущего ключевого слова
    const writeLog = (text) => {
        const message = `[${new Date().toISOString()}] ${text}`;
        console.log(message); // Также выводим в консоль
        if (globalLogWriteStream) {
            globalLogWriteStream.write(message + '\n');
        }
        fs.appendFileSync(logFilePath, message + '\n');
    };

    writeLog(`--- Начало обработки ключевого слова: "${searchQuery}" ---`);
    const currentAnalyzedChannelsFile = getAnalyzedChannelsFilePath(searchQuery);
    writeLog(`Используемый файл для ID проанализированных каналов (для этого запроса): ${currentAnalyzedChannelsFile}`);
    loadPreviouslyAnalyzedIds(currentAnalyzedChannelsFile); // Загружаем ID, проанализированные ранее ИМЕННО ДЛЯ ЭТОГО КЛЮЧЕВОГО СЛОВА

    writeLog(`Конфигурация SKIP_VIDEO_ANALYSIS: ${SKIP_VIDEO_ANALYSIS}`);
    // ... (можно добавить больше логов конфигурации по необходимости)

    const sheetTitle = searchQuery.trim() || 'YouTube Channels (Default)';
    if (SPREADSHEET_ID && currentSheetsClient) {
        try {
            await ensureSheetExists(currentSheetsClient, SPREADSHEET_ID, sheetTitle, currentSheetHeaders);
            writeLog(`Данные для "${searchQuery}" будут сохранены в Google Sheet: ID ${SPREADSHEET_ID}, Лист: "${sheetTitle}"`);
        } catch (e) {
            writeLog(`Не удалось инициализировать лист "${sheetTitle}": ${e.message}. Данные не будут сохранены в таблицу для этого ключевого слова.`);
            // Не прерываем выполнение, просто не будем писать в этот лист
        }
    } else {
        writeLog("SPREADSHEET_ID не указан или sheetsClient не инициализирован. Данные не будут сохранены в Google Sheets.");
    }

    writeLog(`Поиск каналов по запросу: "${searchQuery}"...`);
    let nextPageToken = null;
    const newChannelIdsToAnalyzeSet = new Set();
    let totalChannelsFetchedFromSearchAPI = 0;
    let searchApiPagesFetched = 0;
    let estimatedQuotaUsed = 0;
    let channelsWithTelegram = 0;
    let totalChannelsProcessedDetailed = 0;
    let channelsAttemptedVideoAnalysis = 0;

    try {
        let totalResultsFromSearchAPI = 0;
        let searchComplete = false;
        writeLog('Этап 1: Поиск каналов по ключевому слову.');

        while (newChannelIdsToAnalyzeSet.size < MAX_CHANNELS_TO_PROCESS) {
            const searchResponse = await youtube.search.list({
                key: API_KEY,
                part: 'snippet',
                q: searchQuery,
                type: 'channel',
                relevanceLanguage: TARGET_LANGUAGE,
                maxResults: MAX_RESULTS_PER_PAGE,
                pageToken: nextPageToken,
            });
            searchApiPagesFetched++;
            estimatedQuotaUsed += 100;

            const items = searchResponse.data.items || [];
            if (searchApiPagesFetched === 1) {
                totalResultsFromSearchAPI = searchResponse.data.pageInfo?.totalResults || 0;
            }
            totalChannelsFetchedFromSearchAPI += items.length;
            writeLog(`Страница поиска ${searchApiPagesFetched}: получено ${items.length} каналов.`);

            if (items.length === 0) {
                searchComplete = true;
                writeLog('Результаты поиска API исчерпаны.');
                break;
            }

            let newChannelsAddedInThisPage = 0;
            for (const item of items) {
                if (item.snippet?.channelId) {
                    if (!previouslyAnalyzedChannelIds.has(item.snippet.channelId)) {
                        if (newChannelIdsToAnalyzeSet.size < MAX_CHANNELS_TO_PROCESS) {
                            newChannelIdsToAnalyzeSet.add(item.snippet.channelId);
                            newChannelsAddedInThisPage++;
                        } else {
                            break;
                        }
                    }
                }
            }
            writeLog(`Добавлено ${newChannelsAddedInThisPage} новых каналов с этой страницы. Всего новых для анализа: ${newChannelIdsToAnalyzeSet.size}`);

            nextPageToken = searchResponse.data.nextPageToken;
            if (!nextPageToken) {
                searchComplete = true;
                writeLog('Достигнут конец результатов поиска API.');
                break;
            }
            if (newChannelIdsToAnalyzeSet.size >= MAX_CHANNELS_TO_PROCESS) {
                writeLog(`Собрано достаточно (${newChannelIdsToAnalyzeSet.size}) новых каналов для анализа.`);
                break;
            }
            await new Promise(resolve => setTimeout(resolve, 200)); // Увеличена задержка
        }
        writeLog(`\n=== Статус этапа 1 (Поиск каналов для "${searchQuery}") ===`);
        writeLog(`Всего найдено каналов API поиска: ${totalResultsFromSearchAPI} (просмотрено ${totalChannelsFetchedFromSearchAPI} на ${searchApiPagesFetched} страницах)`);
        writeLog(`Собрано НОВЫХ уникальных ID для детального анализа: ${newChannelIdsToAnalyzeSet.size}`);
        writeLog('======================================\n');

        writeLog('Этап 2: Получение подробной информации и фильтрация каналов.');
        const channelIdsToProcessArray = Array.from(newChannelIdsToAnalyzeSet);
        let processedInThisBatch = 0;

        for (let i = 0; i < channelIdsToProcessArray.length; i += MAX_RESULTS_PER_PAGE) {
            const batchIds = channelIdsToProcessArray.slice(i, i + MAX_RESULTS_PER_PAGE);
            writeLog(`\nЗапрос деталей для ${batchIds.length} каналов (пакет ${Math.floor(i / MAX_RESULTS_PER_PAGE) + 1}/${Math.ceil(channelIdsToProcessArray.length / MAX_RESULTS_PER_PAGE)}).`);

            const channelsResponse = await youtube.channels.list({
                key: API_KEY,
                part: 'snippet,statistics',
                id: batchIds.join(','),
                maxResults: MAX_RESULTS_PER_PAGE
            });
            estimatedQuotaUsed += 1;
            processedInThisBatch = channelsResponse.data.items?.length || 0;
            writeLog(`Получены детали для ${processedInThisBatch} каналов в этом пакете.`);

            for (const channel of channelsResponse.data.items || []) {
                totalChannelsProcessedDetailed++;
                const channelUrl = `https://www.youtube.com/channel/${channel.id}`;

                // Глобальная проверка на дубликат по всем ключевым словам в текущем запуске И ПРЕДЫДУЩИХ ЗАПУСКАХ
                let skipReason = "";
                if (allProcessedChannelUrlsInThisRun.has(channelUrl)) {
                    skipReason = "уже был добавлен в таблицу по другому ключевому слову в этом запуске";
                } else if (globallyProcessedChannelUrls.has(channelUrl)) {
                    skipReason = "уже существует в таблице (из предыдущих запусков или других листов)";
                }

                if (skipReason) {
                    writeLog(`\nКанал ${channel.snippet.title} (URL: ${channelUrl}) ${skipReason}. Пропуск.`);
                    saveAnalyzedChannelId(channel.id, currentAnalyzedChannelsFile); // Все равно помечаем как проанализированный для этого ключа
                    continue;
                }

                if (!await isTargetLanguageChannel(channel)) {
                    writeLog(`\nПропущен канал не на целевом языке (${TARGET_LANGUAGE}): ${channel.snippet.title} (ID: ${channel.id})`);
                    saveAnalyzedChannelId(channel.id, currentAnalyzedChannelsFile);
                    continue;
                }

                const subscriberCount = parseInt(channel.statistics?.subscriberCount || 0);
                if (subscriberCount < MIN_SUBSCRIBER_COUNT || subscriberCount > MAX_SUBSCRIBER_COUNT) {
                    writeLog(`\nПропущен канал по количеству подписчиков (${subscriberCount}): ${channel.snippet.title} (ID: ${channel.id}).`);
                    saveAnalyzedChannelId(channel.id, currentAnalyzedChannelsFile);
                    continue;
                }
                
                let videoCriteria;
                let statusMessage = 'Добавлен';
                let shortsPercStr = 'Н/Д';
                let avgDurationStr = 'Н/Д';

                if (SKIP_VIDEO_ANALYSIS) {
                    writeLog(`\nАнализ видео для канала ${channel.snippet.title} (ID: ${channel.id}) пропущен.`);
                    videoCriteria = {
                        isLikelyShortsChannel: false, meetsVideoAgeCriteria: true, meetsVideoDurationCriteria: true,
                        estimatedQuotaUsed: 0, shortsPercentage: 0, latestVideoTimestamp: null, oldestVideoTimestamp: null,
                        videosCheckedCount: 0, averageDurationMinutes: 0, videoFrequencyStr: 'Н/Д (анализ пропущен)'
                    };
                    statusMessage = 'Добавлен (видео не анализ.)';
                    shortsPercStr = 'Н/Д (пропущено)';
                    avgDurationStr = 'Н/Д (пропущено)';
                } else {
                    channelsAttemptedVideoAnalysis++;
                    videoCriteria = await checkChannelVideosCriteria(channel.id);
                    estimatedQuotaUsed += videoCriteria.estimatedQuotaUsed;

                    if (videoCriteria.isLikelyShortsChannel && SHORTS_THRESHOLD > 0 && SHORTS_THRESHOLD <=1) { 
                        writeLog(`\nПропущен шортс-канал: ${channel.snippet.title} (ID: ${channel.id})`);
                        saveAnalyzedChannelId(channel.id, currentAnalyzedChannelsFile);
                        continue;
                    }
                    if (MAX_VIDEO_AGE_DAYS > 0 && !videoCriteria.meetsVideoAgeCriteria) {
                        writeLog(`\nПропущен канал из-за отсутствия недавних видео: ${channel.snippet.title} (ID: ${channel.id})`);
                        saveAnalyzedChannelId(channel.id, currentAnalyzedChannelsFile);
                        continue;
                    }
                    if (MIN_VIDEO_DURATION_MINUTES > 0 && !videoCriteria.meetsVideoDurationCriteria) {
                        writeLog(`\nПропущен канал из-за отсутствия длинных видео: ${channel.snippet.title} (ID: ${channel.id})`);
                        saveAnalyzedChannelId(channel.id, currentAnalyzedChannelsFile);
                        continue;
                    }
                    shortsPercStr = `${(videoCriteria.shortsPercentage * 100).toFixed(0)}% из ${videoCriteria.videosCheckedCount} в.`;
                    avgDurationStr = videoCriteria.averageDurationMinutes > 0 ? `${videoCriteria.averageDurationMinutes} мин` : 'Н/Д';
                }

                const telegramLinks = extractTelegramLinks(channel.snippet.description);
                if (telegramLinks.length > 0) {
                    channelsWithTelegram++;
                    const channelTitle = channel.snippet.title;
                    const channelDescription = channel.snippet.description ? channel.snippet.description.substring(0, 500) + (channel.snippet.description.length > 500 ? '...' : '') : '';
                    const tgLinksStr = telegramLinks.join(', ');
                    
                    let whatsAppNumbersStr = '';
                    if (EXTRACT_WHATSAPP_NUMBERS) {
                        const whatsAppNumbers = extractWhatsAppNumbers(channel.snippet.description);
                        whatsAppNumbersStr = whatsAppNumbers.join(', ');
                    }
                    const dateAdded = new Date().toLocaleDateString('ru-RU');

                    let latestVideoDateStr = 'Н/Д';
                    if (videoCriteria && videoCriteria.latestVideoTimestamp) {
                        latestVideoDateStr = new Date(videoCriteria.latestVideoTimestamp).toLocaleDateString('ru-RU');
                    }
                    
                    writeLog('\n=====================================');
                    writeLog(`Канал: ${channelTitle} (ID: ${channel.id})`);
                    writeLog(`URL: ${channelUrl}`);
                    writeLog(`Подписчики: ${subscriberCount}`);
                    writeLog(`Telegram ссылки:`);
                    telegramLinks.forEach(link => writeLog(`- ${link}`));
                    if (EXTRACT_WHATSAPP_NUMBERS && whatsAppNumbersStr) {
                        writeLog(`WhatsApp/Телефоны: ${whatsAppNumbersStr}`);
                    }
                    writeLog(`Шортсы: ${shortsPercStr}`);
                    writeLog(`Последнее видео: ${latestVideoDateStr}`);
                    writeLog(`Частота видео (для таблицы): ${videoCriteria.videoFrequencyStr}`);
                    writeLog(`Сред. продолж. видео (для таблицы): ${avgDurationStr}`);
                    writeLog('=====================================');

                    if (currentSheetsClient && SPREADSHEET_ID) {
                        const isDuplicateInCurrentSheet = await isDuplicateInSheet(currentSheetsClient, SPREADSHEET_ID, sheetTitle, channelUrl);

                        if (isDuplicateInCurrentSheet) {
                            writeLog(`Дубль в листе "${sheetTitle}": Канал уже существует. Пропущен: ${channel.snippet.title}`);
                        } else {
                            const dataRowBase = [channelTitle, channelUrl, subscriberCount, channelDescription, tgLinksStr];
                            let dataRow = [...dataRowBase];
                            if (EXTRACT_WHATSAPP_NUMBERS) dataRow.push(whatsAppNumbersStr);
                            
                            const dataRowSuffix = [dateAdded, shortsPercStr, videoCriteria.videoFrequencyStr, avgDurationStr, statusMessage];
                            dataRow = dataRow.concat(dataRowSuffix);

                            await appendDataToSheet(currentSheetsClient, SPREADSHEET_ID, sheetTitle, dataRow); 
                            allProcessedChannelUrlsInThisRun.add(channelUrl); 
                            globallyProcessedChannelUrls.add(channelUrl); 
                            writeLog(`Канал ${channelTitle} добавлен в лист "${sheetTitle}".`);
                        }
                    }
                }
                saveAnalyzedChannelId(channel.id, currentAnalyzedChannelsFile);
            }
            await new Promise(resolve => setTimeout(resolve, 200)); // Увеличена задержка
        }

        writeLog(`\n=== Итоги для ключевого слова "${searchQuery}" ===`);
        writeLog(`Всего найдено каналов API поиска: ${totalResultsFromSearchAPI}`);
        writeLog(`Собрано НОВЫХ уникальных ID для детального анализа: ${newChannelIdsToAnalyzeSet.size}`);
        writeLog(`Обработано новых каналов (детали, фильтры): ${totalChannelsProcessedDetailed}`);
        if (!SKIP_VIDEO_ANALYSIS) writeLog(`Выполнен анализ видео для ${channelsAttemptedVideoAnalysis} каналов.`);
        writeLog(`Каналов с Telegram (после всех фильтров): ${channelsWithTelegram}`);
        writeLog(`Оценка использования квоты для этого ключевого слова: ~${estimatedQuotaUsed} единиц`);
        writeLog(`--- Завершение обработки ключевого слова: "${searchQuery}" ---`);

    } catch (error) {
        writeLog(`\nКРИТИЧЕСКАЯ ОШИБКА при обработке "${searchQuery}":`);
        if (error.response?.data?.error?.errors?.[0]?.reason === 'quotaExceeded') {
            const errorMsg = "Достигнут лимит квоты API!";
            writeLog(errorMsg);
            throw new Error(errorMsg); // Перебрасываем, чтобы остановить обработку других ключевых слов
        } else {
            writeLog(error.message);
            if (error.stack) writeLog(error.stack);
        }
        // Не перебрасываем другие ошибки, чтобы попытаться обработать следующие ключевые слова
        // Статус ошибки будет установлен в основной функции
        return ERROR_STATUS_TEXT; // Сигнализируем об ошибке
    }
    return PROCESSED_STATUS_TEXT; // Сигнализируем об успешной обработке
}


// Новая функция для загрузки всех URL из всех листов
async function loadAllExistingChannelUrlsFromSpreadsheet(sheets, spreadsheetId) {
    console.log("Загрузка всех существующих URL каналов из таблицы для глобальной проверки дубликатов...");
    globallyProcessedChannelUrls.clear(); // Начинаем с чистого списка в памяти
    try {
        const res = await sheets.spreadsheets.get({
            spreadsheetId,
            fields: 'sheets.properties(title,sheetId,index)',
        });
        const allSheetProperties = res.data.sheets ? res.data.sheets.map(s => s.properties) : [];

        const channelUrlHeaderName = 'Ссылка канала';
        const channelUrlColumnIndex = SHEET_HEADERS.findIndex(header => header === channelUrlHeaderName);

        if (channelUrlColumnIndex === -1) {
            console.warn(`[loadAllExistingChannelUrlsFromSpreadsheet] Не удалось найти колонку "${channelUrlHeaderName}" в SHEET_HEADERS. Глобальная проверка дубликатов по URL будет неполной.`);
            fs.writeFileSync(GLOBALLY_PROCESSED_CHANNELS_FILE, '', 'utf8');
            console.log(`Файл ${GLOBALLY_PROCESSED_CHANNELS_FILE} создан (пустой), так как колонка URL не определена.`);
            return;
        }
        const channelUrlColumnLetter = String.fromCharCode(65 + channelUrlColumnIndex);

        for (const sheetProps of allSheetProperties) {
            const title = sheetProps.title;
            if (title === KEYWORDS_SHEET_NAME) {
                continue; // Пропускаем лист с ключевыми словами
            }

            console.log(`[loadAllExistingChannelUrlsFromSpreadsheet] Сканирование листа "${title}" на наличие URL каналов (колонка ${channelUrlColumnLetter})...`);
            try {
                // Читаем со второй строки, чтобы пропустить заголовок
                const range = `${title}!${channelUrlColumnLetter}2:${channelUrlColumnLetter}`;
                const response = await sheets.spreadsheets.values.get({
                    spreadsheetId,
                    range: range,
                });
                const existingUrlsInData = response.data.values;
                if (existingUrlsInData) {
                    const flatUrls = existingUrlsInData.flat().filter(url => url && typeof url === 'string' && url.trim() !== '');
                    flatUrls.forEach(url => globallyProcessedChannelUrls.add(url.trim()));
                    console.log(`[loadAllExistingChannelUrlsFromSpreadsheet] Добавлено ${flatUrls.length} URL из листа "${title}" в глобальный список.`);
                } else {
                    console.log(`[loadAllExistingChannelUrlsFromSpreadsheet] В листе "${title}" (колонка ${channelUrlColumnLetter}) не найдено URL или лист пуст.`);
                }
            } catch (error) {
                if (error.code === 400 && error.message && error.message.includes("Unable to parse range")) {
                    console.log(`[loadAllExistingChannelUrlsFromSpreadsheet] Лист "${title}" вероятно пуст или колонка URL ${channelUrlColumnLetter} не найдена. Пропуск сканирования этого листа.`);
                } else {
                    console.warn(`[loadAllExistingChannelUrlsFromSpreadsheet] Ошибка при чтении URL из листа "${title}": ${error.message}. Пропуск этого листа для глобальной проверки.`);
                }
            }
        }
        fs.writeFileSync(GLOBALLY_PROCESSED_CHANNELS_FILE, Array.from(globallyProcessedChannelUrls).join('\n'), 'utf8');
        console.log(`[loadAllExistingChannelUrlsFromSpreadsheet] Всего загружено ${globallyProcessedChannelUrls.size} уникальных URL каналов из всех листов. Список сохранен в ${GLOBALLY_PROCESSED_CHANNELS_FILE}`);

    } catch (error) {
        console.error(`[loadAllExistingChannelUrlsFromSpreadsheet] Критическая ошибка при загрузке URL каналов из таблицы: ${error.message}`);
        try {
            fs.writeFileSync(GLOBALLY_PROCESSED_CHANNELS_FILE, '', 'utf8');
            console.log(`[loadAllExistingChannelUrlsFromSpreadsheet] Файл ${GLOBALLY_PROCESSED_CHANNELS_FILE} очищен из-за ошибки загрузки.`);
        } catch (writeError) {
            console.error(`[loadAllExistingChannelUrlsFromSpreadsheet] Не удалось очистить файл ${GLOBALLY_PROCESSED_CHANNELS_FILE}: ${writeError.message}`);
        }
    }
}


// Главная функция-оркестратор для одного цикла обработки ключевых слов
async function findChannelsAndProcessKeywords() {
    // Эта функция теперь использует глобальный `sheetsClient`
    // Инициализируем allProcessedChannelUrlsInThisRun для этого конкретного цикла обработки всех ключевых слов
    const allProcessedChannelUrlsInThisRun = new Set();

    console.log(`[${new Date().toISOString()}] Запуск цикла обработки ключевых слов...`);
    // ... (существующая логика проверки API_KEY, SPREADSHEET_ID и GOOGLE_APPLICATION_CREDENTIALS если они не проверяются в initializeApp)

    if (!sheetsClient) {
        console.error(`[${new Date().toISOString()}] Клиент Google Sheets не инициализирован. Пропуск цикла.`);
        throw new Error("Sheets client not initialized for findChannelsAndProcessKeywords"); // Это должно быть обработано в runPeriodically
    }

    let keywordsToProcess;
    try {
        keywordsToProcess = await getKeywordsToProcess(sheetsClient, SPREADSHEET_ID, KEYWORDS_SHEET_NAME, KEYWORDS_COLUMN_INDEX, STATUS_COLUMN_INDEX);
        if (keywordsToProcess.length === 0) {
            console.log(`[${new Date().toISOString()}] Не найдено ключевых слов для обработки в листе. Завершение текущего цикла.`);
            return;
        }
        console.log(`[${new Date().toISOString()}] Найдено ${keywordsToProcess.length} ключевых слов для обработки.`);
    } catch (e) {
        console.error(`[${new Date().toISOString()}] Критическая ошибка при получении списка ключевых слов: ${e.message}. Пропуск цикла.`);
        // Эта ошибка не связана с квотой, поэтому не должна вызывать длительную паузу, но цикл прервется.
        // runPeriodically запланирует следующий запуск.
        return; 
    }
    
    for (const keywordData of keywordsToProcess) {
        if (Date.now() < quotaPauseUntil) { // Дополнительная проверка на случай, если квота была превышена в середине цикла
            console.log(`[${new Date().toISOString()}] Обнаружена активная пауза по квоте во время обработки ключевых слов. Прерывание цикла.`);
            throw new Error("Достигнут лимит квоты API!"); // Сигнализируем для runPeriodically
        }

        if (keywordData.status === PROCESSED_STATUS_TEXT) {
            console.log(`[${new Date().toISOString()}] Ключевое слово "${keywordData.text}" уже обработано. Пропуск.`);
            continue;
        }
        if (keywordData.status === PROCESSING_STATUS_TEXT) {
            console.log(`[${new Date().toISOString()}] Ключевое слово "${keywordData.text}" было в состоянии 'Processing...'. Повторная обработка.`);
            // Можно добавить логику для пропуска или особой обработки таких случаев
        }

        console.log(`\n[${new Date().toISOString()}] --- Обработка ключевого слова: "${keywordData.text}" (строка ${keywordData.rowIndex}) ---`);
        await updateKeywordStatus(sheetsClient, SPREADSHEET_ID, KEYWORDS_SHEET_NAME, keywordData.rowIndex, STATUS_COLUMN_INDEX, PROCESSING_STATUS_TEXT);
        
        let processingResultStatus;
        try {
            processingResultStatus = await processSingleKeyword(keywordData.text, sheetsClient, null, allProcessedChannelUrlsInThisRun); 
            if (processingResultStatus === ERROR_STATUS_TEXT) {
                 await updateKeywordStatus(sheetsClient, SPREADSHEET_ID, KEYWORDS_SHEET_NAME, keywordData.rowIndex, STATUS_COLUMN_INDEX, ERROR_STATUS_TEXT);
            } else {
                 await updateKeywordStatus(sheetsClient, SPREADSHEET_ID, KEYWORDS_SHEET_NAME, keywordData.rowIndex, STATUS_COLUMN_INDEX, PROCESSED_STATUS_TEXT);
            }
        } catch (error) { 
            console.error(`[${new Date().toISOString()}] Ошибка при обработке "${keywordData.text}": ${error.message}`);
            if (error.message.includes("Достигнут лимит квоты API!")) {
                console.error(`[${new Date().toISOString()}] Обнаружен лимит квоты во время обработки "${keywordData.text}". Прерывание текущего цикла.`);
                await updateKeywordStatus(sheetsClient, SPREADSHEET_ID, KEYWORDS_SHEET_NAME, keywordData.rowIndex, STATUS_COLUMN_INDEX, ERROR_STATUS_TEXT + " (Quota Limit)");
                throw error; // Перебрасываем ошибку квоты для runPeriodically
            }
            // Для других ошибок
            await updateKeywordStatus(sheetsClient, SPREADSHEET_ID, KEYWORDS_SHEET_NAME, keywordData.rowIndex, STATUS_COLUMN_INDEX, ERROR_STATUS_TEXT + " (Details in Log)");
            break; 
        }
        console.log(`[${new Date().toISOString()}] --- Завершение обработки для "${keywordData.text}" со статусом: ${processingResultStatus} ---`);
        await new Promise(resolve => setTimeout(resolve, 2000)); // Небольшая пауза между ключевыми словами
    }

    console.log(`[${new Date().toISOString()}] --- Цикл обработки ключевых слов завершен. ---`);
}

// --- HTTP Log Server ---
async function getLatestLogFile(dir) {
    try {
        const files = await fsPromises.readdir(dir);
        const logFiles = files.filter(file => file.startsWith('youtube_channels_') && file.endsWith('.txt'));
        if (logFiles.length === 0) return null;

        let latestFile = null;
        let latestTime = 0;

        for (const file of logFiles) {
            const filePath = path.join(dir, file);
            const stats = await fsPromises.stat(filePath);
            if (stats.mtimeMs > latestTime) {
                latestTime = stats.mtimeMs;
                latestFile = filePath;
            }
        }
        return latestFile;
    } catch (error) {
        console.error("Ошибка при поиске последнего лог-файла:", error);
        return null;
    }
}

function startLogServer(logDir, port) {
    http.createServer(async (req, res) => {
        if (req.url === '/favicon.ico') {
            res.writeHead(204);
            res.end();
            return;
        }
        
        console.log(`[LogServer] Запрос: ${req.url}`);
        let targetLogFile = LATEST_LOG_FILE_PATH; // По умолчанию последний обновленный в сессии

        if (req.url === '/' || req.url === '/latest') {
            // Если хотим всегда самый свежий из директории, а не только из текущей сессии
            const freshestLogFile = await getLatestLogFile(logDir);
            if (freshestLogFile) {
                targetLogFile = freshestLogFile;
            }
        } else if (req.url.startsWith('/log/')) {
            const specificLogName = req.url.substring(5); // Убираем /log/
            const specificLogPath = path.join(logDir, specificLogName);
            if (fs.existsSync(specificLogPath) && specificLogName.endsWith('.txt')) {
                 targetLogFile = specificLogPath;
            } else {
                res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
                res.end('Лог файл не найден.');
                return;
            }
        } else if (req.url === '/list') {
             try {
                const files = await fsPromises.readdir(logDir);
                const logFiles = files.filter(file => file.startsWith('youtube_channels_') && file.endsWith('.txt'))
                                      .sort().reverse(); // Сортируем для удобства
                res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                let html = '<h1>Доступные лог файлы:</h1><ul>';
                logFiles.forEach(f => {
                    html += `<li><a href="/log/${f}">${f}</a></li>`;
                });
                html += '</ul>';
                res.end(html);
                return;
            } catch (error) {
                res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
                res.end('Ошибка при чтении директории логов: ' + error.message);
                return;
            }
        }


        if (!targetLogFile || !fs.existsSync(targetLogFile)) {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('Лог файл не найден или еще не создан.');
            return;
        }

        try {
            const data = await fsPromises.readFile(targetLogFile, 'utf8');
            res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end(data);
        } catch (error) {
            res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('Ошибка при чтении лог файла: ' + error.message);
        }
    }).listen(port, () => {
        console.log(`\nСервер для просмотра логов запущен на http://localhost:${port}`);
        console.log(`- Открыть последний лог: http://localhost:${port}/latest`);
        console.log(`- Список всех логов: http://localhost:${port}/list`);
        console.log(`- Для конкретного лога: http://localhost:${port}/log/ИМЯ_ФАЙЛА.txt`);
    });
}

// --- Периодический запуск ---
const PROCESSING_INTERVAL_MS = PROCESSING_INTERVAL_MINUTES * 60 * 1000;
const QUOTA_PAUSE_MS = QUOTA_PAUSE_HOURS * 60 * 60 * 1000;

async function runPeriodically() {
    if (Date.now() < quotaPauseUntil) {
        const resumeTime = new Date(quotaPauseUntil).toISOString();
        const waitMs = quotaPauseUntil - Date.now();
        console.log(`[${new Date().toISOString()}] Script is paused due to API quota limit. Resuming after ${resumeTime} (in ~${(waitMs / (60 * 1000)).toFixed(1)} mins).`);
        // Schedule the next check closer to the resume time or at the normal interval, whichever is sooner but positive
        setTimeout(runPeriodically, Math.min(PROCESSING_INTERVAL_MS, waitMs > 0 ? waitMs : PROCESSING_INTERVAL_MS ));
        return;
    }

    console.log(`[${new Date().toISOString()}] Starting periodic keyword processing cycle...`);
    try {
        if (!sheetsClient) {
            console.error(`[${new Date().toISOString()}] Sheets client not initialized. Attempting to re-initialize.`);
            try {
                sheetsClient = await getSheetsClient(); // Попытка инициализации
                await loadAllExistingChannelUrlsFromSpreadsheet(sheetsClient, SPREADSHEET_ID); // Перезагрузка глобального списка
                 console.log(`[${new Date().toISOString()}] Sheets client re-initialized successfully.`);
            } catch (initError) {
                console.error(`[${new Date().toISOString()}] Failed to re-initialize Sheets client: ${initError.message}. Retrying in ${PROCESSING_INTERVAL_MINUTES} minutes.`);
                setTimeout(runPeriodically, PROCESSING_INTERVAL_MS); // Повторная попытка позже
                return;
            }
        }
        await findChannelsAndProcessKeywords();
        console.log(`[${new Date().toISOString()}] Finished periodic keyword processing cycle successfully.`);
    } catch (error) {
        if (error.message.includes("Достигнут лимит квоты API!")) {
            console.error(`[${new Date().toISOString()}] API Quota limit reached. Pausing script for ${QUOTA_PAUSE_HOURS} hours.`);
            quotaPauseUntil = Date.now() + QUOTA_PAUSE_MS;
        } else {
            console.error(`[${new Date().toISOString()}] Critical error during keyword processing cycle:`, error);
            // Для других критических ошибок можно решить, нужна ли пауза или просто логирование и следующая попытка по расписанию
        }
    } finally {
        // Рассчитываем задержку для следующего запуска
        let nextRunDelay = PROCESSING_INTERVAL_MS;
        if (Date.now() < quotaPauseUntil) { // Если установлена пауза по квоте
             const timeToResume = quotaPauseUntil - Date.now();
             nextRunDelay = Math.max(1000, timeToResume); // Убедимся, что задержка положительная
        }
        console.log(`[${new Date().toISOString()}] Next keyword processing cycle scheduled in ~${(nextRunDelay / (60 * 1000)).toFixed(1)} minutes.`);
        setTimeout(runPeriodically, nextRunDelay);
    }
}

// --- Инициализация приложения ---
async function initializeApp() {
    if (!fs.existsSync(LOG_DIRECTORY)) {
        fs.mkdirSync(LOG_DIRECTORY, { recursive: true });
    }
    console.log(`--- Начало работы скрипта (режим PM2) ---`);
    console.log(`Интервал обработки: ${PROCESSING_INTERVAL_MINUTES} мин. Пауза при квоте: ${QUOTA_PAUSE_HOURS} час(ов).`);


    if (!API_KEY) {
        console.error("Ошибка: API ключ YOUTUBE_API_KEY не найден в .env файле. Выполнение остановлено.");
        return;
    }
    if (!SPREADSHEET_ID) {
        console.warn("Предупреждение: SPREADSHEET_ID не найден. Невозможно прочитать ключевые слова или сохранить результаты. Выполнение остановлено.");
        return;
    }
    if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        console.warn("Предупреждение: GOOGLE_APPLICATION_CREDENTIALS не установлен. Аутентификация Google Sheets может не удаться.");
        // Не останавливаем, но предупреждаем
    }

    try {
        sheetsClient = await getSheetsClient(); // Инициализация глобального клиента
        console.log("[initializeApp] Google Sheets client initialized.");
    } catch (e) {
        console.error(`[initializeApp] Не удалось инициализировать Google Sheets клиент: ${e.message}. Повторная попытка через 1 минуту.`);
        setTimeout(initializeApp, 60000); // Повторная попытка инициализации
        return; // Выход из текущего вызова initializeApp
    }
    
    try {
        await loadAllExistingChannelUrlsFromSpreadsheet(sheetsClient, SPREADSHEET_ID);
        console.log("[initializeApp] Global processed channel URLs loaded.");
    } catch (e) {
        console.error(`[initializeApp] Не удалось загрузить глобальный список URL: ${e.message}. Работа продолжится без него, но проверка на глобальные дубликаты может быть неполной.`);
        // Не останавливаем, но функциональность будет ограничена
    }
    
    startLogServer(LOG_DIRECTORY, LOG_SERVER_PORT); // Запуск лог-сервера один раз
    runPeriodically(); // Запуск основного цикла обработки
}

// Запуск скрипта
initializeApp().catch(err => {
    console.error("[GLOBAL CATCH] Непредвиденная ошибка при инициализации приложения:", err);
    // PM2 должен перезапустить скрипт в соответствии с его настройками
    process.exit(1); // Явный выход с ошибкой для PM2
});
