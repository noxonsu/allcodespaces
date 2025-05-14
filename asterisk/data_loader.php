<?php
// Assumes config.php and google_helpers.php are included.
// Access global config variables
global $googleCredentialsPath, $googleSheetId, $operatorDataRange, $operatorSheetName;

// --- Fetch Operator Config from Google Sheets (if authenticated) ---
$operatorConfigData = [];
try {
    $service = getGoogleServiceClient($googleCredentialsPath);
    $sheetData = fetchFromGoogleSheet($service, $googleSheetId, $operatorDataRange);

    if ($sheetData) {
        foreach ($sheetData as $row) {
            if (count($row) >= 1 && !empty(trim($row[0]))) { // FIO must exist
                $fullQueue = isset($row[1]) ? trim($row[1]) : null;
                $medicalCenterQueue = null;
                $operatorExtension = null;

                if ($fullQueue) {
                    $parts = explode('-', $fullQueue, 2); 
                    if (!empty($parts[0])) {
                        $medicalCenterQueue = trim($parts[0]); 
                    }
                    if (isset($parts[1]) && !empty($parts[1])) {
                        $operatorExtension = trim($parts[1]);
                    }
                }

                $config_entry = [
                    'fio' => trim($row[0]),
                    'queue_full' => $fullQueue, 
                    'queue_medical_center' => $medicalCenterQueue, 
                    'operator_extension' => $operatorExtension,
                    'department' => isset($row[2]) ? trim($row[2]) : null,
                ];
                $operatorConfigData[] = $config_entry;
            }
        }
    }
    debugLog("Operator Config Data fetched. Count: " . count($operatorConfigData));
    if (count($operatorConfigData) > 0) {
        $sampleOpConfLog = $operatorConfigData[0];
        debugLog("Sample operator config (first entry): " . json_encode($sampleOpConfLog));
    }
} catch (Exception $e) {
    error_log("Error fetching operator data from Google Sheets: " . $e->getMessage());
}

if (empty($operatorConfigData)) {
    $errorMessage = "Не удалось загрузить конфигурацию операторов из Google Sheets ({$operatorSheetName}) или таблица пуста. Фильтрация по операторам и отделам может быть неполной.";
    // Displaying HTML here might be problematic if headers are already sent or if this script is included before HTML output starts.
    // Consider logging and setting a flag for index.php to display the error.
    // For now, let's keep the echo but be mindful.
    echo "<p style='color:red; text-align:center;'>{$errorMessage}</p>";
    error_log($errorMessage);
}

// --- Fetch Call Logs from URL ---
$sessionsData = [];
$callLogURL = 'https://sip.qazna24.kz/admin/dashboard/';

debugLog("Attempting to fetch call sessions from: " . $callLogURL);
try {
    $ch = curl_init($callLogURL);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);
    $jsonContent = curl_exec($ch);

    $rawJsonFilePath = __DIR__ . '/calls_raw.json';
    file_put_contents($rawJsonFilePath, $jsonContent);
    debugLog("Raw JSON response saved to " . $rawJsonFilePath);

    if (curl_errno($ch)) throw new Exception(curl_error($ch));
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    if ($httpCode != 200) throw new Exception("HTTP Error: " . $httpCode . " - " . $jsonContent);
    curl_close($ch);

    if ($jsonContent === false) throw new Exception('Failed to fetch data from URL.');

    if (!empty($jsonContent)) {
        $decodedData = json_decode($jsonContent, true);
        if (json_last_error() !== JSON_ERROR_NONE) {
            $jsonError = 'Error decoding JSON: ' . json_last_error_msg();
            // echo '<div class="error-message">' . $jsonError . '</div>'; // Defer to index.php for UI errors
            error_log($jsonError);
            debugLog($jsonError . " Raw content (first 500 chars): " . substr($jsonContent, 0, 500));
        } else {
            debugLog("JSON decoded successfully. Top-level keys: " . implode(', ', array_keys($decodedData)));
            if (!is_array($decodedData) || !isset($decodedData['processed_logical_sessions']) || !is_array($decodedData['processed_logical_sessions'])) {
                $formatError = 'JSON does not contain a "processed_logical_sessions" key with an array value';
                // echo '<div class="error-message">' . $formatError . '</div>'; // Defer
                error_log($formatError);
                debugLog($formatError . " Available Keys: " . implode(', ', array_keys($decodedData)));
            } else {
                $sessionsData = $decodedData['processed_logical_sessions'];
                error_log("Successfully loaded " . count($sessionsData) . " call sessions from URL into \$sessionsData.");
                debugLog("Successfully loaded " . count($sessionsData) . " call sessions. Sample: " . (count($sessionsData) > 0 ? json_encode($sessionsData[0]) : "No sessions"));
            }
        }
    } else {
        $emptyFileError = 'Fetched JSON is empty';
        // echo '<div class="error-message">' . $emptyFileError . '</div>'; // Defer
        error_log($emptyFileError);
        debugLog($emptyFileError);
    }
} catch (Exception $e) {
    $fetchError = 'Error fetching or processing JSON: ' . $e->getMessage();
    // echo '<div class="error-message">' . $fetchError . '</div>'; // Defer
    error_log($fetchError);
    debugLog($fetchError);
}

