<?php
// amogt/zeno_report.php

require_once __DIR__ . '/config.php'; // Defines AMO_TOKEN, BLOCKED_DEALS_PATH etc.
require_once __DIR__ . '/vendor/autoload.php'; // For AmoCRM client if used, or other utilities
require_once __DIR__ . '/logger.php';
require_once __DIR__ . '/lib/json_storage_utils.php';
require_once __DIR__ . '/lib/amo_auth_utils.php'; // New include for AmoCRM auth functions

define('ZENO_REPORT_LOG_FILE', LOGS_DIR . '/zeno_report.log'); // Используем LOGS_DIR
define('ZENO_REPORTS_JSON_FILE', DATA_DIR . '/zeno_report.json'); // Используем DATA_DIR
define('ID_OF_DEALS_SENT_TO_AMO_FILE_PATH', DATA_DIR . '/id_of_deals_sent_to_amo.txt'); // Используем DATA_DIR

// --- Global AmoCRM variables ---
$amoCustomFieldsDefinitions = null; // To store AmoCRM custom field definitions
$currentAccessToken = null; // Будет установлен через checkAmoAccess()
global $AMO_CUSTOM_FIELD_NAMES; // From config.php

// Попытка получить актуальный токен AmoCRM
$amoTokens = checkAmoAccess();
if ($amoTokens && !empty($amoTokens['access_token'])) {
    $currentAccessToken = $amoTokens['access_token'];
    logMessage('[ZenoReport] AmoCRM access token obtained for Zeno Report.', 'INFO', $dealSpecificLogFile);
} else {
    logMessage('[ZenoReport] Failed to obtain AmoCRM access token for Zeno Report. AmoCRM updates will be skipped.', 'ERROR', $dealSpecificLogFile);
}

// --- Helper function to load AmoCRM custom field definitions ---
function zenoFetchAndProcessAmoCustomFieldDefinitions() {
    global $amoCustomFieldsDefinitions, $currentAccessToken;
    if ($amoCustomFieldsDefinitions !== null) return true; // Already loaded

    if (!$currentAccessToken) {
        logMessage('[ZenoAmoCF] Cannot fetch AmoCRM custom fields: API token is not available.', 'ERROR', $dealSpecificLogFile);
        return false;
    }
    // Simplified version, assuming AMO_API_URL_BASE is defined in config.php
    $url = AMO_API_URL_BASE . '/leads/custom_fields';
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, ['Authorization: Bearer ' . $currentAccessToken]);
    curl_setopt($ch, CURLOPT_TIMEOUT, 15);
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($httpCode !== 200 || $response === false) {
        logMessage("[ZenoAmoCF] Failed to fetch custom fields. HTTP: $httpCode, Response: " . substr($response,0,200), 'ERROR', $dealSpecificLogFile);
        return false;
    }
    $data = json_decode($response, true);
    if (json_last_error() === JSON_ERROR_NONE && isset($data['_embedded']['custom_fields'])) {
        $amoCustomFieldsDefinitions = [];
        foreach ($data['_embedded']['custom_fields'] as $field) {
            $amoCustomFieldsDefinitions[$field['name']] = $field;
        }
        logMessage('[ZenoAmoCF] Successfully fetched and processed AmoCRM custom field definitions. Loaded fields: ' . implode(', ', array_keys($amoCustomFieldsDefinitions)), 'INFO', $dealSpecificLogFile);
        return true;
    }
    logMessage('[ZenoAmoCF] Failed to decode or find custom_fields in AmoCRM response. Last JSON error: ' . json_last_error_msg(), 'ERROR', $dealSpecificLogFile);
    return false;
}


// --- Main Request Handling ---
header('Content-Type: application/json');

// Быстрая валидация без блокировки
if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['status' => 'error', 'message' => 'Invalid request method. Only GET is accepted.']);
    exit;
}

$leadId = $_GET['id'] ?? null;
if (empty($leadId)) {
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => 'Missing lead ID in GET parameters.']);
    exit;
}

// Define deal-specific log file
$dealSpecificLogFile = LOGS_DIR . '/zeno_report_' . preg_replace('/[^a-zA-Z0-9_-]/', '_', $leadId) . '.log';
// Ensure log directory for deal-specific log exists
$dealSpecificLogDir = dirname($dealSpecificLogFile);
if (!is_dir($dealSpecificLogDir)) {
    mkdir($dealSpecificLogDir, 0775, true);
}

