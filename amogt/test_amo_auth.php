<?php

declare(strict_types=1);

// Включаем необходимые файлы
require_once __DIR__ . '/config.php'; // Для AMO_DOMAIN, AMO_INTEGRATION_ID, AMO_SECRET_KEY, AMO_AUTH_CODE, AMO_REDIRECT_URI, AMO_TOKENS_PATH
require_once __DIR__ . '/logger.php';   // Для функции logMessage
require_once __DIR__ . '/lib/amo_auth_utils.php'; // Для функций аутентификации AmoCRM

echo "=== Тестирование аутентификации AmoCRM ===\n";

try {
    // Попытка получить актуальный токен AmoCRM
    $amoTokens = checkAmoAccess();

    if ($amoTokens && !empty($amoTokens['access_token'])) {
        echo "\n✅ Успешный логин в AmoCRM!\n";
        echo "Access Token получен. Срок действия: " . ($amoTokens['expires_in'] ?? 'неизвестно') . " секунд.\n";
        echo "Токены сохранены в: " . AMO_TOKENS_PATH . "\n";
        logMessage('[TestAmoAuth] Успешный логин в AmoCRM.');
    } else {
        echo "\n❌ Ошибка логина в AmoCRM.\n";
        echo "Пожалуйста, проверьте вывод выше для инструкций по авторизации (если они были).\n";
        logMessage('[TestAmoAuth] Ошибка логина в AmoCRM.');
    }
} catch (Exception $e) {
    echo "\n❌ Произошла ошибка во время аутентификации: " . $e->getMessage() . "\n";
    logMessage('[TestAmoAuth] Исключение во время аутентификации: ' . $e->getMessage(), 'ERROR');
}

echo "\n=== Тест завершен ===\n";

?>