// --- START: Filter sessionsData by queues in operatorConfigData ---
$configuredMedicalCenterQueues = [];
if (!empty($operatorConfigData)) {
    $rawMedicalCenterQueues = array_column($operatorConfigData, 'queue_medical_center');
    $configuredMedicalCenterQueues = array_unique(array_filter($rawMedicalCenterQueues));
}

debugLog("Configured MEDICAL CENTER queues for filtering (from '{$operatorSheetName}', col B): " . (!empty($configuredMedicalCenterQueues) ? implode(', ', array_map('htmlspecialchars', $configuredMedicalCenterQueues)) : "NONE"));
$relevantSessionsData = [];
if (!empty($configuredMedicalCenterQueues)) {
    debugLog("Starting to filter " . count($sessionsData) . " sessions based on " . count($configuredMedicalCenterQueues) . " configured MC queue(s).");
    foreach ($sessionsData as $session_idx => $session) {
        $sessionMasterIdForLog = isset($session['session_master_id']) ? htmlspecialchars($session['session_master_id']) : ('index_' . $session_idx);
        $sessionQueues = [];
        if (isset($session['queue_legs_info']) && is_array($session['queue_legs_info'])) {
            foreach ($session['queue_legs_info'] as $leg) {
                if (isset($leg['queue_dst']) && !in_array($leg['queue_dst'], $sessionQueues)) {
                    $sessionQueues[] = $leg['queue_dst'];
                }
            }
        }
        if (empty($sessionQueues)) {
            debugLog("Session ID: " . $sessionMasterIdForLog . " - No queues in 'queue_legs_info'. Not relevant for MC queue filtering.");
            continue; 
        }
        $isRelevant = false;
        foreach ($sessionQueues as $sq) {
            if (in_array($sq, $configuredMedicalCenterQueues)) {
                $isRelevant = true;
                debugLog("Session ID: " . $sessionMasterIdForLog . " - MATCH: Session MC queue '" . htmlspecialchars($sq) . "' IS IN configured MC queues. Relevant.");
                break; 
            }
        }
        if ($isRelevant) {
            $relevantSessionsData[] = $session;
        } else {
            debugLog("Session ID: " . $sessionMasterIdForLog . " - Not relevant. No match for its MC queues [" . implode(', ', array_map('htmlspecialchars', $sessionQueues)) . "] in configured MC queues.");
        }
    }
    error_log("Filtered session data. Original: " . count($sessionsData) . ", Relevant: " . count($relevantSessionsData) . " based on " . count($configuredMedicalCenterQueues) . " MC queues: [" . implode(', ', array_map('htmlspecialchars', $configuredMedicalCenterQueues)) . "]");
    debugLog("After filtering by configured sheet's MC queues. Relevant sessions: " . count($relevantSessionsData));
    $sessionsData = $relevantSessionsData; // Replace original with filtered
} else {
    error_log("No valid MC queues in operatorConfigData (from '{$operatorSheetName}', col B). Session list will be empty.");
    debugLog("No valid MC queues in operatorConfigData. Session list empty.");
    $sessionsData = []; 
}
// --- END: Filter sessionsData ---

?>
