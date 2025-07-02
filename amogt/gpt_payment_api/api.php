<?php
// gpt_payment_api/api.php

// Don't show logs in browser output, only save to disk
define('dontshowlogs', 1);

require_once __DIR__ . '/../config.php'; // Общий конфиг проекта, определяет BLOCKED_DEALS_PATH
require_once __DIR__ . '/../logger.php';   // Логгер
require_once __DIR__ . '/lib/auth_partner.php';
require_once __DIR__ . '/lib/payment_core.php';
require_once __DIR__ . '/lib/db.php'; 
require_once __DIR__ . '/lib/partner_transaction_logger.php'; // Новый логгер транзакций
require_once __DIR__ . '/../lib/json_storage_utils.php';
require_once __DIR__ . '/../lib/payment_link_parser.php'; // Добавляем для парсинга ссылок на оплату

header('Content-Type: application/json');

// Определения для функционала submit_partner_lead
define('SUBMIT_LEAD_LOCK_FILE', __DIR__ . '/data/submit_partner_lead.lock'); 
define('SUBMIT_LEAD_LOG_FILE', LOGS_DIR . '/gpt_payment_api/submit_partner_lead.log'); // Используем LOGS_DIR
// RECIEVED_API_IDS_FILE_PATH уже определена в config.php

$action = null;
$current_api_token = null;
$inputData = null; 

// Сначала пытаемся получить action и api_token из JSON, если это POST запрос
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $inputJSON = file_get_contents('php://input');
    $inputData = json_decode($inputJSON, true);

    if (json_last_error() === JSON_ERROR_NONE && isset($inputData['action'])) {
        $action = $inputData['action'];
        // Если action из JSON это submit_partner_lead, токен тоже берем из JSON.
        if ($action === 'submit_partner_lead') {
            $current_api_token = $inputData['api_token'] ?? null;
        } else {
            // Если action в JSON не submit_partner_lead, то $_REQUEST['action'] и $_REQUEST['api_token'] имеют приоритет
            $action = $_REQUEST['action'] ?? $action; 
            $current_api_token = $_REQUEST['api_token'] ?? ($inputData['api_token'] ?? null); // Используем токен из $_REQUEST если есть, иначе из JSON
        }
    } else {
        // JSON невалидный или не содержит action, полностью полагаемся на $_REQUEST
        $action = $_REQUEST['action'] ?? '';
        $current_api_token = $_REQUEST['api_token'] ?? null;
        if (json_last_error() !== JSON_ERROR_NONE && !empty($inputJSON)) {
            // Логируем ошибку парсинга JSON, если он был непустой
            logMessage("[GPT_API] Invalid JSON received: " . json_last_error_msg() . ". Falling back to _REQUEST.", 'WARNING', SUBMIT_LEAD_LOG_FILE);
        }
    }
} else {
    // Для GET и других методов
    $action = $_REQUEST['action'] ?? '';
    $current_api_token = $_REQUEST['api_token'] ?? null;
}

logMessage("[GPT_API] Request received. Action: {$action}, Token in request: " . ($current_api_token ? 'Yes' : 'No'), 'INFO', SUBMIT_LEAD_LOG_FILE);

$partner = null;

