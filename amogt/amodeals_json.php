<?php
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/logger.php';

header('Content-Type: application/json; charset=UTF-8');

// Enable error reporting for debugging but suppress display
error_reporting(E_ALL);
ini_set('display_errors', 0); // Disable display of errors/warnings
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

// Handle delete all action
if (isset($_GET['deleteall']) || (isset($_GET['delete']) && $_GET['delete'] === 'all')) {
    logMessage("Attempting to delete all deals from local JSON (delete all requested)...");
    
    $leadsFilePath = defined('ALL_LEADS_FILE_PATH') ? ALL_LEADS_FILE_PATH : (defined('BLOCKED_DEALS_PATH') ? BLOCKED_DEALS_PATH : __DIR__ . '/allLeads.json');
    if (file_put_contents($leadsFilePath, json_encode([], JSON_PRETTY_PRINT)) !== false) {
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
    $leadsFilePath = defined('ALL_LEADS_FILE_PATH') ? ALL_LEADS_FILE_PATH : (defined('BLOCKED_DEALS_PATH') ? BLOCKED_DEALS_PATH : __DIR__ . '/allLeads.json');
    if (!file_exists($leadsFilePath)) {
        // Try to create the file with empty array if it doesn't exist
        $emptyData = json_encode([], JSON_PRETTY_PRINT);
        if (file_put_contents($leadsFilePath, $emptyData) !== false) {
            echo json_encode([
                'deals' => [], 
                'total' => 0,
                'message' => 'No deals file found. Created empty file.',
                'info' => [
                    'usage' => 'Как использовать этот скрипт:',
                    'delete_all' => 'Удалить все сделки: ?deleteall=1',
                    'view_all' => 'Просмотреть все сделки: доступ без параметров',
                    'example_delete_all' => 'Пример: amodeals_json.php?deleteall=1'
                ]
            ], JSON_UNESCAPED_SLASHES);
        } else {
            echo json_encode([
                'deals' => [], 
                'message' => 'No deals file found and cannot create one.',
                'info' => [
                    'usage' => 'Script usage instructions:',
                    'delete_all' => 'To delete all deals: ?deleteall=1',
                    'example_delete_all' => 'Example: amodeals_json.php?deleteall=1'
                ]
            ], JSON_UNESCAPED_SLASHES);
        }
        exit;
    }
    
    $jsonData = file_get_contents($leadsFilePath);
    if ($jsonData === false) {
        echo json_encode(['error' => 'Failed to read deals file: ' . $leadsFilePath]);
        exit;
    }
    
    $data = json_decode($jsonData, true);
    if (json_last_error() !== JSON_ERROR_NONE) {
        echo json_encode(['error' => 'Invalid JSON format in deals file.']);
        exit;
    }
    
    // Format data for output
    $formattedDeals = [];
    if (is_array($data)) {
        foreach ($data as $item) {
            if (is_string($item) || is_numeric($item)) {
                // Old format: simple array of IDs
                $formattedDeals[] = [
                    'dealId' => (string)$item,
                    'paymentUrl' => null,
                    'created_at' => null,
                    'last_updated' => null
                ];
            } elseif (is_array($item) && isset($item['dealId'])) {
                // New format: array of objects
                $formattedDeals[] = [
                    'dealId' => $item['dealId'],
                    'paymentUrl' => $item['paymentUrl'] ?? null,
                    'created_at' => $item['created_at'] ?? null,
                    'last_updated' => $item['last_updated'] ?? null
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
