const puppeteer = require('puppeteer');
const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Кеш для хранения результатов парсинга
const cache = new Map();
const CACHE_DURATION = 30 * 60 * 1000; // 30 минут

// Функция для очистки кеша
function cleanCache() {
    const now = Date.now();
    for (const [key, value] of cache.entries()) {
        if (now - value.timestamp > CACHE_DURATION) {
            cache.delete(key);
        }
    }
}

// Очистка кеша каждые 5 минут
setInterval(cleanCache, 5 * 60 * 1000);

/**
 * Парсинг Stripe ссылок оплаты
 */
async function parseStripePaymentLink(url) {
    const browser = await puppeteer.launch({
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu'
        ]
    });

    try {
        const page = await browser.newPage();
        await page.setDefaultTimeout(30000);
        await page.setDefaultNavigationTimeout(30000);
        await page.goto(url, { waitUntil: 'networkidle2' });

        // Сохраняем скриншот для отладки
        let screenshotPath = null;
        try {
            const fs = require('fs');
            const path = require('path');
            const screenshotsDir = path.join(__dirname, 'screenshots');
            if (!fs.existsSync(screenshotsDir)) fs.mkdirSync(screenshotsDir);
            const host = (new URL(url)).host.replace(/[^a-zA-Z0-9.]/g, '_');
            screenshotPath = path.join(screenshotsDir, `${host}_${Date.now()}.png`);
            await page.screenshot({ path: screenshotPath, fullPage: true });
            console.log('Screenshot saved:', screenshotPath);
        } catch (e) {
            console.error('Screenshot error:', e);
        }

        // Ждем загрузки элементов с валютой и суммой
        await page.waitForSelector('.CurrencyAmount, [data-testid="CurrencyAmount"], .amount, .price, .total', { timeout: 10000 });

        // Извлекаем валюту и сумму
        const result = await page.evaluate(() => {
            // Различные селекторы для поиска валюты и суммы
            const selectors = [
                '.CurrencyAmount',
                '[data-testid="CurrencyAmount"]',
                '[class*="CurrencyAmount"]',
                '.amount',
                '.price',
                '.total',
                '[class*="amount"]',
                '[class*="price"]',
                '[class*="total"]',
                '[class*="ProductSummary"]',
                '[class*="totalAmount"]',
                '[class*="TotalAmount"]',
                '[data-testid*="amount"]',
                '[data-testid*="price"]',
                '[data-testid*="total"]'
            ];

            console.log('Looking for payment amount and currency...');
            
            // Сначала пробуем найти по специфичным селекторам
            for (const selector of selectors) {
                const elements = document.querySelectorAll(selector);
                for (const element of elements) {
                    const text = element.textContent || element.innerText;
                    const htmlContent = element.innerHTML;
                    
                    console.log(`Found element with selector ${selector}: "${text}"`);
                    
                    if (text && text.match(/[\\$£€¥₽]|USD|EUR|GBP|JPY|RUB/)) {
                        // Заменяем &nbsp; на обычный пробел
                        const cleanText = text.replace(/&nbsp;/g, ' ').replace(/\\s+/g, ' ').trim();
                        
                        // Различные паттерны для извлечения валюты и суммы
                        const patterns = [
                            // 20.00 £ или 20.00£
                            /([\\d,]+(?:\\.\\d{2})?)\\s*([£€¥₽\\$])/,
                            // £20.00 или £ 20.00
                            /([£€¥₽\\$])\\s*([\\d,]+(?:\\.\\d{2})?)/,
                            // 20.00 GBP или 20.00 USD
                            /([\\d,]+(?:\\.\\d{2})?)\\s*([A-Z]{3})/,
                            // GBP 20.00 или USD 20.00
                            /([A-Z]{3})\\s*([\\d,]+(?:\\.\\d{2})?)/,
                            // Старый паттерн как запасной
                            /([\\$£€¥₽])|([A-Z]{3})/
                        ];
                        
                        for (const pattern of patterns) {
                            const match = cleanText.match(pattern);
                            if (match) {
                                let currency, amount;
                                
                                if (pattern.toString().includes('\\d')) {
                                    // Паттерны с цифрами
                                    if (match[1] && match[2]) {
                                        if (match[1].match(/[\\d,]+/)) {
                                            // Сумма идет первой
                                            amount = match[1].replace(/,/g, '');
                                            currency = match[2];
                                        } else {
                                            // Валюта идет первой
                                            currency = match[1];
                                            amount = match[2].replace(/,/g, '');
                                        }
                                    }
                                } else {
                                    // Старый паттерн
                                    const amountMatch = cleanText.match(/([\\d,]+(?:\\.\\d{2})?)/);
                                    if (amountMatch) {
                                        currency = match[1] || match[2];
                                        amount = amountMatch[1].replace(/,/g, '');
                                    }
                                }
                                
                                // Конвертируем символы валют в коды
                                const currencyMap = {
                                    '$': 'USD',
                                    '£': 'GBP',
                                    '€': 'EUR',
                                    '¥': 'JPY',
                                    '₽': 'RUB'
                                };
                                
                                if (currencyMap[currency]) {
                                    currency = currencyMap[currency];
                                }
                                
                                if (amount && currency) {
                                    console.log(`Successfully extracted: ${amount} ${currency}`);
                                    return {
                                        amount: amount,
                                        currency: currency,
                                        element: selector,
                                        text: cleanText,
                                        originalText: text
                                    };
                                }
                            }
                        }
                    }
                }
            }
            
            // Если не нашли по селекторам, ищем по всему body
            console.log('Searching in entire body...');
            const bodyText = document.body.textContent || document.body.innerText;
            const cleanBodyText = bodyText.replace(/&nbsp;/g, ' ').replace(/\\s+/g, ' ');
            
            // Паттерны для поиска в тексте
            const bodyPatterns = [
                // 20.00 £ или 20.00£
                /([\\d,]+(?:\\.\\d{2})?)\\s*([£€¥₽\\$])/g,
                // £20.00 или £ 20.00
                /([£€¥₽\\$])\\s*([\\d,]+(?:\\.\\d{2})?)/g,
                // 20.00 GBP или 20.00 USD
                /([\\d,]+(?:\\.\\d{2})?)\\s*([A-Z]{3})/g,
                // GBP 20.00 или USD 20.00
                /([A-Z]{3})\\s*([\\d,]+(?:\\.\\d{2})?)/g
            ];
            
            for (const pattern of bodyPatterns) {
                const matches = [...cleanBodyText.matchAll(pattern)];
                for (const match of matches) {
                    let currency, amount;
                    
                    if (match[1] && match[2]) {
                        if (match[1].match(/[\\d,]+/)) {
                            // Сумма идет первой
                            amount = match[1].replace(/,/g, '');
                            currency = match[2];
                        } else {
                            // Валюта идет первой
                            currency = match[1];
                            amount = match[2].replace(/,/g, '');
                        }
                        
                        // Конвертируем символы валют в коды
                        const currencyMap = {
                            '$': 'USD',
                            '£': 'GBP',
                            '€': 'EUR',
                            '¥': 'JPY',
                            '₽': 'RUB'
                        };
                        
                        if (currencyMap[currency]) {
                            currency = currencyMap[currency];
                        }
                        
                        // Проверяем, что сумма разумная (больше 0 и меньше 100000)
                        const numAmount = parseFloat(amount);
                        if (numAmount > 0 && numAmount < 100000) {
                            console.log(`Found in body: ${amount} ${currency}`);
                            return {
                                amount: amount,
                                currency: currency,
                                source: 'body_search'
                            };
                        }
                    }
                }
            }
            
            console.log('No payment amount found');
            return null;
        });

        // Возвращаем путь к скриншоту для отладки
        if (result) {
            result.screenshot = screenshotPath;
        } else {
            result = { amount: null, currency: null, screenshot: screenshotPath };
        }
        return result;
    } finally {
        await browser.close();
    }
}

