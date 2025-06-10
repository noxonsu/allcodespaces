<?php
// Determine which .env file to load
$appEnv = getenv('ENVIRONMENT'); // Используем переменную из .htaccess
$envFile = __DIR__ . '/.env.test'; // Default to .env.test

if ($appEnv === 'production') {
    $envFile = __DIR__ . '/.env.production';
}

// Загрузка переменных окружения из выбранного файла .env
if (file_exists($envFile)) {
    $env_lines = file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($env_lines as $line) {
        if (strpos(trim($line), '#') === 0) continue; // Пропускаем комментарии
        if (strpos($line, '=') === false) continue; // Пропускаем строки без знака равно
        list($name, $value) = explode('=', $line, 2);
        $name = trim($name);
        $value = trim($value);
        if (!empty($name)) {
            putenv("$name=$value");
            $_ENV[$name] = $value;
            // For direct access if getenv() is problematic in some environments
            // $_SERVER[$name] = $value; 
        }
    }
} else {
    error_log("Warning: Environment file $envFile not found.");
    // Optionally, exit or handle the error if .env is critical
    // exit("Critical error: Environment file $envFile not found.");
}

// Общие настройки
define('NAMEPROMPT', getenv('NAMEPROMPT') ?: '');

// Динамическое определение директории для данных
define('DATA_DIR', __DIR__ . '/' . ($appEnv === 'production' ? 'data_production' : 'data_test'));
// Убедимся, что директория существует
if (!is_dir(DATA_DIR)) {
    mkdir(DATA_DIR, 0755, true);
}

// Динамическое определение директории для логов
define('LOGS_DIR', __DIR__ . '/' . ($appEnv === 'production' ? 'logs_production' : 'logs_test'));
// Убедимся, что директория существует
if (!is_dir(LOGS_DIR)) {
    mkdir(LOGS_DIR, 0755, true);
}

// AMO CRM
define('AMO_DOMAIN', getenv('AMO_DOMAIN'));
define('AMO_INTEGRATION_ID', getenv('AMO_INTEGRATION_ID'));
define('AMO_SECRET_KEY', getenv('AMO_SECRET_KEY'));
define('AMO_AUTH_CODE', getenv('AMO_AUTH_CODE'));
define('AMO_REDIRECT_URI', getenv('AMO_REDIRECT_URI'));
define('AMO_TOKENS_PATH', DATA_DIR . '/amo_tokens.json'); // Используем DATA_DIR
define('AMO_API_URL_BASE', AMO_DOMAIN . '/api/v4');
define('AMO_TOKEN', getenv('AMO_TOKEN')); // Опциональный прямой токен

// ID воронок и статусов AmoCRM (загружаются из .env)
define('AMO_MAIN_PIPELINE_ID', getenv('AMO_MAIN_PIPELINE_ID'));
define('AMO_CHATGPT_STATUS_ID', getenv('AMO_CHATGPT_STATUS_ID'));
define('AMO_FINAL_OPERATOR_STATUS_ID', getenv('AMO_FINAL_OPERATOR_STATUS_ID'));

// ID пользовательских полей AmoCRM (загружаются из .env)
define('AMO_CF_ID_PAYMENT_LINK', getenv('AMO_CF_ID_PAYMENT_LINK'));
define('AMO_CF_ID_REQUEST_AMOUNT', getenv('AMO_CF_ID_REQUEST_AMOUNT'));
define('AMO_CF_ID_REQUEST_CURRENCY', getenv('AMO_CF_ID_REQUEST_CURRENCY'));
define('AMO_CF_ID_CHATGPT_PAYMENT_STATUS', getenv('AMO_CF_ID_CHATGPT_PAYMENT_STATUS'));

// Enum ID валют AmoCRM (загружаются из .env)
define('AMO_CURRENCY_ENUM_ID_USD', getenv('AMO_CURRENCY_ENUM_ID_USD'));
define('AMO_CURRENCY_ENUM_ID_EUR', getenv('AMO_CURRENCY_ENUM_ID_EUR'));
define('AMO_CURRENCY_ENUM_ID_KZT', getenv('AMO_CURRENCY_ENUM_ID_KZT'));
define('AMO_CURRENCY_ENUM_ID_RUB', getenv('AMO_CURRENCY_ENUM_ID_RUB'));
define('AMO_CURRENCY_ENUM_ID_GBP', getenv('AMO_CURRENCY_ENUM_ID_GBP'));
define('AMO_CURRENCY_ENUM_ID_TL', getenv('AMO_CURRENCY_ENUM_ID_TL'));
define('AMO_CURRENCY_ENUM_ID_TRY', getenv('AMO_CURRENCY_ENUM_ID_TRY'));

// Дополнительные константы
define('WEBHOOK_API_KEY', getenv('WEBHOOK_API_KEY'));
define('AMO_SUCCESS_STATUS', getenv('AMO_SUCCESS_STATUS'));

// Имена пользовательских полей AmoCRM
$AMO_CUSTOM_FIELD_NAMES = [
    'amount_issued' => getenv('AMO_CF_NAME_AMOUNT_ISSUED') ?: "Сумма выдана",
    'currency' => getenv('AMO_CF_NAME_CURRENCY') ?: "Валюта",
    'withdrawal_account' => getenv('AMO_CF_NAME_WITHDRAWAL_ACCOUNT') ?: "Счет списания",
    'withdrawal_date' => getenv('AMO_CF_NAME_WITHDRAWAL_DATE') ?: "Дата списания",
    'administrator' => getenv('AMO_CF_NAME_ADMINISTRATOR') ?: "Администратор",
    'card' => getenv('AMO_CF_NAME_CARD') ?: "Карта",
    'paid_service' => getenv('AMO_CF_NAME_PAID_SERVICE') ?: "Оплаченный сервис",
    'email' => getenv('AMO_CF_NAME_EMAIL') ?: "Почта",
    'payment_term' => getenv('AMO_CF_NAME_PAYMENT_TERM') ?: "Срок оплаты",
    'status' => getenv('AMO_CF_NAME_STATUS') ?: "Статус",
    'payment_link' => "Ссылка на оплату", // имя поля для ссылки на оплату
];

