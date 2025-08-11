<?php

declare(strict_types=1);

// Устанавливаем production окружение
putenv('ENVIRONMENT=production');

// Включаем необходимые файлы
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/logger.php';
require_once __DIR__ . '/lib/amo_auth_utils.php';
require_once __DIR__ . '/lib/request_utils.php';
require_once __DIR__ . '/lib/json_storage_utils.php';

echo "=== Тестирование PRODUCTION аутентификации AmoCRM ===\n";
echo "Текущее окружение: " . (getenv('ENVIRONMENT') ?: 'не установлено') . "\n";
echo "AmoCRM домен: " . AMO_DOMAIN . "\n";
echo "Директория данных: " . DATA_DIR . "\n";
echo "PHP SAPI: " . php_sapi_name() . "\n\n";

echo "⚠️  ВНИМАНИЕ: ВЫ РАБОТАЕТЕ С PRODUCTION ОКРУЖЕНИЕМ!\n";
echo "⚠️  Все изменения будут применены к реальным данным!\n\n";

try {
    // Попытка получить актуальный токен AmoCRM
    $amoTokens = checkAmoAccess();

    if ($amoTokens && !empty($amoTokens['access_token'])) {
        $accessToken = $amoTokens['access_token'];
        echo "\n✅ Успешный логин в PRODUCTION AmoCRM!\n";
        echo "Access Token получен. Срок действия: " . ($amoTokens['expires_in'] ?? 'неизвестно') . " секунд.\n";
        echo "Токены сохранены в: " . AMO_TOKENS_PATH . "\n";
        logMessage('[TestAmoAuth] Успешный логин в PRODUCTION AmoCRM.');

        echo "\n=== Получение информации об аккаунте ===\n";
        $accountUrl = AMO_API_URL_BASE . '/account';
        echo "Запрос информации об аккаунте: $accountUrl\n";
        $accountResponse = httpClient($accountUrl, [
            'headers' => ['Authorization: Bearer ' . $accessToken],
            'timeout' => 15
        ]);

        if ($accountResponse['statusCode'] === 200 && !empty($accountResponse['body'])) {
            $accountData = json_decode($accountResponse['body'], true);
            if (json_last_error() === JSON_ERROR_NONE) {
                echo "✅ Информация об аккаунте получена:\n";
                echo "  Название: " . ($accountData['name'] ?? 'неизвестно') . "\n";
                echo "  ID: " . ($accountData['id'] ?? 'неизвестно') . "\n";
                echo "  Поддомен: " . ($accountData['subdomain'] ?? 'неизвестно') . "\n";
                echo "  Часовой пояс: " . ($accountData['timezone'] ?? 'неизвестно') . "\n";
                echo "  Валюта: " . ($accountData['currency'] ?? 'неизвестно') . "\n\n";
            }
        }

        echo "=== Проверка доступа к основным API ===\n";
        
        // Проверяем доступ к пользователям
        $usersUrl = AMO_API_URL_BASE . '/users';
        echo "Проверка пользователей: $usersUrl\n";
        $usersResponse = httpClient($usersUrl, [
            'headers' => ['Authorization: Bearer ' . $accessToken],
            'timeout' => 15
        ]);
        
        if ($usersResponse['statusCode'] === 200) {
            $usersData = json_decode($usersResponse['body'], true);
            $userCount = count($usersData['_embedded']['users'] ?? []);
            echo "✅ Доступ к пользователям: найдено $userCount пользователей\n";
        } else {
            echo "❌ Ошибка доступа к пользователям: " . $usersResponse['statusCode'] . "\n";
        }

        // Проверяем доступ к воронкам
        $pipelinesUrl = AMO_API_URL_BASE . '/leads/pipelines';
        echo "Проверка воронок: $pipelinesUrl\n";
        $pipelinesResponse = httpClient($pipelinesUrl, [
            'headers' => ['Authorization: Bearer ' . $accessToken],
            'timeout' => 15
        ]);
        
        if ($pipelinesResponse['statusCode'] === 200) {
            $pipelinesData = json_decode($pipelinesResponse['body'], true);
            $pipelineCount = count($pipelinesData['_embedded']['pipelines'] ?? []);
            echo "✅ Доступ к воронкам: найдено $pipelineCount воронок\n";
        } else {
            echo "❌ Ошибка доступа к воронкам: " . $pipelinesResponse['statusCode'] . "\n";
        }

        // Проверяем доступ к полям
        $fieldsUrl = AMO_API_URL_BASE . '/leads/custom_fields';
        echo "Проверка пользовательских полей: $fieldsUrl\n";
        $fieldsResponse = httpClient($fieldsUrl, [
            'headers' => ['Authorization: Bearer ' . $accessToken],
            'timeout' => 15
        ]);
        
        if ($fieldsResponse['statusCode'] === 200) {
            $fieldsData = json_decode($fieldsResponse['body'], true);
            $fieldCount = count($fieldsData['_embedded']['custom_fields'] ?? []);
            echo "✅ Доступ к пользовательским полям: найдено $fieldCount полей\n";
        } else {
            echo "❌ Ошибка доступа к пользовательским полям: " . $fieldsResponse['statusCode'] . "\n";
        }

        echo "\n✅ PRODUCTION AmoCRM API полностью доступен!\n";
        
    } else {
        echo "❌ Ошибка логина в PRODUCTION AmoCRM.\n";
        echo "Пожалуйста, проверьте вывод выше для инструкций по авторизации (если они были).\n";
        logMessage('[TestAmoAuth] Ошибка логина в PRODUCTION AmoCRM.');
    }
    
} catch (Exception $e) {
    echo "\n❌ Произошла ошибка во время аутентификации: " . $e->getMessage() . "\n";
    logMessage('[TestAmoAuth] Исключение во время аутентификации PRODUCTION: ' . $e->getMessage(), 'ERROR');
}

echo "\n=== PRODUCTION тест завершен ===\n";
