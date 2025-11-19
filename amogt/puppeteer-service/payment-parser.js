const puppeteer = require('puppeteer');
const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3018;

// Middleware
app.use(cors());
app.use(express.json());

/**
 * Парсинг ссылок оплаты
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
            '--disable-gpu',
            '--disable-web-security',
            '--disable-features=VizDisplayCompositor'
        ]
    });

    try {
        const page = await browser.newPage();
        
        // Устанавливаем User-Agent
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
        
        // Устанавливаем таймауты
        await page.setDefaultTimeout(30000);
        await page.setDefaultNavigationTimeout(30000);
        
        // Переходим на страницу
        await page.goto(url, { waitUntil: 'networkidle2' });

        // Ждем загрузки элементов с валютой и суммой
        try {
            await page.waitForSelector('.CurrencyAmount, [data-testid="CurrencyAmount"], .amount, .price, .total', { timeout: 5000 });
        } catch (e) {
            console.log('Selector not found, proceeding with page evaluation');
        }

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
                    
                    if (text && text.match(/[$£€¥₽]|USD|EUR|GBP|JPY|RUB/)) {
                        // Заменяем &nbsp; на обычный пробел
                        const cleanText = text.replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
                        
                        // Различные паттерны для извлечения валюты и суммы
                        const patterns = [
                            // 20.00 £ или 20.00£ или 20,00 £
                            /([0-9,]+(?:\.[0-9]{2})?)\s*([£€¥₽$])/,
                            // £20.00 или £ 20.00
                            /([£€¥₽$])\s*([0-9,]+(?:\.[0-9]{2})?)/,
                            // 20.00 GBP или 20.00 USD
                            /([0-9,]+(?:\.[0-9]{2})?)\s*([A-Z]{3})/,
                            // GBP 20.00 или USD 20.00
                            /([A-Z]{3})\s*([0-9,]+(?:\.[0-9]{2})?)/
                        ];
                        
                        for (const pattern of patterns) {
                            const match = cleanText.match(pattern);
                            if (match) {
                                let currency, amount;
                                
                                if (match[1] && match[2]) {
                                    if (match[1].match(/[0-9,]+/)) {
                                        // Сумма идет первой
                                        amount = match[1].replace(/,/g, '');
                                        currency = match[2];
                                    } else {
                                        // Валюта идет первой
                                        currency = match[1];
                                        amount = match[2].replace(/,/g, '');
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
            const cleanBodyText = bodyText.replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
            
            // Паттерны для поиска в тексте
            const bodyPatterns = [
                // 20.00 £ или 20.00£ или 20,00 £
                /([0-9,]+(?:\.[0-9]{2})?)\s*([£€¥₽$])/g,
                // £20.00 или £ 20.00
                /([£€¥₽$])\s*([0-9,]+(?:\.[0-9]{2})?)/g,
                // 20.00 GBP или 20.00 USD
                /([0-9,]+(?:\.[0-9]{2})?)\s*([A-Z]{3})/g,
                // GBP 20.00 или USD 20.00
                /([A-Z]{3})\s*([0-9,]+(?:\.[0-9]{2})?)/g
            ];
            
            for (const pattern of bodyPatterns) {
                const matches = [...cleanBodyText.matchAll(pattern)];
                for (const match of matches) {
                    let currency, amount;
                    
                    if (match[1] && match[2]) {
                        if (match[1].match(/[0-9,]+/)) {
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

// Endpoint для парсинга ссылки оплаты (БЕЗ КЭША)
app.get('/parse', async (req, res) => {
    const { url } = req.query;
    
    if (!url) {
        return res.status(400).json({
            error: 'URL parameter is required'
        });
    }

    console.log(`Parsing payment URL (no cache): ${url}`);

    try {
        const result = await parsePaymentLink(url);

        if (result && result.amount && result.currency) {
            const response = {
                success: true,
                amount: result.amount,
                currency: result.currency,
                parsed_at: new Date().toISOString(),
                screenshot: result.screenshot
            };

            res.json(response);
        } else {
            const response = {
                success: false,
                error: 'Could not parse amount and currency from the payment page',
                screenshot: result ? result.screenshot : null
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
        cache_disabled: true
    });
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('Shutting down gracefully...');
    process.exit(0);
});

app.listen(port, () => {
    console.log(`Payment parser service running on port ${port} (cache disabled)`);
});
