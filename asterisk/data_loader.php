<?php
// This file assumes config.php, google_helpers.php have been included
// and $selectedDateFrom, $selectedDateTo are available from index.php

// Ensure critical files are loaded first.
require_once __DIR__ . '/config.php'; // Defines $googleCredentialsPath, $googleSheetId, $operatorDataRange, etc.
require_once __DIR__ . '/google_helpers.php'; // Defines getGoogleServiceClient, fetchFromGoogleSheet

global $googleCredentialsPath, $googleSheetId, $operatorDataRange;

// --- Load Operator Configuration Data ---
$operatorConfigData = [];
custom_log("Attempting to load operator config. Sheet ID: '{$googleSheetId}', Range: '{$operatorDataRange}'");

if (empty($googleSheetId) || empty($operatorDataRange)) {
    custom_log("Error: \$googleSheetId or \$operatorDataRange is not configured. Cannot load operator config.");
} else {
    try {
        $service = getGoogleServiceClient($googleCredentialsPath); 
        $sheetData = fetchFromGoogleSheet($service, $googleSheetId, $operatorDataRange); 

        if ($sheetData) {
            custom_log("Fetched " . count($sheetData) . " rows from Google Sheet for operator config.");
            foreach ($sheetData as $rowIndex => $row) {
                // Expecting FIO in col 0 (A), Queue-Operator in 1 (B), Dept in 2 (C), Password in 3 (D), Dedicated Extension in 4 (E)
                if (count($row) >= 1 && !empty(trim($row[0]))) { // FIO must exist
                    $fio = trim($row[0]);
                    $queueOperatorValue = isset($row[1]) ? trim($row[1]) : null; // e.g., "001-101" or "-"
                    $department = isset($row[2]) ? trim($row[2]) : null;
                    $dedicatedExtension = isset($row[4]) ? trim($row[4]) : null; // Extension from dedicated column E

                    $currentOperatorExtension = null;

                    // 1. Prioritize dedicated extension column if it's filled
                    if (!empty($dedicatedExtension)) {
                        $currentOperatorExtension = $dedicatedExtension;
                    } 
                    // 2. If dedicated extension is empty, try to parse from Queue-Operator column
                    elseif (!empty($queueOperatorValue) && $queueOperatorValue !== '-') {
                        $parts = explode('-', $queueOperatorValue);
                        if (count($parts) >= 2) {
                            $currentOperatorExtension = trim(end($parts));
                        } elseif (count($parts) === 1 && is_numeric(trim($parts[0]))) {
                            $currentOperatorExtension = trim($parts[0]);
                        } else {
                            custom_log("Warning: Could not parse operator extension from 'Queue-Operator' value: '{$queueOperatorValue}' for FIO: '{$fio}'. Row index: {$rowIndex}");
                        }
                    }
                    // If $queueOperatorValue is '-' or parsing fails, $currentOperatorExtension remains null (or empty if admin)

                    $operatorConfigData[] = [
                        'fio' => $fio,
                        'queue' => $queueOperatorValue, // Store the original "Очередь-Оператор" value
                        'department' => $department,
                        'operator_extension' => $currentOperatorExtension,
                    ];
                } else {
                    // custom_log("Skipping row {$rowIndex} in operator config: FIO is empty or row is invalid.");
                }
            }
            custom_log("Processed " . count($operatorConfigData) . " operator records. Sample: " . print_r(array_slice($operatorConfigData, 0, 2), true));
        } else {
            custom_log("Could not fetch operator config from Google Sheet, or sheet is empty. Range: " . $operatorDataRange);
        }
    } catch (Exception $e) {
        custom_log("Error loading operator config from Google Sheets: " . $e->getMessage());
    }
}
// custom_log("Operator Config Data Loaded: " . count($operatorConfigData) . " records.");

// --- Load Sessions Data (Call Logs) ---
$sessionsData = [];
// Construct the URL for asterisk_cdr_export.php
// The base URL should be the one you want to use for fetching CDR data.
$cdrExportBaseUrl = 'https://sip.qazna24.kz/admin/asterisk_cdr_export/'; // As per your request

// Load SECRET_KEY from environment variables (assuming config.php loads .env)
$secretKey = $_ENV['SECRET_KEY'] ?? null;

if (empty($secretKey)) {
    custom_log("CRITICAL ERROR: SECRET_KEY is not defined in environment variables. Cannot securely fetch CDR data.");
    // Optionally, prevent further execution or set $sessionsData to an error state
    // For now, we'll log and proceed, but asterisk_cdr_export.php should reject if key is missing.
}

$cdrRequestUrl = $cdrExportBaseUrl . '?action=get_cdr_stats';

// Add secretKey to the request URL if it's available
if (!empty($secretKey)) {
    $cdrRequestUrl .= '&secretKey=' . urlencode($secretKey);
} else {
    custom_log("Warning: SECRET_KEY is missing, CDR request will be made without it. This is insecure if asterisk_cdr_export.php expects it.");
}


// Validate and add date parameters
if (isset($_GET['date_from']) && !empty($_GET['date_from'])) {
    if (isValidDate($_GET['date_from'])) {
        $cdrRequestUrl .= '&date_from=' . urlencode($_GET['date_from']);
    } else {
        custom_log("Invalid date_from format: " . $_GET['date_from'] . " - Using default or no date_from filter for CDR.");
    }
}

if (isset($_GET['date_to']) && !empty($_GET['date_to'])) {
    if (isValidDate($_GET['date_to'])) {
        $cdrRequestUrl .= '&date_to=' . urlencode($_GET['date_to']);
    } else {
        custom_log("Invalid date_to format: " . $_GET['date_to'] . " - Using default or no date_to filter for CDR.");
    }
}

// Log the URL being requested with date parameters for debugging
custom_log("Requesting CDR data from URL: " . $cdrRequestUrl);

try {
    $contextOptions = [
        "ssl" => [
            "verify_peer" => false,
            "verify_peer_name" => false,
        ],
    ];
    $context = stream_context_create($contextOptions);

    $jsonData = @file_get_contents($cdrRequestUrl, false, $context); // The @ suppresses warnings
    if ($jsonData === false) {
        $error = error_get_last();
        custom_log("Failed to fetch data from asterisk_cdr_export.php. URL: " . $cdrRequestUrl . ". Error: " . print_r($error, true));
        $sessionsData = []; // Ensure it's an empty array on failure
    } else {
        $decodedData = json_decode($jsonData, true);
        if (json_last_error() === JSON_ERROR_NONE && isset($decodedData['processed_logical_sessions'])) {
            $sessionsData = $decodedData['processed_logical_sessions'];
            // custom_log("Successfully fetched and decoded " . count($sessionsData) . " sessions from CDR export.");
        } else {
            custom_log("Failed to decode JSON from asterisk_cdr_export.php or 'processed_logical_sessions' key missing. JSON Error: " . json_last_error_msg() . ". Raw response snippet: " . substr($jsonData, 0, 500));
            $sessionsData = []; // Ensure it's an empty array on failure
        }
    }
} catch (Exception $e) {
    custom_log("Exception while fetching/processing CDR data: " . $e->getMessage() . " URL: " . $cdrRequestUrl);
    $sessionsData = []; // Ensure it's an empty array on exception
}

// At this point, $operatorConfigData and $sessionsData are populated (or are empty arrays on error)
?>
