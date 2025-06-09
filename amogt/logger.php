<?php

ob_start();

function logMessage($message, $type = 'INFO') {
    // Check if logging is enabled
    $enableLogs = $_ENV['ENABLE_LOGS'] ?? 0;
    
    // If logging is disabled, only log errors
    if ($enableLogs == 0) {
        $isError = stripos($message, 'error') !== false || 
                   stripos($message, 'failed') !== false ||
                   stripos($message, 'exception') !== false;
        
        if (!$isError) {
            return; // Skip non-error messages
        }
    }

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
    
    // Only output to browser if dontshowlogs is not set to 1
    if (!defined('dontshowlogs') || dontshowlogs != 1) {
        // Output to browser with HTML formatting
        echo "<pre>" . htmlspecialchars($logEntry) . "</pre>\n";
        
        // Force output flush
        if (ob_get_level() > 0) {
            ob_flush();
        }
        flush();
    }
    
    return $message;
}

function logError($message) {
    logMessage($message, 'ERROR');
}

function logDebug($message) {
    logMessage($message, 'DEBUG');
}
