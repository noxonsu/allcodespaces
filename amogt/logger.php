<?php

ob_start();

// Подключаем config.php, чтобы LOGS_DIR был доступен
if (!defined('CONFIG_LOADED')) {
    require_once __DIR__ . '/config.php';
}

function logMessage($message, $type = 'INFO', $logFile = null) {
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

    // Determine script name from debug backtrace
    $scriptName = 'unknown';
    $backtrace = debug_backtrace(DEBUG_BACKTRACE_IGNORE_ARGS, 2);
    if (isset($backtrace[1]['file'])) {
        $scriptName = basename($backtrace[1]['file'], '.php');
    } elseif (isset($backtrace[0]['file'])) {
        $scriptName = basename($backtrace[0]['file'], '.php');
    }
    
    // Determine log file: use provided logFile, then SCRIPT_LOG_FILE if defined, otherwise default to app.log in LOGS_DIR
    $logFilename = $logFile ?? (defined('SCRIPT_LOG_FILE') ? SCRIPT_LOG_FILE : LOGS_DIR . '/app.log'); // Используем LOGS_DIR
    
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
    $logEntry = "[$dateTime][$type][$scriptName] $message" . PHP_EOL;
    
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

function logError($message, $logFile = null) {
    logMessage($message, 'ERROR', $logFile);
}

function logDebug($message, $logFile = null) {
    logMessage($message, 'DEBUG', $logFile);
}
