<?php

declare(strict_types=1);

echo "=== Проверка статуса OAuth для всех окружений ===\n\n";

// Функция для проверки окружения
function checkEnvironment($envName, $envValue) {
    echo "📋 Проверка окружения: $envName\n";
    echo "=" . str_repeat("=", strlen("Проверка окружения: $envName")) . "\n";
    
    // Устанавливаем окружение
    putenv("ENVIRONMENT=$envValue");
    
    // Включаем файлы
    require_once __DIR__ . '/config.php';
    
    echo "Окружение: " . (getenv('ENVIRONMENT') ?: 'не установлено') . "\n";
    echo "AmoCRM домен: " . AMO_DOMAIN . "\n";
    echo "Integration ID: " . AMO_INTEGRATION_ID . "\n";
    echo "Директория данных: " . DATA_DIR . "\n";
    echo "Путь к токенам: " . AMO_TOKENS_PATH . "\n";
    
    // Проверяем токены
    if (file_exists(AMO_TOKENS_PATH)) {
        $tokensContent = file_get_contents(AMO_TOKENS_PATH);
        $tokens = json_decode($tokensContent, true);
        
        if ($tokens && isset($tokens['access_token'], $tokens['refresh_token'])) {
            echo "✅ Файл токенов: найден\n";
            echo "   Access token: " . substr($tokens['access_token'], 0, 50) . "...\n";
            echo "   Refresh token: " . substr($tokens['refresh_token'], 0, 50) . "...\n";
            
            if (isset($tokens['server_time'], $tokens['expires_in'])) {
                $serverTime = $tokens['server_time'];
                $expiresIn = $tokens['expires_in'];
                $expirationTime = $serverTime + $expiresIn;
                $currentTime = time();
                
                echo "   Создан: " . date('Y-m-d H:i:s', $serverTime) . "\n";
                echo "   Истекает: " . date('Y-m-d H:i:s', $expirationTime) . "\n";
                
                if ($currentTime > $expirationTime) {
                    echo "   ❌ Статус: ИСТЕК\n";
                } else {
                    $hoursLeft = round(($expirationTime - $currentTime) / 3600, 2);
                    echo "   ✅ Статус: ДЕЙСТВИТЕЛЕН (осталось $hoursLeft часов)\n";
                }
            }
        } else {
            echo "❌ Файл токенов: поврежден\n";
        }
    } else {
        echo "❌ Файл токенов: не найден\n";
    }
    
    echo "\n";
}

// Проверяем TEST окружение
checkEnvironment("TEST", "test");

// Проверяем PRODUCTION окружение
checkEnvironment("PRODUCTION", "production");

echo "=== Быстрые команды для перезайти ===\n";
echo "🔄 Для TEST окружения:\n";
echo "   1. Удалить токены: rm -f data_test/amo_tokens.json\n";
echo "   2. Получить новые: php get_new_tokens.php\n";
echo "   3. Тест: php test_amo_auth.php\n\n";

echo "🔄 Для PRODUCTION окружения:\n";
echo "   1. Удалить токены: rm -f data_production/amo_tokens.json\n";
echo "   2. Получить новые: php get_production_tokens.php\n";
echo "   3. Тест: php test_production_auth.php\n\n";