// Логируем все полученные GET параметры
$getParamsJson = json_encode($_GET, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
logMessage('[ZenoReport] Received GET parameters: ' . $getParamsJson, 'INFO', $dealSpecificLogFile);
logMessage("=== Received GET parameters for Lead ID: $leadId ===" . PHP_EOL . $getParamsJson . PHP_EOL, 'INFO', $dealSpecificLogFile);


$reportStatus = $_GET['status'] ?? null;
$reportAmount = $_GET['amount'] ?? null;
$reportCurrency = $_GET['currency'] ?? null;
$reportEmail = $_GET['email'] ?? null;
$reportCard = $_GET['card'] ?? null;
$partnerIdSubmitter = $_GET['partner_id'] ?? null;

// Log specific parameters for troubleshooting
logMessage("[ZenoReport] Extracted parameters - Amount: '$reportAmount', Currency: '$reportCurrency', Email: '$reportEmail'", 'DEBUG', $dealSpecificLogFile);

if (empty($reportStatus)) {
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => "Missing required GET parameter: status."]);
    exit;
}

// Validate status value
$validStatuses = ["Выполнено", "ОШИБКА!"];
$isStatusValid = in_array($reportStatus, $validStatuses);
if (defined('AMO_STATUS_COMPLETED_ENUM_ID') && $reportStatus == AMO_STATUS_COMPLETED_ENUM_ID) {
    $isStatusValid = true;
    $reportStatus = "Выполнено";
}

if (!$isStatusValid) {
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => "Invalid value for GET parameter 'status'. Allowed: " . implode(', ', $validStatuses) . " or corresponding enum IDs."]);
    exit;
}

// ТЕПЕРЬ проверяем лок-файл только для обработки AmoCRM
define('ZENO_REPORT_LOCK_FILE', sys_get_temp_dir() . '/zeno_report.lock');

$needsAmoProcessing = empty($partnerIdSubmitter); // Только если НЕ партнерский отчет
logMessage("----");
if ($needsAmoProcessing) {
    // Проверяем лок-файл только для AmoCRM операций
    $lockAcquired = false;
    $maxAttempts = 10;
    $attempt = 0;
    
    while ($attempt < $maxAttempts) {
        if (!file_exists(ZENO_REPORT_LOCK_FILE)) {
            if (file_put_contents(ZENO_REPORT_LOCK_FILE, getmypid() . PHP_EOL . date('Y-m-d H:i:s')) !== false) {
                $lockAcquired = true;
                break;
            }
        }
        $attempt++;
        usleep(100000); // 0.1 секунды
    }
    
    if (!$lockAcquired) {
        // Сохраняем отчет без AmoCRM обработки
        logMessage("[ZenoReport] Could not acquire lock for AmoCRM processing. Saving report without AmoCRM update.", 'WARNING', $dealSpecificLogFile);
        $reportEntry = [
            'report_id' => uniqid('zenorep_', true),
            'lead_id' => $leadId,
            'partner_id_submitter' => $partnerIdSubmitter,
            'report_data' => [
                'status' => $reportStatus,
                'amount' => $reportAmount,
                'currency' => $reportCurrency,
                'email' => $reportEmail,
                'card' => $reportCard,
            ],
            'reported_at' => date('Y-m-d H:i:s'),
            'amo_update_skipped_reason' => 'lock_timeout',
            'amo_update_status' => 'deferred',
            'amo_update_message' => 'AmoCRM update deferred due to lock timeout'
        ];
        
        $allReports = loadDataFromFile(ZENO_REPORTS_JSON_FILE);
        $allReports[] = $reportEntry;
        saveDataToFile(ZENO_REPORTS_JSON_FILE, $allReports);
        
        http_response_code(200);
        echo json_encode([
            'status' => 'success', 
            'message' => 'Report saved, AmoCRM update deferred.',
            'report_id' => $reportEntry['report_id'],
            'amo_status' => 'deferred'
        ]);
        exit;
    }
}

// Основная логика обработки (с AmoCRM или без)
$reportEntry = [
    'report_id' => uniqid('zenorep_', true),
    'lead_id' => $leadId,
    'partner_id_submitter' => $partnerIdSubmitter,
    'report_data' => [
        'status' => $reportStatus,
        'amount' => $reportAmount,
        'currency' => $reportCurrency,
        'email' => $reportEmail, // Added missing email field
        'card' => $reportCard,
    ],
    'reported_at' => date('Y-m-d H:i:s'),
    'amo_update_skipped_reason' => null,
    'amo_update_status' => 'skipped',
    'amo_update_message' => null,
    'amo_request_payload' => null // Initialize new field for AmoCRM request payload
];

// Cleanup function для лок-файла
function cleanupLock() {
    if (defined('ZENO_REPORT_LOCK_FILE') && file_exists(ZENO_REPORT_LOCK_FILE)) {
        unlink(ZENO_REPORT_LOCK_FILE);
    }
}

