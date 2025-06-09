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
 * Handles both JSON array format and line-by-line format for backwards compatibility (for specific 'dealId' structures).
 * For generic JSON, it expects an array of objects.
 * @param string $filePath Path to the data file.
 * @return array The array of objects or an empty array on failure/if file not found.
 */
function loadDataFromFile(string $filePath): array {
    if (!file_exists($filePath) || !is_readable($filePath)) {
        logMessage("Data file not found or not readable: $filePath");
        return [];
    }
    $fileContent = file_get_contents($filePath);
    if ($fileContent === false) {
        logMessage("Failed to read data file: $filePath");
        return [];
    }
    
    // Try to decode as JSON first
    $data = json_decode($fileContent, true);
    if (json_last_error() === JSON_ERROR_NONE && is_array($data)) {
        // JSON format - ensure it's an array of items (potentially objects)
        $normalizedItems = [];
        foreach ($data as $item) {
            if (is_string($item) || is_numeric($item)) {
                // Simple ID format (likely from old line-by-line format if it somehow got into JSON)
                // This part is specific to the 'dealId' structure of amo2json.
                // For generic partner leads, we'd expect objects.
                $normalizedItems[] = [
                    'dealId' => (string)$item, // Assuming this structure for backward compatibility
                    'paymentUrl' => null,
                    'created_at' => null,
                    'last_updated' => null
                ];
            } elseif (is_array($item)) {
                // Object format, preserve all fields
                $normalizedItem = $item; // Copy all existing fields
                
                // The following is specific to 'dealId' structure from amo2json.
                // For generic partner leads, these specific field checks might not apply
                // or would be different.
                if (isset($item['dealId'])) {
                    $normalizedItem['dealId'] = (string)$item['dealId'];
                }
                // Ensure standard fields have default nulls if not present,
                // but don't overwrite if they are already there with a different value (e.g. false)
                if (!array_key_exists('paymentUrl', $normalizedItem) && isset($item['dealId'])) {
                    $normalizedItem['paymentUrl'] = null;
                }
                if (!array_key_exists('created_at', $normalizedItem)) {
                    $normalizedItem['created_at'] = date('Y-m-d H:i:s'); // Default to now if not present
                }
                if (!array_key_exists('last_updated', $normalizedItem)) {
                    $normalizedItem['last_updated'] = date('Y-m-d H:i:s'); // Default to now if not present
                }
                $normalizedItems[] = $normalizedItem;
            }
        }
        return $normalizedItems;
    }
    
    // Not valid JSON, try line-by-line format (specific to old amo2json dealId list)
    $lines = explode("\n", trim($fileContent));
    $items = [];
    foreach ($lines as $line) {
        $line = trim($line);
        if (!empty($line)) {
            // This structure is specific to 'dealId' list
            $items[] = [
                'dealId' => $line,
                'paymentUrl' => null,
                'created_at' => date('Y-m-d H:i:s'),
                'last_updated' => date('Y-m-d H:i:s')
            ];
        }
    }
    
    if (!empty($items)) {
        logMessage("Loaded " . count($items) . " items from line-by-line format from $filePath. Converting to JSON format.");
        // Save in JSON format for future use
        saveDataToFile($filePath, $items); // Use the generic saveDataToFile
    }
    
    return $items;
}

/**
 * Saves data to a JSON file.
 * @param string $filePath Path to the JSON file.
 * @param array $dataToSave The array of objects to save.
 * @return bool True on success, false on failure.
 */
function saveDataToFile(string $filePath, array $dataToSave): bool {
    $jsonData = json_encode($dataToSave, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    if ($jsonData === false) {
        logMessage("Failed to encode data to JSON for $filePath. Error: " . json_last_error_msg());
        return false;
    }
    if (file_put_contents($filePath, $jsonData, LOCK_EX) === false) {
        logMessage("Failed to write data to file: $filePath");
        return false;
    }
    return true;
}

?>
