<?php
// amo2json.php

// Enable error reporting for debugging
error_reporting(E_ALL);
ini_set('display_errors', 1);
ini_set('log_errors', 1);

// Prevent direct execution when included
if (!defined('AMO2JSON_INCLUDED')) {
    define('AMO2JSON_INCLUDED', true);
}

// Include dependencies
if (!defined('CONFIG_LOADED')) {
    require_once __DIR__ . '/config.php';
}
// Define constant to prevent logger from outputting to browser
define('dontshowlogs', 1);
if (!function_exists('logMessage')) {
    require_once __DIR__ . '/logger.php';
}
require_once __DIR__ . '/lib/json_storage_utils.php';
require_once __DIR__ . '/lib/request_utils.php';
require_once __DIR__ . '/lib/amo_auth_utils.php'; // Для работы с API AmoCRM
if (!function_exists('parsePaymentPage')) {
    require_once __DIR__ . '/lib/payment_link_parser.php'; // Для парсинга ссылок на оплату
}

// Define constants with error checking
if (!defined('DATA_DIR')) {
    define('DATA_DIR', __DIR__ . '/data');
}
if (!defined('LOGS_DIR')) {
    define('LOGS_DIR', __DIR__ . '/logs');
}

define('AMO2JSON_LOCK_FILE', DATA_DIR . '/amo2json.lock');
define('AMO2JSON_SCRIPT_LOG_FILE', LOGS_DIR . '/amo2json.log');

// Log script startup when called directly
if (basename($_SERVER['SCRIPT_FILENAME']) === basename(__FILE__)) {
    logMessage("=== AMO2JSON WEBHOOK SCRIPT STARTED ===", 'INFO', AMO2JSON_SCRIPT_LOG_FILE);
    logMessage("Request method: " . ($_SERVER['REQUEST_METHOD'] ?? 'unknown'), 'INFO', AMO2JSON_SCRIPT_LOG_FILE);
    logMessage("Request URI: " . ($_SERVER['REQUEST_URI'] ?? 'unknown'), 'INFO', AMO2JSON_SCRIPT_LOG_FILE);
    logMessage("User agent: " . ($_SERVER['HTTP_USER_AGENT'] ?? 'unknown'), 'INFO', AMO2JSON_SCRIPT_LOG_FILE);
    logMessage("Remote IP: " . ($_SERVER['REMOTE_ADDR'] ?? 'unknown'), 'INFO', AMO2JSON_SCRIPT_LOG_FILE);
    logMessage("X-Signature header: " . ($_SERVER['HTTP_X_SIGNATURE'] ?? 'not present'), 'INFO', AMO2JSON_SCRIPT_LOG_FILE);
    logMessage("Content-Type: " . ($_SERVER['CONTENT_TYPE'] ?? 'not set'), 'INFO', AMO2JSON_SCRIPT_LOG_FILE);
    logMessage("Content-Length: " . ($_SERVER['CONTENT_LENGTH'] ?? 'not set'), 'INFO', AMO2JSON_SCRIPT_LOG_FILE);
}


/**
 * Проверяет, был ли уже обработан ID события/сделки.
 * @param string|int $eventId ID события/сделки
 * @param string $filePath Путь к файлу с обработанными ID
 * @return bool True, если ID уже обработан, иначе false.
 */
