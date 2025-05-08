<?php

ob_start();

function logMessage($message, $type = 'INFO') {
    $logFile = __DIR__ . '/logs/app.log';
    $logDir = dirname($logFile);

    // Create logs directory if it doesn't exist
    if (!file_exists($logDir)) {
        mkdir($logDir, 0777, true);
    }

    $dateTime = date('Y-m-d H:i:s');
    $logEntry = "[$dateTime][$type] $message" . PHP_EOL;
    
    error_log($logEntry);
    file_put_contents($logFile, $logEntry, FILE_APPEND);
    
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
