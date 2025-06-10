<?php

declare(strict_types=1);

// Включаем необходимые файлы
require_once __DIR__ . '/config.php'; // Для AMO_DOMAIN, AMO_INTEGRATION_ID, AMO_SECRET_KEY, AMO_AUTH_CODE, AMO_REDIRECT_URI, AMO_TOKENS_PATH
require_once __DIR__ . '/logger.php';   // Для функции logMessage
require_once __DIR__ . '/lib/amo_auth_utils.php'; // Для функций аутентификации AmoCRM
require_once __DIR__ . '/lib/request_utils.php';   // Для функции httpClient
require_once __DIR__ . '/lib/json_storage_utils.php'; // Для функций saveDataToFile

echo "=== Тестирование аутентификации AmoCRM ===\n";
echo "Текущее окружение: " . ($_SERVER['ENVIRONMENT'] ?? 'не установлено') . "\n";
echo "PHP SAPI: " . php_sapi_name() . "\n\n";

try {
    // Попытка получить актуальный токен AmoCRM
    $amoTokens = checkAmoAccess();

    if ($amoTokens && !empty($amoTokens['access_token'])) {
        $accessToken = $amoTokens['access_token'];
        echo "\n✅ Успешный логин в AmoCRM!\n";
        echo "Access Token получен. Срок действия: " . ($amoTokens['expires_in'] ?? 'неизвестно') . " секунд.\n";
        echo "Токены сохранены в: " . AMO_TOKENS_PATH . "\n";
        logMessage('[TestAmoAuth] Успешный логин в AmoCRM.');

        echo "\n=== Попытка получить ID полей и воронок из AmoCRM ===\n";

        // --- 1. Получение и сохранение Custom Fields ---
        $customFieldsUrl = AMO_API_URL_BASE . '/leads/custom_fields';
        echo "Запрос пользовательских полей: $customFieldsUrl\n";
        $fieldsResponse = httpClient($customFieldsUrl, [
            'headers' => ['Authorization: Bearer ' . $accessToken],
            'timeout' => 15
        ]);

        if ($fieldsResponse['statusCode'] === 200 && !empty($fieldsResponse['body'])) {
            $fieldsData = json_decode($fieldsResponse['body'], true);
            if (json_last_error() === JSON_ERROR_NONE && isset($fieldsData['_embedded']['custom_fields'])) {
                $fieldsFilePath = DATA_DIR . '/amo_fields.json'; // Используем DATA_DIR
                if (saveDataToFile($fieldsFilePath, $fieldsData)) {
                    echo "✅ Пользовательские поля сохранены в: $fieldsFilePath\n";
                    logMessage("[TestAmoAuth] Пользовательские поля AmoCRM успешно сохранены.", 'INFO');

                    echo "\n--- Найденные ID пользовательских полей ---\n";
                    $foundFieldIds = [];
                    foreach ($fieldsData['_embedded']['custom_fields'] as $field) {
                        switch ($field['name']) {
                            case 'Ссылка ChatGPT':
                                $foundFieldIds['AMO_CF_ID_PAYMENT_LINK'] = $field['id'];
                                break;
                            case 'Сумма запроса':
                                $foundFieldIds['AMO_CF_ID_REQUEST_AMOUNT'] = $field['id'];
                                break;
                            case 'Валюта запроса':
                                $foundFieldIds['AMO_CF_ID_REQUEST_CURRENCY'] = $field['id'];
                                if (isset($field['enums'])) {
                                    foreach ($field['enums'] as $enum) {
                                        switch ($enum['value']) {
                                            case 'USD': $foundFieldIds['AMO_CURRENCY_ENUM_ID_USD'] = $enum['id']; break;
                                            case 'EUR': $foundFieldIds['AMO_CURRENCY_ENUM_ID_EUR'] = $enum['id']; break;
                                            case 'KZT': $foundFieldIds['AMO_CURRENCY_ENUM_ID_KZT'] = $enum['id']; break;
                                            case 'RUB': $foundFieldIds['AMO_CURRENCY_ENUM_ID_RUB'] = $enum['id']; break;
                                            case 'GBP': $foundFieldIds['AMO_CURRENCY_ENUM_ID_GBP'] = $enum['id']; break;
                                            case 'TL':  $foundFieldIds['AMO_CURRENCY_ENUM_ID_TL'] = $enum['id']; break;
                                            case 'TRY': $foundFieldIds['AMO_CURRENCY_ENUM_ID_TRY'] = $enum['id']; break;
                                        }
                                    }
                                }
                                break;
                            case 'Статус оплаты ChatGPT':
                                // This field is used in zeno_report.php, but its ID is not directly used as a constant in config.php
                                // It's good to know its ID for reference.
                                $foundFieldIds['AMO_CF_ID_STATUS_CHATGPT'] = $field['id'];
                                if (isset($field['enums'])) {
                                    foreach ($field['enums'] as $enum) {
                                        if ($enum['value'] === 'Выполнено') {
                                            $foundFieldIds['AMO_CF_ENUM_STATUS_CHATGPT_COMPLETED'] = $enum['id'];
                                        } elseif ($enum['value'] === 'ОШИБКА!') {
                                            $foundFieldIds['AMO_CF_ENUM_STATUS_CHATGPT_ERROR'] = $enum['id'];
                                        }
                                    }
                                }
                                break;
                            // Добавьте другие поля, если их ID нужны в .env
                            case 'Сумма выдана': $foundFieldIds['AMO_CF_NAME_AMOUNT_ISSUED'] = $field['id']; break;
                            case 'Валюта': $foundFieldIds['AMO_CF_NAME_CURRENCY'] = $field['id']; break;
                            case 'Счет списания': $foundFieldIds['AMO_CF_NAME_WITHDRAWAL_ACCOUNT'] = $field['id']; break;
                            case 'Дата списания': $foundFieldIds['AMO_CF_NAME_WITHDRAWAL_DATE'] = $field['id']; break;
                            case 'Администратор': $foundFieldIds['AMO_CF_NAME_ADMINISTRATOR'] = $field['id']; break;
                            case 'Карта': $foundFieldIds['AMO_CF_NAME_CARD'] = $field['id']; break;
                            case 'Оплаченный сервис': $foundFieldIds['AMO_CF_NAME_PAID_SERVICE'] = $field['id']; break;
                            case 'Почта': $foundFieldIds['AMO_CF_NAME_EMAIL'] = $field['id']; break;
                            case 'Срок оплаты': $foundFieldIds['AMO_CF_NAME_PAYMENT_TERM'] = $field['id']; break;
                            case 'Статус': $foundFieldIds['AMO_CF_NAME_STATUS'] = $field['id']; break;
                        }
                    }
                    foreach ($foundFieldIds as $key => $value) {
                        echo "$key=$value\n";
                    }
                } else {
                    echo "❌ Ошибка: Не удалось сохранить пользовательские поля в файл: $fieldsFilePath\n";
                    logMessage("[TestAmoAuth] Ошибка при сохранении пользовательских полей в файл: $fieldsFilePath", 'ERROR');
                }
            } else {
                echo "❌ Ошибка: Не удалось распарсить JSON или найти пользовательские поля.\n";
                logMessage("[TestAmoAuth] Ошибка при парсинге или поиске пользовательских полей: " . json_last_error_msg(), 'ERROR');
            }

        } else {
            echo "❌ Ошибка: Не удалось получить пользовательские поля. HTTP Status: {$fieldsResponse['statusCode']}. Ошибка: {$fieldsResponse['error']}\n";
            logMessage("[TestAmoAuth] Ошибка при получении пользовательских полей: {$fieldsResponse['statusCode']}. {$fieldsResponse['error']}", 'ERROR');
        }

        // --- 2. Получение и сохранение Pipelines ---
        $pipelinesUrl = AMO_API_URL_BASE . '/leads/pipelines';
        echo "\nЗапрос воронок: $pipelinesUrl\n";
        $pipelinesResponse = httpClient($pipelinesUrl, [
            'headers' => ['Authorization: Bearer ' . $accessToken],
            'timeout' => 15
        ]);

        if ($pipelinesResponse['statusCode'] === 200 && !empty($pipelinesResponse['body'])) {
            $pipelinesData = json_decode($pipelinesResponse['body'], true);
            if (json_last_error() === JSON_ERROR_NONE && isset($pipelinesData['_embedded']['pipelines'])) {
                $pipelinesFilePath = DATA_DIR . '/pipelines.json'; // Используем DATA_DIR
                if (saveDataToFile($pipelinesFilePath, $pipelinesData)) {
                    echo "✅ Воронки сохранены в: $pipelinesFilePath\n";
                    logMessage("[TestAmoAuth] Воронки AmoCRM успешно сохранены.", 'INFO');

                    echo "\n--- Найденные ID воронок и статусов ---\n";
                    $foundPipelineIds = [];
                    foreach ($pipelinesData['_embedded']['pipelines'] as $pipeline) {
                        if ($pipeline['is_main']) {
                            $foundPipelineIds['AMO_MAIN_PIPELINE_ID'] = $pipeline['id'];
                        }
                        // Поиск конкретных статусов по имени в основной воронке
                        if (isset($pipeline['_embedded']['statuses'])) {
                            foreach ($pipeline['_embedded']['statuses'] as $status) {
                                switch ($status['name']) {
                                    case 'CHATGPT':
                                        $foundPipelineIds['AMO_CHATGPT_STATUS_ID'] = $status['id'];
                                        break;
                                    case 'Финальный Операторский':
                                        $foundPipelineIds['AMO_FINAL_OPERATOR_STATUS_ID'] = $status['id'];
                                        break;
                                    // Добавьте другие статусы, если их ID нужны в .env
                                }
                            }
                        }
                    }
                    foreach ($foundPipelineIds as $key => $value) {
                        echo "$key=$value\n";
                    }
                } else {
                    echo "❌ Ошибка: Не удалось сохранить воронки в файл: $pipelinesFilePath\n";
                    logMessage("[TestAmoAuth] Ошибка при сохранении воронок в файл: $pipelinesFilePath", 'ERROR');
                }
            } else {
                echo "❌ Ошибка: Не удалось распарсить JSON или найти воронки.\n";
                logMessage("[TestAmoAuth] Ошибка при парсинге или поиске воронок: " . json_last_error_msg(), 'ERROR');
            }
        } else {
            echo "❌ Ошибка: Не удалось получить воронки. HTTP Status: {$pipelinesResponse['statusCode']}. Ошибка: {$pipelinesResponse['error']}\n";
            logMessage("[TestAmoAuth] Ошибка при получении воронок: {$pipelinesResponse['statusCode']}. {$pipelinesResponse['error']}", 'ERROR');
        }

    } else {
        echo "❌ Ошибка логина в AmoCRM.\n";
        echo "Пожалуйста, проверьте вывод выше для инструкций по авторизации (если они были).\n";
        logMessage('[TestAmoAuth] Ошибка логина в AmoCRM.');
    }
} catch (Exception $e) {
    echo "\n❌ Произошла ошибка во время аутентификации или получения данных: " . $e->getMessage() . "\n";
    logMessage('[TestAmoAuth] Исключение во время аутентификации или получения данных: ' . $e->getMessage(), 'ERROR');
}

echo "\n=== Тест завершен ===\n";
