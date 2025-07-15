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
Ты помощник фрилансера. Ты читаешь описания проектов и пытаешься квалифицировать их. Посмотри на этот проект и скажи — подходит ли он для нас (мое портфолио ниже, для справки)? В противном случае пропускай проект. Если ты рекомендуешь рассмотреть проект, то кратко скажи почему. Если проект не подходит, то напиши "Пропустить." и объясни почему. Не пиши ничего лишнего. Так же интересует создание ботов в телеграм. Так же интересует работа с нейросетями (не изображения). Пропускай 1с программирование. Все что связано с криптовалютой и блокчейном подходит. Чем старше аккаунт рекламодателя тем лучше. Если в описании есть ссылка на figma то это приоритетный проект. Пропускай если ищут арбитражников. Пропускай если бюжет меньше 10000р (но если бюджет не определен то это ок для нас). Достаточно соотвествовать одной из моих компетенций чтоб проект подходил нам.  

Мои компетенции:
hire a web developer, [11.06.2025 11:03]
Hi! I offer web development (full stack - react js , python, php etc...) services: CRM integrations, AI, Telegram, any API, and dashboards - faster than anyone. My goal: 100 outsourcing projects by year-end. Contact @sashanoxon to solve your task—first demo in 24 hours!

My Rates: 1 hour ~ 40$ 

Check out case studies of similar complexity in my channel. Message @sashanoxon to discuss your project. Have a mockup? Send it to @sashanoxonbot for auto-evaluation (Figma link or layout image).

hire a web developer, [11.06.2025 11:03]
Earlier works (without neural networks):

- GitHub: https://github.com/noxonsu - 108 repositories, including MultiCurrencyWallet (Bitcoin, Ethereum, ERC20 wallets with atomic swap exchange) and other blockchain projects.
- Onout: https://onout.org/ - No-code web3 solutions, deploy blockchain apps (DEX, wallets) on custom domains. Features Telegram GPT integration, WordPress plugins, and auto-deployment via Cloudflare Pages.

hire a web developer, [11.06.2025 11:04]
1. 🔄 DEX (UNI FACTORY)
   - Create your DEX based on Uniswap V2.
   - Commission: 0.00% to 20%.
   - Price: 0-$899
   - Editable: Colors, logo, menus, fees, tokenlist.
   - Details: https://onout.org/dex/
   - Preview: https://definance.wpmix.net/

2. 🎰 Lottery
   - Blockchain-based lottery; earn 0-30% commission.
   - Supported Blockchains: ETH, BSC, Polygon.
   - Supported tokens: ERC20 (BEP20).
   - Admin Controls: Start/Finish lottery, set fees.
   - Details: https://onout.org/lottery/
   - Preview: https://lottery.onout.org/

3. 🪙 Wallet
   - Create a multicurrency crypto wallet.
   - Price: $999
   - Supported cryptocurrencies: Bitcoin, Ethereum, tokens.
   - Features: P2P exchange via atomic swaps, customize tokens, set commissions, Visa/MC integration.
   - Editable: Logo, colors, assets list, banners.
   - Details: https://onout.org/wallet/
   - Preview: https://wallet.wpmix.net/

4. 🌾 Farming
   - Create ERC20 Staking & Yield Farming.
   - Price: $799
   - Attract investment by offering rewards.
   - Use any ERC20 tokens, including Uniswap lp.
   - Set staking and reward tokens in the admin panel.
   - Simple Interface & Settings.
   - Details: https://onout.org/farming/
   - Preview: https://farm.wpmix.net/

5. 🗳 DAO
   - Governance and proposals for your crypto token.
   - Price: $600
   - Stakeholders can create/vote for proposals without spending on gas.
   - Supported: Metamask, ERC20, BEP20, other EVM blockchains.
   - Features: Metamask integration, create/vote on proposals, list of votes, set voting period.
   - Based on snapshot.org API.
   - Details: https://onout.org/dao/
   - Preview: https://farm.wpmix.net/daofactory/

6. 🌉 CrossChain
   - Create an EVM compatible blockchain bridge.
   - Price: $1500 
   - Based on multichain.org's open sources.
   - Admin Abilities: Custom design (logo, colors, social links), set up tokens and swap configurations.
   - Reliability: Uses multichain.org open sources with verifiable changes; developed by the MCW wallet team.
   - Connectivity: All EVM blockchains can be supported.
   - Details: https://onout.org/crosschain/
   - Preview: https://crosschain.onout.org/

