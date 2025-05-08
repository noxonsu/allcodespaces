<?php
// Загрузка переменных окружения из файла .env
if (file_exists(__DIR__ . '/.env')) {
    $env_lines = file(__DIR__ . '/.env', FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($env_lines as $line) {
        if (strpos(trim($line), '#') === 0) continue; // Пропускаем комментарии
        list($name, $value) = explode('=', $line, 2);
        $name = trim($name);
        $value = trim($value);
        if (!empty($name)) {
            putenv("$name=$value");
            $_ENV[$name] = $value;
        }
    }
}

// Общие настройки
define('NAMEPROMPT', getenv('NAMEPROMPT') ?: '');

// Google Drive / API
define('GOOGLE_SCOPES', ['https://www.googleapis.com/auth/drive']);
define('GOOGLE_KEY_FILE', __DIR__ . '/my-project-1337-458418-4b4c595d74d5.json');
define('GOOGLE_DRIVE_FILE_ID_AMO2EXCEL', getenv('GOOGLE_DRIVE_FILE_ID_AMO2EXCEL'));
define('GOOGLE_DRIVE_FILE_ID_EXCEL2AMO', getenv('GOOGLE_DRIVE_FILE_ID_EXCEL2AMO'));
define('DEFAULT_SHEET_NAME', getenv('SHEET_NAME') ?: 'Sheet1');

// AMO CRM
define('AMO_DOMAIN', getenv('AMO_DOMAIN'));
define('AMO_INTEGRATION_ID', getenv('AMO_INTEGRATION_ID'));
define('AMO_SECRET_KEY', getenv('AMO_SECRET_KEY'));
define('AMO_AUTH_CODE', getenv('AMO_AUTH_CODE'));
define('AMO_REDIRECT_URI', getenv('AMO_REDIRECT_URI'));
define('AMO_TOKENS_PATH', __DIR__ . '/amo_tokens.json');
define('AMO_API_URL_BASE', AMO_DOMAIN . '/api/v4');
define('AMO_TOKEN', getenv('AMO_TOKEN')); // Опциональный прямой токен

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
];

if (getenv('GOOGLE_DRIVE_FILE_ID_AMO2EXCEL')) {
    $requiredEnvVars['GOOGLE_DRIVE_FILE_ID_AMO2EXCEL'] = GOOGLE_DRIVE_FILE_ID_AMO2EXCEL;
}

if (getenv('GOOGLE_DRIVE_FILE_ID_EXCEL2AMO')) {
    $requiredEnvVars['GOOGLE_DRIVE_FILE_ID_EXCEL2AMO'] = GOOGLE_DRIVE_FILE_ID_EXCEL2AMO;
}

$missingVar = false;
foreach ($requiredEnvVars as $key => $value) {
    if (getenv($key) !== false && empty($value)) {
        echo "Критическая ошибка: Переменная окружения $key указана в .env, но ее значение не удалось определить или она пуста.\n";
        $missingVar = true;
    }
}

if ($missingVar) {
    exit(1);
}

if (!AMO_DOMAIN) {
    echo "Критическая ошибка: AMO_DOMAIN не установлен, не удается сформировать AMO_API_URL_BASE.\n";
    exit(1);
}

// Проверка наличия Google Service Account Key
if ((GOOGLE_DRIVE_FILE_ID_AMO2EXCEL || GOOGLE_DRIVE_FILE_ID_EXCEL2AMO) && !file_exists(GOOGLE_KEY_FILE)) {
    echo "Критическая ошибка: Файл ключа Google Service Account не найден по пути " . GOOGLE_KEY_FILE . "\n";
    exit(1);
}
