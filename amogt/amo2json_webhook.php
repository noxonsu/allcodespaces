<?php
// amo2json.php

// Enable error reporting for debugging
error_reporting(E_ALL);
ini_set('display_errors', 1);
ini_set('log_errors', 1);

if (!$_POST['leads']['update'][0]['custom_fields'][14]['values'][0]['value']) die("No payment URL provided.");

// временно отключить парсер суммы и валюты предварительный
define('AMO2JSON_SKIP_PAYMENT_PARSING', true); // Устанавливаем флаг для пропуска парсинга суммы и валюты

// Prevent direct execution when included
if (!defined('AMO2JSON_INCLUDED')) {
    define('AMO2JSON_INCLUDED', true);
}

// Include dependencies
if (!defined('CONFIG_LOADED')) {
    require_once __DIR__ . '/config.php';
}

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

// Custom error handler to log PHP errors and warnings
function customErrorHandler($errno, $errstr, $errfile, $errline) {
    $errorTypes = [
        E_ERROR => 'ERROR',
        E_WARNING => 'WARNING', 
        E_PARSE => 'PARSE',
        E_NOTICE => 'NOTICE',
        E_CORE_ERROR => 'CORE_ERROR',
        E_CORE_WARNING => 'CORE_WARNING',
        E_COMPILE_ERROR => 'COMPILE_ERROR',
        E_COMPILE_WARNING => 'COMPILE_WARNING',
        E_USER_ERROR => 'USER_ERROR',
        E_USER_WARNING => 'USER_WARNING',
        E_USER_NOTICE => 'USER_NOTICE',
        E_STRICT => 'STRICT',
        E_RECOVERABLE_ERROR => 'RECOVERABLE_ERROR',
        E_DEPRECATED => 'DEPRECATED',
        E_USER_DEPRECATED => 'USER_DEPRECATED'
    ];
    
    $errorType = $errorTypes[$errno] ?? 'UNKNOWN';
    $logMsg = "PHP $errorType: $errstr in $errfile on line $errline";
    
    if (defined('AMO2JSON_SCRIPT_LOG_FILE') && function_exists('logMessage')) {
        logMessage($logMsg, 'ERROR', AMO2JSON_SCRIPT_LOG_FILE);
    }
    
    // Don't execute PHP internal error handler
    return true;
}

// Set custom error handler
set_error_handler('customErrorHandler');