// Проверка обязательных переменных окружения
$requiredEnvVars = [
    'AMO_DOMAIN' => AMO_DOMAIN,
    'AMO_INTEGRATION_ID' => AMO_INTEGRATION_ID,
    'AMO_SECRET_KEY' => AMO_SECRET_KEY,
    'AMO_REDIRECT_URI' => AMO_REDIRECT_URI,
    'AMO_MAIN_PIPELINE_ID' => AMO_MAIN_PIPELINE_ID,
    'AMO_CHATGPT_STATUS_ID' => AMO_CHATGPT_STATUS_ID,
    'AMO_FINAL_OPERATOR_STATUS_ID' => AMO_FINAL_OPERATOR_STATUS_ID,
    'AMO_CF_ID_PAYMENT_LINK' => AMO_CF_ID_PAYMENT_LINK,
    'AMO_CF_ID_REQUEST_AMOUNT' => AMO_CF_ID_REQUEST_AMOUNT,
    'AMO_CF_ID_REQUEST_CURRENCY' => AMO_CF_ID_REQUEST_CURRENCY,
    'AMO_CURRENCY_ENUM_ID_USD' => AMO_CURRENCY_ENUM_ID_USD,
    'AMO_CURRENCY_ENUM_ID_EUR' => AMO_CURRENCY_ENUM_ID_EUR,
    'AMO_CURRENCY_ENUM_ID_KZT' => AMO_CURRENCY_ENUM_ID_KZT,
    'AMO_CURRENCY_ENUM_ID_RUB' => AMO_CURRENCY_ENUM_ID_RUB,
    'AMO_CURRENCY_ENUM_ID_GBP' => AMO_CURRENCY_ENUM_ID_GBP,
    'AMO_CURRENCY_ENUM_ID_TL' => AMO_CURRENCY_ENUM_ID_TL,
    'AMO_CURRENCY_ENUM_ID_TRY' => AMO_CURRENCY_ENUM_ID_TRY,
    'WEBHOOK_API_KEY' => WEBHOOK_API_KEY, // Добавляем WEBHOOK_API_KEY в список обязательных
    'AMO_SUCCESS_STATUS' => AMO_SUCCESS_STATUS, // Добавляем AMO_SUCCESS_STATUS в список обязательных
    'AMO_CF_ID_CHATGPT_PAYMENT_STATUS' => AMO_CF_ID_CHATGPT_PAYMENT_STATUS,
];

$missingVar = false;
$errorMessages = [];
foreach ($requiredEnvVars as $key => $value) {
    // Check if the environment variable itself is set (getenv returns false if not set)
    // And if it is set, check if its value (after being assigned to the constant) is empty.
    if (getenv($key) === false) {
        $errorMessages[] = "Критическая ошибка: Переменная окружения $key не установлена в файле $envFile.";
        $missingVar = true;
    } elseif (empty($value) && getenv($key) !== '0' && getenv($key) !== false ) { // Allow '0' as a valid value
        $errorMessages[] = "Критическая ошибка: Переменная окружения $key ($value) определена в $envFile, но ее значение пустое или не удалось определить.";
        $missingVar = true;
    }
}

if ($missingVar) {
    foreach ($errorMessages as $msg) {
        error_log($msg); // Log to error log
        if (php_sapi_name() !== 'cli') { // Don't echo HTML in CLI
             echo "<p>$msg</p>\n";
        } else {
            echo "$msg\n";
        }
    }
    exit(1);
}

if (!AMO_DOMAIN) { // This check might be redundant if AMO_DOMAIN is in $requiredEnvVars and checked above
    $errorMsg = "Критическая ошибка: AMO_DOMAIN не установлен, не удается сформировать AMO_API_URL_BASE.";
    error_log($errorMsg);
    if (php_sapi_name() !== 'cli') {
        echo "<p>$errorMsg</p>\n";
    } else {
        echo "$errorMsg\n";
    }
    exit(1);
}

// Define the path for all leads JSON file
if (!defined('BLOCKED_DEALS_PATH')) { // Keep old constant name for backward compatibility if other scripts use it directly
    define('BLOCKED_DEALS_PATH', DATA_DIR . '/blocked_deals.txt');
}
if (!defined('ALL_LEADS_FILE_PATH')) { // Define new constant name
    define('ALL_LEADS_FILE_PATH', DATA_DIR . '/allLeads.json');
}
if (!defined('RECIEVED_API_IDS_FILE_PATH')) {
    define('RECIEVED_API_IDS_FILE_PATH', DATA_DIR . '/recieved_api_ids.txt');
}
if (!defined('ZENO_REPORTS_JSON_FILE')) {
    define('ZENO_REPORTS_JSON_FILE', DATA_DIR . '/zeno_report.json');
}
if (!defined('RECIEVED_AMO_IDS_FILE_PATH')) {
    define('RECIEVED_AMO_IDS_FILE_PATH', DATA_DIR . '/recieved_amo_ids.txt');
}
if (!defined('STRIPE_LINK_PARSER_LOG_FILE')) {
    define('STRIPE_LINK_PARSER_LOG_FILE', LOGS_DIR . '/amo2json.log'); // Используем LOGS_DIR, тот же файл что и для amo2json
}


// Mark that config is loaded to prevent conflicts
if (!defined('CONFIG_LOADED')) {
    define('CONFIG_LOADED', true);
}
