тнеров<?php
// amogt/zeno_report.php

require_once __DIR__ . '/config.php'; // Defines AMO_TOKEN, BLOCKED_DEALS_PATH etc.
require_once __DIR__ . '/vendor/autoload.php'; // For AmoCRM client if used, or other utilities
require_once __DIR__ . '/logger.php';
require_once __DIR__ . '/lib/json_storage_utils.php';
// Potentially require AmoCRM interaction logic if refactored from excel2amo.php
// For now, we'll adapt parts of excel2amo.php's logic here.

define('ZENO_REPORT_LOG_FILE', __DIR__ . '/logs/zeno_report.log');
define('ZENO_REPORTS_JSON_FILE', __DIR__ . '/zeno_report.json');
define('RECIEVED_AMO_IDS_FILE_PATH', __DIR__ . '/recieved_amo_ids.txt'); // For IDs processed via Amo

// --- Global AmoCRM variables (similar to excel2amo.php) ---
$amoCustomFieldsDefinitions = null; // To store AmoCRM custom field definitions
$currentAccessToken = AMO_TOKEN; // Use token from config by default
global $AMO_CUSTOM_FIELD_NAMES; // From config.php

// --- Helper function to load AmoCRM custom field definitions (adapted from excel2amo) ---
function zenoFetchAndProcessAmoCustomFieldDefinitions() {
    global $amoCustomFieldsDefinitions, $currentAccessToken;
    if ($amoCustomFieldsDefinitions !== null) return true; // Already loaded

    if (!$currentAccessToken) {
        logMessage('[ZenoAmoCF] Cannot fetch AmoCRM custom fields: API token is not available.', 'ERROR', ZENO_REPORT_LOG_FILE);
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
        logMessage("[ZenoAmoCF] Failed to fetch custom fields. HTTP: $httpCode, Response: " . substr($response,0,200), 'ERROR', ZENO_REPORT_LOG_FILE);
        return false;
    }
    $data = json_decode($response, true);
    if (json_last_error() === JSON_ERROR_NONE && isset($data['_embedded']['custom_fields'])) {
        $amoCustomFieldsDefinitions = [];
        foreach ($data['_embedded']['custom_fields'] as $field) {
            $amoCustomFieldsDefinitions[$field['name']] = $field;
        }
        logMessage('[ZenoAmoCF] Successfully fetched and processed AmoCRM custom field definitions.', 'INFO', ZENO_REPORT_LOG_FILE);
        return true;
    }
    logMessage('[ZenoAmoCF] Failed to decode or find custom_fields in AmoCRM response.', 'ERROR', ZENO_REPORT_LOG_FILE);
    return false;
}


// --- Main Request Handling ---
header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') { // Expect POST for report data, GET for lead_id
    http_response_code(405);
    echo json_encode(['status' => 'error', 'message' => 'Invalid request method. Only POST is accepted.']);
    exit;
}

$leadId = $_GET['id'] ?? null;
if (empty($leadId)) {
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => 'Missing lead ID in GET parameters.']);
    exit;
}

// Assuming report data comes as x-www-form-urlencoded
$reportStatus = $_POST['status'] ?? null;
$reportAmount = $_POST['amount'] ?? null;
$reportCurrency = $_POST['currency'] ?? null;
$reportEmail = $_POST['email'] ?? null;
$reportCard = $_POST['card'] ?? null;
$partnerIdSubmitter = $_POST['partner_id'] ?? null; // Optional partner_id

if (empty($reportStatus)) {
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => "Missing required POST parameter: status."]);
    exit;
}
// Validate status value (example)
$validStatuses = ["Успешно", "ОШИБКА!"]; // Assuming these are the only two valid statuses
if (!in_array($reportStatus, $validStatuses)) {
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => "Invalid value for POST parameter 'status'. Allowed: " . implode(', ', $validStatuses)]);
    exit;
}


