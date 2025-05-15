<?php
// This file assumes config.php, google_helpers.php have been included
// and $selectedDateFrom, $selectedDateTo are available from index.php

global $googleCredentialsPath, $googleSheetId, $operatorDataRange;

// --- Load Operator Configuration Data ---
$operatorConfigData = [];
try {
    $service = getGoogleServiceClient($googleCredentialsPath); // Assumes this function is in google_helpers.php
    $sheetData = fetchFromGoogleSheet($service, $googleSheetId, $operatorDataRange); // Assumes this function is in google_helpers.php

    if ($sheetData) {
        foreach ($sheetData as $row) {
            // Expecting FIO in col 0, Queue in 1, Dept in 2, Password in 3, Extension in 4 (if added)
            if (count($row) >= 1 && !empty(trim($row[0]))) { // FIO must exist
                $operatorConfigData[] = [
                    'fio' => trim($row[0]),
                    'queue' => isset($row[1]) ? trim($row[1]) : null,
                    'department' => isset($row[2]) ? trim($row[2]) : null,
                    // 'password' is not typically needed for display, but was in auth.php
                    'operator_extension' => isset($row[4]) ? trim($row[4]) : null, // Assuming extension is in Column E
                ];
            }
        }
    } else {
        custom_log("Could not fetch operator config from Google Sheet. Range: " . $operatorDataRange);
    }
} catch (Exception $e) {
    custom_log("Error loading operator config from Google Sheets: " . $e->getMessage());
}
// custom_log("Operator Config Data Loaded: " . count($operatorConfigData) . " records.");

// --- Load Sessions Data (Call Logs) ---
$sessionsData = [];
// Construct the URL for asterisk_cdr_export.php
// The base URL should be the one you want to use for fetching CDR data.
$cdrExportBaseUrl = 'https://sip.qazna24.kz/admin/asterisk_cdr_export/'; // As per your request

// Instead of relying on global variables, directly access the request parameters
// that were used to set $selectedDateFrom and $selectedDateTo in index.php
// Validate and process dates before constructing URL
function isValidDate($date) {
    if (empty($date)) return false;
    $d = DateTime::createFromFormat('Y-m-d', $date);
    return $d && $d->format('Y-m-d') === $date;
}

$cdrRequestUrl = $cdrExportBaseUrl . '?action=get_cdr_stats';

// Validate and add date parameters
if (isset($_GET['date_from']) && !empty($_GET['date_from'])) {
    if (isValidDate($_GET['date_from'])) {
        $cdrRequestUrl .= '&date_from=' . urlencode($_GET['date_from']);
    } else {
        custom_log("Invalid date_from format: " . $_GET['date_from']);
    }
}

if (isset($_GET['date_to']) && !empty($_GET['date_to'])) {
    if (isValidDate($_GET['date_to'])) {
        $cdrRequestUrl .= '&date_to=' . urlencode($_GET['date_to']);
    } else {
        custom_log("Invalid date_to format: " . $_GET['date_to']);
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
