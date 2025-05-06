// Загружаем переменные окружения из .env файла
require('dotenv').config();

const { google } = require('googleapis');
const youtube = google.youtube('v3');
const fs = require('fs');

// --- Конфигурация ---
// Получаем ключ API из переменных окружения (.env файл)
const API_KEY = process.env.YOUTUBE_API_KEY;

// Поисковый запрос
const SEARCH_QUERY = 'инвестиции';

// Максимальное количество каналов для анализа
const MAX_CHANNELS_TO_PROCESS = 500;

// Максимальное количество результатов на одной странице поиска (макс. 50)
const MAX_RESULTS_PER_PAGE = 50;

// Регулярное выражение для поиска ссылок Telegram
const TELEGRAM_REGEX = /(https?:\/\/)?(t(elegram)?\.me)\/([a-zA-Z0-9_]{5,}|joinchat\/[a-zA-Z0-9_=-]+)/gi;

function extractTelegramLinks(text) {
    if (!text) return [];
    const matches = text.match(TELEGRAM_REGEX);
    return matches ? [...new Set(matches)] : [];
}

// Добавляем конфигурацию для фильтрации шортс
const SHORTS_THRESHOLD = 0.7; // Если более 70% последних видео - шортс, канал считается шортс-каналом
const VIDEOS_TO_CHECK = 10; // Количество последних видео для проверки

async function isShortsChannel(channelId) {
    try {
        const response = await youtube.search.list({
            key: API_KEY,
            part: 'snippet',
            channelId: channelId,
            order: 'date',
            type: 'video',
            maxResults: VIDEOS_TO_CHECK
        });

        const videos = response.data.items || [];
        if (videos.length === 0) return false;

        const shortsCount = videos.filter(video => {
            const title = video.snippet.title.toLowerCase();
            const description = video.snippet.description.toLowerCase();
            return title.includes('#shorts') || 
                   description.includes('#shorts') ||
                   video.id.kind === 'youtube#shorts';
        }).length;

        return (shortsCount / videos.length) >= SHORTS_THRESHOLD;
    } catch (error) {
        console.error(`Ошибка при проверке шортс для канала ${channelId}:`, error.message);
        return false;
    }
}

// Добавляем конфигурацию для языкового фильтра
const RUSSIAN_LANGUAGE_CODES = ['ru', 'rus'];

async function isRussianChannel(channel) {
    // Проверяем язык канала по описанию и заголовку
    const title = channel.snippet.title || '';
    const description = channel.snippet.description || '';
    const defaultLanguage = channel.snippet.defaultLanguage;
    
    // Проверяем указанный язык канала
    if (defaultLanguage && RUSSIAN_LANGUAGE_CODES.includes(defaultLanguage.toLowerCase())) {
        return true;
    }

    // Проверяем наличие кириллицы в названии или описании
    const cyrillicPattern = /[\u0400-\u04FF]/;
    return cyrillicPattern.test(title) || cyrillicPattern.test(description);
}

async function findChannelsAndTelegramLinks() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const logFile = `youtube_channels_${timestamp}.txt`;
    const writeLog = (text) => {
        console.log(text);
        fs.appendFileSync(logFile, text + '\n');
    };

    if (!API_KEY) {
        console.error("Ошибка: API ключ не найден в .env файле");
        return;
    }

    writeLog(`Поиск каналов по запросу: "${SEARCH_QUERY}"...`);
    let nextPageToken = null;
    const uniqueChannelIds = new Set();
    let channelsProcessed = 0;
    let estimatedQuotaUsed = 0;
    let channelsWithTelegram = 0;

    try {
        // 1. Поиск каналов напрямую
        let totalResults = 0;
        let searchComplete = false;

        while (channelsProcessed < MAX_CHANNELS_TO_PROCESS) {
            const searchResponse = await youtube.search.list({
                key: API_KEY,
                part: 'snippet',
                q: SEARCH_QUERY,
                type: 'channel',
                relevanceLanguage: 'ru', // Добавляем фильтр по русскому языку
                maxResults: Math.min(MAX_RESULTS_PER_PAGE, MAX_CHANNELS_TO_PROCESS - channelsProcessed),
                pageToken: nextPageToken,
            });

            totalResults = searchResponse.data.pageInfo?.totalResults || 0;
            estimatedQuotaUsed += 100;

            const items = searchResponse.data.items || [];
            if (items.length === 0) {
                searchComplete = true;
                break;
            }

            // Добавляем ID каналов в множество
            items.forEach(item => {
                if (item.snippet?.channelId) {
                    uniqueChannelIds.add(item.snippet.channelId);
                }
            });

            channelsProcessed += items.length;
            nextPageToken = searchResponse.data.nextPageToken;
            
            writeLog(`Найдено каналов: ${uniqueChannelIds.size} из ${totalResults} доступных`);
            
            if (!nextPageToken) {
                searchComplete = true;
                break;
            }
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        writeLog('\n=== Статус поиска ===');
        writeLog(`Всего найдено каналов по запросу "${SEARCH_QUERY}": ${totalResults}`);
        writeLog(`Обработано каналов: ${channelsProcessed}`);
        writeLog(`Поиск ${searchComplete ? 'завершен полностью' : 'остановлен по достижению лимита'}`);
        writeLog('==================\n');

        // 2. Получение подробной информации о каналах
        console.log("\nПолучение информации о каналах...");
        const channelIdsArray = Array.from(uniqueChannelIds);

        for (let i = 0; i < channelIdsArray.length; i += MAX_RESULTS_PER_PAGE) {
            const batchIds = channelIdsArray.slice(i, i + MAX_RESULTS_PER_PAGE);
            
            const channelsResponse = await youtube.channels.list({
                key: API_KEY,
                part: 'snippet',
                id: batchIds.join(','),
                maxResults: MAX_RESULTS_PER_PAGE
            });
            estimatedQuotaUsed += 100;

            for (const channel of channelsResponse.data.items || []) {
                // Проверяем язык канала
                if (!await isRussianChannel(channel)) {
                    writeLog(`\nПропущен не русскоязычный канал: ${channel.snippet.title}`);
                    continue;
                }

                // Проверяем, не является ли канал шортс-каналом
                const isShorts = await isShortsChannel(channel.id);
                if (isShorts) {
                    writeLog(`\nПропущен шортс-канал: ${channel.snippet.title}`);
                    continue;
                }

                const telegramLinks = extractTelegramLinks(channel.snippet.description);
                if (telegramLinks.length > 0) {
                    channelsWithTelegram++;
                    writeLog('\n=====================================');
                    writeLog(`Канал: ${channel.snippet.title}`);
                    writeLog(`Ссылка на канал: https://www.youtube.com/channel/${channel.id}`);
                    writeLog(`Telegram ссылки:`);
                    telegramLinks.forEach(link => writeLog(`- ${link}`));
                    writeLog('=====================================');
                }
            }

            await new Promise(resolve => setTimeout(resolve, 100));
        }

        console.log(`\n=== Итоги ===`);
        writeLog(`\n=== Итоги ===`);
        writeLog(`Всего найдено каналов по запросу: ${totalResults}`);
        writeLog(`Обработано уникальных каналов: ${uniqueChannelIds.size}`);
        writeLog(`Каналов с Telegram ссылками: ${channelsWithTelegram}`);
        writeLog(`Статус поиска: ${searchComplete ? 'Обработаны все доступные каналы' : 'Достигнут установленный лимит'}`);
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