// Регистрируем cleanup на завершение скрипта
if ($needsAmoProcessing && $lockAcquired) {
    register_shutdown_function('cleanupLock');
}

// --- Logic for AmoCRM interaction ---
if (empty($partnerIdSubmitter)) { // Only interact with AmoCRM if partner_id is NOT provided in POST
    
    // Check if this lead_id was already processed for AmoCRM
    $recievedAmoIds = loadLineDelimitedFile(ID_OF_DEALS_SENT_TO_AMO_FILE_PATH);

    if (in_array($leadId, $recievedAmoIds)) {
        $reportEntry['amo_update_skipped_reason'] = 'already_processed_for_amo';
        $reportEntry['amo_update_status'] = 'skipped';
        $reportEntry['amo_update_message'] = "AmoCRM update already performed for this lead ID.";
        logMessage("[ZenoReport] AmoCRM update for lead $leadId skipped: already processed.", 'INFO', $dealSpecificLogFile);
    } else {
        // Add to processed list BEFORE attempting AmoCRM update
        $recievedAmoIds[] = $leadId;
        if (!is_writable(dirname(ID_OF_DEALS_SENT_TO_AMO_FILE_PATH))) {
            logMessage("[ZenoReport] CRITICAL: Directory for " . ID_OF_DEALS_SENT_TO_AMO_FILE_PATH . " is not writable.", 'ERROR', $dealSpecificLogFile);
        }
        if (file_exists(ID_OF_DEALS_SENT_TO_AMO_FILE_PATH) && !is_writable(ID_OF_DEALS_SENT_TO_AMO_FILE_PATH)) {
            logMessage("[ZenoReport] CRITICAL: File " . ID_OF_DEALS_SENT_TO_AMO_FILE_PATH . " is not writable.", 'ERROR', $dealSpecificLogFile);
        }
        if (saveLineDelimitedFile(ID_OF_DEALS_SENT_TO_AMO_FILE_PATH, $recievedAmoIds) === false) {
            logMessage("[ZenoReport] CRITICAL: Failed to write lead $leadId to " . ID_OF_DEALS_SENT_TO_AMO_FILE_PATH . ". Check file permissions.", 'ERROR', $dealSpecificLogFile);
            // Decide if we should proceed or error out. For now, log and proceed.
            $reportEntry['amo_update_skipped_reason'] = 'failed_to_log_recieved_id';
        }

        if (!zenoFetchAndProcessAmoCustomFieldDefinitions()) {
            $reportEntry['amo_update_status'] = 'failed';
            $reportEntry['amo_update_message'] = "Failed to fetch AmoCRM custom field definitions.";
            logMessage("[ZenoReport] Failed to fetch AmoCRM custom field definitions. Update aborted for deal $leadId.", 'ERROR', $dealSpecificLogFile);
        } else {
            // Find the deal in AmoCRM by $leadId (which is dealId)
            $urlSearch = AMO_API_URL_BASE . '/leads/' . $leadId; // Direct lookup by ID
            $chSearch = curl_init($urlSearch);
            curl_setopt($chSearch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($chSearch, CURLOPT_HTTPHEADER, ['Authorization: Bearer ' . $currentAccessToken]);
            curl_setopt($chSearch, CURLOPT_TIMEOUT, 15);
            $amoDealResponse = curl_exec($chSearch);
            $httpCodeSearch = curl_getinfo($chSearch, CURLINFO_HTTP_CODE);
            curl_close($chSearch);

            if ($httpCodeSearch === 200 && $amoDealResponse) {
                $dealToUpdate = json_decode($amoDealResponse, true);
                if ($dealToUpdate && isset($dealToUpdate['id'])) {
                    logMessage("[ZenoReport] Found deal in AmoCRM: ID {$dealToUpdate['id']} for report on lead $leadId.", 'INFO', $dealSpecificLogFile);
                    
                    // Check current "Status оплаты ChatGPT" field in AmoCRM
                    $statusAmoFieldName = $AMO_CUSTOM_FIELD_NAMES['status'] ?? 'Статус оплаты ChatGPT'; // Default or from config
                     // Apply workaround for status field name if needed (copied from excel2amo)
                    $correctedAmoFieldNamesForStatus = ['Статус' => 'Статус оплаты ChatGPT'];
                    if (isset($correctedAmoFieldNamesForStatus[$statusAmoFieldName])) {
                        $statusAmoFieldName = $correctedAmoFieldNamesForStatus[$statusAmoFieldName];
                    }

                    $statusFieldDefinition = $amoCustomFieldsDefinitions[$statusAmoFieldName] ?? null;
                    $currentAmoStatusValue = null;
                    if ($statusFieldDefinition && !empty($dealToUpdate['custom_fields_values'])) {
                        foreach ($dealToUpdate['custom_fields_values'] as $cf) {
                            if ($cf['field_id'] == $statusFieldDefinition['id'] && !empty($cf['values'][0])) {
                                $valObj = $cf['values'][0];
                                $currentAmoStatusValue = $valObj['enum'] ?? ($valObj['value'] ?? null);
                                break;
                            }
                        }
                    }

                    if (!empty(trim((string)$currentAmoStatusValue))) {
                        $reportEntry['amo_update_skipped_reason'] = 'amo_status_not_empty';
                        $reportEntry['amo_update_status'] = 'skipped';
                        $reportEntry['amo_update_message'] = "AmoCRM status field '$statusAmoFieldName' is already set to '$currentAmoStatusValue'. No update performed.";
                        logMessage("[ZenoReport] AmoCRM update for lead $leadId skipped: status field not empty ('$currentAmoStatusValue').", 'INFO', $dealSpecificLogFile);
                    } else {
                        // Proceed with AmoCRM update
                        $customFieldsPayload = [];
                        $currentUnixTimestamp = time();
                        
                        // Simplified field mapping based on POST data
                        // 'email' and 'currency' are handled specially below
                        $mapPostToInternal = [
                            'amount' => 'amount_issued', 
                            'card' => 'card', 
                            'status' => 'status'
                        ];
$reportDataForAmo = $reportEntry['report_data'];

// Handle email separately, mapping to "Комментарий (для списания)"
if (isset($reportDataForAmo['email']) && $reportDataForAmo['email'] !== null) {
    $emailCommentAmoFieldName = "Комментарий (для списания)"; // Directly use the name provided by user
    logMessage("[ZenoReport] Processing field 'email' -> using Amo field name '$emailCommentAmoFieldName', value: '{$reportDataForAmo['email']}'", 'DEBUG', ZENO_REPORT_LOG_FILE);
    if (isset($amoCustomFieldsDefinitions[$emailCommentAmoFieldName])) {
        $fieldDef = $amoCustomFieldsDefinitions[$emailCommentAmoFieldName];
        $value = $reportDataForAmo['email'];
        $valPayload = ['value' => (string)$value];
        if ($valPayload) {
            $customFieldsPayload[] = ['field_id' => $fieldDef['id'], 'values' => [$valPayload]];
            logMessage("[ZenoReport] Added field '{$emailCommentAmoFieldName}' (ID: {$fieldDef['id']}) to update payload", 'DEBUG', ZENO_REPORT_LOG_FILE);
        }
    } else {
        logMessage("[ZenoReport] Field 'email' -> Amo field name '$emailCommentAmoFieldName' not found in AmoCRM custom field definitions", 'WARNING', ZENO_REPORT_LOG_FILE);
    }
}

// Handle currency separately using "Валюта (выдано)"
if (isset($reportDataForAmo['currency']) && $reportDataForAmo['currency'] !== null) {
    $issuedCurrencyAmoFieldName = $AMO_CUSTOM_FIELD_NAMES['issued_currency'] ?? "Валюта (выдано)"; // Используем имя из config.php или дефолтное
    logMessage("[ZenoReport] Processing field 'currency' -> using Amo field name '$issuedCurrencyAmoFieldName', value: '{$reportDataForAmo['currency']}'", 'DEBUG', ZENO_REPORT_LOG_FILE);
    if (isset($amoCustomFieldsDefinitions[$issuedCurrencyAmoFieldName])) {
        $fieldDef = $amoCustomFieldsDefinitions[$issuedCurrencyAmoFieldName];
        $value = $reportDataForAmo['currency'];
        $valPayload = null;
        if (in_array($fieldDef['type'], ['select', 'multiselect', 'radiobutton']) && isset($fieldDef['enums'])) {
            $enumValues = array_map(function($enum) { return $enum['value'] . " (ID: " . $enum['id'] . ")"; }, $fieldDef['enums']);
            logMessage("[ZenoReport] Field '{$issuedCurrencyAmoFieldName}' has type '{$fieldDef['type']}' with enum options: " . implode(", ", $enumValues), 'DEBUG', ZENO_REPORT_LOG_FILE);
            foreach ($fieldDef['enums'] as $enum) {
                if (strtolower((string)$enum['value']) === strtolower((string)$value)) { // Сравнение без учета регистра
                    $valPayload = ['enum_id' => (int)$enum['id']];
                    logMessage("[ZenoReport] Found matching enum for '{$value}' in '{$issuedCurrencyAmoFieldName}': ID {$enum['id']}", 'DEBUG', ZENO_REPORT_LOG_FILE);
                    break;
                }
            }
            if (!$valPayload) {
                logMessage("[ZenoReport] No matching enum found for value '{$value}' in field '{$issuedCurrencyAmoFieldName}'", 'WARNING', ZENO_REPORT_LOG_FILE);
            }
        } else {
             $valPayload = ['value' => (string)$value]; // Fallback for non-enum or if type is different
        }
        if ($valPayload) {
            $customFieldsPayload[] = ['field_id' => $fieldDef['id'], 'values' => [$valPayload]];
            logMessage("[ZenoReport] Added field '{$issuedCurrencyAmoFieldName}' (ID: {$fieldDef['id']}) to update payload", 'DEBUG', ZENO_REPORT_LOG_FILE);
        }
    } else {
        logMessage("[ZenoReport] Field 'currency' -> Amo field name '$issuedCurrencyAmoFieldName' not found in AmoCRM custom field definitions", 'WARNING', ZENO_REPORT_LOG_FILE);
    }
}


foreach ($mapPostToInternal as $postKey => $internalKey) {
    if (isset($reportDataForAmo[$postKey]) && $reportDataForAmo[$postKey] !== null) {
        $amoFieldName = $AMO_CUSTOM_FIELD_NAMES[$internalKey] ?? null;
        // Special handling for status field name was already here
        if ($internalKey === 'status') $amoFieldName = $statusAmoFieldName; 

        // Log field mapping information
        logMessage("[ZenoReport] Processing field '$postKey' -> '$internalKey' -> '$amoFieldName', value: '{$reportDataForAmo[$postKey]}'", 'DEBUG', $dealSpecificLogFile);
        
        if ($amoFieldName && isset($amoCustomFieldsDefinitions[$amoFieldName])) {
            $fieldDef = $amoCustomFieldsDefinitions[$amoFieldName];
            $value = $reportDataForAmo[$postKey];
            $valPayload = null;
            
            // For enum fields like currency, log available options
            if (in_array($fieldDef['type'], ['select', 'multiselect', 'radiobutton']) && isset($fieldDef['enums'])) {
                $enumValues = array_map(function($enum) { 
                    return $enum['value'] . " (ID: " . $enum['id'] . ")"; 
                }, $fieldDef['enums']);
                logMessage("[ZenoReport] Field '{$amoFieldName}' has type '{$fieldDef['type']}' with enum options: " . 
                           implode(", ", $enumValues), 'DEBUG', $dealSpecificLogFile);
                
                foreach ($fieldDef['enums'] as $enum) {
                    if (strtolower((string)$enum['value']) === strtolower((string)$value)) {
                        $valPayload = ['enum_id' => (int)$enum['id']]; 
                        logMessage("[ZenoReport] Found matching enum for '{$value}': ID {$enum['id']}", 'DEBUG', $dealSpecificLogFile);
                        break;
                    }
                }
                
                if (!$valPayload) {
                    logMessage("[ZenoReport] No matching enum found for value '{$value}' in field '{$amoFieldName}'", 'WARNING', $dealSpecificLogFile);
                }
            } else if ($fieldDef['type'] === 'date') {
                $ts = strtotime($value);
                if ($ts) $valPayload = ['value' => $ts];
            } else if ($fieldDef['type'] === 'numeric') {
                $valPayload = ['value' => (float)$value];
            } else { // text, textarea etc.
                $valPayload = ['value' => (string)$value];
            }
            if ($valPayload) {
                $customFieldsPayload[] = ['field_id' => $fieldDef['id'], 'values' => [$valPayload]];
                logMessage("[ZenoReport] Added field '{$amoFieldName}' (ID: {$fieldDef['id']}) to update payload", 'DEBUG', $dealSpecificLogFile);
            }
        } else {
            logMessage("[ZenoReport] Field '{$postKey}' -> '$internalKey}' -> '$amoFieldName' not found in AmoCRM custom field definitions", 'WARNING', $dealSpecificLogFile);
        }
    } else {
        logMessage("[ZenoReport] Field '{$postKey}' is not set or null in the report data", 'DEBUG', $dealSpecificLogFile);
    }
}

// Add static fields
$staticFields = [
    'withdrawal_account' => 'Mastercard Prepaid', 'withdrawal_date' => $currentUnixTimestamp,
    'administrator' => 'Бот', 'paid_service' => 'chatgpt', 'payment_term' => '1'
];
foreach ($staticFields as $internalKey => $value) {
     $amoFieldName = $AMO_CUSTOM_FIELD_NAMES[$internalKey] ?? null;
     logMessage("[ZenoReport] Processing static field '$internalKey' -> '$amoFieldName', value: '{$value}'", 'DEBUG', $dealSpecificLogFile);

     if ($amoFieldName && isset($amoCustomFieldsDefinitions[$amoFieldName])) {
        $fieldDef = $amoCustomFieldsDefinitions[$amoFieldName];
        $valPayload = null;

        if (in_array($fieldDef['type'], ['select', 'multiselect', 'radiobutton']) && isset($fieldDef['enums'])) {
            $foundEnum = false;
            foreach ($fieldDef['enums'] as $enum) {
                if (strtolower((string)$enum['value']) === strtolower((string)$value)) {
                    $valPayload = ['enum_id' => (int)$enum['id']];
                    logMessage("[ZenoReport] Static field '{$amoFieldName}': Found matching enum for '{$value}': ID {$enum['id']}", 'DEBUG', $dealSpecificLogFile);
                    $foundEnum = true;
                    break;
                }
            }
            if (!$foundEnum) {
                logMessage("[ZenoReport] Static field '{$amoFieldName}' ('{$fieldDef['type']}'): No matching enum found for value '{$value}'. Available enums: " . json_encode($fieldDef['enums']), 'WARNING', $dealSpecificLogFile);
            }
        } else if ($fieldDef['type'] === 'date') { // Handles date type with Unix timestamp
            $valPayload = ['value' => (int)$value]; 
        } else if ($fieldDef['type'] === 'numeric') {
            if (is_numeric($value)) {
                $valPayload = ['value' => (float)$value];
            } else {
                logMessage("[ZenoReport] Static field '{$amoFieldName}' ('numeric'): Value '{$value}' is not numeric.", 'WARNING', $dealSpecificLogFile);
            }
        } else if ($fieldDef['type'] === 'checkbox') {
             $valPayload = ['value' => (bool)$value];
        } else { // text, textarea, url etc.
            $valPayload = ['value' => (string)$value];
        }
        
        if ($valPayload) {
            $customFieldsPayload[] = ['field_id' => $fieldDef['id'], 'values' => [$valPayload]];
            logMessage("[ZenoReport] Added static field '{$amoFieldName}' (ID: {$fieldDef['id']}) to update payload with value: ".json_encode($valPayload), 'DEBUG', $dealSpecificLogFile);
        }
     } else {
        logMessage("[ZenoReport] Static field definition for '$internalKey' (mapped to Amo field name '$amoFieldName') not found or amoFieldName is null. Cannot add to payload.", 'WARNING', $dealSpecificLogFile);
     }
}

$amoUpdatePayload = ['id' => $dealToUpdate['id']];
if (!empty($customFieldsPayload)) {
    $amoUpdatePayload['custom_fields_values'] = $customFieldsPayload;
}

// Update stage based on report status
if ($reportStatus === "Выполнено") {
    if (defined('AMO_MAIN_PIPELINE_ID') && defined('AMO_FINAL_OPERATOR_STATUS_ID')) {
        $amoUpdatePayload['pipeline_id'] = (int)AMO_MAIN_PIPELINE_ID;
        $amoUpdatePayload['status_id'] = (int)AMO_FINAL_OPERATOR_STATUS_ID;
        logMessage("[ZenoReport] Setting deal to Pipeline ID: " . AMO_MAIN_PIPELINE_ID . ", Status ID: " . AMO_FINAL_OPERATOR_STATUS_ID, 'DEBUG', $dealSpecificLogFile);
    } else {
        logMessage("[ZenoReport] WARNING: AMO_MAIN_PIPELINE_ID or AMO_FINAL_OPERATOR_STATUS_ID not defined. Cannot set success stage.", 'WARNING', $dealSpecificLogFile);
    }
} else if ($reportStatus === "ОШИБКА!") {
    // Если статус "ОШИБКА!", не меняем pipeline_id и status_id сделки.
    // Пользовательское поле "Статус оплаты ChatGPT" будет обновлено ранее в $customFieldsPayload.
    // Если необходимо перевести сделку в определенный этап при ошибке, нужно добавить соответствующую логику и константы.
    // Например, можно переводить в AMO_CHATGPT_STATUS_ID, если это логично для процесса.
    // Пока оставляем без изменения этапа.
    logMessage("[ZenoReport] Report status is ОШИБКА!. Deal stage (pipeline_id, status_id) will not be changed. Custom field 'Статус оплаты ChatGPT' should reflect the error.", 'INFO', $dealSpecificLogFile);
    // Убедимся, что pipeline_id не будет пустым, если он был в исходной сделке
    if (isset($dealToUpdate['pipeline_id'])) {
         $amoUpdatePayload['pipeline_id'] = (int)$dealToUpdate['pipeline_id'];
    }
    // Также для status_id, если он не меняется
    if (isset($dealToUpdate['status_id']) && !isset($amoUpdatePayload['status_id'])) {
        $amoUpdatePayload['status_id'] = (int)$dealToUpdate['status_id'];
    }
}
                        
                        // Log the complete payload before sending to AmoCRM
                        if (count($amoUpdatePayload) > 1) { // Has more than just 'id'
                            // Ensure pipeline_id is set if status_id is being changed
                            if (isset($amoUpdatePayload['status_id']) && !isset($amoUpdatePayload['pipeline_id'])) {
                                if (isset($dealToUpdate['pipeline_id'])) {
                                    $amoUpdatePayload['pipeline_id'] = (int)$dealToUpdate['pipeline_id'];
                                    logMessage("[ZenoReport] Pipeline ID was not set but status_id is. Using existing pipeline_id: " . $dealToUpdate['pipeline_id'], 'DEBUG', $dealSpecificLogFile);
                                } else if (defined('AMO_MAIN_PIPELINE_ID')) {
                                     $amoUpdatePayload['pipeline_id'] = (int)AMO_MAIN_PIPELINE_ID; // Fallback to main pipeline
                                     logMessage("[ZenoReport] Pipeline ID was not set but status_id is. Using AMO_MAIN_PIPELINE_ID as fallback.", 'DEBUG', $dealSpecificLogFile);
                                } else {
                                    logMessage("[ZenoReport] WARNING: Pipeline ID is not set and status_id is being updated. This might cause an error if the status_id is not valid for the deal's current pipeline.", 'WARNING', $dealSpecificLogFile);
                                }
                            }

                            $reportEntry['amo_request_payload'] = $amoUpdatePayload; // Store the payload that will be sent

                            $amoUpdatePayloadJson = json_encode($amoUpdatePayload, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
                            logMessage("[ZenoReport] AmoCRM update payload for lead $leadId: " . $amoUpdatePayloadJson, 'DEBUG', $dealSpecificLogFile);
                            logMessage("=== AmoCRM Update Payload for Lead ID: $leadId ===" . PHP_EOL . $amoUpdatePayloadJson . PHP_EOL, 'INFO', $dealSpecificLogFile);
                            
                            // Add debug logging for individual field values
                            $logPipelineId = isset($amoUpdatePayload['pipeline_id']) ? $amoUpdatePayload['pipeline_id'] : 'not_set';
                            $logStatusId = isset($amoUpdatePayload['status_id']) ? $amoUpdatePayload['status_id'] : 'not_set';
                            logMessage("[ZenoReport] Field values: Pipeline ID: {$logPipelineId}, Status ID: {$logStatusId}", 'DEBUG', $dealSpecificLogFile);
                            
                            $chUpdate = curl_init(AMO_API_URL_BASE . '/leads/' . $dealToUpdate['id']);
                            curl_setopt($chUpdate, CURLOPT_RETURNTRANSFER, true);
                            curl_setopt($chUpdate, CURLOPT_CUSTOMREQUEST, 'PATCH');
                            curl_setopt($chUpdate, CURLOPT_POSTFIELDS, json_encode($amoUpdatePayload));
                            curl_setopt($chUpdate, CURLOPT_HTTPHEADER, ['Authorization: Bearer ' . $currentAccessToken, 'Content-Type: application/json']);
                            $updateResponse = curl_exec($chUpdate);
                            $httpCodeUpdate = curl_getinfo($chUpdate, CURLINFO_HTTP_CODE);
                            curl_close($chUpdate);

                            $amoUpdateResponseLog = "=== AmoCRM Update Response for Lead ID: $leadId ===" . PHP_EOL .
                                                  "HTTP Code: $httpCodeUpdate" . PHP_EOL .
                                                  "Response: " . $updateResponse . PHP_EOL;
                            logMessage($amoUpdateResponseLog, ($httpCodeUpdate >= 200 && $httpCodeUpdate < 300) ? 'INFO' : 'ERROR', $dealSpecificLogFile);

                            if ($httpCodeUpdate >= 200 && $httpCodeUpdate < 300) {
                                $reportEntry['amo_update_status'] = 'success';
                                $reportEntry['amo_update_message'] = "AmoCRM deal updated successfully.";
                                logMessage("[ZenoReport] Successfully updated AmoCRM deal ID {$dealToUpdate['id']} for lead $leadId.", 'INFO', $dealSpecificLogFile);
                                $amoUpdatePerformed = true;
                            } else {
                                $reportEntry['amo_update_status'] = 'failed';
                                $reportEntry['amo_update_message'] = "AmoCRM update failed. HTTP: $httpCodeUpdate. Response: " . substr($updateResponse,0,200);
                                logMessage("[ZenoReport] Failed to update AmoCRM deal ID {$dealToUpdate['id']}. HTTP: $httpCodeUpdate. Resp: " . $updateResponse, 'ERROR', $dealSpecificLogFile);
                            }
                        } else {
                             $reportEntry['amo_update_status'] = 'skipped';
                             $reportEntry['amo_update_message'] = "No data to update in AmoCRM.";
                             logMessage("[ZenoReport] No data to update in AmoCRM for lead $leadId.", 'INFO', $dealSpecificLogFile);
                             logMessage("=== No data to update in AmoCRM for Lead ID: $leadId ===", 'INFO', $dealSpecificLogFile);
                        }
                    }
                } else {
                    $reportEntry['amo_update_status'] = 'failed';
                    $reportEntry['amo_update_message'] = "Deal with ID $leadId not found in AmoCRM or invalid response.";
                    logMessage("[ZenoReport] Deal $leadId not found in AmoCRM. HTTP: $httpCodeSearch. Resp: " . substr($amoDealResponse,0,200), 'WARNING', $dealSpecificLogFile);
                    logMessage("=== Deal with ID $leadId not found in AmoCRM or invalid response ===" . PHP_EOL . "HTTP Code: $httpCodeSearch" . PHP_EOL . "Response: " . substr($amoDealResponse,0,200) . PHP_EOL, 'WARNING', $dealSpecificLogFile);
                }
            } else {
                 $reportEntry['amo_update_status'] = 'failed';
                 $reportEntry['amo_update_message'] = "Failed to search deal $leadId in AmoCRM. HTTP: $httpCodeSearch.";
                 logMessage("[ZenoReport] Failed to search deal $leadId in AmoCRM. HTTP: $httpCodeSearch.", 'ERROR', $dealSpecificLogFile);
                 logMessage("=== Failed to search deal $leadId in AmoCRM ===" . PHP_EOL . "HTTP Code: $httpCodeSearch" . PHP_EOL, 'ERROR', $dealSpecificLogFile);
            }
        }
    }
} else { // partner_id was provided in POST
    $reportEntry['amo_update_skipped_reason'] = 'partner_report';
    $reportEntry['amo_update_status'] = 'skipped';
    $reportEntry['amo_update_message'] = "Report for partner lead, AmoCRM update not applicable.";
    logMessage("[ZenoReport] Report for partner lead $leadId (partner: $partnerIdSubmitter). AmoCRM update skipped.", 'INFO', $dealSpecificLogFile);
}

// Save the report to zeno_report.json
$allReports = loadDataFromFile(ZENO_REPORTS_JSON_FILE);
$allReports[] = $reportEntry;
if (saveDataToFile(ZENO_REPORTS_JSON_FILE, $allReports)) {
    logMessage("[ZenoReport] Report for lead $leadId saved to " . ZENO_REPORTS_JSON_FILE, 'INFO', $dealSpecificLogFile);
    http_response_code(200);
    echo json_encode([
        'status' => 'success', 
        'message' => 'Report received and processed.', 
        'report_id' => $reportEntry['report_id'],
        'lead_id' => $leadId,
        'amo_status' => $reportEntry['amo_update_status'],
        'amo_message' => $reportEntry['amo_update_message']
    ]);
} else {
    logMessage("[ZenoReport] CRITICAL: Failed to save report for lead $leadId to " . ZENO_REPORTS_JSON_FILE, 'ERROR', $dealSpecificLogFile);
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Failed to save report.']);
}

// Ensure directories exist
$logDir = dirname(ZENO_REPORT_LOG_FILE); if (!is_dir($logDir)) mkdir($logDir, 0775, true);
$reportDir = dirname(ZENO_REPORTS_JSON_FILE); if (!is_dir($reportDir)) mkdir($reportDir, 0775, true);
// RECIEVED_AMO_IDS_FILE_PATH уже использует DATA_DIR, поэтому его директория будет создана автоматически
// $recAmoDir = dirname(RECIEVED_AMO_IDS_FILE_PATH); if (!is_dir($recAmoDir)) mkdir($recAmoDir, 0775, true);

// В конце скрипта, перед exit:
if ($needsAmoProcessing && $lockAcquired) {
    cleanupLock();
}

exit;
?>
