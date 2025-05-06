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
const AMO_AUTH_CODE = process.env.AMO_AUTH_CODE; 
const AMO_REDIRECT_URI = process.env.AMO_REDIRECT_URI;
const AMO_TOKENS_PATH = path.join(__dirname, 'amo_tokens.json');
const AMO_API_URL_BASE = `${AMO_DOMAIN}/api/v4`;

// Map internal script keys to EXACT AmoCRM Custom Field Names
// These names will be used to look up field_id and enums dynamically.
// **IMPORTANT**: You MUST update these string values to match your AmoCRM field names precisely.
const AMO_CUSTOM_FIELD_NAMES = {
    amount_issued: process.env.AMO_CF_NAME_AMOUNT_ISSUED || "Сумма выдана",
    currency: process.env.AMO_CF_NAME_CURRENCY || "Валюта",
    withdrawal_account: process.env.AMO_CF_NAME_WITHDRAWAL_ACCOUNT || "Счет списания",
    withdrawal_date: process.env.AMO_CF_NAME_WITHDRAWAL_DATE || "Дата списания",
    administrator: process.env.AMO_CF_NAME_ADMINISTRATOR || "Администратор",
    card: process.env.AMO_CF_NAME_CARD || "Карта",
    paid_service: process.env.AMO_CF_NAME_PAID_SERVICE || "Оплаченный сервис",
    email: process.env.AMO_CF_NAME_EMAIL || "Почта", // Common name for email field
    payment_term: process.env.AMO_CF_NAME_PAYMENT_TERM || "Срок оплаты",
    status: process.env.AMO_CF_NAME_STATUS || "Статус",
};

// Check for essential environment variables
const requiredEnvVars = {
    AMO_DOMAIN,
    AMO_INTEGRATION_ID,
    AMO_SECRET_KEY,
    AMO_REDIRECT_URI,
};

if (process.env.SPREADSHEET_ID_AMO2GT) {
    requiredEnvVars.SPREADSHEET_ID_AMO2GT = process.env.SPREADSHEET_ID_AMO2GT;
}
if (process.env.SPREADSHEET_ID_GT2AMO) {
    requiredEnvVars.SPREADSHEET_ID_GT2AMO = process.env.SPREADSHEET_ID_GT2AMO;
}

let missingVar = false;
for (const [key, value] of Object.entries(requiredEnvVars)) {
    if (requiredEnvVars[key] !== undefined && !value) {
        console.error(`Критическая ошибка: Переменная окружения ${key} не установлена в файле .env, но требуется для активных модулей.`);
        missingVar = true;
    }
}

if (missingVar) {
    process.exit(1);
}

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
    AMO_REDIRECT_URI,
    AMO_TOKENS_PATH,
    AMO_API_URL_BASE,
    AMO_CUSTOM_FIELD_NAMES, // Export the new name mappings
};