// Log script startup when called directly
if (basename($_SERVER['SCRIPT_FILENAME']) === basename(__FILE__)) {
    // Check for lock file before logging start
    if (file_exists(AMO2JSON_LOCK_FILE)) {
        logMessage("!!! AMO2JSON WEBHOOK SCRIPT ATTEMPTED TO START WHILE LOCKED !!!", 'WARNING', AMO2JSON_SCRIPT_LOG_FILE);
    }
    logMessage("=== AMO2JSON WEBHOOK SCRIPT STARTED ===", 'INFO', AMO2JSON_SCRIPT_LOG_FILE);
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
 * Sends a comment (note) to a specific deal in AmoCRM.
 * @param string $dealId The ID of the deal.
 * @param string $accessToken The AmoCRM API access token.
 * @param string $commentText The text of the comment to send.
 * @return void
 */
function sendParsingComment(string $dealId, string $accessToken, string $commentText): void {
    if (!defined('AMO_API_URL_BASE')) {
        logMessage("AMO_API_URL_BASE not defined. Cannot send comment to AmoCRM for deal $dealId.", 'ERROR', AMO2JSON_SCRIPT_LOG_FILE);
        return;
    }

    $notesUrl = AMO_API_URL_BASE . "/leads/" . $dealId . "/notes";
    // AmoCRM API v4 expects an array of note objects
    $noteData = [
        [
            // "common" is a general purpose note. Other types include "call_in", "call_out", "message_cashier", etc.
            // Adjust "note_type" if a more specific type is needed.
            "note_type" => "common", 
            "params" => [
                "text" => $commentText
            ]
        ]
    ];

    logMessage("Attempting to send comment to AmoCRM for deal $dealId: '$commentText'", 'INFO', AMO2JSON_SCRIPT_LOG_FILE);

    try {
        $response = httpClient($notesUrl, [
            'method' => 'POST',
            'headers' => [
                'Authorization: Bearer ' . $accessToken,
                'Content-Type: application/json'
            ],
            'body' => json_encode($noteData)
        ]);

        // Successful note creation usually returns 200 OK with the created note(s) data.
        if ($response['statusCode'] < 300 && $response['statusCode'] >= 200) { 
            logMessage("Successfully sent comment to AmoCRM for deal $dealId.", 'INFO', AMO2JSON_SCRIPT_LOG_FILE);
        } else {
            logMessage("Failed to send comment to AmoCRM for deal $dealId. Status: " . $response['statusCode'] . " Body: " . $response['body'], 'ERROR', AMO2JSON_SCRIPT_LOG_FILE);
        }
    } catch (Exception $e) {
        logMessage("Exception sending comment to AmoCRM for deal $dealId: " . $e->getMessage(), 'ERROR', AMO2JSON_SCRIPT_LOG_FILE);
    }
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

            // Проверка статуса "Статус оплаты ChatGPT"
            if (isset($leadData['custom_fields'])) {
                $skipProcessing = false;
                $paymentStatusChecked = false;
                
                foreach ($leadData['custom_fields'] as $field) {
                    $fieldIdToCheck = (isset($field['id'])) ? (string)$field['id'] : null;

                    // Check for "Статус оплаты ChatGPT" FIRST
                    if (defined('AMO_CF_ID_CHATGPT_PAYMENT_STATUS') && $fieldIdToCheck === AMO_CF_ID_CHATGPT_PAYMENT_STATUS) {
                        $paymentStatusChecked = true;
                        if (isset($field['values'][0]['value']) && trim($field['values'][0]['value']) !== '') {
                            $statusValue = $field['values'][0]['value'];
                            logMessage("Deal ID $dealId has a non-empty status ('" . htmlspecialchars($statusValue) . "') for ChatGPT payment (field " . AMO_CF_ID_CHATGPT_PAYMENT_STATUS . "). Skipping processing.", 'INFO', AMO2JSON_SCRIPT_LOG_FILE);
                            return ['status' => 'skipped_payment_status_not_empty', 'message' => "Deal ID $dealId skipped because ChatGPT payment status ('" . htmlspecialchars($statusValue) . "') is not empty.", 'http_code' => $successHttpCode];
                        }
                    }
                    
                    // Extract payment URL from custom field
                    if (defined('AMO_CF_ID_PAYMENT_LINK') && $fieldIdToCheck === AMO_CF_ID_PAYMENT_LINK && isset($field['values'][0]['value'])) {
                        $paymentUrl = (string)$field['values'][0]['value'];
                        logMessage("Found payment URL in custom field: $paymentUrl", 'INFO', AMO2JSON_SCRIPT_LOG_FILE);
                        // УБИРАЕМ break здесь - нужно проверить все поля
                    }
                }
                
                // Дополнительная проверка если поле статуса оплаты не найдено
                if (!$paymentStatusChecked) {
                    logMessage("Payment status field (ID: " . (defined('AMO_CF_ID_CHATGPT_PAYMENT_STATUS') ? AMO_CF_ID_CHATGPT_PAYMENT_STATUS : 'undefined') . ") not found in webhook data", 'WARNING', AMO2JSON_SCRIPT_LOG_FILE);
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
            
            // If dealId is present, but no paymentUrl was found, return early.
            // No specific log message here as per user request for this scenario.
            if ($dealId && !$paymentUrl) {
                return ['status' => 'skipped_no_payment_url', 'message' => "Deal $dealId: Payment URL not found. Processing skipped.", 'http_code' => $successHttpCode];
            }
            // Removed: logMessage("Payment URL not found in custom fields...")
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

                // 4. Парсинг ссылки на оплату - проверяем валидность и парсим
                $parseResult = null;
                $commentSent = false;
                
                // Проверяем валидность URL всегда (быстрая проверка)
                if (strpos($paymentUrl, 'c/pay/cs_live') === false) {
                    logMessage("Payment URL for deal $dealId does not contain 'c/pay/cs_live' - not a valid Stripe payment link. Skipping parsing.", 'WARNING', AMO2JSON_SCRIPT_LOG_FILE);
                    if ($tokens && defined('AMO_API_URL_BASE')) {
                        sendParsingComment($dealId, $accessToken, "⚠️ PHP парсер: URL оплаты не содержит 'c/pay/cs_live' - не является валидной Stripe ссылкой. Парсинг пропущен.");
                    }
                    return [
                        'status' => 'skipped_invalid_url', 
                            'message' => "Deal $dealId: Invalid payment URL - not saved to JSON", 
                            'http_code' => $successHttpCode
                        ];
                } elseif (defined('AMO2JSON_SKIP_PAYMENT_PARSING') && AMO2JSON_SKIP_PAYMENT_PARSING === true) {
                    logMessage("Payment parsing is DISABLED by AMO2JSON_SKIP_PAYMENT_PARSING flag for deal $dealId. Skipping parsing.", 'INFO', AMO2JSON_SCRIPT_LOG_FILE);
                    if ($tokens && defined('AMO_API_URL_BASE')) {
                        sendParsingComment($dealId, $accessToken, "ℹ️ PHP парсер: Парсинг оплаты временно отключен (флаг AMO2JSON_SKIP_PAYMENT_PARSING).");
                    }
                } else {
                    logMessage("--- BEFORE calling parsePaymentLink for deal $dealId with URL: $paymentUrl ---", 'DEBUG', AMO2JSON_SCRIPT_LOG_FILE);
                    $parseResult = parsePaymentLink($paymentUrl);
                    if (!$parseResult || !isset($parseResult['amount']) || !isset($parseResult['currency']) || $parseResult['amount'] === null || $parseResult['currency'] === null) {
                        logMessage("Payment parsing failed for deal $dealId. Parse result: " . json_encode($parseResult), 'WARNING', AMO2JSON_SCRIPT_LOG_FILE);
                        if ($tokens && defined('AMO_API_URL_BASE')) {
                            sendParsingComment($dealId, $accessToken, "❌ PHP парсер не смог извлечь сумму из URL оплаты. URL: " . substr($paymentUrl, 0, 100) . (strlen($paymentUrl) > 100 ? '...' : ''));
                        }
                    }
                    logMessage("--- AFTER calling parsePaymentLink for deal $dealId. Result: " . json_encode($parseResult), 'DEBUG', AMO2JSON_SCRIPT_LOG_FILE);
                }
                
                // 5. Логика обновления AmoCRM - только если токены получены, сделка в основной воронке И НЕ на этапе CHATGPT И парсинг успешен (или пропущен)
                $shouldUpdateAmo = $tokens && defined('AMO_MAIN_PIPELINE_ID') && defined('AMO_CHATGPT_STATUS_ID') && 
                    $currentPipelineId === AMO_MAIN_PIPELINE_ID && $currentStatusId !== AMO_CHATGPT_STATUS_ID;
                
                // Если парсинг не пропущен, требуем успешный результат парсинга
                if (!defined('AMO2JSON_SKIP_PAYMENT_PARSING') || AMO2JSON_SKIP_PAYMENT_PARSING !== true) {
                    $shouldUpdateAmo = $shouldUpdateAmo && $parseResult && isset($parseResult['amount']) && isset($parseResult['currency']) && isset($parseResult['currencyAmoId']) && 
                        $parseResult['amount'] !== null && $parseResult['currency'] !== null && $parseResult['currencyAmoId'] !== null;
                }
                
                if ($shouldUpdateAmo) {
                    logMessage("Deal $dealId is in pipeline $currentPipelineId and not in CHATGPT stage ($currentStatusId). Attempting AmoCRM update.", 'INFO', AMO2JSON_SCRIPT_LOG_FILE);

                    // Если парсинг пропущен, используем значения по умолчанию или пропускаем обновление полей
                    if (defined('AMO2JSON_SKIP_PAYMENT_PARSING') && AMO2JSON_SKIP_PAYMENT_PARSING === true) {
                        logMessage("Payment parsing was skipped - updating only deal stage to CHATGPT without amount/currency fields.", 'INFO', AMO2JSON_SCRIPT_LOG_FILE);
                        
                        if (defined('AMO_CHATGPT_STATUS_ID')) {
                            $updateData = [
                                'id' => (int)$dealId,
                                'status_id' => (int)AMO_CHATGPT_STATUS_ID // Переводим только на этап CHATGPT
                            ];
                            
                            logMessage("Attempting to update AmoCRM deal $dealId - moving to Stage ID: " . AMO_CHATGPT_STATUS_ID . " (parsing skipped)", 'INFO', AMO2JSON_SCRIPT_LOG_FILE);
                        }
                    } else {
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
                            
                            logMessage("Attempting to update AmoCRM deal $dealId with Amount: $amount, Currency Enum ID: $currencyEnumId and move to Stage ID: " . AMO_CHATGPT_STATUS_ID, 'INFO', AMO2JSON_SCRIPT_LOG_FILE);
                        }
                    }

                    if (isset($updateData)) {
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
                                logMessage("Successfully updated AmoCRM deal $dealId " . (defined('AMO2JSON_SKIP_PAYMENT_PARSING') && AMO2JSON_SKIP_PAYMENT_PARSING === true ? "(stage only)" : "with payment details") . " and moved to CHATGPT stage.", 'INFO', AMO2JSON_SCRIPT_LOG_FILE);
                                $amoUpdateSuccessful = true; // Устанавливаем флаг успешного обновления AmoCRM
                                // НЕ помечаем вебхук как обработанный здесь
                                // НЕ возвращаем статус здесь, чтобы продолжить выполнение и сохранить в JSON
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


            // Логика локального сохранения - выполняется если dealId, paymentUrl присутствуют И (парсинг успешен ИЛИ пропущен)
            if ($dealId && $paymentUrl) {
                // Если парсинг пропущен, сохраняем без amount и currency
                if (defined('AMO2JSON_SKIP_PAYMENT_PARSING') && AMO2JSON_SKIP_PAYMENT_PARSING === true) {
                    logMessage("Payment parsing was skipped - saving deal $dealId to JSON without amount/currency data.", 'INFO', AMO2JSON_SCRIPT_LOG_FILE);
                    $amountToSave = null;
                    $currencyToSave = null;
                } else {
                    // Проверяем, что парсинг был успешен и получены amount и currency
                    $amountToSave = ($parseResult && isset($parseResult['amount'])) ? (float)$parseResult['amount'] : null;
                    $currencyToSave = ($parseResult && isset($parseResult['currency'])) ? $parseResult['currency'] : null;
                    
                    if ($amountToSave === null || $currencyToSave === null) {
                        logMessage("Skipping local save for deal $dealId - Amount ($amountToSave) or Currency ($currencyToSave) not defined from payment URL parsing.", 'WARNING', AMO2JSON_SCRIPT_LOG_FILE);
                        // Не сохраняем в JSON, но продолжаем выполнение
                        $amountToSave = null;
                        $currencyToSave = null;
                    }
                }
                
                // Сохраняем в любом случае, если есть dealId и paymentUrl
                if (!defined('ALL_LEADS_FILE_PATH')) {
                    logMessage('ALL_LEADS_FILE_PATH not defined', 'ERROR', AMO2JSON_SCRIPT_LOG_FILE);
                    // Не выходим, просто логируем ошибку и продолжаем, чтобы не прерывать обновление AmoCRM
                } else {
                    $localSaveAttempted = true;
                    $deals = loadDataFromFile(ALL_LEADS_FILE_PATH);
                    $dealFound = false;

                    foreach ($deals as $key => $existingDeal) {
                        if (isset($existingDeal['dealId']) && (string)$existingDeal['dealId'] === $dealId) {
                            $deals[$key]['paymentUrl'] = $paymentUrl;
                            $deals[$key]['last_updated'] = date('Y-m-d H:i:s');
                            if ($amountToSave !== null) {
                                $deals[$key]['amount'] = $amountToSave;
                            }
                            if ($currencyToSave !== null) {
                                $deals[$key]['currency'] = $currencyToSave;
                            }
                            $dealFound = true;
                            logMessage("Deal ID $dealId found, updating payment URL and details in JSON.", 'INFO', AMO2JSON_SCRIPT_LOG_FILE);
                            break;
                        }
                    }

                    if (!$dealFound) {
                        $newDeal = [
                            'dealId' => $dealId,
                            'paymentUrl' => $paymentUrl,
                            'created_at' => date('Y-m-d H:i:s'),
                            'last_updated' => date('Y-m-d H:i:s')
                        ];
                        if ($amountToSave !== null) {
                            $newDeal['amount'] = $amountToSave;
                        }
                        if ($currencyToSave !== null) {
                            $newDeal['currency'] = $currencyToSave;
                        }
                        $deals[] = $newDeal;
                        logMessage("Deal ID $dealId not found, adding new entry to JSON.", 'INFO', AMO2JSON_SCRIPT_LOG_FILE);
                    }

                    if (saveDataToFile(ALL_LEADS_FILE_PATH, $deals)) {
                        logMessage("Successfully updated/added deal ID $dealId to " . ALL_LEADS_FILE_PATH, 'INFO', AMO2JSON_SCRIPT_LOG_FILE);
                        $localSaveSuccessful = true;
                    } else {
                        logMessage("Failed to save deal ID $dealId to " . ALL_LEADS_FILE_PATH . ".", 'ERROR', AMO2JSON_SCRIPT_LOG_FILE);
                    }
                }
            } else {
                logMessage("Skipping local save for amo2json - Deal ID or Payment URL not found.", 'INFO', AMO2JSON_SCRIPT_LOG_FILE);
            }

            // Помечаем вебхук как обработанный, если локальное сохранение было успешным
            if ($localSaveSuccessful) {
                if (!isEventAlreadyProcessed($dealId, RECIEVED_AMO_IDS_FILE_PATH)) {
                    if (!markEventAsProcessed($dealId, RECIEVED_AMO_IDS_FILE_PATH)) {
                        logMessage("CRITICAL: Deal ID $dealId was processed (AmoCRM: " . ($amoUpdateSuccessful ? 'Yes' : 'No') . ", Local: Yes), but FAILED to be marked in " . RECIEVED_AMO_IDS_FILE_PATH, 'ERROR', AMO2JSON_SCRIPT_LOG_FILE);
                    }
                }
            }

            // Возвращаем статус на основе результатов
            if ($localSaveSuccessful) {
                $message = "Deal $dealId processed and saved to JSON.";
                if ($amoUpdateAttempted) {
                    $message .= $amoUpdateSuccessful ? " AmoCRM update was successful." : " AmoCRM update failed.";
                } else {
                    $message .= " AmoCRM update was skipped.";
                }
                return ['status' => 'success', 'message' => $message, 'http_code' => $successHttpCode];
            } else {
                // Если ни одна операция не удалась, но мы пытались
                $errorMsg = "Failed to process deal $dealId.";
                if ($amoUpdateAttempted) $errorMsg .= " AmoCRM update failed.";
                if ($localSaveAttempted) $errorMsg .= " Local JSON save failed.";
                return ['status' => 'error_processing', 'message' => $errorMsg, 'http_code' => 500];
            }


        } else { // Missing dealId or ($dealId was present but paymentUrl was missing - handled by early return)
                 // This block is now primarily for cases where $dealId is missing.
            $logMsg = "Cannot process webhook: ";
            if (!$dealId) {
                $logMsg .= "Deal ID is missing or could not be extracted from lead data.";
            } else {
                // This case should ideally not be reached if the early return for ($dealId && !$paymentUrl) works.
                // If it is, it means $paymentUrl is also missing for some other reason not caught.
                $logMsg .= "Required data (Deal ID or Payment URL) is missing.";
            }
            logMessage($logMsg, 'INFO', AMO2JSON_SCRIPT_LOG_FILE);
            return ['status' => 'error_missing_required_data', 'message' => $logMsg, 'http_code' => 400];
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
