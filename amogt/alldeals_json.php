<?php
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/logger.php';

header('Content-Type: application/json; charset=UTF-8');

// Enable error reporting for debugging but suppress display
error_reporting(E_ALL);
ini_set('display_errors', 1); 
ini_set('log_errors', 1); // Keep logging to file

// Don't show logs in browser output, only save to disk
define('dontshowlogs', 1);

// Load access token
$tokenData = file_exists(AMO_TOKENS_PATH) ? json_decode(file_get_contents(AMO_TOKENS_PATH), true) : null;
$accessToken = $tokenData && isset($tokenData['access_token']) ? $tokenData['access_token'] : AMO_TOKEN;

if (!$accessToken) {
    echo json_encode(['error' => 'AMO CRM access token not defined']);
    exit;
}

// Helper functions for file operations
function loadDataFromFile($filePath) {
    if (!file_exists($filePath)) {
        return [];
    }
    
    $content = file_get_contents($filePath);
    if ($content === false) {
        return [];
    }
    
    $data = json_decode($content, true);
    return is_array($data) ? $data : [];
}

function saveDataToFile($filePath, $data) {
    $dir = dirname($filePath);
    if (!is_dir($dir)) {
        if (!mkdir($dir, 0755, true)) {
            return false;
        }
    }
    
    $json = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
    return file_put_contents($filePath, $json) !== false;
}

// Handle delete all action
if (isset($_GET['deleteall']) || (isset($_GET['delete']) && $_GET['delete'] === 'all')) {
    logMessage("Attempting to delete all deals from local JSON (delete all requested)...");
    
    $leadsFilePath = ALL_LEADS_FILE_PATH;
    if (saveDataToFile($leadsFilePath, [])) {
        logMessage("Successfully deleted all deals from local JSON file: " . $leadsFilePath);
        echo json_encode(['success' => "Successfully deleted all deals from local JSON file."]);
    } else {
        logMessage("Error saving empty JSON file after deleting all deals.");
        echo json_encode(['error' => "Error saving JSON file after deleting all deals."]);
    }
    exit;
}

// Handle display of current deals (if no specific action requested)
if (!isset($_GET['deleteall'])) {
    $leadsFilePath = ALL_LEADS_FILE_PATH;
    $data = loadDataFromFile($leadsFilePath);
    
    // Format data for output
    $formattedDeals = [];
    if (is_array($data)) {
        foreach ($data as $item) {
            // Ensure all items are objects with 'dealId'
            if (is_array($item) && isset($item['dealId'])) {
                $formattedDeals[] = [
                    'dealId' => $item['dealId'],
                    'paymentUrl' => $item['paymentUrl'] ?? null,
                    'partnerId' => $item['partnerId'] ?? null,
                    'partner_name' => $item['partner_name'] ?? null,
                    'created_at' => $item['created_at'] ?? null,
                    'last_updated' => $item['last_updated'] ?? null
                ];
            } elseif (is_string($item) || is_numeric($item)) {
                // Handle old format (simple array of IDs) if it somehow persists
                $formattedDeals[] = [
                    'dealId' => (string)$item,
                    'paymentUrl' => null,
                    'partnerId' => null,
                    'partner_name' => null,
                    'created_at' => null,
                    'last_updated' => null
                ];
            }
        }
    }
    
    echo json_encode([
        'deals' => $formattedDeals,
        'total' => count($formattedDeals),
        'message' => 'Current deals in JSON file.',
        'info' => [
            'usage' => 'How to use this script:',
            'delete_all' => 'To delete all deals: ?deleteall=1',
            'view_all' => 'To view all deals: access without parameters',
            'example_delete_all' => 'Example: amodeals_json.php?deleteall=1',
            'note' => 'This script primarily manages a local JSON file of deal IDs.'
        ]
    ], JSON_UNESCAPED_SLASHES);
    exit;
}
