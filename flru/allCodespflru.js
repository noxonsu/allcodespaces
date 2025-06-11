const Parser = require('rss-parser');
const axios = require('axios');
const cheerio = require('cheerio');
const TelegramBot = require('node-telegram-bot-api');
const dotenv = require('dotenv');
const fs = require('fs').promises;

// Установка nameprompt и загрузка .env файла
const nameprompt = 'flru';
const envPath = `.env.${nameprompt}`;
const result = dotenv.config({ path: envPath });

const { setSystemMessage, callOpenAI } = require('./openai');

if (result.error) {
  console.error(`Ошибка загрузки файла ${envPath}:`, result.error.message);
  process.exit(1);
}

const openaiApiKey = process.env.OPENAI_API_KEY;
if (!openaiApiKey) {
  console.error(`Не удалось загрузить ключ API из файла ${envPath}`);
  process.exit(1);
}

const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN;
if (!telegramBotToken) {
  console.error('TELEGRAM_BOT_TOKEN не найден в .env файле');
  process.exit(1);
}
const bot = new TelegramBot(telegramBotToken, { polling: false });

const parser = new Parser();
const rssUrl = 'https://www.fl.ru/rss/all.xml';
const chatId = 1; // Уникальный chatId для OpenAI
const logFile = 'processed_projects.json';

// Установка системного сообщения
const systemPrompt = `
Ты помощник фрилансера. Ты читаешь описания проектов и пытаешься квалифицировать их. Посмотри на этот проект и скажи — похоже ли, что проект размещён крупной компанией или агенством или это система для B2B? В противном случае пропускай проект (нам не нужны проекты от физлиц или мелких заказчиков или студентов). Если ты рекомендуешь рассмотреть проект, то дай описание что нужно накодить в виде инструкции для нейросети-разработчика. Если нет, то просто напиши "Нет". Не пиши ничего лишнего. Так же интересует создание ботов в телеграм. Так же интересует работа с нейросетями (не изображения). Пропускай 1с программирование. Битрикс подходит. Пропускай если ищут арбитражников.  Вот описание проекта:
`;
setSystemMessage(systemPrompt);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Загрузка лога обработанных проектов
async function loadProcessedProjects() {
  try {
    const data = await fs.readFile(logFile, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return {};
    }
    console.error('Ошибка при чтении файла логов:', error.message);
    return {};
  }
}

// Сохранение лога обработанных проектов
async function saveProcessedProject(projectUrl) {
  const processed = await loadProcessedProjects();
  processed[projectUrl] = new Date().toISOString();
  try {
    await fs.writeFile(logFile, JSON.stringify(processed, null, 2));
  } catch (error) {
    console.error('Ошибка при сохранении лога:', error.message);
  }
}

function extractRegistrationDate(htmlContent) {
  const $ = cheerio.load(htmlContent);
  const registrationText = $('div.mt-8.text-7:contains("Зарегистрирован на сайте")').text();
  const match = registrationText.match(/Зарегистрирован на сайте\s*(.+)/);
  return match ? match[1].trim() : null;
}

async function fetchProjectDetails(projectUrl) {
  try {
    const response = await axios.get(projectUrl);
    const $ = cheerio.load(response.data);
    const description = $('div.b-post__txt').text().trim();
    const registrationDate = extractRegistrationDate(response.data);
    return { description: description || 'Описание не найдено', registrationDate };
  } catch (error) {
    console.error(`Ошибка при получении деталей проекта ${projectUrl}:`, error.message);
    return { description: 'Ошибка при получении описания', registrationDate: null };
  }
}

async function analyzeProject(projectTitle, projectDescription, registrationDate) {
  try {
    // Проверка даты регистрации
    let isOldEnough = false;
    if (registrationDate) {
      const match = registrationDate.match(/(\d+)\s*лет/);
      if (match && parseInt(match[1]) >= 2) {
        isOldEnough = true;
      }
    }

    if (!isOldEnough) {
      console.log(`Заказчик зарегистрирован менее 2 лет (${registrationDate}). Пропускаем проект.`);
      return 'Нет';
    }

    const userMessageContent = [
      {
        type: 'input_text',
        text: `Название проекта: ${projectTitle}\n Описание: ${projectDescription}\n Дата регистрации заказчика: ${registrationDate}`,
      },
    ];

    let retries = 3;
    while (retries > 0) {
      try {
        const analysis = await callOpenAI(chatId, userMessageContent);
        if (!analysis || analysis.trim() === 'Нет' || analysis.trim() === 'Нет.' || analysis.match(/пропустить этот проект/i)) {
          return 'Нет';
        }
        return analysis;
      } catch (error) {
        retries--;
        if (retries === 0) {
          throw error;
        }
        await sleep(1000);
      }
    }
  } catch (error) {
    console.error('Ошибка при анализе проекта:', error.message);
    if (error instanceof SyntaxError && error.message.includes('JSON')) {
      console.log('Инициализация нового чата...');
      return 'Нет';
    }
    return 'Ошибка анализа';
  }
}

async function processFeed() {
  try {
    const feed = await parser.parseURL(rssUrl);
    console.log(`Получено ${feed.items.length} проектов`);

    const processedProjects = await loadProcessedProjects();
    const delay = 4000;

    for (const item of feed.items) {
      const projectTitle = item.title || 'Без названия';
      const projectUrl = item.link;

      if (processedProjects[projectUrl]) {
        console.log(`Проект уже обработан: ${projectTitle}`);
        continue;
      }

      console.log(`Обработка проекта: ${projectTitle}`);

      const { description: projectDescription, registrationDate } = await fetchProjectDetails(projectUrl);

      const analysis = await analyzeProject(projectTitle, projectDescription, registrationDate);

      console.log(`Проект: ${projectTitle}`);
      console.log(`Описание: ${projectDescription}`);
      console.log(`Дата регистрации: ${registrationDate}`);
      console.log(`Анализ: ${analysis}`);
      if (analysis !== 'Нет' && analysis !== 'Ошибка анализа') {
        const message = `Новый проект: ${projectTitle}\nURL: ${projectUrl}\nОписание: ${projectDescription}\nДата регистрации заказчика: ${registrationDate}\nАнализ: ${analysis}`;
        try {
          await bot.sendMessage(29165285, message);
          console.log(`Сообщение отправлено в Telegram для проекта: ${projectTitle}`);
        } catch (error) {
          console.error(`Ошибка при отправке сообщения в Telegram: ${error.message}`);
        }
      }

      await saveProcessedProject(projectUrl);
      console.log('---');

      await sleep(delay);
    }
  } catch (error) {
    console.error('Ошибка при получении RSS:', error.message);
  }
}

async function main() {
  await processFeed();

  const interval = 5 * 60 * 1000;
  setInterval(async () => {
    console.log('Запуск периодического опроса RSS...');
    await processFeed();
  }, interval);
}

main();
