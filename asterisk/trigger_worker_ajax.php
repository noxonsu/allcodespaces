<?php

header('Content-Type: application/json');

// Define the same lock file path as used by transcribe_worker.php
if (!defined('WORKER_LOCK_FILE')) {
    define('WORKER_LOCK_FILE', __DIR__ . '/transcribe_worker.lock');
}
$workerLogFile = __DIR__ . '/transcribe_worker_launcher.log'; // For logging attempts from AJAX

$response = ['status' => 'error', 'message' => 'Unknown error.'];

try {
    $lockCheckHandle = fopen(WORKER_LOCK_FILE, 'c');

    if ($lockCheckHandle) {
        // Try to get an exclusive non-blocking lock to check if another process holds it
        if (flock($lockCheckHandle, LOCK_EX | LOCK_NB)) {
            // Lock acquired by this script, means worker is NOT running.
            // We MUST release this lock immediately so the actual worker script (when included) can acquire it.
            flock($lockCheckHandle, LOCK_UN);
            // The lock file itself is not unlinked here; transcribe_worker.php manages its own lock file.
            
            // Close this specific handle as its purpose (checking) is done.
            fclose($lockCheckHandle); 
            $lockCheckHandle = null; // Nullify to avoid accidental reuse or re-closing

            $logMessage = date('Y-m-d H:i:s') . " - AJAX: No worker running, proceeding to include transcribe_worker.php.\n";
            file_put_contents($workerLogFile, $logMessage, FILE_APPEND);
            error_log("AJAX: No worker running, proceeding to include transcribe_worker.php.");

            // Start output buffering to capture any echos from the included script
            ob_start();
            
            // Now, include and run the actual worker script.
            // It will handle its own locking, processing, and lock release.
            // This require_once call will block until transcribe_worker.php finishes its batch.
            require_once __DIR__ . '/transcribe_worker.php';
            
            $workerScriptOutput = ob_get_clean(); // Get any output from worker and clean buffer

            // Log the output from the worker script if desired
            if (!empty(trim($workerScriptOutput))) {
                $outputLogMessage = date('Y-m-d H:i:s') . " - AJAX: transcribe_worker.php output:\n" . $workerScriptOutput . "\n";
                file_put_contents($workerLogFile, $outputLogMessage, FILE_APPEND);
            }
            
            $response = ['status' => 'worker_batch_completed', 'message' => 'Transcription worker processed a batch.'];
            error_log("AJAX: transcribe_worker.php included and completed its batch processing.");

        } else {
            // Flock failed, worker is likely running (lock held by another process).
            if ($lockCheckHandle) fclose($lockCheckHandle); // Ensure handle is closed
            $logMessage = date('Y-m-d H:i:s') . " - AJAX: Worker already running (lock held by another process).\n";
            file_put_contents($workerLogFile, $logMessage, FILE_APPEND);
            error_log("AJAX: Background transcription worker appears to be running (lock held by another process).");
            $response = ['status' => 'already_running', 'message' => 'Transcription worker is already running.'];
        }
    } else {
        $errorMessage = "AJAX: Could not open/create lock file for checking: " . WORKER_LOCK_FILE;
        $logMessage = date('Y-m-d H:i:s') . " - " . $errorMessage . "\n";
        file_put_contents($workerLogFile, $logMessage, FILE_APPEND);
        error_log($errorMessage);
        $response = ['status' => 'error', 'message' => 'Could not access lock file to check worker status.'];
    }
} catch (Exception $e) {
    if (isset($lockCheckHandle) && $lockCheckHandle) fclose($lockCheckHandle); // Ensure handle is closed on exception
    $errorMessage = "AJAX: Error trying to trigger worker: " . $e->getMessage();
    $logMessage = date('Y-m-d H:i:s') . " - " . $errorMessage . "\n";
    file_put_contents($workerLogFile, $logMessage, FILE_APPEND);
    error_log($errorMessage);
    $response = ['status' => 'error', 'message' => 'Exception: ' . $e->getMessage()];
}

echo json_encode($response);
exit;

?>