/**
 * Парсинг любых ссылок оплаты
 */
async function parsePaymentLink(url) {
    const browser = await puppeteer.launch({
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu'
        ]
    });

    try {
        const page = await browser.newPage();
        
        // Устанавливаем таймауты
        await page.setDefaultTimeout(30000);
        await page.setDefaultNavigationTimeout(30000);
        
        // Переходим на страницу
        await page.goto(url, { waitUntil: 'networkidle2' });

        // Ждем немного для загрузки динамического контента
        await page.waitForTimeout(2000);

        // Извлекаем валюту и сумму
        const result = await page.evaluate(() => {
            // Более широкий поиск по всему тексту страницы
            const bodyText = document.body.textContent || document.body.innerText;
            const cleanBodyText = bodyText.replace(/&nbsp;/g, ' ').replace(/\\s+/g, ' ');
            
            console.log('Searching for payment info in page text...');
            
            // Паттерны для поиска валюты и суммы
            const patterns = [
                // 20.00 £ или 20.00£
                /([\\d,]+(?:\\.\\d{2})?)\\s*([£€¥₽\\$])/g,
                // £20.00 или £ 20.00
                /([£€¥₽\\$])\\s*([\\d,]+(?:\\.\\d{2})?)/g,
                // 20.00 GBP или 20.00 USD
                /([\\d,]+(?:\\.\\d{2})?)\\s*([A-Z]{3})/g,
                // GBP 20.00 или USD 20.00
                /([A-Z]{3})\\s*([\\d,]+(?:\\.\\d{2})?)/g
            ];

            for (const pattern of patterns) {
                const matches = [...cleanBodyText.matchAll(pattern)];
                for (const match of matches) {
                    let currency, amount;
                    
                    if (match[1] && match[2]) {
                        if (match[1].match(/[\\d,]+/)) {
                            // Сумма идет первой
                            amount = match[1].replace(/,/g, '');
                            currency = match[2];
                        } else {
                            // Валюта идет первой
                            currency = match[1];
                            amount = match[2].replace(/,/g, '');
                        }
                        
                        // Конвертируем символы валют в коды
                        const currencyMap = {
                            '$': 'USD',
                            '£': 'GBP',
                            '€': 'EUR',
                            '¥': 'JPY',
                            '₽': 'RUB'
                        };
                        
                        if (currencyMap[currency]) {
                            currency = currencyMap[currency];
                        }
                        
                        // Проверяем, что сумма разумная (больше 0 и меньше 100000)
                        const numAmount = parseFloat(amount);
                        if (numAmount > 0 && numAmount < 100000) {
                            console.log(`Found payment info: ${amount} ${currency}`);
                            return {
                                amount: amount,
                                currency: currency
                            };
                        }
                    }
                }
            }
            
            console.log('No payment info found');
            return null;
        });

        return result;
    } finally {
        await browser.close();
    }
}