$reportEntry = [
    'report_id' => uniqid('zenorep_', true),
    'lead_id' => $leadId,
    'partner_id_submitter' => $partnerIdSubmitter, // Who submitted this report
    'report_data' => [
        'status' => $reportStatus,
        'amount' => $reportAmount,
        'currency' => $reportCurrency,
        'email' => $reportEmail,
        'card' => $reportCard,
        // Add any other POST params here if needed
    ],
    'reported_at' => date('Y-m-d H:i:s'),
    'amo_update_skipped_reason' => null,
    'amo_update_status' => 'skipped',
    'amo_update_message' => null
];

$amoUpdatePerformed = false;

// --- Logic for AmoCRM interaction ---
if (empty($partnerIdSubmitter)) { // Only interact with AmoCRM if partner_id is NOT provided in POST
    
    // Check if this lead_id was already processed for AmoCRM
    $recievedAmoIds = [];
    if (file_exists(RECIEVED_AMO_IDS_FILE_PATH)) {
        $idsContent = file_get_contents(RECIEVED_AMO_IDS_FILE_PATH);
        if ($idsContent !== false) {
            $recievedAmoIds = array_filter(explode(PHP_EOL, trim($idsContent)));
        }
    }

    if (in_array($leadId, $recievedAmoIds)) {
        $reportEntry['amo_update_skipped_reason'] = 'already_processed_for_amo';
        $reportEntry['amo_update_status'] = 'skipped';
        $reportEntry['amo_update_message'] = "AmoCRM update already performed for this lead ID.";
        logMessage("[ZenoReport] AmoCRM update for lead $leadId skipped: already processed.", 'INFO', ZENO_REPORT_LOG_FILE);
    } else {
        // Add to processed list BEFORE attempting AmoCRM update
        if (file_put_contents(RECIEVED_AMO_IDS_FILE_PATH, $leadId . PHP_EOL, FILE_APPEND | LOCK_EX) === false) {
            logMessage("[ZenoReport] CRITICAL: Failed to write lead $leadId to " . RECIEVED_AMO_IDS_FILE_PATH, 'ERROR', ZENO_REPORT_LOG_FILE);
            // Decide if we should proceed or error out. For now, log and proceed.
            $reportEntry['amo_update_skipped_reason'] = 'failed_to_log_recieved_id';
        }

        if (!zenoFetchAndProcessAmoCustomFieldDefinitions()) {
            $reportEntry['amo_update_status'] = 'failed';
            $reportEntry['amo_update_message'] = "Failed to fetch AmoCRM custom field definitions.";
        } else {
            // Find the deal in AmoCRM by $leadId (which is dealId)
            $urlSearch = AMO_API_URL_BASE . '/leads/' . $leadId; // Direct lookup by ID
            $chSearch = curl_init($urlSearch);
            curl_setopt($chSearch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($chSearch, CURLOPT_HTTPHEADER, ['Authorization: Bearer ' . $currentAccessToken]);
            $amoDealResponse = curl_exec($chSearch);
            $httpCodeSearch = curl_getinfo($chSearch, CURLINFO_HTTP_CODE);
            curl_close($chSearch);

            if ($httpCodeSearch === 200 && $amoDealResponse) {
                $dealToUpdate = json_decode($amoDealResponse, true);
                if ($dealToUpdate && isset($dealToUpdate['id'])) {
                    logMessage("[ZenoReport] Found deal in AmoCRM: ID {$dealToUpdate['id']} for report on lead $leadId.", 'INFO', ZENO_REPORT_LOG_FILE);
                    
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
                        logMessage("[ZenoReport] AmoCRM update for lead $leadId skipped: status field not empty ('$currentAmoStatusValue').", 'INFO', ZENO_REPORT_LOG_FILE);
                    } else {
                        // Proceed with AmoCRM update
                        $customFieldsPayload = [];
                        $currentUnixTimestamp = time();
                        
                        // Simplified field mapping based on POST data
                        $mapPostToInternal = [
                            'amount' => 'amount_issued', 'currency' => 'currency', 
                            'email' => 'email', 'card' => 'card', 'status' => 'status'
                        ];
                        $reportDataForAmo = $reportEntry['report_data'];

                        foreach ($mapPostToInternal as $postKey => $internalKey) {
                            if (isset($reportDataForAmo[$postKey]) && $reportDataForAmo[$postKey] !== null) {
                                $amoFieldName = $AMO_CUSTOM_FIELD_NAMES[$internalKey] ?? null;
                                if ($internalKey === 'status') $amoFieldName = $statusAmoFieldName; // Use corrected status field name

                                if ($amoFieldName && isset($amoCustomFieldsDefinitions[$amoFieldName])) {
                                    $fieldDef = $amoCustomFieldsDefinitions[$amoFieldName];
                                    $value = $reportDataForAmo[$postKey];
                                    $valPayload = null;
                                    if (in_array($fieldDef['type'], ['select', 'multiselect', 'radiobutton']) && isset($fieldDef['enums'])) {
                                        foreach ($fieldDef['enums'] as $enum) {
                                            if (strtolower((string)$enum['value']) === strtolower((string)$value)) {
                                                $valPayload = ['enum_id' => $enum['id']]; break;
                                            }
                                        }
                                    } else if ($fieldDef['type'] === 'date') {
                                        $ts = strtotime($value);
                                        if ($ts) $valPayload = ['value' => $ts];
                                    } else { // numeric, text, textarea etc.
                                        $valPayload = ['value' => (string)$value];
                                    }
                                    if ($valPayload) $customFieldsPayload[] = ['field_id' => $fieldDef['id'], 'values' => [$valPayload]];
                                }
                            }
                        }
                        // Add static fields
                        $staticFields = [
                            'withdrawal_account' => 'Mastercard Prepaid', 'withdrawal_date' => $currentUnixTimestamp,
                            'administrator' => 'Бот Zeno', 'paid_service' => 'chatgpt', 'payment_term' => '1'
                        ];
                        foreach ($staticFields as $internalKey => $value) {
                             $amoFieldName = $AMO_CUSTOM_FIELD_NAMES[$internalKey] ?? null;
                             if ($amoFieldName && isset($amoCustomFieldsDefinitions[$amoFieldName])) {
                                $fieldDef = $amoCustomFieldsDefinitions[$amoFieldName];
                                $valPayload = null;
                                if ($fieldDef['type'] === 'date') $valPayload = ['value' => (int)$value]; // for timestamp
                                else $valPayload = ['value' => (string)$value];
                                if ($valPayload) $customFieldsPayload[] = ['field_id' => $fieldDef['id'], 'values' => [$valPayload]];
                             }
                        }
                        
                        $amoUpdatePayload = ['id' => $dealToUpdate['id']];
                        if (!empty($customFieldsPayload)) {
                            $amoUpdatePayload['custom_fields_values'] = $customFieldsPayload;
                        }

                        // Update stage if report status is not "ОШИБКА!"
                        if ($reportStatus !== "ОШИБКА!") {
                            $amoUpdatePayload['pipeline_id'] = 8824470; // "Воронка"
                            $amoUpdatePayload['status_id'] = 73606602;  // "Финальный Операторский"
                        }
                        
                        if (count($amoUpdatePayload) > 1) { // Has more than just 'id'
                            $chUpdate = curl_init(AMO_API_URL_BASE . '/leads/' . $dealToUpdate['id']);
                            curl_setopt($chUpdate, CURLOPT_RETURNTRANSFER, true);
                            curl_setopt($chUpdate, CURLOPT_CUSTOMREQUEST, 'PATCH');
                            curl_setopt($chUpdate, CURLOPT_POSTFIELDS, json_encode($amoUpdatePayload));
                            curl_setopt($chUpdate, CURLOPT_HTTPHEADER, ['Authorization: Bearer ' . $currentAccessToken, 'Content-Type: application/json']);
                            $updateResponse = curl_exec($chUpdate);
                            $httpCodeUpdate = curl_getinfo($chUpdate, CURLINFO_HTTP_CODE);
                            curl_close($chUpdate);

                            if ($httpCodeUpdate >= 200 && $httpCodeUpdate < 300) {
                                $reportEntry['amo_update_status'] = 'success';
                                $reportEntry['amo_update_message'] = "AmoCRM deal updated successfully.";
                                logMessage("[ZenoReport] Successfully updated AmoCRM deal ID {$dealToUpdate['id']} for lead $leadId.", 'INFO', ZENO_REPORT_LOG_FILE);
                                $amoUpdatePerformed = true;
                            } else {
                                $reportEntry['amo_update_status'] = 'failed';
                                $reportEntry['amo_update_message'] = "AmoCRM update failed. HTTP: $httpCodeUpdate. Response: " . substr($updateResponse,0,200);
                                logMessage("[ZenoReport] Failed to update AmoCRM deal ID {$dealToUpdate['id']}. HTTP: $httpCodeUpdate. Resp: " . $updateResponse, 'ERROR', ZENO_REPORT_LOG_FILE);
                            }
                        } else {
                             $reportEntry['amo_update_status'] = 'skipped';
                             $reportEntry['amo_update_message'] = "No data to update in AmoCRM.";
                             logMessage("[ZenoReport] No data to update in AmoCRM for lead $leadId.", 'INFO', ZENO_REPORT_LOG_FILE);
                        }
                    }
                } else {
                    $reportEntry['amo_update_status'] = 'failed';
                    $reportEntry['amo_update_message'] = "Deal with ID $leadId not found in AmoCRM or invalid response.";
                    logMessage("[ZenoReport] Deal $leadId not found in AmoCRM. HTTP: $httpCodeSearch. Resp: " . substr($amoDealResponse,0,200), 'WARNING', ZENO_REPORT_LOG_FILE);
                }
            } else {
                 $reportEntry['amo_update_status'] = 'failed';
                 $reportEntry['amo_update_message'] = "Failed to search deal $leadId in AmoCRM. HTTP: $httpCodeSearch.";
                 logMessage("[ZenoReport] Failed to search deal $leadId in AmoCRM. HTTP: $httpCodeSearch.", 'ERROR', ZENO_REPORT_LOG_FILE);
            }
        }
    }
} else { // partner_id was provided in POST
    $reportEntry['amo_update_skipped_reason'] = 'partner_report';
    $reportEntry['amo_update_status'] = 'skipped';
    $reportEntry['amo_update_message'] = "Report for partner lead, AmoCRM update not applicable.";
    logMessage("[ZenoReport] Report for partner lead $leadId (partner: $partnerIdSubmitter). AmoCRM update skipped.", 'INFO', ZENO_REPORT_LOG_FILE);
}

// Save the report to zeno_report.json
$allReports = loadDataFromFile(ZENO_REPORTS_JSON_FILE);
$allReports[] = $reportEntry;
if (saveDataToFile(ZENO_REPORTS_JSON_FILE, $allReports)) {
    logMessage("[ZenoReport] Report for lead $leadId saved to " . ZENO_REPORTS_JSON_FILE, 'INFO', ZENO_REPORT_LOG_FILE);
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
    logMessage("[ZenoReport] CRITICAL: Failed to save report for lead $leadId to " . ZENO_REPORTS_JSON_FILE, 'ERROR', ZENO_REPORT_LOG_FILE);
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Failed to save report.']);
}

// Ensure directories exist
$logDir = dirname(ZENO_REPORT_LOG_FILE); if (!is_dir($logDir)) mkdir($logDir, 0775, true);
$reportDir = dirname(ZENO_REPORTS_JSON_FILE); if (!is_dir($reportDir)) mkdir($reportDir, 0775, true);
$recAmoDir = dirname(RECIEVED_AMO_IDS_FILE_PATH); if (!is_dir($recAmoDir)) mkdir($recAmoDir, 0775, true);

exit;
?>