7. 🚀 IDOFactory - Launchpad
   - Purpose: Launchpad solution for IDO pools and token locking.
   - Price: $950
   - Feature: Use your token for IDO pools or native coins like ETH, BNB for token lockers.
   - Editable: Logo, title, social links, services' fees, admin and fee addresses.
   - Note: Admin does not have access to the smart contracts, and the software should be used at one's own risk.
   - Details: https://onout.org/launchpad/
   - Preview: https://launchpad.onout.org/

https://t.me/onoutsupportbot - Talk to team!!!!

hire a web developer, [11.06.2025 11:04]
Task: Cold sales via neuro-commenting.

Solution: System parses crypto projects from blockchain, finds websites via Google (serpapi.com), analyzes content, and locates Telegram chats. Data is stored in Google Sheets. A human joins groups (anti-spam, no automation possible), and a script sends personalized commercial offers, saving message links.

Result: Processed thousands of projects, sent offers. ROI was zero (targeted a dying market), but the case is scalable to any industry.

Why? Automates cold sales for your business. Your parsing sources and channels (e.g., email) may differ, but the flow remains: search, analyze, generate offer, send.

Contact: @sashanoxon

hire a web developer, [11.06.2025 11:06]
Task: Gather a female audience for weight loss.

Solution:

Telegram Bot https://t.me/calloriescalculatorbot

A calorie-counting Telegram bot that:

