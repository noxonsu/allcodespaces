<?php

ob_start();

function logMessage($message, $type = 'INFO') {
    // Determine log file: use SCRIPT_LOG_FILE if defined, otherwise default to app.log
    $logFilename = defined('SCRIPT_LOG_FILE') ? SCRIPT_LOG_FILE : __DIR__ . '/logs/app.log';
    
    $logDir = dirname($logFilename);

    // Create logs directory if it doesn't exist
    if (!file_exists($logDir)) {
        // Attempt to create the directory recursively
        if (!mkdir($logDir, 0777, true) && !is_dir($logDir)) {
            // Fallback or error if directory creation fails
            // For now, we'll let file_put_contents fail if dir is not writable/creatable
            // but ideally, this should be handled more robustly.
            error_log("Failed to create log directory: $logDir"); // Log this specific error to default error log
        }
    }

    $dateTime = date('Y-m-d H:i:s');
    $logEntry = "[$dateTime][$type] $message" . PHP_EOL;
    
    error_log($logEntry); // Continues to log to the general PHP error log as well
    file_put_contents($logFilename, $logEntry, FILE_APPEND);
    
    // Output to browser with HTML formatting
    echo "<pre>" . htmlspecialchars($logEntry) . "</pre>\n";
    
    // Force output flush
    if (ob_get_level() > 0) {
        ob_flush();
    }
    flush();
    
    return $message;
}

function logError($message) {
    logMessage($message, 'ERROR');
}

function logDebug($message) {
    logMessage($message, 'DEBUG');
}
