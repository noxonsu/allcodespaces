<?php
// gpt_payment_api/api.php
require_once __DIR__ . '/../config.php'; // Общий конфиг проекта, определяет BLOCKED_DEALS_PATH
require_once __DIR__ . '/../logger.php';   // Логгер
require_once __DIR__ . '/lib/auth_partner.php';
require_once __DIR__ . '/lib/payment_core.php';
require_once __DIR__ . '/lib/db.php'; 
require_once __DIR__ . '/../lib/json_storage_utils.php';

header('Content-Type: application/json');

// Определения для функционала submit_partner_lead
define('SUBMIT_LEAD_LOCK_FILE', __DIR__ . '/submit_partner_lead.lock'); 
define('SUBMIT_LEAD_LOG_FILE', __DIR__ . '/../logs/submit_partner_lead.log');
define('RECIEVED_API_IDS_FILE_PATH', __DIR__ . '/../recieved_api_ids.txt'); // Файл для ID от API партнеров

// Простой роутинг на основе параметра 'action'
$action = $_REQUEST['action'] ?? '';
$api_token_request = $_REQUEST['api_token'] ?? null; 

logMessage("[GPT_API] Request received. Action: {$action}, Token in request: " . ($api_token_request ? 'Yes' : 'No'), 'INFO', SUBMIT_LEAD_LOG_FILE);

$partner = null;
$inputData = null; 

if ($action === 'submit_partner_lead' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $inputJSON = file_get_contents('php://input');
    $inputData = json_decode($inputJSON, true);
    if (json_last_error() !== JSON_ERROR_NONE) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'Invalid JSON payload for submit_partner_lead.']);
        logMessage("[GPT_API] Invalid JSON for submit_partner_lead: " . json_last_error_msg(), 'ERROR', SUBMIT_LEAD_LOG_FILE);
        exit;
    }
    if (!isset($inputData['action']) || $inputData['action'] !== 'submit_partner_lead') {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => "Missing or incorrect 'action' in JSON payload for submit_partner_lead."]);
        logMessage("[GPT_API] Missing or incorrect 'action' in JSON for submit_partner_lead.", 'WARNING', SUBMIT_LEAD_LOG_FILE);
        exit;
    }
    $current_api_token = $inputData['api_token'] ?? null;
} else {
    $current_api_token = $api_token_request;
}

if ($action !== 'submit_partner_lead') {
    if (!$current_api_token || !AuthPartner::isTokenValid($current_api_token)) {
        http_response_code(401);
        echo json_encode(['status' => 'error', 'message' => 'Unauthorized: Invalid API token.']);
        logMessage("[GPT_API] Unauthorized access attempt. Action: {$action}", 'WARNING');
        exit;
    }
    $partner = AuthPartner::getPartnerByToken($current_api_token);
    if (!$partner) {
        http_response_code(401);
        echo json_encode(['status' => 'error', 'message' => 'Unauthorized: Partner not found for token.']);
        logMessage("[GPT_API] Partner not found for token: {$current_api_token}", 'WARNING');
        exit;
    }
}

$response = ['status' => 'error', 'message' => 'Invalid action.'];