- Asks for daily calorie goals and tracks intake via text, photos (OCR via OpenAI), or voice messages (transcribed).
- Resets daily based on user’s timezone (determined by city).
- Stores user data (name, city, timezone) in long-term memory.
- Boosts engagement by occasionally prompting to pin the chat or share via referral link (https://t.me/fatnosecretbot/?start=chatId).

Prompt example: Tracks calories, accepts text/photo/voice, resets daily, stores data, encourages sharing after proving value, double-checks calculations.
Result:

Seeded female audience (~0.5$ per user in tests). Users engage, share links, and find the bot via search.

Why?

Custom bots can target any audience, drive engagement, sell, and go viral.

Contact: @sashanoxon

hire a web developer, [11.06.2025 11:07]
Task: Find leads for development projects on Upwork.com.

Solution:

Parser for new project feeds. Each project is analyzed with a prompt:

You’re a freelancer’s assistant. You read project descriptions and qualify them. Check if this project seems posted by a large company, agency, or is a B2B system. Skip projects from individuals, small clients, or students. If you recommend pursuing the project, provide a description of what needs to be coded as instructions for a neural network developer. If not, write “No”. Keep it concise. We’re also interested in Telegram bot development and working with neural networks (non-image). Skip 1C programming. Bitrix is acceptable. Skip if they’re looking for arbitrage specialists. Here’s the project description: [description].

Selected projects are sent to me via Telegram with a starter prompt for Copilot.

Result:

Generated leads from Upwork.com.

Contact me for any development needs: @sashanoxon

hire a web developer, [11.06.2025 11:07]
Task: Create a bot for internal use in a crypto exchanger to quickly calculate fair rates, perform AML checks, and verify against blocklists via API.

Solution:

A Telegram bot using the /aml command. User inputs an address, and the bot queries a service to return whether the address is safe to use. Supports Bitcoin and Tron, and calculates rates based on the exchanger’s internal rates.

Contact: @sashanoxon

hire a web developer, [11.06.2025 11:08]
Task: Replace Windows' default Voice-to-Text, which poorly handles mixed Russian/English terms. I built a program triggered by a hotkey, listening to the microphone until speech stops, converting it to Russian or English text, and cleaning it of filler words.

Prompt for audio post-processing:

This is an audio transcription. Remove filler sounds like "uh," "um," and make the text look typed, without parasite words or pauses. Return only the cleaned text, no explanations or prefixes.

If posting to Telegram, include: https://t.me/sashanoxon

Result:

Faster text communication, especially for explaining things to non-technical people without calls. Also useful for interacting with Copilot (the AI I use for code editing), which can’t process audio yet.

Contact: https://t.me/sashanoxon

hire a web developer, [11.06.2025 11:08]
Task: Create a web-based dashboard for telephony analysis. The client has a virtual PBX (Asterisk) with multiple operators. The dashboard must visually display operations, comply with personal data storage regulations, and run on the client’s server (market solutions don’t meet data privacy requirements).

Solution:

Integrated with Asterisk API to export call data.
Implemented speech transcription for call recordings.
Applied semantic analysis via neural networks to identify call purposes.
Built an authentication system (admin configures departments, operator passwords, etc., via Google Sheets).
Tech Stack:

Backend: Node.js for API integration and data processing.
Frontend: React with Tailwind CSS for responsive, modern UI.
Neural Network: Custom model for semantic analysis (non-image).
Database: PostgreSQL (on client’s server) for call data and user configs.
Authentication: JWT-based, linked to Google Sheets for admin management.
Features:

Real-time call metrics (duration, operator performance, call volume).
Transcribed call logs with searchable semantic tags (e.g., “complaint,” “sales”).
Secure data storage on client’s server.
Role-based access (admin, operator) with Google Sheets-driven config.
Contact: https://t.me/sashanoxon

hire a web developer, [11.06.2025 11:09]
Task: Create a bot to analyze Figma designs, assess complexity (screens, elements, user scenarios, complex components), and estimate implementation effort. For Figma files, it exports structured text data for subsequent development.

Solution:

@sashanoxonbot анализирует макеты Figma через API, считает экраны/элементы, определяет пользовательские потоки и сложные компоненты (например, интерактивные виджеты) и предоставляет оценку трудозатрат. Экспортирует структурированный текст (например, иерархия компонентов, стили) для фронтенд-разработки.

Result:

Автоматизированный анализ сложности и подготовка данных для кодирования. Затраченное время: 5 часов.

Contact: @sashanoxon

скилы: python, nodejs, react, telegram bot, figma api, нейросети, ai, web development, blockchain, crypto, smart contracts, api integration, full stack development

КОНЕЦ КОМПЕТЕНЦИЙ И ПОРТФОЛИО. 

Вот описание проекта для анализа: 
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
    
    // Updated selector - look for div with class 'text-5' that contains the project description
    // The description is typically in a div with id starting with 'projectp' followed by project ID
    const description = $('div[id^="projectp"]').text().trim() || 
                       $('div.text-5.b-layout__txt_padbot_20').text().trim() ||
                       $('div.text-5').first().text().trim();
    
    // Extract budget information
    let budget = null;
    // Look for budget in different possible locations
    const budgetSelectors = [
      'div.text-4:contains("Бюджет:") span',
      'div:contains("Бюджет:") span',
      '.budget',
      '[class*="budget"]'
    ];
    
    for (const selector of budgetSelectors) {
      const budgetElement = $(selector);
      if (budgetElement.length > 0) {
        const budgetText = budgetElement.text().trim();
        if (budgetText && budgetText !== 'Бюджет:') {
          // Clean budget text by removing HTML entities and extra characters
          budget = budgetText
            .replace(/&#8381;/g, 'руб')
            .replace(/\s+/g, ' ')
            .trim();
          break;
        }
      }
    }
    
    // Alternative: search for budget in the entire page text
    if (!budget) {
      const pageText = $('body').text();
      const budgetMatch = pageText.match(/Бюджет:\s*([^\n\r]+)/i);
      if (budgetMatch) {
        budget = budgetMatch[1]
          .replace(/&#8381;/g, 'руб')
          .replace(/\s+/g, ' ')
          .trim();
      }
    }
    
    const registrationDate = extractRegistrationDate(response.data);
    return { description: description || 'Описание не найдено', registrationDate, budget };
  } catch (error) {
    console.error(`Ошибка при получении деталей проекта ${projectUrl}:`, error.message);
    return { description: 'Ошибка при получении описания', registrationDate: null, budget: null };
  }
}

async function analyzeProject(projectTitle, projectDescription, registrationDate) {
  try {
    // Проверка даты регистрации - СНАЧАЛА проверяем возраст аккаунта
    let isOldEnough = false;
    if (registrationDate) {
      // Handle different registration date formats
      const yearMatch = registrationDate.match(/(\d+)\s*лет/);
      const monthMatch = registrationDate.match(/(\d+)\s*месяц/);
      const yearAndMonthMatch = registrationDate.match(/(\d+)\s*года?\s+и\s+(\d+)\s*месяц/);
      
      let totalYears = 0;
      
      if (yearAndMonthMatch) {
        // Format: "4 года и 6 месяцев"
        totalYears = parseInt(yearAndMonthMatch[1]) + (parseInt(yearAndMonthMatch[2]) / 12);
      } else if (yearMatch) {
        // Format: "5 лет"
        totalYears = parseInt(yearMatch[1]);
      } else if (monthMatch) {
        // Format: "8 месяцев"
        totalYears = parseInt(monthMatch[1]) / 12;
      }
      
      if (totalYears >= 1) {
        isOldEnough = true;
      }
    }

    // Если аккаунт слишком новый - пропускаем БЕЗ обращения к OpenAI
    if (!isOldEnough) {
      console.log(`Заказчик зарегистрирован менее 1 года (${registrationDate}). Пропускаем проект.`);
      return 'Пропустить. Заказчик зарегистрирован менее 1 года назад.';
    }

    // ТОЛЬКО если аккаунт старый - обращаемся к OpenAI (тратим деньги)
    const userMessageContent = [
      {
        type: 'input_text',
        text: `Название проекта: ${projectTitle}\n Описание: ${projectDescription}\n Дата регистрации заказчика: ${registrationDate}`,
      },
    ];

    let retries = 3;
    while (retries > 0) {
      try {
        // Use a unique chat ID for each request to avoid sending history
        const uniqueChatId = Math.floor(Date.now() / 1000) + Math.floor(Math.random() * 1000);
        const analysis = await callOpenAI(uniqueChatId, userMessageContent);
        if (!analysis || analysis.trim().toLowerCase().includes('пропустить')) {
          return analysis || 'Пропустить. Проект не подходит по критериям.';
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
      return 'Пропустить. Ошибка анализа проекта.';
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
      let projectTitle = item.title || 'Без названия';
      const projectUrl = item.link;

      if (processedProjects[projectUrl]) {
        console.log(`Проект уже обработан: ${projectTitle}`);
        continue;
      }

      console.log(`Обработка проекта: ${projectTitle}`);

      // Используем только данные из RSS, без дополнительных HTTP запросов
      const description = item.contentSnippet || item.description || 'Описание из RSS';
      const registrationDate = null; // Временно отключено из-за 403 ошибок
      const budget = null; // Временно отключено из-за 403 ошибок
      
      // Если нужны дополнительные данные, раскомментируйте:
      // const { description, registrationDate, budget } = await fetchProjectDetails(projectUrl);
      
      // Add budget to title if not already present and budget exists
      if (budget && !projectTitle.toLowerCase().includes('бюджет') && !projectTitle.includes('₽') && !projectTitle.includes('руб')) {
        projectTitle = `${projectTitle} (Бюджет: ${budget})`;
      }
      
      // Add account age and budget to project description
      let projectDescription = description;
      
      if (registrationDate) {
        projectDescription += `\n\nВозраст аккаунта заказчика: ${registrationDate}`;
      }
      
      if (budget && !description.toLowerCase().includes('бюджет')) {
        projectDescription += `\n\nБюджет проекта: ${budget}`;
      }

      const analysis = await analyzeProject(projectTitle, projectDescription, registrationDate);

      console.log(`Проект: ${projectTitle}`);
      console.log(`Описание: ${projectDescription}`);
      console.log(`Анализ: ${analysis}`);
      if (analysis !== 'Ошибка анализа' && !analysis.toLowerCase().includes('пропустить')) {
        const message = `Новый проект: ${projectTitle}\nURL: ${projectUrl}\nОписание: ${projectDescription}\nДата регистрации заказчика: ${registrationDate}\nБюджет: ${budget || 'Не указан'}\nАнализ: ${analysis}`;
        try {
          await bot.sendMessage(29165285, message);
          console.log(`Сообщение отправлено в Telegram для проекта: ${projectTitle}`);
        } catch (error) {
          console.error(`Ошибка при отправке сообщения в Telegram: ${error.message}`);
        }
      } else {
        console.log(`Проект пропущен: ${analysis}`);
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

  const interval = 15 * 60 * 1000; // Увеличено с 5 до 15 минут
  setInterval(async () => {
    console.log('Запуск периодического опроса RSS...');
    await processFeed();
  }, interval);
}

main();
