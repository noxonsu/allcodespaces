<?php

declare(strict_types=1);

// Устанавливаем production окружение
putenv('ENVIRONMENT=production');

// Включаем необходимые файлы
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/logger.php';
require_once __DIR__ . '/lib/amo_auth_utils.php';

echo "=== Получение новых токенов AmoCRM (PRODUCTION) ===\n";
echo "Текущее окружение: " . (getenv('ENVIRONMENT') ?: 'не установлено') . "\n";
echo "AmoCRM домен: " . AMO_DOMAIN . "\n";
echo "Integration ID: " . AMO_INTEGRATION_ID . "\n";
echo "Директория данных: " . DATA_DIR . "\n\n";

// Проверяем, есть ли AUTH_CODE
if (empty(AMO_AUTH_CODE)) {
    echo "❌ Ошибка: AMO_AUTH_CODE не установлен в .env.production\n";
    echo "Получите новый код авторизации:\n";
    $authUrl = sprintf(
        'https://www.amocrm.ru/oauth?client_id=%s&mode=popup',
        AMO_INTEGRATION_ID
    );
    echo "🔗 Ссылка для авторизации: " . $authUrl . "\n";
    exit(1);
}

echo "🔑 Используем AUTH_CODE: " . substr(AMO_AUTH_CODE, 0, 50) . "...\n\n";

try {
    // Удаляем старые токены если есть
    if (file_exists(AMO_TOKENS_PATH)) {
        echo "🗑️ Удаляем старые токены: " . AMO_TOKENS_PATH . "\n";
        unlink(AMO_TOKENS_PATH);
    }
    
    echo "📡 Получаем новые токены для PRODUCTION...\n";
    $tokens = getNewTokens(AMO_AUTH_CODE);
    
    echo "✅ Новые токены получены успешно!\n";
    echo "Access token: " . substr($tokens['access_token'], 0, 50) . "...\n";
    echo "Refresh token: " . substr($tokens['refresh_token'], 0, 50) . "...\n";
    echo "Срок действия: " . ($tokens['expires_in'] ?? 'неизвестно') . " секунд\n";
    echo "Токены сохранены в: " . AMO_TOKENS_PATH . "\n\n";
    
    // Проверяем доступ к API
    echo "🔍 Проверяем доступ к PRODUCTION API AmoCRM...\n";
    $testUrl = AMO_API_URL_BASE . '/account';
    
    require_once __DIR__ . '/lib/request_utils.php';
    $response = httpClient($testUrl, [
        'headers' => ['Authorization: Bearer ' . $tokens['access_token']],
        'timeout' => 15
    ]);
    
    if ($response['statusCode'] === 200) {
        $accountData = json_decode($response['body'], true);
        echo "✅ Доступ к PRODUCTION API подтвержден!\n";
        echo "Аккаунт: " . ($accountData['name'] ?? 'неизвестно') . "\n";
        echo "ID: " . ($accountData['id'] ?? 'неизвестно') . "\n";
        echo "Поддомен: " . ($accountData['subdomain'] ?? 'неизвестно') . "\n\n";
        
        echo "🎉 PRODUCTION OAuth сессия успешно установлена!\n";
        echo "⚠️  ВНИМАНИЕ: Вы работаете с PRODUCTION окружением!\n";
        echo "Теперь можно запускать скрипты в production режиме\n";
        
    } else {
        echo "❌ Ошибка доступа к API: " . $response['statusCode'] . "\n";
        echo "Ответ: " . $response['body'] . "\n";
    }
    
} catch (Exception $e) {
    echo "❌ Ошибка получения токенов: " . $e->getMessage() . "\n\n";
    
    // Если ошибка связана с authorization code, показываем инструкции
    if (strpos($e->getMessage(), 'authorization_code') !== false || 
        strpos($e->getMessage(), 'invalid_grant') !== false) {
        
        echo "🔄 Код авторизации недействителен или истек.\n";
        echo "Получите новый код авторизации:\n\n";
        
        $authUrl = sprintf(
            'https://www.amocrm.ru/oauth?client_id=%s&mode=popup',
            AMO_INTEGRATION_ID
        );
        
        echo "1. Откройте: " . $authUrl . "\n";
        echo "2. Авторизуйтесь в AmoCRM (аккаунт: paysaas.amocrm.ru)\n";
        echo "3. Разрешите доступ приложению\n";
        echo "4. Скопируйте параметр 'code' из URL после перенаправления\n";
        echo "5. Обновите AMO_AUTH_CODE в .env.production новым кодом\n";
        echo "6. Запустите этот скрипт снова\n";
    }
}
