const express = require('express');
const puppeteer = require('puppeteer');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const cors = require('cors');
const NodeCache = require('node-cache');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3018;

// Настройка безопасности
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", "data:", "https:"],
        },
    },
    hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
    }
}));

// CORS настройки (только для localhost)
app.use(cors({
    origin: ['http://localhost', 'http://127.0.0.1'],
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: false
}));

// Rate limiting - защита от DoS атак
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 минут
    max: 100, // максимум 100 запросов с одного IP за 15 минут
    message: {
        success: false,
        error: 'Too many requests from this IP, please try again later.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
        console.log(`Rate limit exceeded for IP: ${req.ip}`);
        res.status(429).json({
            success: false,
            error: 'Too many requests from this IP, please try again later.'
        });
    }
});

app.use(limiter);

// Middleware для парсинга JSON
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Кэш для результатов парсинга (TTL 5 минут)
const cache = new NodeCache({ 
    stdTTL: 300, // 5 минут
    checkperiod: 60, // проверка каждые 60 секунд
    maxKeys: 1000 // максимум 1000 ключей
});

// Логирование
const logFile = path.join(__dirname, 'logs', 'puppeteer.log');
function logMessage(message, level = 'INFO') {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] [${level}] ${message}\n`;
    
    console.log(logEntry.trim());
    
    // Создаем директорию для логов если её нет
    const logDir = path.dirname(logFile);
    if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
    }
    
    fs.appendFile(logFile, logEntry, (err) => {
        if (err) console.error('Error writing to log file:', err);
    });
}

// Валидация URL
function validateUrl(url) {
    const allowedDomains = [
        'pay.openai.com',
        'pay.stripe.com',
        'checkout.stripe.com',
        'payments.paypal.com',
        'www.paypal.com',
        'paypal.com',
        'secure.paypal.com',
        'checkout.paypal.com',
        'checkout.paddle.com',
        'pay.paddle.com',
        'checkout.razorpay.com',
        'api.razorpay.com',
        'checkout.square.com',
        'squareup.com',
        'connect.squareup.com',
        'buy.itunes.apple.com',
        'apps.apple.com',
        'secure.authorize.net',
        'accept.authorize.net',
        'checkout.braintreepayments.com',
        'www.braintreepayments.com',
        'js.braintreegateway.com',
        'checkout.coinbase.com',
        'commerce.coinbase.com',
        'pay.google.com',
        'payments.google.com',
        'checkout.shopify.com',
        'shopify.com',
        'amazon.com',
        'payments.amazon.com',
        'pay.amazon.com',
        'checkout.klarna.com',
        'js.klarna.com',
        'checkout.afterpay.com',
        'portal.afterpay.com',
        'checkout.affirm.com',
        'cdn1.affirm.com',
        'secure.worldpay.com',
        'payments.worldpay.com',
        'checkout.2checkout.com',
        'secure.2checkout.com',
        'checkout.mollie.com',
        'www.mollie.com',
        'secure.adyen.com',
        'checkoutshopper-live.adyen.com',
        'checkoutshopper-test.adyen.com',
        'checkout.sumup.com',
        'api.sumup.com',
        'checkout.wepay.com',
        'www.wepay.com',
        'checkout.dwolla.com',
        'www.dwolla.com',
        'checkout.bluesnap.com',
        'checkout.fastspring.com',
        'onfastspring.com',
        'checkout.chargebee.com',
        'js.chargebee.com',
        'checkout.recurly.com',
        'js.recurly.com',
        'checkout.paymill.com',
        'bridge.paymill.com',
        'checkout.gocardless.com',
        'pay.gocardless.com'
    ];
    
    try {
        const parsedUrl = new URL(url);
        
        // Проверка протокола
        if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
            return { valid: false, reason: 'Invalid protocol' };
        }
        
        // Проверка домена
        const host = parsedUrl.hostname.toLowerCase();
        const hostWithoutWww = host.replace(/^www\./, '');
        
        const isDomainAllowed = allowedDomains.some(allowedDomain => {
            const allowedDomainLower = allowedDomain.toLowerCase();
            const allowedDomainWithoutWww = allowedDomainLower.replace(/^www\./, '');
            
            return host === allowedDomainLower || 
                   hostWithoutWww === allowedDomainWithoutWww ||
                   host === allowedDomainWithoutWww ||
                   hostWithoutWww === allowedDomainLower;
        });
        
        if (!isDomainAllowed) {
            return { valid: false, reason: `Domain '${host}' not allowed` };
        }
        
        // Проверка на локальные IP
        const isLocalIP = /^(127\.|192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/.test(host);
        if (isLocalIP || host === 'localhost') {
            return { valid: false, reason: 'Local addresses not allowed' };
        }
        
        // Проверка длины URL
        if (url.length > 2048) {
            return { valid: false, reason: 'URL too long' };
        }
        
        // Проверка на подозрительные символы
        const suspiciousPatterns = [
            /<|>|"|'|\(|\)|\{|\}|\[|\]/,
            /javascript:/i,
            /data:/i,
            /file:/i,
            /\x00/,
            /\r|\n/
        ];
        
        for (const pattern of suspiciousPatterns) {
            if (pattern.test(url)) {
                return { valid: false, reason: 'URL contains suspicious characters' };
            }
        }
        
        return { valid: true, reason: '' };
        
    } catch (error) {
        return { valid: false, reason: 'Invalid URL format' };
    }
}

// Глобальный экземпляр браузера
let browser = null;

// Функция для инициализации браузера
async function initBrowser() {
    if (browser) {
        return browser;
    }
    
    try {
        logMessage('Initializing Puppeteer browser...', 'INFO');
        
        browser = await puppeteer.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--disable-software-rasterizer',
                '--disable-background-timer-throttling',
                '--disable-backgrounding-occluded-windows',
                '--disable-renderer-backgrounding',
                '--disable-features=TranslateUI',
                '--disable-ipc-flooding-protection',
                '--disable-web-security',
                '--disable-features=VizDisplayCompositor',
                '--no-zygote',
                '--disable-extensions',
                '--disable-plugins',
                '--disable-default-apps',
                '--disable-sync',
                '--disable-translate',
                '--hide-scrollbars',
                '--mute-audio',
                '--no-first-run',
                '--safebrowsing-disable-auto-update',
                '--disable-background-networking',
                '--disable-client-side-phishing-detection',
                '--disable-component-extensions-with-background-pages',
                '--disable-hang-monitor',
                '--disable-popup-blocking',
                '--disable-prompt-on-repost',
                '--metrics-recording-only',
                '--no-default-browser-check',
                '--no-pings',
                '--password-store=basic',
                '--use-mock-keychain',
                '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            ],
            timeout: 30000,
            defaultViewport: {
                width: 1280,
                height: 720
            }
        });
        
        logMessage('Browser initialized successfully', 'INFO');
        return browser;
        
    } catch (error) {
        logMessage(`Failed to initialize browser: ${error.message}`, 'ERROR');
        throw error;
    }
}

// Функция для парсинга платежной страницы
async function parsePaymentPage(url) {
    const cacheKey = crypto.createHash('md5').update(url).digest('hex');
    
    // Проверяем кэш
    const cachedResult = cache.get(cacheKey);
    if (cachedResult) {
        logMessage(`Cache hit for URL: ${url}`, 'INFO');
        return cachedResult;
    }
    
    let page = null;
    try {
        logMessage(`Parsing payment page: ${url}`, 'INFO');
        
        const browserInstance = await initBrowser();
        page = await browserInstance.newPage();
        
        // Настройка страницы для безопасности
        await page.setRequestInterception(true);
        
        page.on('request', (req) => {
            // Блокируем загрузку изображений, стилей и скриптов для ускорения
            const resourceType = req.resourceType();
            if (['image', 'stylesheet', 'font', 'script'].includes(resourceType)) {
                req.abort();
            } else {
                req.continue();
            }
        });
        
        // Устанавливаем заголовки для безопасности
        await page.setExtraHTTPHeaders({
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Upgrade-Insecure-Requests': '1'
        });
        
        // Переходим на страницу с тайм-аутом
        await page.goto(url, {
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });
        
        // Ждем загрузки контента
        await page.waitForTimeout(3000);
        
        // Парсинг различных платежных систем
        const result = await page.evaluate(() => {
            let amount = null;
            let currency = null;
            
            // Специальная обработка для CurrencyAmount элемента
            const currencyAmountElement = document.querySelector('.CurrencyAmount');
            if (currencyAmountElement) {
                const text = currencyAmountElement.textContent || currencyAmountElement.innerText;
                console.log('CurrencyAmount text:', text);
                
                // Обрабатываем текст типа "20,00 £" или "20.00 £"
                if (text) {
                    const cleanText = text.replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
                    console.log('Cleaned text:', cleanText);
                    
                    // Паттерны для извлечения суммы и валюты
                    const patterns = [
                        // 20,00 £ или 20.00 £
                        /([0-9,]+(?:\.[0-9]{2})?)\s*([£€¥₽$])/,
                        // £ 20,00 или £20.00
                        /([£€¥₽$])\s*([0-9,]+(?:\.[0-9]{2})?)/,
                        // 20,00 GBP или 20.00 USD
                        /([0-9,]+(?:\.[0-9]{2})?)\s*([A-Z]{3})/,
                        // GBP 20,00 или USD 20.00
                        /([A-Z]{3})\s*([0-9,]+(?:\.[0-9]{2})?)/
                    ];
                    
                    for (const pattern of patterns) {
                        const match = cleanText.match(pattern);
                        if (match) {
                            console.log('Pattern match:', match);
                            
                            if (match[1] && match[2]) {
                                if (match[1].match(/[0-9,]+/)) {
                                    // Сумма идет первой
                                    amount = parseFloat(match[1].replace(/,/g, ''));
                                    currency = match[2];
                                } else {
                                    // Валюта идет первой
                                    currency = match[1];
                                    amount = parseFloat(match[2].replace(/,/g, ''));
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
                                
                                console.log('Extracted from CurrencyAmount:', amount, currency);
                                break;
                            }
                        }
                    }
                }
            }
            
            // Если не нашли в CurrencyAmount, используем общий поиск
            if (!amount || !currency) {
                // Селекторы для разных платежных систем
                const selectors = {
                    // OpenAI Pay
                    openai: {
                        amount: [
                            '[data-testid="amount"]',
                            '.amount',
                            '[class*="amount"]',
                            '[class*="price"]',
                            '[class*="total"]',
                            '.CurrencyAmount'
                        ],
                        currency: [
                            '[data-testid="currency"]',
                            '.currency',
                            '[class*="currency"]',
                            '[class*="symbol"]',
                            '.CurrencyAmount'
                        ]
                    },
                    
                    // Stripe
                    stripe: {
                        amount: [
                            '[data-testid="total-amount"]',
                            '.OrderSummaryTotalAmount',
                            '.amount',
                            '[class*="amount"]',
                            '[class*="price"]',
                            '[class*="total"]',
                            '.CurrencyAmount'
                        ],
                        currency: [
                            '[data-testid="currency"]',
                            '.currency',
                            '[class*="currency"]',
                            '.CurrencyAmount'
                        ]
                    },
                    
                    // PayPal
                    paypal: {
                        amount: [
                            '#totalAmount',
                            '.amount',
                            '[data-testid="amount"]',
                            '[class*="amount"]',
                            '[class*="price"]',
                            '[class*="total"]'
                        ],
                        currency: [
                            '.currency',
                            '[data-testid="currency"]',
                            '[class*="currency"]'
                        ]
                    },
                    
                    // Общие селекторы
                    generic: {
                        amount: [
                            '[data-amount]',
                            '[data-price]',
                            '[data-total]',
                            '.amount',
                            '.price',
                            '.total',
                            '[class*="amount"]',
                            '[class*="price"]',
                            '[class*="total"]',
                            '[class*="cost"]',
                            '[class*="sum"]',
                            '.CurrencyAmount'
                        ],
                        currency: [
                            '[data-currency]',
                            '.currency',
                            '[class*="currency"]',
                            '[class*="symbol"]',
                            '.CurrencyAmount'
                        ]
                    }
                };
                
                // Функция для поиска элемента по селекторам
                function findElement(selectorsList) {
                    for (const selector of selectorsList) {
                        const element = document.querySelector(selector);
                        if (element) {
                            return element;
                        }
                    }
                    return null;
                }
                
                // Определяем платежную систему по домену
                const hostname = window.location.hostname.toLowerCase();
                let paymentSystem = 'generic';
                
                if (hostname.includes('openai.com')) {
                    paymentSystem = 'openai';
                } else if (hostname.includes('stripe.com')) {
                    paymentSystem = 'stripe';
                } else if (hostname.includes('paypal.com')) {
                    paymentSystem = 'paypal';
                }
                
                // Ищем сумму
                const amountElement = findElement(selectors[paymentSystem].amount) || 
                                    findElement(selectors.generic.amount);
                
                if (amountElement && !amount) {
                    const amountText = amountElement.textContent || amountElement.innerText || 
                                     amountElement.getAttribute('data-amount') || 
                                     amountElement.getAttribute('data-price') ||
                                     amountElement.getAttribute('data-total');
                    
                    if (amountText) {
                        // Извлекаем числовое значение
                        const amountMatch = amountText.match(/[0-9,]+\.?[0-9]*/);
                        if (amountMatch) {
                            amount = parseFloat(amountMatch[0].replace(/,/g, ''));
                        }
                    }
                }
                
                // Ищем валюту
                const currencyElement = findElement(selectors[paymentSystem].currency) || 
                                       findElement(selectors.generic.currency);
                
                if (currencyElement && !currency) {
                    const currencyText = currencyElement.textContent || currencyElement.innerText || 
                                        currencyElement.getAttribute('data-currency');
                    
                    if (currencyText) {
                        // Извлекаем валюту
                        const currencyMatch = currencyText.match(/[A-Z]{3}|[$€£¥₹]/);
                        if (currencyMatch) {
                            currency = currencyMatch[0];
                        }
                    }
                }
                
                // Если не нашли валюту, пытаемся найти символ валюты в тексте суммы
                if (!currency && amountElement) {
                    const fullText = amountElement.textContent || amountElement.innerText || '';
                    const currencySymbols = {
                        '$': 'USD',
                        '€': 'EUR',
                        '£': 'GBP',
                        '¥': 'JPY',
                        '₹': 'INR'
                    };
                    
                    for (const [symbol, code] of Object.entries(currencySymbols)) {
                        if (fullText.includes(symbol)) {
                            currency = code;
                            break;
                        }
                    }
                }
                
                // Если все еще не нашли валюту, пытаемся найти в URL или мета-тегах
                if (!currency) {
                    const urlParams = new URLSearchParams(window.location.search);
                    currency = urlParams.get('currency') || urlParams.get('curr') || 
                              document.querySelector('meta[name="currency"]')?.getAttribute('content') ||
                              'USD'; // По умолчанию USD
                }
                
                // Дополнительная проверка по всему документу
                if (!amount || !currency) {
                    const bodyText = document.body.textContent || document.body.innerText || '';
                    
                    // Ищем паттерны суммы и валюты в тексте
                    const patterns = [
                        /(\$|€|£|¥|₹)\s*([0-9]+[,.]?[0-9]*)/g,
                        /([0-9]+[,.]?[0-9]*)\s*(\$|€|£|¥|₹)/g,
                        /([0-9]+[,.]?[0-9]*)\s*(USD|EUR|GBP|JPY|INR)/g,
                        /(USD|EUR|GBP|JPY|INR)\s*([0-9]+[,.]?[0-9]*)/g
                    ];
                    
                    for (const pattern of patterns) {
                        const matches = bodyText.match(pattern);
                        if (matches && matches.length > 0) {
                            const match = matches[0];
                            const numberMatch = match.match(/[0-9]+[,.]?[0-9]*/);
                            const currencyMatch = match.match(/\$|€|£|¥|₹|USD|EUR|GBP|JPY|INR/);
                            
                            if (numberMatch && !amount) {
                                amount = parseFloat(numberMatch[0].replace(/,/g, ''));
                            }
                            
                            if (currencyMatch && !currency) {
                                const currencySymbols = {
                                    '$': 'USD',
                                    '€': 'EUR',
                                    '£': 'GBP',
                                    '¥': 'JPY',
                                    '₹': 'INR'
                                };
                                currency = currencySymbols[currencyMatch[0]] || currencyMatch[0];
                            }
                            
                            if (amount && currency) break;
                        }
                    }
                }
            }
            
            return {
                amount: amount,
                currency: currency,
                url: window.location.href,
                title: document.title,
                hostname: window.location.hostname
            };
        });
        
        // Валидация результата
        if (!result.amount || !result.currency) {
            throw new Error(`Failed to parse payment details. Amount: ${result.amount}, Currency: ${result.currency}`);
        }
        
        // Нормализация валюты
        const normalizedCurrency = result.currency.toUpperCase();
        const validCurrencies = ['USD', 'EUR', 'GBP', 'JPY', 'INR', 'CAD', 'AUD', 'CHF', 'CNY', 'SEK', 'NOK', 'DKK'];
        
        if (!validCurrencies.includes(normalizedCurrency)) {
            throw new Error(`Invalid currency: ${normalizedCurrency}`);
        }
        
        const finalResult = {
            success: true,
            amount: result.amount,
            currency: normalizedCurrency,
            url: result.url,
            title: result.title,
            hostname: result.hostname,
            parsed_at: new Date().toISOString()
        };
        
        // Кэшируем результат
        cache.set(cacheKey, finalResult);
        
        logMessage(`Successfully parsed payment page: ${url}, Amount: ${result.amount}, Currency: ${normalizedCurrency}`, 'INFO');
        
        return finalResult;
        
    } catch (error) {
        logMessage(`Error parsing payment page ${url}: ${error.message}`, 'ERROR');
        throw error;
    } finally {
        if (page) {
            await page.close();
        }
    }
}

// Маршрут для парсинга платежной страницы
app.get('/parse', async (req, res) => {
    try {
        const { url } = req.query;
        
        if (!url) {
            return res.status(400).json({
                success: false,
                error: 'URL parameter is required'
            });
        }
        
        logMessage(`Received parse request for URL: ${url}`, 'INFO');
        
        // Валидация URL
        const validation = validateUrl(url);
        if (!validation.valid) {
            logMessage(`URL validation failed: ${validation.reason}`, 'WARNING');
            return res.status(400).json({
                success: false,
                error: `URL validation failed: ${validation.reason}`
            });
        }
        
        // Парсинг страницы
        const result = await parsePaymentPage(url);
        
        res.json(result);
        
    } catch (error) {
        logMessage(`Parse request failed: ${error.message}`, 'ERROR');
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Маршрут для проверки здоровья сервиса
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        cache_stats: cache.getStats()
    });
});

// Маршрут для получения статистики кэша
app.get('/cache/stats', (req, res) => {
    res.json({
        cache_stats: cache.getStats(),
        cache_keys: cache.keys().length
    });
});

// Маршрут для очистки кэша
app.post('/cache/clear', (req, res) => {
    cache.flushAll();
    logMessage('Cache cleared manually', 'INFO');
    res.json({
        success: true,
        message: 'Cache cleared successfully'
    });
});

// Обработка необработанных исключений
process.on('uncaughtException', (error) => {
    logMessage(`Uncaught exception: ${error.message}`, 'ERROR');
    logMessage(error.stack, 'ERROR');
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    logMessage(`Unhandled rejection at: ${promise}, reason: ${reason}`, 'ERROR');
});

// Graceful shutdown
process.on('SIGTERM', async () => {
    logMessage('SIGTERM received, shutting down gracefully', 'INFO');
    
    if (browser) {
        await browser.close();
        logMessage('Browser closed', 'INFO');
    }
    
    process.exit(0);
});

process.on('SIGINT', async () => {
    logMessage('SIGINT received, shutting down gracefully', 'INFO');
    
    if (browser) {
        await browser.close();
        logMessage('Browser closed', 'INFO');
    }
    
    process.exit(0);
});

// Запуск сервера
app.listen(port, () => {
    logMessage(`Puppeteer service started on port ${port}`, 'INFO');
    logMessage(`Environment: ${process.env.NODE_ENV || 'development'}`, 'INFO');
});

// Инициализация браузера при запуске
initBrowser().catch(error => {
    logMessage(`Failed to initialize browser on startup: ${error.message}`, 'ERROR');
    process.exit(1);
});