// Аутентификация партнера (кроме submit_partner_lead, который имеет свою логику внутри switch)
// Для submit_partner_lead токен проверяется внутри case, так как он должен быть в JSON
if ($action !== 'submit_partner_lead') {
    if (!$current_api_token || !AuthPartner::isTokenValid($current_api_token)) {
        http_response_code(401);
        echo json_encode(['status' => 'error', 'message' => 'Unauthorized: Invalid API token.']);
        logMessage("[GPT_API] Unauthorized access attempt (early check). Action: {$action}", 'WARNING', SUBMIT_LEAD_LOG_FILE);
        exit;
    }
    $partner = AuthPartner::getPartnerByToken($current_api_token);
    if (!$partner) {
        http_response_code(401);
        echo json_encode(['status' => 'error', 'message' => 'Unauthorized: Partner not found for token.']);
        logMessage("[GPT_API] Partner not found for token (early check): {$current_api_token}", 'WARNING', SUBMIT_LEAD_LOG_FILE);
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
             $response = ['status' => 'error', 'message' => 'Unauthorized. Partner context missing for get_balance. Action was: '.$action];
             logMessage("[GPT_API] get_balance failed: Partner context missing. Action: {$action}, Token: " . ($current_api_token ? $current_api_token : 'None'), 'WARNING', SUBMIT_LEAD_LOG_FILE);
        }
        break;

    case 'get_transactions':
        if ($partner) {
            $limit = isset($_GET['limit']) ? min(max((int)$_GET['limit'], 1), 1000) : 100; // Лимит от 1 до 1000, по умолчанию 100
            
            try {
                $transactions = PartnerTransactionLogger::getPartnerTransactions($partner['id'], $limit);
                $stats = PartnerTransactionLogger::getPartnerStats($partner['id']);
                
                $response = [
                    'status' => 'success',
                    'partner_name' => $partner['name'],
                    'partner_id' => $partner['id'],
                    'transactions' => $transactions,
                    'stats' => $stats,
                    'count' => count($transactions)
                ];
                logMessage("[GPT_API] get_transactions successful for partner: {$partner['name']}, returned " . count($transactions) . " transactions");
            } catch (Exception $e) {
                http_response_code(500);
                $response = ['status' => 'error', 'message' => 'Failed to retrieve transactions: ' . $e->getMessage()];
                logMessage("[GPT_API] get_transactions failed for partner: {$partner['name']}, error: " . $e->getMessage(), 'ERROR', SUBMIT_LEAD_LOG_FILE);
            }
        } else { 
             http_response_code(401);
             $response = ['status' => 'error', 'message' => 'Unauthorized. Partner context missing for get_transactions.'];
             logMessage("[GPT_API] get_transactions failed: Partner context missing. Action: {$action}, Token: " . ($current_api_token ? $current_api_token : 'None'), 'WARNING', SUBMIT_LEAD_LOG_FILE);
        }
        break;

    case 'submit_partner_lead':
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            http_response_code(405);
            $response = ['status' => 'error', 'message' => 'Invalid request method. Only POST is accepted for submit_partner_lead.'];
            logMessage("[GPT_API] submit_partner_lead: Method Not Allowed.", 'WARNING', SUBMIT_LEAD_LOG_FILE);
            break;
        }

        // $inputData уже должен быть установлен из блока выше, если это POST с JSON
        if ($inputData === null) { 
             // Если $inputData все еще null, значит JSON не был получен или был невалиден
             $inputJSON_check = file_get_contents('php://input'); // Повторно читаем для лога, если нужно
             $inputData_check = json_decode($inputJSON_check, true);
             if (json_last_error() !== JSON_ERROR_NONE) {
                 logMessage("[GPT_API] submit_partner_lead: Invalid JSON payload. Error: " . json_last_error_msg() . ". Raw: " . substr($inputJSON_check, 0, 200), 'ERROR', SUBMIT_LEAD_LOG_FILE);
                 http_response_code(400);
                 $response = ['status' => 'error', 'message' => 'Invalid JSON payload for submit_partner_lead.'];
                 break;
             }
             // Если JSON валиден, но $inputData не был установлен, это странная ситуация, но проверим $inputData_check
             $inputData = $inputData_check; 
             if ($inputData === null || !isset($inputData['action'])) { // Дополнительная проверка
                http_response_code(400);
                $response = ['status' => 'error', 'message' => 'Missing or invalid JSON payload.'];
                logMessage("[GPT_API] submit_partner_lead: Missing or invalid JSON payload (checked again).", 'ERROR', SUBMIT_LEAD_LOG_FILE);
                break;
             }
        }
        
        // Токен для submit_partner_lead должен быть в JSON теле
        $api_token_from_body = $inputData['api_token'] ?? null; 
        if (!$api_token_from_body || !AuthPartner::isTokenValid($api_token_from_body)) {
            http_response_code(401);
            $response = ['status' => 'error', 'message' => 'Unauthorized: Invalid API token in JSON payload.'];
            logMessage("[GPT_API] submit_partner_lead: Unauthorized. Token in JSON: " . ($api_token_from_body ? 'Invalid' : 'Missing'), 'WARNING', SUBMIT_LEAD_LOG_FILE);
            break;
        }
        $partner_for_lead = AuthPartner::getPartnerByToken($api_token_from_body);
        if (!$partner_for_lead) {
            http_response_code(401);
            $response = ['status' => 'error', 'message' => 'Unauthorized: Partner not found for token in JSON payload.'];
            logMessage("[GPT_API] submit_partner_lead: Partner not found for token in JSON: {$api_token_from_body}", 'ERROR', SUBMIT_LEAD_LOG_FILE);
            break;
        }
        
        // Блокировка одновременного выполнения
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
        
        logMessage('[GPT_API] submit_partner_lead: Processing data: ' . json_encode($inputData, JSON_UNESCAPED_UNICODE), 'INFO', SUBMIT_LEAD_LOG_FILE);

        $leadsToProcess = $inputData['lead_data'] ?? null;
        if (!is_array($leadsToProcess)) { 
            http_response_code(400);
            $response = ['status' => 'error', 'message' => "Missing or invalid 'lead_data' array in JSON payload."];
            logMessage("[GPT_API] submit_partner_lead: Missing or invalid 'lead_data' array. Partner: {$partner_for_lead['name']}", 'WARNING', SUBMIT_LEAD_LOG_FILE);
            break;
        }

        $existingLeads = loadDataFromFile(ALL_LEADS_FILE_PATH);
        $currentTime = date('Y-m-d H:i:s');
        $processedCount = 0;
        $errors = [];
        $addedToMainListCount = 0;
        $updatedInMainListCount = 0;

        // Проверяем баланс партнера для обработки всех лидов
        $totalCostRequired = count($leadsToProcess) * LEAD_PROCESSING_COST_USD;
        if ((float)$partner_for_lead['balance'] < $totalCostRequired) {
            http_response_code(402); // Payment Required
            $response = [
                'status' => 'insufficient_funds',
                'message' => "Insufficient funds. Required: {$totalCostRequired} USD, Current balance: {$partner_for_lead['balance']} USD",
                'required_balance' => $totalCostRequired,
                'current_balance' => (float)$partner_for_lead['balance'],
                'cost_per_lead' => LEAD_PROCESSING_COST_USD,
                'leads_count' => count($leadsToProcess)
            ];
            logMessage("[GPT_API] submit_partner_lead: Insufficient funds for partner {$partner_for_lead['name']}. Required: {$totalCostRequired} USD, Available: {$partner_for_lead['balance']} USD", 'WARNING', SUBMIT_LEAD_LOG_FILE);
            break;
        }

        foreach ($leadsToProcess as $idx => $lead) {
            if (!isset($lead['paymentUrl']) || empty(trim($lead['paymentUrl']))) {
                $errors[] = "Lead at index $idx missing paymentUrl.";
                logMessage("[GPT_API] submit_partner_lead: Lead at index $idx missing paymentUrl. Partner: {$partner_for_lead['name']}", 'WARNING', SUBMIT_LEAD_LOG_FILE);
                continue;
            }
            $paymentUrl = (string)trim($lead['paymentUrl']);
            
            // Проверяем дублирование по paymentUrl среди всех существующих лидов
            $isDuplicateUrl = false;
            foreach ($existingLeads as $existingLead) {
                if (isset($existingLead['paymentUrl']) && $existingLead['paymentUrl'] === $paymentUrl) {
                    $isDuplicateUrl = true;
                    break;
                }
            }
            
            if ($isDuplicateUrl) {
                $errors[] = "Lead at index $idx: Lead with paymentUrl '$paymentUrl' already exists in the system.";
                logMessage("[GPT_API] submit_partner_lead: Duplicate paymentUrl '$paymentUrl' found. Skipping. Partner: {$partner_for_lead['name']}", 'INFO', SUBMIT_LEAD_LOG_FILE);
                continue;
            }
            
            // Проверяем достаточность средств для каждого лида ПЕРЕД добавлением
            if ((float)$partner_for_lead['balance'] < LEAD_PROCESSING_COST_USD) {
                $errors[] = "Lead at index $idx: Insufficient funds. Required: " . LEAD_PROCESSING_COST_USD . " USD, Available: {$partner_for_lead['balance']} USD";
                logMessage("[GPT_API] submit_partner_lead: Insufficient funds for lead at index $idx. Partner: {$partner_for_lead['name']}", 'WARNING', SUBMIT_LEAD_LOG_FILE);
                continue;
            }

            // Парсим сумму и валюту из paymentUrl используя parsePaymentLink для большей надежности
            $parsedPaymentDetails = parsePaymentLink($paymentUrl); // Используем parsePaymentLink
            $amount = null;
            $currency = null;

            if (!empty($parsedPaymentDetails) && isset($parsedPaymentDetails['amount']) && isset($parsedPaymentDetails['currency'])) {
                $amount = $parsedPaymentDetails['amount'];
                $currency = $parsedPaymentDetails['currency'];
                logMessage("[GPT_API] submit_partner_lead: Successfully parsed payment details for lead at index $idx. Amount: $amount, Currency: $currency. URL: $paymentUrl", 'INFO', SUBMIT_LEAD_LOG_FILE);
            } else {
                // parsePaymentLink логирует ошибки самостоятельно, здесь просто добавляем в массив ошибок для ответа API
                $errors[] = "Lead at index $idx: Failed to parse payment details from URL: $paymentUrl. Invalid payment URL format.";
                logMessage("[GPT_API] submit_partner_lead: Failed to parse payment details for lead at index $idx. URL: $paymentUrl. parsePaymentLink returned empty or invalid data. Check STRIPE_LINK_PARSER_LOG_FILE.", 'WARNING', SUBMIT_LEAD_LOG_FILE);
                // НЕ добавляем лид если не удалось распарсить ссылку
                continue;
            }

            // Всегда генерируем dealId на сервере для обеспечения уникальности
            $dealId = strtoupper(uniqid("DID", true));

            // Списываем 25$ с баланса партнера за обработку лида
            $db = new DB();
            $partners = $db->read('partners');
            $partnerIndex = -1;
            
            // Находим партнера в массиве для обновления баланса
            foreach ($partners as $index => $p) {
                if ($p['id'] === $partner_for_lead['id']) {
                    $partnerIndex = $index;
                    break;
                }
            }
            
            if ($partnerIndex === -1) {
                $errors[] = "Lead at index $idx: Partner not found for balance update.";
                logMessage("[GPT_API] submit_partner_lead: Partner not found for balance update. Partner ID: {$partner_for_lead['id']}", 'ERROR', SUBMIT_LEAD_LOG_FILE);
                continue;
            }
            
            // Списываем средства
            $partners[$partnerIndex]['balance'] = (float)$partners[$partnerIndex]['balance'] - LEAD_PROCESSING_COST_USD;
            
            // Сохраняем обновленный баланс партнера
            if (!$db->write('partners', $partners)) {
                $errors[] = "Lead at index $idx: Failed to update partner balance.";
                logMessage("[GPT_API] submit_partner_lead: Failed to update partner balance. Partner: {$partner_for_lead['name']}", 'ERROR', SUBMIT_LEAD_LOG_FILE);
                continue;
            }
            
            // Логируем транзакцию
            try {
                $transactionId = PartnerTransactionLogger::logLeadTransaction(
                    $partner_for_lead,
                    $lead,
                    LEAD_PROCESSING_COST_USD,
                    $dealId
                );
                logMessage("[GPT_API] submit_partner_lead: Transaction logged. TxnID: {$transactionId}, Partner: {$partner_for_lead['name']}, LeadID: {$dealId}", 'INFO', SUBMIT_LEAD_LOG_FILE);
            } catch (Exception $e) {
                $errors[] = "Lead at index $idx: Failed to log transaction: " . $e->getMessage();
                logMessage("[GPT_API] submit_partner_lead: Failed to log transaction for lead {$dealId}: " . $e->getMessage(), 'ERROR', SUBMIT_LEAD_LOG_FILE);
                continue;
            }

            $leadEntryData = [
                'dealId' => $dealId, 
                'paymentUrl' => $paymentUrl,
                'partnerId' => $partner_for_lead['id'],
                'partner_name' => $partner_for_lead['name'],
                'created_at' => $currentTime, 
                'last_updated' => $currentTime,
                'amount' => $amount, // Добавляем распарсенную сумму
                'currency' => $currency, // Добавляем распарсенную валюту
            ];
            
            // Копируем все остальные пользовательские поля из входящего лида
            foreach($lead as $k => $v) {
                if (!in_array($k, ['dealId', 'paymentUrl', 'created_at', 'last_updated', 'partnerId', 'partner_name', 'amount', 'currency'])) {
                    $leadEntryData[$k] = $v;
                }
            }

            $existingLeads[] = $leadEntryData;
            $addedToMainListCount++;
            logMessage("[GPT_API] submit_partner_lead: Added new lead with generated ID $dealId to ALL_LEADS_FILE_PATH for partner {$partner_for_lead['name']}. Amount: $amount, Currency: $currency", 'INFO', SUBMIT_LEAD_LOG_FILE);
            
            // Обновляем баланс партнера в памяти для следующих итераций
            $partner_for_lead['balance'] = (float)$partner_for_lead['balance'] - LEAD_PROCESSING_COST_USD;
            
            $processedCount++;
        }

        $updatedInMainListCount = 0; 

        if ($processedCount > 0) {
            if (saveDataToFile(ALL_LEADS_FILE_PATH, $existingLeads)) {
                http_response_code(200); 
                $response = [
                    'status' => 'success',
                    'message' => "Processed $processedCount leads. Added to main list: $addedToMainListCount, Updated in main list: $updatedInMainListCount.",
                    'processed_count' => $processedCount,
                    'added_to_main_list_count' => $addedToMainListCount,
                    'updated_in_main_list_count' => $updatedInMainListCount,
                    'total_cost_charged' => $processedCount * LEAD_PROCESSING_COST_USD,
                    'remaining_balance' => $partner_for_lead['balance']
                ];
                if (!empty($errors)) {
                    $response['errors'] = $errors;
                    $response['message'] .= " Some leads had issues (see errors array).";
                    $response['error_count'] = count($errors);
                }
            } else {
                http_response_code(500);
                $response = ['status' => 'error', 'message' => 'Failed to save partner leads data to main list.'];
                logMessage("[GPT_API] submit_partner_lead: Failed to save leads data to ALL_LEADS_FILE_PATH for partner {$partner_for_lead['name']}", 'ERROR', SUBMIT_LEAD_LOG_FILE);
            }
        } else {
             if (count($errors) === count($leadsToProcess)) {
                 // Все лиды имели ошибки
                 http_response_code(400);
                 $response = [
                    'status' => 'error',
                    'message' => "All leads failed validation. No leads processed.",
                    'processed_count' => 0,
                    'added_to_main_list_count' => 0,
                    'updated_in_main_list_count' => 0,
                    'total_cost_charged' => 0,
                    'errors' => $errors,
                    'error_count' => count($errors)
                 ];
             } else {
                 http_response_code(200);
                 $response = [
                    'status' => 'success',
                    'message' => "No new leads to process.",
                    'processed_count' => 0,
                    'added_to_main_list_count' => 0,
                    'updated_in_main_list_count' => 0,
                    'total_cost_charged' => 0,
                    'remaining_balance' => $partner_for_lead['balance']
                 ];
                 if (!empty($errors)) {
                    $response['errors'] = $errors;
                    $response['message'] .= " All leads had issues (see errors array).";
                    $response['error_count'] = count($errors);
                 }
             }
        }
        break;

    default:
        http_response_code(400);
        $response = ['status' => 'error', 'message' => 'Invalid action specified.'];
        logMessage("[GPT_API] Invalid action specified: {$action}", 'WARNING', SUBMIT_LEAD_LOG_FILE);
}

// Ensure data/log directories exist
$logDir = dirname(SUBMIT_LEAD_LOG_FILE);
if (!is_dir($logDir)) mkdir($logDir, 0775, true);

$dataDirAllLeads = dirname(ALL_LEADS_FILE_PATH);
if (!is_dir($dataDirAllLeads)) mkdir($dataDirAllLeads, 0775, true);


echo json_encode($response);
exit;
?>
