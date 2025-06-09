<?php
// amo2json.php

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

// Define constants
define('AMO2JSON_LOCK_FILE', __DIR__ . '/amo2json.lock');
define('AMO2JSON_SCRIPT_LOG_FILE', __DIR__ . '/logs/amo2json.log');

/**
 * Checks if a deal ID is in the blocked deals list.
 * Note: This function might be redundant if the primary use is just to get all deals.
 * Consider just loading the deals once in the main processing function.
 * @param string $dealId The deal ID to check
 * @param string $filePath Path to the blocked deals file
 * @return bool True if deal is blocked, false otherwise
 */
// isDealBlocked больше не используется напрямую, так как BLOCKED_DEALS_PATH теперь указывает на ALL_LEADS_FILE_PATH
// и логика проверки дубликатов перенесена в api.php для submit_partner_lead.
// Эта функция может быть удалена, если нет других мест, где она используется.
/*
function isDealBlocked(string $dealId, string $filePath): bool {
    $deals = loadDataFromFile($filePath);
    foreach ($deals as $deal) {
        if (isset($deal['dealId']) && (string)$deal['dealId'] === $dealId) {
            return true;
        }
    }
    return false;
}
*/

/**
 * Main function to handle AMO to JSON webhook processing.
 * @param int $successHttpCode The HTTP status code to use on success.
 * @return array Result of processing.
 */
function handleAmo2JsonWebhook(int $successHttpCode): array {
    $webhookData = $_POST;
    
    logMessage('Processing webhook for amo2json', 'INFO', AMO2JSON_SCRIPT_LOG_FILE);
    logMessage('Webhook POST data: ' . json_encode($webhookData, JSON_UNESCAPED_UNICODE), 'INFO', AMO2JSON_SCRIPT_LOG_FILE);

    $dealId = null;
    $paymentUrl = null;
    $leadData = null;

    // Check for lead add or update events
    if (isset($webhookData['leads']['add'][0])) {
        $leadData = $webhookData['leads']['add'][0];
    } elseif (isset($webhookData['leads']['update'][0])) {
        $leadData = $webhookData['leads']['update'][0];
    }

    if ($leadData) {
        $dealId = isset($leadData['id']) ? (string)$leadData['id'] : null;

        // Extract payment URL from custom field
        if (isset($leadData['custom_fields'])) {
            foreach ($leadData['custom_fields'] as $field) {
                $fieldIdToCheck = (isset($field['id'])) ? (string)$field['id'] : ((isset($field['field_id'])) ? (string)$field['field_id'] : null);
                if ($fieldIdToCheck === '752625' && isset($field['values'][0]['value'])) {
                    $paymentUrl = (string)$field['values'][0]['value'];
                    break;
                }
            }
        }
    }

    if ($dealId && $paymentUrl) {
        logMessage("Processing webhook for amo2json - Deal ID: $dealId, Payment URL: $paymentUrl", 'INFO', AMO2JSON_SCRIPT_LOG_FILE);

        $deals = loadDataFromFile(ALL_LEADS_FILE_PATH);
        $dealFound = false;

        foreach ($deals as $key => $existingDeal) {
            if (isset($existingDeal['dealId']) && (string)$existingDeal['dealId'] === $dealId) {
                $deals[$key]['paymentUrl'] = $paymentUrl;
                $deals[$key]['last_updated'] = date('Y-m-d H:i:s');
                $dealFound = true;
                logMessage("Deal ID $dealId found, updating payment URL in JSON.", 'INFO', AMO2JSON_SCRIPT_LOG_FILE);
                break;
            }
        }

        if (!$dealFound) {
            $deals[] = [
                'dealId' => $dealId,
                'paymentUrl' => $paymentUrl,
                'created_at' => date('Y-m-d H:i:s'),
                'last_updated' => date('Y-m-d H:i:s')
            ];
            logMessage("Deal ID $dealId not found, adding new entry to JSON.", 'INFO', AMO2JSON_SCRIPT_LOG_FILE);
        }

        if (saveDataToFile(ALL_LEADS_FILE_PATH, $deals)) {
            logMessage("Successfully updated/added deal ID $dealId to " . ALL_LEADS_FILE_PATH, 'INFO', AMO2JSON_SCRIPT_LOG_FILE);
            return ['status' => 'success', 'message' => "Deal $dealId processed and saved to JSON.", 'http_code' => $successHttpCode];
        } else {
            logMessage("Failed to save deal ID $dealId to " . ALL_LEADS_FILE_PATH, 'ERROR', AMO2JSON_SCRIPT_LOG_FILE);
            return ['status' => 'error', 'message' => "Failed to save deal $dealId to JSON.", 'http_code' => 500];
        }
    } else {
        $logMsg = "Missing required data for amo2json - ";
        if (!$dealId) $logMsg .= "Deal ID not found. ";
        if (!$paymentUrl) $logMsg .= "Payment URL not found (expected in custom field 752625).";
        logMessage($logMsg, 'WARNING', AMO2JSON_SCRIPT_LOG_FILE);
        return ['status' => 'error', 'message' => $logMsg, 'http_code' => 400];
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
