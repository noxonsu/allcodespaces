const dotenv = require('dotenv');
const path = require('path');

const envPath = path.join(__dirname, '.env');
const dotenvResult = dotenv.config({ path: envPath });

if (dotenvResult.error) {
    console.error(`Критическая ошибка: Не удалось загрузить файл .env по пути ${envPath}. Ошибка: ${dotenvResult.error}`);
    process.exit(1);
}

// General
const NAMEPROMPT = process.env.NAMEPROMPT || '';

// Google Sheets
const GOOGLE_SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
const GOOGLE_KEY_FILE = path.join(__dirname, 'mycity2_key.json');
const SPREADSHEET_ID_AMO2GT = process.env.SPREADSHEET_ID_AMO2GT;
const SPREADSHEET_ID_GT2AMO = process.env.SPREADSHEET_ID_GT2AMO;
const DEFAULT_SHEET_NAME = process.env.SHEET_NAME || 'Sheet1';

// AMO CRM
const AMO_DOMAIN = process.env.AMO_DOMAIN;
const AMO_INTEGRATION_ID = process.env.AMO_INTEGRATION_ID;
const AMO_SECRET_KEY = process.env.AMO_SECRET_KEY;
const AMO_AUTH_CODE = process.env.AMO_AUTH_CODE; // For initial token acquisition
const AMO_REDIRECT_URI = process.env.AMO_REDIRECT_URI; // Load this
const AMO_TOKENS_PATH = path.join(__dirname, 'amo_tokens.json');
const AMO_API_URL_BASE = `${AMO_DOMAIN}/api/v4`; // Corrected: Use AMO_DOMAIN directly as it includes protocol
const AMO_TOKEN = process.env.AMO_TOKEN; // For gtables2amo.js, if still used separately

// Custom Fields for gtables2amo.js
const AMO_CUSTOM_FIELDS = {
    request_amount: parseInt(process.env.AMO_FIELD_REQUEST_AMOUNT) || 188879,    // Сумма запроса
    request_currency: parseInt(process.env.AMO_FIELD_REQUEST_CURRENCY) || 188929, // Валюта запроса
    receive_currency: parseInt(process.env.AMO_FIELD_RECEIVE_CURRENCY) || 188875, // Валюта получения
    commission: parseInt(process.env.AMO_FIELD_COMMISSION) || 262053,            // Комиссия %
    deal_amount: parseInt(process.env.AMO_FIELD_DEAL_AMOUNT) || 188871,         // Сумма сделки
    exchange_rate: parseInt(process.env.AMO_FIELD_EXCHANGE_RATE) || 264459,     // Курс
    payment_link: 835906                                  // Ссылка на оплату (ID: 835906)
};

// Check for essential environment variables
const requiredEnvVars = {
    SPREADSHEET_ID_AMO2GT,
    SPREADSHEET_ID_GT2AMO,
    AMO_DOMAIN,
    AMO_INTEGRATION_ID,
    AMO_SECRET_KEY,
    AMO_REDIRECT_URI, // Add to required check
    // AMO_TOKEN might be required if gtables2amo.js is active and uses it.
};

let missingVar = false;
for (const [key, value] of Object.entries(requiredEnvVars)) {
    if (!value) {
        console.error(`Критическая ошибка: Переменная окружения ${key} не установлена в файле .env`);
        missingVar = true;
    }
}

if (missingVar) {
    process.exit(1);
}

// Check if AMO_API_URL_BASE is valid
if (!AMO_DOMAIN) {
    console.error(`Критическая ошибка: AMO_DOMAIN не установлен, не удается сформировать AMO_API_URL_BASE.`);
    process.exit(1);
}


module.exports = {
    NAMEPROMPT,
    GOOGLE_SCOPES,
    GOOGLE_KEY_FILE,
    SPREADSHEET_ID_AMO2GT,
    SPREADSHEET_ID_GT2AMO,
    DEFAULT_SHEET_NAME,
    AMO_DOMAIN,
    AMO_INTEGRATION_ID,
    AMO_SECRET_KEY,
    AMO_AUTH_CODE,
    AMO_REDIRECT_URI, // Export this
    AMO_TOKENS_PATH,
    AMO_API_URL_BASE,
    AMO_TOKEN,
    AMO_CUSTOM_FIELDS,
};
