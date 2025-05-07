// Загружаем переменные окружения из .env файла
require('dotenv').config();

const { google } = require('googleapis');
const youtube = google.youtube('v3');
const fs = require('fs');

// --- Конфигурация ---
// Получаем ключ API из переменных окружения (.env файл)
const API_KEY = process.env.YOUTUBE_API_KEY;
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
// GOOGLE_APPLICATION_CREDENTIALS должен быть установлен в .env или системных переменных
// например: GOOGLE_APPLICATION_CREDENTIALS=/workspaces/allcodespaces/youtube/mycity2_key.json

// Поисковый запрос
const SEARCH_QUERY = process.env.SEARCH_QUERY || 'инвестиции';

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
const SKIP_VIDEO_ANALYSIS = process.env.SKIP_VIDEO_ANALYSIS === 'true';
// --- Конец новой переменной ---

// --- Новые переменные для WhatsApp ---
const EXTRACT_WHATSAPP_NUMBERS = process.env.EXTRACT_WHATSAPP_NUMBERS === 'true';
const WHATSAPP_COLUMN_NAME = process.env.WHATSAPP_COLUMN_NAME || "Телефон";
// --- Конец новых переменных для WhatsApp ---

// Файл для хранения ID уже проанализированных каналов
const ANALYZED_CHANNELS_FILE = 'analysed.txt';
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

