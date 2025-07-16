<?php

declare(strict_types=1);


// Включаем необходимые файлы
require_once __DIR__ . '/config.php';

echo "=== Получение нового Authorization Code для AmoCRM ===\n";
echo "Текущее окружение: " . (getenv('ENVIRONMENT') ?: 'не установлено') . "\n";
echo "AmoCRM домен: " . AMO_DOMAIN . "\n";
echo "Integration ID: " . AMO_INTEGRATION_ID . "\n";
echo "Redirect URI: " . AMO_REDIRECT_URI . "\n\n";

// Генерируем URL для авторизации
$authUrl = sprintf(
    'https://www.amocrm.ru/oauth?client_id=%s&mode=popup',
    AMO_INTEGRATION_ID
);

echo "🔗 Для получения нового Authorization Code:\n";
echo "1. Откройте в браузере: " . $authUrl . "\n";
echo "2. Авторизуйтесь в AmoCRM\n";
echo "3. Разрешите доступ приложению\n";
echo "4. После перенаправления скопируйте параметр 'code' из URL\n";
echo "5. Обновите AMO_AUTH_CODE в файле .env.test\n\n";

echo "Текущий AUTH_CODE в .env.test:\n";
echo substr(AMO_AUTH_CODE, 0, 50) . "...\n\n";

echo "=== Проверка токенов ===\n";
if (file_exists(AMO_TOKENS_PATH)) {
    $tokensContent = file_get_contents(AMO_TOKENS_PATH);
    $tokens = json_decode($tokensContent, true);
    
    if ($tokens) {
        echo "✅ Файл токенов найден: " . AMO_TOKENS_PATH . "\n";
        echo "Access token: " . substr($tokens['access_token'] ?? 'отсутствует', 0, 50) . "...\n";
        echo "Refresh token: " . substr($tokens['refresh_token'] ?? 'отсутствует', 0, 50) . "...\n";
        
        if (isset($tokens['server_time'])) {
            $serverTime = $tokens['server_time'];
            $expiresIn = $tokens['expires_in'] ?? 86400;
            $expirationTime = $serverTime + $expiresIn;
            $currentTime = time();
            
            echo "Время создания: " . date('Y-m-d H:i:s', $serverTime) . "\n";
            echo "Время истечения: " . date('Y-m-d H:i:s', $expirationTime) . "\n";
            echo "Текущее время: " . date('Y-m-d H:i:s', $currentTime) . "\n";
            
            if ($currentTime > $expirationTime) {
                echo "❌ Access token истек!\n";
            } else {
                echo "✅ Access token действителен еще " . round(($expirationTime - $currentTime) / 3600, 2) . " часов\n";
            }
        }
    } else {
        echo "❌ Не удалось прочитать токены из файла\n";
    }
} else {
    echo "❌ Файл токенов не найден: " . AMO_TOKENS_PATH . "\n";
}

echo "\n=== Рекомендации ===\n";
echo "1. Если токены истекли, получите новый Authorization Code по ссылке выше\n";
echo "2. Обновите AMO_AUTH_CODE в .env.test\n";
echo "3. Удалите старый файл токенов: " . AMO_TOKENS_PATH . "\n";
echo "4. Запустите test_amo_auth.php снова\n";