// Endpoint для парсинга ссылки оплаты
app.get('/parse', async (req, res) => {
    const { url } = req.query;
    
    if (!url) {
        return res.status(400).json({
            error: 'URL parameter is required'
        });
    }

    // Проверяем кеш
    const cacheKey = url;
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
        console.log(`Cache hit for: ${url}`);
        return res.json(cached.data);
    }

    console.log(`Parsing payment URL: ${url}`);

    try {
        let result;
        
        // Определяем тип ссылки и используем соответствующий парсер
        if (url.includes('stripe.com') || url.includes('buy.stripe.com')) {
            result = await parseStripePaymentLink(url);
        } else {
            result = await parsePaymentLink(url);
        }

        if (result) {
            const response = {
                success: true,
                amount: result.amount,
                currency: result.currency,
                parsed_at: new Date().toISOString()
            };

            // Кешируем результат
            cache.set(cacheKey, {
                data: response,
                timestamp: Date.now()
            });

            res.json(response);
        } else {
            const response = {
                success: false,
                error: 'Could not parse amount and currency from the payment page'
            };
            res.json(response);
        }
    } catch (error) {
        console.error('Error parsing payment URL:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        cache_size: cache.size 
    });
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('Shutting down gracefully...');
    process.exit(0);
});

app.listen(port, () => {
    console.log(`Payment parser service running on port ${port}`);
});