function isEventAlreadyProcessed(string $eventId, string $filePath): bool {
    if (!file_exists($filePath)) {
        return false;
    }
    $processed_ids = file($filePath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    return in_array($eventId, $processed_ids);
}

/**
 * Помечает ID события/сделки как обработанный.
 * @param string|int $eventId ID события/сделки
 * @param string $filePath Путь к файлу с обработанными ID
 * @return bool True в случае успеха, false в случае ошибки.
 */
function markEventAsProcessed(string $eventId, string $filePath): bool {
    $dir = dirname($filePath);
    if (!is_dir($dir)) {
        if (!mkdir($dir, 0755, true) && !is_dir($dir)) {
            logMessage("Failed to create directory for processed event IDs: $dir", 'ERROR', AMO2JSON_SCRIPT_LOG_FILE);
            return false;
        }
    }
    return file_put_contents($filePath, $eventId . PHP_EOL, FILE_APPEND | LOCK_EX) !== false;
}

/**
 * Main function to handle AMO to JSON webhook processing.
 * @param int $successHttpCode The HTTP status code to use on success.
 * @return array Result of processing.
 */
function handleAmo2JsonWebhook(int $successHttpCode): array {
    try {
        // Initialize variables
        $amount = null;
        $currency = null;
        $parseResult = null; // Инициализируем parseResult здесь
        $amoUpdateAttempted = false; // Флаг попытки обновления AmoCRM
        $amoUpdateSuccessful = false; // Флаг успешного обновления AmoCRM
        $localSaveAttempted = false; // Флаг попытки локального сохранения
        $localSaveSuccessful = false; // Флаг успешного локального сохранения
        
        // Check API key from GET parameter
        $providedApiKey = $_GET['apikey'] ?? '';
        
        // Log available constants for debugging
        logMessage('Checking for WEBHOOK_API_KEY constant...', 'INFO', AMO2JSON_SCRIPT_LOG_FILE);
        
        if (!defined('WEBHOOK_API_KEY')) {
            logMessage('WEBHOOK_API_KEY not defined in environment. Please add WEBHOOK_API_KEY to your .env file', 'ERROR', AMO2JSON_SCRIPT_LOG_FILE);
            logMessage('Available constants: ' . implode(', ', array_filter(get_defined_constants(true)['user'], function($key) { return strpos($key, 'AMO_') === 0 || strpos($key, 'WEBHOOK_') === 0; }, ARRAY_FILTER_USE_KEY)), 'DEBUG', AMO2JSON_SCRIPT_LOG_FILE);
            return ['status' => 'error', 'message' => 'Configuration error.', 'http_code' => 500];
        }
        
        if (empty($providedApiKey) || $providedApiKey !== WEBHOOK_API_KEY) {
            logMessage('API key validation failed. Expected: ' . substr(WEBHOOK_API_KEY, 0, 3) . '..., Received: ' . substr($providedApiKey, 0, 10) . '...', 'WARNING', AMO2JSON_SCRIPT_LOG_FILE);
            return ['status' => 'error', 'message' => 'Invalid API key.', 'http_code' => 403];
        }
        
        logMessage('API key validation successful', 'INFO', AMO2JSON_SCRIPT_LOG_FILE);
        
        // Get raw POST data for logging
        $rawPostData = file_get_contents('php://input');
        logMessage('Raw POST data length: ' . strlen($rawPostData), 'INFO', AMO2JSON_SCRIPT_LOG_FILE);

        // Парсинг данных вебхука - AmoCRM может отправлять как JSON, так и form-data
        $webhookData = [];
        if (!empty($rawPostData)) {
            // Попытка парсинга как JSON
            $jsonData = json_decode($rawPostData, true);
            if (json_last_error() === JSON_ERROR_NONE && is_array($jsonData)) {
                $webhookData = $jsonData;
                logMessage('Parsed webhook data as JSON', 'INFO', AMO2JSON_SCRIPT_LOG_FILE);
            } else {
                // Fallback на $_POST для form-data
                $webhookData = $_POST;
                logMessage('Using $_POST data (form-encoded)', 'INFO', AMO2JSON_SCRIPT_LOG_FILE);
            }
        } else {
            $webhookData = $_POST;
        }
        
        logMessage('Processing webhook for amo2json', 'INFO', AMO2JSON_SCRIPT_LOG_FILE);
        logMessage('Webhook data: ' . json_encode($webhookData, JSON_UNESCAPED_UNICODE), 'INFO', AMO2JSON_SCRIPT_LOG_FILE);

        $dealId = null;
        $paymentUrl = null;
        $leadData = null;

        // Check for lead add or update events - проверяем разные возможные структуры
        if (isset($webhookData['leads']['add'][0])) {
            $leadData = $webhookData['leads']['add'][0];
            logMessage('Found lead add event', 'INFO', AMO2JSON_SCRIPT_LOG_FILE);
        } elseif (isset($webhookData['leads']['update'][0])) {
            $leadData = $webhookData['leads']['update'][0];
            logMessage('Found lead update event', 'INFO', AMO2JSON_SCRIPT_LOG_FILE);
        } elseif (isset($webhookData['lead'])) {
            // Альтернативная структура
            $leadData = $webhookData['lead'];
            logMessage('Found lead data in alternative structure', 'INFO', AMO2JSON_SCRIPT_LOG_FILE);
        }

        if ($leadData) {
            $dealId = isset($leadData['id']) ? (string)$leadData['id'] : null;
            logMessage("Extracted deal ID: $dealId", 'INFO', AMO2JSON_SCRIPT_LOG_FILE);

            // Extract payment URL from custom field
            if (isset($leadData['custom_fields'])) {
                foreach ($leadData['custom_fields'] as $field) {
                    $fieldIdToCheck = (isset($field['id'])) ? (string)$field['id'] : ((isset($field['field_id'])) ? (string)$field['field_id'] : null);
                    logMessage("Checking custom field ID: $fieldIdToCheck", 'DEBUG', AMO2JSON_SCRIPT_LOG_FILE);
                    
                    if (defined('AMO_CF_ID_PAYMENT_LINK') && $fieldIdToCheck === AMO_CF_ID_PAYMENT_LINK && isset($field['values'][0]['value'])) {
                        $paymentUrl = (string)$field['values'][0]['value'];
                        logMessage("Found payment URL in custom field: $paymentUrl", 'INFO', AMO2JSON_SCRIPT_LOG_FILE);
                        break;
                    }
                }
            } elseif (isset($leadData['custom_fields_values'])) {
                // Альтернативная структура для custom fields
                foreach ($leadData['custom_fields_values'] as $field) {
                    $fieldIdToCheck = (isset($field['field_id'])) ? (string)$field['field_id'] : null;
                    logMessage("Checking custom field ID (alternative): $fieldIdToCheck", 'DEBUG', AMO2JSON_SCRIPT_LOG_FILE);
                    
                    if (defined('AMO_CF_ID_PAYMENT_LINK') && $fieldIdToCheck === AMO_CF_ID_PAYMENT_LINK && isset($field['values'][0]['value'])) {
                        $paymentUrl = (string)$field['values'][0]['value'];
                        logMessage("Found payment URL in custom field (alternative): $paymentUrl", 'INFO', AMO2JSON_SCRIPT_LOG_FILE);
                        break;
                    }
                }
            }
            
            if (!$paymentUrl) {
                logMessage("Payment URL not found in custom fields. Available fields: " . json_encode($leadData['custom_fields'] ?? $leadData['custom_fields_values'] ?? 'none'), 'WARNING', AMO2JSON_SCRIPT_LOG_FILE);
            }
        } else {
            logMessage("No lead data found in webhook. Available keys: " . implode(', ', array_keys($webhookData)), 'WARNING', AMO2JSON_SCRIPT_LOG_FILE);
        }

        if ($dealId && $paymentUrl) {
            // Check required constants
            if (!defined('RECIEVED_AMO_IDS_FILE_PATH')) {
                logMessage('RECIEVED_AMO_IDS_FILE_PATH not defined', 'ERROR', AMO2JSON_SCRIPT_LOG_FILE);
                return ['status' => 'error', 'message' => 'Configuration error.', 'http_code' => 500];
            }
            
            // Проверка на дубликат вебхука
            if (isEventAlreadyProcessed($dealId, RECIEVED_AMO_IDS_FILE_PATH)) {
                logMessage("Webhook for Deal ID $dealId already processed (found in " . RECIEVED_AMO_IDS_FILE_PATH . "). Skipping full processing.", 'INFO', AMO2JSON_SCRIPT_LOG_FILE);
                return ['status' => 'skipped_duplicate_webhook', 'message' => "Webhook for Deal ID $dealId already processed.", 'http_code' => $successHttpCode];
            }

            logMessage("Processing webhook for amo2json - Deal ID: $dealId, Payment URL: $paymentUrl", 'INFO', AMO2JSON_SCRIPT_LOG_FILE);

            // 1. Получаем токены AmoCRM
            $tokens = checkAmoAccess();
            if (!$tokens) {
                $logMsg = "Failed to get AmoCRM access tokens for deal ID: $dealId. Cannot update AmoCRM.";
                logMessage($logMsg, 'ERROR', AMO2JSON_SCRIPT_LOG_FILE);
                // Продолжаем парсинг и сохранение в JSON, но без обновления AmoCRM
            } else {
                $accessToken = $tokens['access_token'];

                // 2. Получаем текущий статус сделки
                $currentStatusId = null;
                $currentPipelineId = null;

                // Попытка получить status_id и pipeline_id из данных веб-хука
                if (isset($leadData['status_id'])) {
                    $currentStatusId = (string)$leadData['status_id'];
                }
                if (isset($leadData['pipeline_id'])) {
                    $currentPipelineId = (string)$leadData['pipeline_id'];
                }

                // Если status_id не найден в веб-хуке (что маловероятно для update), делаем запрос к API
                if (!$currentStatusId) {
                    logMessage("Status ID not found in webhook data for deal $dealId. Fetching deal details from AmoCRM API.", 'INFO', AMO2JSON_SCRIPT_LOG_FILE);
                    try {
                        if (!defined('AMO_API_URL_BASE')) {
                            logMessage('AMO_API_URL_BASE not defined', 'ERROR', AMO2JSON_SCRIPT_LOG_FILE);
                        } else {
                            $dealInfoResponse = httpClient(AMO_API_URL_BASE . "/leads/" . $dealId, [
                                'headers' => [
                                    'Authorization: Bearer ' . $accessToken,
                                    'Content-Type: application/json'
                                ]
                            ]);

                            if ($dealInfoResponse['statusCode'] < 400) {
                                $dealDetails = json_decode($dealInfoResponse['body'], true);
                                if (json_last_error() === JSON_ERROR_NONE && isset($dealDetails['_embedded']['leads'][0])) {
                                    $currentStatusId = (string)$dealDetails['_embedded']['leads'][0]['status_id'];
                                    $currentPipelineId = (string)$dealDetails['_embedded']['leads'][0]['pipeline_id'];
                                    logMessage("Fetched deal $dealId details. Status ID: $currentStatusId, Pipeline ID: $currentPipelineId", 'INFO', AMO2JSON_SCRIPT_LOG_FILE);
                                } else {
                                    logMessage("Failed to parse deal details for $dealId or lead data missing. Body: " . $dealInfoResponse['body'], 'ERROR', AMO2JSON_SCRIPT_LOG_FILE);
                                }
                            } else {
                                logMessage("Failed to fetch deal details for $dealId. Status: " . $dealInfoResponse['statusCode'] . " Body: " . $dealInfoResponse['body'], 'ERROR', AMO2JSON_SCRIPT_LOG_FILE);
                            }
                        }
                    } catch (Exception $e) {
                        logMessage("Exception fetching deal details for $dealId: " . $e->getMessage(), 'ERROR', AMO2JSON_SCRIPT_LOG_FILE);
                    }
                }

                // 4. Парсинг ссылки на оплату - Вызываем парсинг, если есть dealId и paymentUrl
                logMessage("--- BEFORE calling parsePaymentLink for deal $dealId with URL: $paymentUrl ---", 'DEBUG', AMO2JSON_SCRIPT_LOG_FILE);
                $parseResult = parsePaymentLink($paymentUrl);
                logMessage("--- AFTER calling parsePaymentLink for deal $dealId. Result: " . json_encode($parseResult), 'DEBUG', AMO2JSON_SCRIPT_LOG_FILE);


                // 5. Логика обновления AmoCRM - только если токены получены, сделка в основной воронке И НЕ на этапе CHATGPT И парсинг успешен
                if ($tokens && defined('AMO_MAIN_PIPELINE_ID') && defined('AMO_CHATGPT_STATUS_ID') && 
                    $currentPipelineId === AMO_MAIN_PIPELINE_ID && $currentStatusId !== AMO_CHATGPT_STATUS_ID &&
                    $parseResult && isset($parseResult['amount']) && isset($parseResult['currency']) && isset($parseResult['currencyAmoId']) && $parseResult['amount'] !== null && $parseResult['currency'] !== null && $parseResult['currencyAmoId'] !== null) {
                    
                    logMessage("Deal $dealId is in pipeline $currentPipelineId and not in CHATGPT stage ($currentStatusId). Attempting AmoCRM update.", 'INFO', AMO2JSON_SCRIPT_LOG_FILE);

                    $amount = (float)$parseResult['amount'];
                    $currency = $parseResult['currency'];
                    $currencyEnumId = $parseResult['currencyAmoId'];

                    if (defined('AMO_CF_ID_REQUEST_AMOUNT') && defined('AMO_CF_ID_REQUEST_CURRENCY') && defined('AMO_CHATGPT_STATUS_ID')) {
                        // 6. Обновляем поля и этап в AmoCRM
                        $updateData = [
                            'id' => (int)$dealId,
                            'status_id' => (int)AMO_CHATGPT_STATUS_ID, // Переводим на этап CHATGPT
                            'custom_fields_values' => [
                                [
                                    'field_id' => (int)AMO_CF_ID_REQUEST_AMOUNT,
                                    'values' => [['value' => $amount]]
                                ],
                                [
                                    'field_id' => (int)AMO_CF_ID_REQUEST_CURRENCY,
                                    'values' => [['enum_id' => (int)$currencyEnumId]]
                                ]
                            ]
                        ];
                        
                        // Если нужно обновить и воронку (хотя по логике выше, мы уже в AMO_MAIN_PIPELINE_ID)
                        // $updateData['pipeline_id'] = (int)AMO_MAIN_PIPELINE_ID;


                        logMessage("Attempting to update AmoCRM deal $dealId with Amount: $amount, Currency Enum ID: $currencyEnumId and move to Stage ID: " . AMO_CHATGPT_STATUS_ID, 'INFO', AMO2JSON_SCRIPT_LOG_FILE);
                        logMessage("AmoCRM update payload: " . json_encode($updateData, JSON_UNESCAPED_UNICODE), 'DEBUG', AMO2JSON_SCRIPT_LOG_FILE);

                        try {
                            $updateResponse = httpClient(AMO_API_URL_BASE . "/leads", [ // Отправляем массив из одного элемента
                                'method' => 'PATCH',
                                'headers' => [
                                    'Authorization: Bearer ' . $accessToken,
                                    'Content-Type: application/json'
                                ],
                                'body' => json_encode([$updateData]) // AmoCRM ожидает массив сделок для пакетного обновления
                            ]);

                            if ($updateResponse['statusCode'] < 400) {
                                logMessage("Successfully updated AmoCRM deal $dealId with payment details and moved to CHATGPT stage.", 'INFO', AMO2JSON_SCRIPT_LOG_FILE);
                                $amoUpdateSuccessful = true; // Устанавливаем флаг успешного обновления AmoCRM
                                // Помечаем вебхук как обработанный (в RECIEVED_AMO_IDS_FILE_PATH) после успешного обновления AmoCRM
                                if (!markEventAsProcessed($dealId, RECIEVED_AMO_IDS_FILE_PATH)) {
                                    logMessage("CRITICAL: Deal ID $dealId was processed and updated in AmoCRM, but FAILED to be marked in " . RECIEVED_AMO_IDS_FILE_PATH, 'ERROR', AMO2JSON_SCRIPT_LOG_FILE);
                                }
                                // Возвращаем успешный статус, так как AmoCRM обновлен
                                return ['status' => 'success_amo_update', 'message' => "Deal $dealId processed, AmoCRM updated.", 'http_code' => $successHttpCode];

                            } else {
                                logMessage("Failed to update AmoCRM deal $dealId. Status: " . $updateResponse['statusCode'] . " Body: " . $updateResponse['body'], 'ERROR', AMO2JSON_SCRIPT_LOG_FILE);
                                // Если обновление AmoCRM не удалось, не помечаем как обработанный
                                // return ['status' => 'error_amo_update_failed', 'message' => "AmoCRM update failed for deal $dealId.", 'http_code' => 500]; // Не завершаем скрипт здесь
                            }
                        } catch (Exception $e) {
                            logMessage("Exception updating AmoCRM deal $dealId: " . $e->getMessage(), 'ERROR', AMO2JSON_SCRIPT_LOG_FILE);
                            // Если обновление AmoCRM вызвало исключение, не помечаем как обработанный
                            // return ['status' => 'error_amo_update_exception', 'message' => 'Internal server error during AmoCRM update: ' . $e->getMessage(), 'http_code' => 500]; // Не завершаем скрипт здесь
                        }
                    } else {
                        logMessage("Missing constants for AmoCRM custom fields (AMO_CF_ID_REQUEST_AMOUNT, AMO_CF_ID_REQUEST_CURRENCY or AMO_CHATGPT_STATUS_ID) for deal $dealId. Cannot update AmoCRM.", 'WARNING', AMO2JSON_SCRIPT_LOG_FILE);
                        // Если константы не определены, не помечаем как обработанный
                        // return ['status' => 'error_config_missing', 'message' => 'Missing AmoCRM custom field constants.', 'http_code' => 500]; // Не завершаем скрипт здесь
                    }
                } else { // Условия для обновления AmoCRM не выполнены
                    logMessage("AmoCRM update conditions not met for deal $dealId (Pipeline: $currentPipelineId, Status: $currentStatusId). Skipping AmoCRM update.", 'INFO', AMO2JSON_SCRIPT_LOG_FILE);
                    // Продолжаем к логике локального сохранения
                }
            }


            // Логика локального сохранения - выполняется, если dealId, paymentUrl присутствуют
            // И если AmoCRM НЕ был успешно обновлен в этом вебхуке.
            if ($dealId && $paymentUrl && !$amoUpdateSuccessful) {
                if (!defined('ALL_LEADS_FILE_PATH')) {
                    logMessage('ALL_LEADS_FILE_PATH not defined', 'ERROR', AMO2JSON_SCRIPT_LOG_FILE);
                    return ['status' => 'error', 'message' => 'Configuration error (ALL_LEADS_FILE_PATH).', 'http_code' => 500];
                }
                
                $deals = loadDataFromFile(ALL_LEADS_FILE_PATH);
                $dealFound = false;

                // Используем данные парсинга, если они успешны, иначе сохраняем null для amount/currency
                $amountToSave = ($parseResult && isset($parseResult['amount'])) ? (float)$parseResult['amount'] : null;
                $currencyToSave = ($parseResult && isset($parseResult['currency'])) ? $parseResult['currency'] : null;


                foreach ($deals as $key => $existingDeal) {
                    if (isset($existingDeal['dealId']) && (string)$existingDeal['dealId'] === $dealId) {
                        $deals[$key]['paymentUrl'] = $paymentUrl;
                        $deals[$key]['last_updated'] = date('Y-m-d H:i:s');
                        // Обновляем сумму и валюту только если они были успешно спарсены в этом вебхуке
                        if ($amountToSave !== null) $deals[$key]['amount'] = $amountToSave;
                        if ($currencyToSave !== null) $deals[$key]['currency'] = $currencyToSave;
                        $dealFound = true;
                        logMessage("Deal ID $dealId found, updating payment URL and details in JSON.", 'INFO', AMO2JSON_SCRIPT_LOG_FILE);
                        break;
                    }
                }

                if (!$dealFound) {
                    $deals[] = [
                        'dealId' => $dealId,
                        'paymentUrl' => $paymentUrl,
                        'created_at' => date('Y-m-d H:i:s'),
                        'last_updated' => date('Y-m-d H:i:s'),
                        'amount' => $amountToSave,
                        'currency' => $currencyToSave
                    ];
                    logMessage("Deal ID $dealId not found, adding new entry to JSON.", 'INFO', AMO2JSON_SCRIPT_LOG_FILE);
                }

                if (saveDataToFile(ALL_LEADS_FILE_PATH, $deals)) {
                    logMessage("Successfully updated/added deal ID $dealId to " . ALL_LEADS_FILE_PATH, 'INFO', AMO2JSON_SCRIPT_LOG_FILE);
                    
                    // Помечаем вебхук как обработанный (в RECIEVED_AMO_IDS_FILE_PATH) после успешного локального сохранения
                    if (!markEventAsProcessed($dealId, RECIEVED_AMO_IDS_FILE_PATH)) {
                        logMessage("CRITICAL: Deal ID $dealId was processed and saved, but FAILED to be marked in " . RECIEVED_AMO_IDS_FILE_PATH, 'ERROR', AMO2JSON_SCRIPT_LOG_FILE);
                    }
                    // Возвращаем успешный статус, так как локальное сохранение прошло успешно
                    return ['status' => 'success_local_save', 'message' => "Deal $dealId processed and saved to JSON.", 'http_code' => $successHttpCode];
                } else {
                    logMessage("Failed to save deal ID $dealId to " . ALL_LEADS_FILE_PATH . ".", 'ERROR', AMO2JSON_SCRIPT_LOG_FILE);
                    return ['status' => 'error', 'message' => "Failed to save deal $dealId to JSON.", 'http_code' => 500];
                }
            } else {
                 // Если нет dealId, paymentUrl, или AmoCRM был успешно обновлен, возвращаем соответствующий статус
                 $logMsg = "Skipping local save for amo2json - ";
                 if (!$dealId) $logMsg .= "Deal ID not found. ";
                 if (!$paymentUrl) $logMsg .= "Payment URL not found. ";
                 if ($amoUpdateSuccessful) $logMsg .= "AmoCRM was successfully updated.";
                 logMessage($logMsg, 'INFO', AMO2JSON_SCRIPT_LOG_FILE);
                 // Возвращаем 200, т.к. это не критическая ошибка, просто нет данных для сохранения или AmoCRM уже обновлен
                 return ['status' => 'skipped_local_save', 'message' => $logMsg, 'http_code' => 200]; 
            }


        } else { // Missing dealId or paymentUrl in initial webhook data
            $logMsg = "Missing required data in initial webhook for amo2json - ";
            if (!$dealId) $logMsg .= "Deal ID not found. ";
            if (!$paymentUrl) $logMsg .= "Payment URL not found (expected in custom field " . (defined('AMO_CF_ID_PAYMENT_LINK') ? AMO_CF_ID_PAYMENT_LINK : 'undefined') . ").";
            logMessage($logMsg, 'INFO', AMO2JSON_SCRIPT_LOG_FILE);
            return ['status' => 'error', 'message' => $logMsg, 'http_code' => 400];
        }
    } catch (Exception $e) {
        logMessage("Exception in handleAmo2JsonWebhook: " . $e->getMessage(), 'ERROR', AMO2JSON_SCRIPT_LOG_FILE);
        return ['status' => 'error', 'message' => 'Internal server error: ' . $e->getMessage(), 'http_code' => 500];
    }
}

// Only execute webhook handling if called directly (not included)
if (basename($_SERVER['SCRIPT_FILENAME']) === basename(__FILE__)) {
    // Send 200 OK early to acknowledge receipt of webhook, then close connection
    // This is a common pattern for webhooks to avoid timeouts on the sender's side.
    if (!headers_sent()) {
        header('HTTP/1.1 200 OK');
        header('Content-Length: 0');
        header('Connection: close');
    }
    // From this point, the client has received a 200 OK and disconnected.
    // The script continues to run in the background.
    if (ob_get_level() > 0) {
        ob_end_flush();
        flush();
    }
    if (session_id()) {
        session_write_close();
    }

    // Now, use the locked request handler to do the actual processing.
    // The handleLockedPostRequest function will manage its own output, but since we've
    // already closed the connection, it's not sent to the original client.
    // It will, however, log everything correctly.
    handleLockedPostRequest(AMO2JSON_LOCK_FILE, 'handleAmo2JsonWebhook', 200);
}

?>