switch ($action) {
    case 'get_balance':
        if ($partner) { 
            $response = [
                'status' => 'success',
                'partner_name' => $partner['name'],
                'balance' => $partner['balance']
            ];
            logMessage("[GPT_API] get_balance successful for partner: {$partner['name']}");
        } else { 
             http_response_code(401);
             $response = ['status' => 'error', 'message' => 'Unauthorized. Partner context missing.'];
        }
        break;

    case 'get_payment_cost':
        if (!$partner) {
             http_response_code(401);
             $response = ['status' => 'error', 'message' => 'Unauthorized. Partner context missing.'];
             break;
        }
        $payment_amount = filter_input(INPUT_POST, 'payment_amount', FILTER_VALIDATE_FLOAT);
        $payment_currency = strtoupper(trim(filter_input(INPUT_POST, 'payment_currency', FILTER_SANITIZE_STRING)));

        if ($payment_amount === false || $payment_amount <= 0 || empty($payment_currency)) {
            http_response_code(400);
            $response = ['status' => 'error', 'message' => 'Invalid parameters: payment_amount and payment_currency are required.'];
        } else {
            $costDetails = PaymentCore::getPaymentCost($payment_amount, $payment_currency);
            if ($costDetails) {
                $response = [
                    'status' => 'success',
                    'cost_in_balance_units' => $costDetails['cost_in_balance_units'],
                    'original_amount' => $payment_amount,
                    'original_currency' => $payment_currency,
                    'rate_used' => $costDetails['rate_used'],
                    'rate_currency_pair' => $costDetails['rate_currency_pair']
                ];
            } else {
                http_response_code(500);
                $response = ['status' => 'error', 'message' => 'Could not calculate payment cost. Exchange rate not found for ' . $payment_currency];
            }
        }
        break;

    case 'process_payment':
        if (!$partner) {
             http_response_code(401);
             $response = ['status' => 'error', 'message' => 'Unauthorized. Partner context missing.'];
             break;
        }
        $payment_amount = filter_input(INPUT_POST, 'payment_amount', FILTER_VALIDATE_FLOAT);
        $payment_currency = strtoupper(trim(filter_input(INPUT_POST, 'payment_currency', FILTER_SANITIZE_STRING)));
        $service_details = $_POST['service_details'] ?? 'ChatGPT Payment';

        if ($payment_amount === false || $payment_amount <= 0 || empty($payment_currency)) {
            http_response_code(400);
            $response = ['status' => 'error', 'message' => 'Invalid parameters: payment_amount and payment_currency are required.'];
        } else {
            $paymentResult = PaymentCore::processPayment($partner['token'], $payment_amount, $payment_currency, $service_details);
            if ($paymentResult['status'] === 'success') {
                $response = $paymentResult;
            } elseif ($paymentResult['status'] === 'insufficient_funds') {
                http_response_code(402);
                $response = $paymentResult;
            } else {
                http_response_code(500);
                $response = $paymentResult;
            }
        }
        break;

    case 'get_transaction_status':
        if (!$partner) {
             http_response_code(401);
             $response = ['status' => 'error', 'message' => 'Unauthorized. Partner context missing.'];
             break;
        }
        $transaction_id = filter_input(INPUT_GET, 'transaction_id', FILTER_SANITIZE_STRING);
        if (empty($transaction_id)) {
            http_response_code(400);
            $response = ['status' => 'error', 'message' => 'transaction_id is required.'];
        } else {
            $transaction = PaymentCore::getTransactionStatus($transaction_id, $partner['token']);
            if ($transaction) {
                $response = ['status' => 'success', 'transaction' => $transaction];
            } else {
                http_response_code(404);
                $response = ['status' => 'error', 'message' => 'Transaction not found or access denied.'];
            }
        }
        break;

    case 'submit_partner_lead':
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            http_response_code(405);
            $response = ['status' => 'error', 'message' => 'Invalid request method. Only POST is accepted for submit_partner_lead.'];
            logMessage("[GPT_API] submit_partner_lead: Method Not Allowed.", 'WARNING', SUBMIT_LEAD_LOG_FILE);
            break;
        }

        if (file_exists(SUBMIT_LEAD_LOCK_FILE)) {
            http_response_code(429);
            $response = ['status' => 'locked', 'message' => 'Another process is already running. Please try again later.'];
            logMessage('[GPT_API] submit_partner_lead: Lock file exists.', 'INFO', SUBMIT_LEAD_LOG_FILE);
            break;
        }
        if (false === touch(SUBMIT_LEAD_LOCK_FILE)) {
            http_response_code(500);
            $response = ['status' => 'error', 'message' => 'Server error: Failed to create lock file.'];
            logMessage('[GPT_API] submit_partner_lead: Could not create lock file.', 'ERROR', SUBMIT_LEAD_LOG_FILE);
            break;
        }
        register_shutdown_function(function() {
            if (file_exists(SUBMIT_LEAD_LOCK_FILE)) {
                unlink(SUBMIT_LEAD_LOCK_FILE);
                logMessage('[GPT_API] submit_partner_lead: Lock file removed.', 'INFO', SUBMIT_LEAD_LOG_FILE);
            }
        });

        if ($inputData === null) {
             http_response_code(400);
             $response = ['status' => 'error', 'message' => 'Missing or invalid JSON payload.'];
             logMessage("[GPT_API] submit_partner_lead: Missing or invalid JSON payload.", 'ERROR', SUBMIT_LEAD_LOG_FILE);
             break;
        }
        
        logMessage('[GPT_API] submit_partner_lead: Processing data: ' . json_encode($inputData, JSON_UNESCAPED_UNICODE), 'INFO', SUBMIT_LEAD_LOG_FILE);

        $api_token_from_body = $inputData['api_token'] ?? null;
        if (!$api_token_from_body || !AuthPartner::isTokenValid($api_token_from_body)) {
            http_response_code(401);
            $response = ['status' => 'error', 'message' => 'Unauthorized: Invalid API token in JSON payload.'];
            logMessage("[GPT_API] submit_partner_lead: Unauthorized. Token: " . ($api_token_from_body ? 'Invalid' : 'Missing'), 'WARNING', SUBMIT_LEAD_LOG_FILE);
            break;
        }
        $partner_for_lead = AuthPartner::getPartnerByToken($api_token_from_body);
        if (!$partner_for_lead) {
            http_response_code(401);
            $response = ['status' => 'error', 'message' => 'Unauthorized: Partner not found for token in JSON payload.'];
            logMessage("[GPT_API] submit_partner_lead: Partner not found for token: {$api_token_from_body}", 'ERROR', SUBMIT_LEAD_LOG_FILE);
            break;
        }

        $leadsToProcess = $inputData['lead_data'] ?? null;
        if (!is_array($leadsToProcess)) { // Allow empty array, will result in processed_count = 0
            http_response_code(400);
            $response = ['status' => 'error', 'message' => "Missing or invalid 'lead_data' array in JSON payload."];
            logMessage("[GPT_API] submit_partner_lead: Missing or invalid 'lead_data' array. Partner: {$partner_for_lead['name']}", 'WARNING', SUBMIT_LEAD_LOG_FILE);
            break;
        }

        $existingLeadsInBlockedDeals = loadDataFromFile(BLOCKED_DEALS_PATH);
        $currentTime = date('Y-m-d H:i:s');
        $processedCount = 0;
        $errors = [];
        $addedToBlockedDealsCount = 0;
        $updatedInBlockedDealsCount = 0;

        $recievedApiIds = [];
        if (file_exists(RECIEVED_API_IDS_FILE_PATH)) {
            $idsContent = file_get_contents(RECIEVED_API_IDS_FILE_PATH);
            if ($idsContent !== false) {
                $recievedApiIds = array_filter(explode(PHP_EOL, trim($idsContent)));
            }
        }
        $newlyRecievedApiIdsForFile = [];

        foreach ($leadsToProcess as $idx => $lead) {
            if (!isset($lead['dealId']) || empty(trim($lead['dealId']))) {
                $errors[] = "Lead at index $idx missing dealId.";
                logMessage("[GPT_API] submit_partner_lead: Lead at index $idx missing dealId. Partner: {$partner_for_lead['name']}", 'WARNING', SUBMIT_LEAD_LOG_FILE);
                continue;
            }
            $dealId = (string)trim($lead['dealId']);

            if (in_array($dealId, $recievedApiIds) || in_array($dealId, $newlyRecievedApiIdsForFile)) {
                $errors[] = "Lead with dealId '$dealId' at index $idx has already been received or is a duplicate in this batch.";
                logMessage("[GPT_API] submit_partner_lead: Duplicate dealId '$dealId' in recieved_api_ids.txt or current batch for partner {$partner_for_lead['name']}. Skipping.", 'INFO', SUBMIT_LEAD_LOG_FILE);
                continue;
            }
            
            $paymentUrl = isset($lead['paymentUrl']) ? (string)$lead['paymentUrl'] : null;
            $foundKeyInBlockedDeals = null;
            foreach ($existingLeadsInBlockedDeals as $key => $existingLead) {
                if (isset($existingLead['dealId']) && (string)$existingLead['dealId'] === $dealId) {
                    $foundKeyInBlockedDeals = $key;
                    break;
                }
            }

            $leadEntryData = [
                'dealId' => $dealId,
                'paymentUrl' => $paymentUrl,
                'partnerId' => $partner_for_lead['id'],
                'partner_name' => $partner_for_lead['name'],
                'last_updated' => $currentTime,
            ];
            // Merge all other fields from $lead into $leadEntryData, preserving specific fields above
            foreach($lead as $k => $v) {
                if (!in_array($k, ['dealId', 'paymentUrl', 'last_updated', 'partnerId', 'partner_name'])) {
                    $leadEntryData[$k] = $v;
                }
            }
            // Ensure created_at is handled correctly (use from partner if provided, else set on new)
            if ($foundKeyInBlockedDeals !== null) {
                 $leadEntryData['created_at'] = $existingLeadsInBlockedDeals[$foundKeyInBlockedDeals]['created_at'] ?? ($lead['created_at'] ?? $currentTime); // Preserve original created_at
                 $existingLeadsInBlockedDeals[$foundKeyInBlockedDeals] = array_merge($existingLeadsInBlockedDeals[$foundKeyInBlockedDeals], $leadEntryData);
                 $updatedInBlockedDealsCount++;
                 logMessage("[GPT_API] submit_partner_lead: Updated lead ID $dealId in BLOCKED_DEALS_PATH for partner {$partner_for_lead['name']}", 'INFO', SUBMIT_LEAD_LOG_FILE);
            } else {
                $leadEntryData['created_at'] = $lead['created_at'] ?? $currentTime;
                $existingLeadsInBlockedDeals[] = $leadEntryData;
                $addedToBlockedDealsCount++;
                logMessage("[GPT_API] submit_partner_lead: Added new lead ID $dealId to BLOCKED_DEALS_PATH for partner {$partner_for_lead['name']}", 'INFO', SUBMIT_LEAD_LOG_FILE);
            }
            $newlyRecievedApiIdsForFile[] = $dealId;
            $processedCount++;
        }

        if ($processedCount > 0) {
            if (saveDataToFile(BLOCKED_DEALS_PATH, $existingLeadsInBlockedDeals)) {
                if (!empty($newlyRecievedApiIdsForFile)) {
                    $idsToAppend = implode(PHP_EOL, $newlyRecievedApiIdsForFile) . PHP_EOL;
                    if (file_put_contents(RECIEVED_API_IDS_FILE_PATH, $idsToAppend, FILE_APPEND | LOCK_EX) === false) {
                        logMessage("[GPT_API] submit_partner_lead: Failed to write to " . RECIEVED_API_IDS_FILE_PATH, 'ERROR', SUBMIT_LEAD_LOG_FILE);
                    }
                }
                http_response_code(200); 
                $response = [
                    'status' => 'success',
                    'message' => "Processed $processedCount leads. Added to main list: $addedToBlockedDealsCount, Updated in main list: $updatedInBlockedDealsCount.",
                    'processed_count' => $processedCount,
                    'added_to_main_list_count' => $addedToBlockedDealsCount,
                    'updated_in_main_list_count' => $updatedInBlockedDealsCount,
                ];
                if (!empty($errors)) {
                    $response['errors'] = $errors;
                    $response['message'] .= " Some leads had issues or were duplicates.";
                }
            } else {
                http_response_code(500);
                $response = ['status' => 'error', 'message' => 'Failed to save partner leads data to main list.'];
                logMessage("[GPT_API] submit_partner_lead: Failed to save leads data to BLOCKED_DEALS_PATH for partner {$partner_for_lead['name']}", 'ERROR', SUBMIT_LEAD_LOG_FILE);
            }
        } else {
             http_response_code(200);
             $response = [
                'status' => 'success',
                'message' => "No new leads to process.",
                'processed_count' => 0,
             ];
             if (!empty($errors)) {
                $response['errors'] = $errors;
                $response['message'] .= " All leads had issues or were duplicates.";
             }
        }
        break;

    default:
        http_response_code(400);
        $response = ['status' => 'error', 'message' => 'Invalid action specified.'];
        logMessage("[GPT_API] Invalid action specified: {$action}", 'WARNING');
}

// Ensure data/log directories exist
$logDir = dirname(SUBMIT_LEAD_LOG_FILE);
if (!is_dir($logDir)) mkdir($logDir, 0775, true);

$dataDirBlockedDeals = dirname(BLOCKED_DEALS_PATH);
if (!is_dir($dataDirBlockedDeals)) mkdir($dataDirBlockedDeals, 0775, true);

$dataDirRecievedApiIds = dirname(RECIEVED_API_IDS_FILE_PATH);
if (!is_dir($dataDirRecievedApiIds)) mkdir($dataDirRecievedApiIds, 0775, true);


echo json_encode($response);
exit;
?>
