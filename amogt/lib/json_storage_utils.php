<?php

if (!function_exists('logMessage')) {
    // Attempt to include a logger if available from a common location
    // This path might need adjustment based on your project structure
    if (file_exists(__DIR__ . '/../logger.php')) {
        require_once __DIR__ . '/../logger.php';
    } elseif (file_exists(__DIR__ . '/../../logger.php')) { // If lib is one level deeper
        require_once __DIR__ . '/../../logger.php';
    } else {
        // Fallback basic logger if no external logger is found
        function logMessage(string $message, string $level = 'INFO', ?string $filename = null) {
            $formattedMessage = date('[Y-m-d H:i:s]') . " [$level] " . $message . PHP_EOL;
            // In a real scenario, you'd write this to a configured log file.
            // For now, let's use error_log as a simple default if no file is given.
            if ($filename) {
                 error_log($formattedMessage, 3, $filename);
            } else {
                 error_log($formattedMessage);
            }
        }
        logMessage("Warning: Main logger.php not found, using fallback basic logger in json_storage_utils.php.");
    }
}

/**
 * Loads data from a JSON file.
 * @param string $filePath Path to the JSON file.
 * @return array The decoded JSON data as an array, or an empty array on failure/if file not found or invalid JSON.
 */
function loadDataFromFile(string $filePath): array {
    if (!file_exists($filePath) || !is_readable($filePath)) {
        // logMessage("Data file not found or not readable: $filePath", 'DEBUG'); // Too verbose for non-critical files
        return [];
    }
    $fileContent = file_get_contents($filePath);
    if ($fileContent === false) {
        logMessage("Failed to read data file: $filePath", 'ERROR');
        return [];
    }
    
    $data = json_decode($fileContent, true);
    if (json_last_error() !== JSON_ERROR_NONE) {
        logMessage("Invalid JSON format in file: $filePath. Error: " . json_last_error_msg(), 'ERROR');
        return [];
    }
    
    return is_array($data) ? $data : [];
}

/**
 * Saves data to a JSON file.
 * @param string $filePath Path to the JSON file.
 * @param array $dataToSave The array to encode and save as JSON.
 * @return bool True on success, false on failure.
 */
function saveDataToFile(string $filePath, array $dataToSave): bool {
    $jsonData = json_encode($dataToSave, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    if ($jsonData === false) {
        logMessage("Failed to encode data to JSON for $filePath. Error: " . json_last_error_msg(), 'ERROR');
        return false;
    }
    // Ensure directory exists before writing
    $dir = dirname($filePath);
    if (!is_dir($dir)) {
        if (!mkdir($dir, 0775, true)) {
            logMessage("Failed to create directory for file: $dir", 'ERROR');
            return false;
        }
    }
    if (file_put_contents($filePath, $jsonData, LOCK_EX) === false) {
        logMessage("Failed to write data to file: $filePath", 'ERROR');
        return false;
    }
    return true;
}

/**
 * Loads data from a line-delimited text file.
 * @param string $filePath Path to the text file.
 * @return array An array of lines, or an empty array on failure/if file not found.
 */
function loadLineDelimitedFile(string $filePath): array {
    if (!file_exists($filePath) || !is_readable($filePath)) {
        // logMessage("Line-delimited file not found or not readable: $filePath", 'DEBUG');
        return [];
    }
    $lines = file($filePath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    if ($lines === false) {
        logMessage("Failed to read line-delimited file: $filePath", 'ERROR');
        return [];
    }
    return $lines;
}

/**
 * Saves an array of strings to a line-delimited text file.
 * @param string $filePath Path to the text file.
 * @param array $linesToSave An array of strings, each representing a line.
 * @return bool True on success, false on failure.
 */
function saveLineDelimitedFile(string $filePath, array $linesToSave): bool {
    $content = implode(PHP_EOL, $linesToSave) . PHP_EOL;
    // Ensure directory exists before writing
    $dir = dirname($filePath);
    if (!is_dir($dir)) {
        if (!mkdir($dir, 0775, true)) {
            logMessage("Failed to create directory for file: $dir", 'ERROR');
            return false;
        }
    }
    if (file_put_contents($filePath, $content, LOCK_EX) === false) {
        logMessage("Failed to write data to line-delimited file: $filePath", 'ERROR');
        return false;
    }
    return true;
}

?>