async function ensureSheetExists(sheets, spreadsheetId, sheetTitle) {
    try {
        const getSpreadsheetResponse = await sheets.spreadsheets.get({
            spreadsheetId,
            fields: 'sheets.properties.title',
        });
        const existingSheet = getSpreadsheetResponse.data.sheets.find(
            s => s.properties.title === sheetTitle
        );

        if (!existingSheet) {
            await sheets.spreadsheets.batchUpdate({
                spreadsheetId,
                requestBody: {
                    requests: [{ addSheet: { properties: { title: sheetTitle } } }],
                },
            });
            console.log(`Лист "${sheetTitle}" создан.`);
            // Add headers to the new sheet
            await sheets.spreadsheets.values.append({
                spreadsheetId,
                range: `${sheetTitle}!A1`,
                valueInputOption: 'USER_ENTERED',
                requestBody: { values: [SHEET_HEADERS] },
            });
            console.log(`Заголовки добавлены в лист "${sheetTitle}".`);
        } else {
            // Check if headers exist
            // Определяем диапазон заголовков динамически
            const lastColumnLetter = String.fromCharCode(64 + SHEET_HEADERS.length); // 65 is 'A'
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
                    requestBody: { values: [SHEET_HEADERS] },
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
        await sheets.spreadsheets.values.append({
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
    if (fs.existsSync(filePath)) {
        const data = fs.readFileSync(filePath, 'utf8');
        const ids = data.split('\n').filter(id => id.trim() !== '');
        previouslyAnalyzedChannelIds = new Set(ids);
        console.log(`Загружено ${previouslyAnalyzedChannelIds.size} ID ранее проанализированных каналов из ${filePath}`);
    } else {
        console.log(`Файл ${filePath} не найден. Список ранее проанализированных каналов пуст.`);
    }
}

function saveAnalyzedChannelId(channelId, filePath) {
    if (!previouslyAnalyzedChannelIds.has(channelId)) {
        fs.appendFileSync(filePath, channelId + '\n');
        previouslyAnalyzedChannelIds.add(channelId);
        // console.log(`Канал ID ${channelId} добавлен в список проанализированных (${filePath}).`); // Можно раскомментировать для детального лога
    }
}

async function findChannelsAndTelegramLinks() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const logFile = `youtube_channels_${timestamp}.txt`;
    const writeLog = (text) => {
        console.log(text);
        fs.appendFileSync(logFile, text + '\n');
    };

    writeLog(`--- Начало скрипта ---`);
    writeLog(`Конфигурация SKIP_VIDEO_ANALYSIS: ${SKIP_VIDEO_ANALYSIS} (true = пропускать анализ видео)`);
    writeLog(`Конфигурация EXTRACT_WHATSAPP_NUMBERS: ${EXTRACT_WHATSAPP_NUMBERS}`);
    writeLog(`Конфигурация MIN_SUBSCRIBER_COUNT: ${MIN_SUBSCRIBER_COUNT}`);
    writeLog(`Конфигурация MAX_SUBSCRIBER_COUNT: ${MAX_SUBSCRIBER_COUNT === Infinity ? 'Infinity' : MAX_SUBSCRIBER_COUNT}`);
    writeLog(`Конфигурация MAX_VIDEO_AGE_DAYS: ${MAX_VIDEO_AGE_DAYS} (0 = не проверять)`);
    writeLog(`Конфигурация MIN_VIDEO_DURATION_MINUTES: ${MIN_VIDEO_DURATION_MINUTES} (0 = не проверять)`);
    writeLog(`Конфигурация SHORTS_THRESHOLD: ${SHORTS_THRESHOLD} (доля шортсов для фильтрации, 0 = не фильтровать по шортсам)`);
    writeLog(`Конфигурация TARGET_LANGUAGE: ${TARGET_LANGUAGE}`);


    loadPreviouslyAnalyzedIds(ANALYZED_CHANNELS_FILE);

    if (!API_KEY) {
        console.error("Ошибка: API ключ не найден в .env файле");
        return;
    }
    if (!SPREADSHEET_ID) {
        console.warn("Предупреждение: SPREADSHEET_ID не найден в .env файле. Данные не будут сохранены в Google Sheets.");
    }
    if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        console.warn("Предупреждение: GOOGLE_APPLICATION_CREDENTIALS не установлен. Аутентификация Google Sheets может не удаться.");
    }

    let sheetsClient;
    if (SPREADSHEET_ID) {
        try {
            sheetsClient = await getSheetsClient();
            const sheetTitle = SEARCH_QUERY.trim() || 'YouTube Channels';
            await ensureSheetExists(sheetsClient, SPREADSHEET_ID, sheetTitle);
            writeLog(`Данные будут сохранены в Google Sheet: ID ${SPREADSHEET_ID}, Лист: "${sheetTitle}"`);
        } catch (e) {
            writeLog(`Не удалось инициализировать Google Sheets: ${e.message}. Данные не будут сохранены в таблицу.`);
            sheetsClient = null; // Disable sheet operations
        }
    }

    writeLog(`Поиск каналов по запросу: "${SEARCH_QUERY}"...`);
    let nextPageToken = null;
    const newChannelIdsToAnalyzeSet = new Set(); // Хранит ID НОВЫХ каналов для детального анализа
    let totalChannelsFetchedFromSearchAPI = 0; // Общее количество каналов, полученных из API поиска
    let searchApiPagesFetched = 0; // Количество запрошенных страниц поиска
    let estimatedQuotaUsed = 0;
    let channelsWithTelegram = 0;
    let totalChannelsProcessedDetailed = 0; // Каналов, прошедших детальную обработку (новые)

    try {
        // 1. Поиск каналов напрямую
        let totalResultsFromSearchAPI = 0; // Общее количество результатов, которое API поиска может вернуть
        let searchComplete = false;

        writeLog('Этап 1: Поиск каналов по ключевому слову (с учетом ранее проанализированных).');
        // Цикл продолжается, пока не наберем достаточно НОВЫХ каналов или не закончатся результаты поиска
        while (newChannelIdsToAnalyzeSet.size < MAX_CHANNELS_TO_PROCESS) {
            const searchResponse = await youtube.search.list({
                key: API_KEY,
                part: 'snippet',
                q: SEARCH_QUERY,
                type: 'channel',
                relevanceLanguage: TARGET_LANGUAGE,
                maxResults: MAX_RESULTS_PER_PAGE, // Запрашиваем полные страницы для эффективной фильтрации
                pageToken: nextPageToken,
            });
            searchApiPagesFetched++;
            estimatedQuotaUsed += 100;

            const items = searchResponse.data.items || [];
            if (searchApiPagesFetched === 1) { // Получаем общее количество результатов один раз
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
                            // Достигнут лимит MAX_CHANNELS_TO_PROCESS для новых каналов
                            break; // Прерываем обход элементов на этой странице
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
                writeLog(`Собрано достаточно (${newChannelIdsToAnalyzeSet.size}) новых каналов для анализа. Остановка поиска.`);
                // searchComplete может быть false, если результаты API не исчерпаны, но лимит новых каналов достигнут
                break;
            }
            await new Promise(resolve => setTimeout(resolve, 100)); // Задержка между запросами
        }

        writeLog('\n=== Статус этапа 1 (Поиск каналов) ===');
        writeLog(`Всего найдено каналов API поиска по запросу "${SEARCH_QUERY}": ${totalResultsFromSearchAPI} (просмотрено ${totalChannelsFetchedFromSearchAPI} результатов на ${searchApiPagesFetched} страницах)`);
        writeLog(`Собрано НОВЫХ уникальных ID для детального анализа: ${newChannelIdsToAnalyzeSet.size}`);
        writeLog(`Поиск ${searchComplete ? 'завершен полностью по результатам API' : 'остановлен по достижению лимита MAX_CHANNELS_TO_PROCESS для НОВЫХ каналов или из-за отсутствия nextPageToken'}`);
        writeLog('======================================\n');

        // 2. Получение подробной информации о каналах
        writeLog('Этап 2: Получение подробной информации и фильтрация каналов.');
        const channelIdsToProcessArray = Array.from(newChannelIdsToAnalyzeSet); // Используем набор новых ID
        const sheetTitle = SEARCH_QUERY.trim() || 'YouTube Channels';
        let processedInThisBatch = 0;

        for (let i = 0; i < channelIdsToProcessArray.length; i += MAX_RESULTS_PER_PAGE) {
            const batchIds = channelIdsToProcessArray.slice(i, i + MAX_RESULTS_PER_PAGE);
            // totalChannelsProcessedDetailed теперь будет считать только те каналы, которые действительно были обработаны (т.е. новые)
            writeLog(`\nЗапрос деталей для ${batchIds.length} каналов (пакет ${Math.floor(i / MAX_RESULTS_PER_PAGE) + 1}/${Math.ceil(channelIdsToProcessArray.length / MAX_RESULTS_PER_PAGE)}). Всего новых каналов для детальной обработки: ${channelIdsToProcessArray.length}, уже обработано деталей: ${totalChannelsProcessedDetailed}`);

            const channelsResponse = await youtube.channels.list({
                key: API_KEY,
                part: 'snippet,statistics', // Добавляем statistics для subscriberCount
                id: batchIds.join(','),
                maxResults: MAX_RESULTS_PER_PAGE
            });
            estimatedQuotaUsed += 1; 
            processedInThisBatch = channelsResponse.data.items?.length || 0;
            writeLog(`Получены детали для ${processedInThisBatch} каналов в этом пакете.`);

            for (const channel of channelsResponse.data.items || []) {
                // Проверка на previouslyAnalyzedChannelIds здесь уже не нужна, так как channelIdsToProcessArray содержит только новые ID.
                // Однако, если есть вероятность, что ID мог быть добавлен в analysed.txt между Этапом 1 и этим местом
                // (например, при параллельной работе или ошибке), можно оставить для подстраховки, но это маловероятно при текущей логике.
                // if (previouslyAnalyzedChannelIds.has(channel.id)) {
                //     writeLog(`\nКанал ${channel.snippet.title} (ID: ${channel.id}) уже был проанализирован ранее (неожиданно). Пропуск.`);
                //     continue; 
                // }
                totalChannelsProcessedDetailed++; // Увеличиваем счетчик обработанных новых каналов

                // Фильтр 1: Язык канала
                if (!await isTargetLanguageChannel(channel)) {
                    writeLog(`\nПропущен канал не на целевом языке (${TARGET_LANGUAGE}): ${channel.snippet.title} (ID: ${channel.id})`);
                    saveAnalyzedChannelId(channel.id, ANALYZED_CHANNELS_FILE);
                    continue;
                }

                // Фильтр 2: Количество подписчиков
                const subscriberCount = parseInt(channel.statistics?.subscriberCount || 0);
                if (subscriberCount < MIN_SUBSCRIBER_COUNT || subscriberCount > MAX_SUBSCRIBER_COUNT) {
                    writeLog(`\nПропущен канал по количеству подписчиков (${subscriberCount}): ${channel.snippet.title} (ID: ${channel.id}). Требования: ${MIN_SUBSCRIBER_COUNT}-${MAX_SUBSCRIBER_COUNT === Infinity ? 'Infinity' : MAX_SUBSCRIBER_COUNT}`);
                    saveAnalyzedChannelId(channel.id, ANALYZED_CHANNELS_FILE);
                    continue;
                }
                
                let videoCriteria;
                let statusMessage = 'Добавлен';
                let shortsPercStr = 'Н/Д';
                let avgDurationStr = 'Н/Д';

                if (SKIP_VIDEO_ANALYSIS) {
                    writeLog(`\nАнализ видео для канала ${channel.snippet.title} (ID: ${channel.id}) пропущен согласно конфигурации.`);
                    videoCriteria = {
                        isLikelyShortsChannel: false, // Assume not shorts channel to pass filter
                        meetsVideoAgeCriteria: true,  // Assume meets age criteria to pass filter
                        meetsVideoDurationCriteria: true, // Assume meets duration criteria to pass filter
                        estimatedQuotaUsed: 0,
                        shortsPercentage: 0,
                        latestVideoTimestamp: null,
                        oldestVideoTimestamp: null,
                        videosCheckedCount: 0,
                        averageDurationMinutes: 0,
                        videoFrequencyStr: 'Н/Д (анализ пропущен)'
                    };
                    statusMessage = 'Добавлен (видео не анализировались)';
                    shortsPercStr = 'Н/Д (анализ пропущен)';
                    avgDurationStr = 'Н/Д (анализ пропущен)';
                } else {
                    // Фильтр 3, 4, 5: Шортсы, возраст видео, длительность видео
                    videoCriteria = await checkChannelVideosCriteria(channel.id);
                    estimatedQuotaUsed += videoCriteria.estimatedQuotaUsed;

                    if (videoCriteria.isLikelyShortsChannel && SHORTS_THRESHOLD > 0 && SHORTS_THRESHOLD <=1) { 
                        writeLog(`\nПропущен шортс-канал: ${channel.snippet.title} (ID: ${channel.id})`);
                        saveAnalyzedChannelId(channel.id, ANALYZED_CHANNELS_FILE);
                        continue;
                    }

                    if (MAX_VIDEO_AGE_DAYS > 0 && !videoCriteria.meetsVideoAgeCriteria) {
                        writeLog(`\nПропущен канал из-за отсутствия недавних видео (старше ${MAX_VIDEO_AGE_DAYS} дней): ${channel.snippet.title} (ID: ${channel.id})`);
                        saveAnalyzedChannelId(channel.id, ANALYZED_CHANNELS_FILE);
                        continue;
                    }

                    if (MIN_VIDEO_DURATION_MINUTES > 0 && !videoCriteria.meetsVideoDurationCriteria) {
                        writeLog(`\nПропущен канал из-за отсутствия длинных видео (короче ${MIN_VIDEO_DURATION_MINUTES} мин): ${channel.snippet.title} (ID: ${channel.id})`);
                        saveAnalyzedChannelId(channel.id, ANALYZED_CHANNELS_FILE);
                        continue;
                    }
                    shortsPercStr = `${(videoCriteria.shortsPercentage * 100).toFixed(0)}% из ${videoCriteria.videosCheckedCount} видео`;
                    avgDurationStr = videoCriteria.averageDurationMinutes > 0 ? `${videoCriteria.averageDurationMinutes} мин` : 'Н/Д';
                }


                const telegramLinks = extractTelegramLinks(channel.snippet.description);
                if (telegramLinks.length > 0) {
                    channelsWithTelegram++;
                    const channelTitle = channel.snippet.title;
                    const channelUrl = `https://www.youtube.com/channel/${channel.id}`;
                    const channelDescription = channel.snippet.description ? channel.snippet.description.substring(0, 500) + (channel.snippet.description.length > 500 ? '...' : '') : '';
                    const tgLinksStr = telegramLinks.join(', ');
                    
                    // --- Извлечение WhatsApp ---
                    let whatsAppNumbersStr = '';
                    if (EXTRACT_WHATSAPP_NUMBERS) {
                        const whatsAppNumbers = extractWhatsAppNumbers(channel.snippet.description);
                        whatsAppNumbersStr = whatsAppNumbers.join(', ');
                    }
                    // --- Конец извлечения WhatsApp ---

                    const dateAdded = new Date().toLocaleDateString('ru-RU');
                    // shortsPercStr is now defined above based on SKIP_VIDEO_ANALYSIS
                    
                    let latestVideoDateStr = 'Н/Д';
                    if (!SKIP_VIDEO_ANALYSIS && videoCriteria.latestVideoTimestamp) {
                        latestVideoDateStr = new Date(videoCriteria.latestVideoTimestamp).toLocaleDateString('ru-RU');
                    }

                    let videoPeriodDaysStr = 'Н/Д';
                    if (!SKIP_VIDEO_ANALYSIS && videoCriteria.oldestVideoTimestamp && videoCriteria.latestVideoTimestamp && videoCriteria.videosCheckedCount > 1) {
                        const diffTime = Math.abs(videoCriteria.latestVideoTimestamp - videoCriteria.oldestVideoTimestamp);
                        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                        videoPeriodDaysStr = `${videoCriteria.videosCheckedCount} видео за ~${diffDays} дней`; // This variable is locally scoped and logged, distinct from videoCriteria.videoFrequencyStr
                    } else if (videoCriteria.videosCheckedCount === 1 && latestVideoTimestamp) {
                         videoPeriodDaysStr = `1 видео`;
                    }

                    writeLog('\n=====================================');
                    writeLog(`Канал: ${channelTitle}`);
                    writeLog(`Ссылка на канал: ${channelUrl}`);
                    writeLog(`Подписчики: ${subscriberCount}`);
                    writeLog(`Telegram ссылки:`);
                    telegramLinks.forEach(link => writeLog(`- ${link}`));
                    if (EXTRACT_WHATSAPP_NUMBERS && whatsAppNumbersStr) {
                        writeLog(`WhatsApp/Телефоны: ${whatsAppNumbersStr}`);
                    }
                    writeLog(`Шортсы: ${shortsPercStr}`);
                    writeLog(`Последнее видео: ${latestVideoDateStr}`);
                    writeLog(`Период видео: ${videoPeriodDaysStr}`); // Logged value
                    writeLog(`Частота видео (для таблицы): ${videoCriteria.videoFrequencyStr}`);
                    writeLog(`Сред. продолж. видео (для таблицы): ${avgDurationStr}`);
                    writeLog('=====================================');

                    if (sheetsClient && SPREADSHEET_ID) {
                        const dataRowBase = [
                            channelTitle,
                            channelUrl,
                            subscriberCount,
                            channelDescription,
                            tgLinksStr,
                        ];
                        
                        let dataRow = [...dataRowBase];

                        if (EXTRACT_WHATSAPP_NUMBERS) {
                            dataRow.push(whatsAppNumbersStr);
                        }

                        const dataRowSuffix = [
                            dateAdded,
                            shortsPercStr, // Uses pre-calculated shortsPercStr
                            videoCriteria.videoFrequencyStr, // Uses value from actual or default videoCriteria
                            avgDurationStr, // Uses pre-calculated avgDurationStr
                            statusMessage, // Статус
                        ];
                        dataRow = dataRow.concat(dataRowSuffix);
                        
                        await appendDataToSheet(sheetsClient, SPREADSHEET_ID, sheetTitle, dataRow);
                    }
                }
                // Сохраняем ID канала как проанализированный, даже если не было ссылок на Telegram, но он прошел все фильтры
                saveAnalyzedChannelId(channel.id, ANALYZED_CHANNELS_FILE);
            }

            await new Promise(resolve => setTimeout(resolve, 100));
        }

        console.log(`\n=== Итоги ===`);
        writeLog(`\n=== Итоги ===`);
        writeLog(`Всего найдено каналов API поиска: ${totalResultsFromSearchAPI} (просмотрено ${totalChannelsFetchedFromSearchAPI} результатов)`);
        writeLog(`Собрано НОВЫХ уникальных ID из поиска для детального анализа: ${newChannelIdsToAnalyzeSet.size}`);
        writeLog(`Прошло детальный анализ (новые каналы, обработанные в этом запуске): ${totalChannelsProcessedDetailed} из ${newChannelIdsToAnalyzeSet.size}`);
        writeLog(`Каналов с Telegram ссылками (после всех фильтров, из новых): ${channelsWithTelegram}`);
        writeLog(`Статус поиска API: ${searchComplete ? 'Обработаны все доступные по API каналы' : 'Достигнут установленный лимит MAX_CHANNELS_TO_PROCESS для НОВЫХ каналов или поиск остановлен ранее'}`);
        writeLog(`Использовано единиц квоты: ~${estimatedQuotaUsed}`);
        
        console.log(`\nРезультаты сохранены в файл: ${logFile}`);

    } catch (error) {
        console.error("\nОшибка:");
        fs.appendFileSync(logFile, "\nОшибка:\n");
        if (error.response?.data?.error?.errors?.[0]?.reason === 'quotaExceeded') {
            const errorMsg = "Достигнут лимит квоты API!";
            console.error(errorMsg);
            fs.appendFileSync(logFile, errorMsg + '\n');
        } else {
            console.error(error.message);
            fs.appendFileSync(logFile, error.message + '\n');
        }
    }
}

// Запуск скрипта
findChannelsAndTelegramLinks();
