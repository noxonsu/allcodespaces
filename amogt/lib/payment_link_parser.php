<?php

declare(strict_types=1);

// Include logger if not already included in the calling script
if (!function_exists('logMessage')) {
    require_once __DIR__ . '/../logger.php';
}

/**
 * Parses a payment page HTML to extract currency and amount.
 *
 * @param string $url The URL of the payment page.
 * @return array An associative array with 'amount', 'currency', and 'error' keys.
 *               'amount' and 'currency' will be null if parsing fails. 'error' will contain a message on failure.
 */
function parsePaymentPage(string $url): array
{
    logMessage("Attempting to parse payment page: $url", 'INFO', AMO2JSON_SCRIPT_LOG_FILE); // Using AMO2JSON_SCRIPT_LOG_FILE for consistency

    // For local debugging, you can use file_get_contents($filePath)
    // For production, use cURL for external URLs
    $html = @file_get_contents($url); // Using @ to suppress warnings, will check return value

    if ($html === false) {
        $error = "Failed to load content from URL: $url";
        logMessage($error, 'ERROR', AMO2JSON_SCRIPT_LOG_FILE);
        return ['amount' => null, 'currency' => null, 'error' => $error];
    }

    // Use the provided regex to find the CurrencyAmount span content
    // This regex accounts for potential whitespace and other attributes within the span tag
    if (preg_match('/<[^>]+class="CurrencyAmount">([^0-9]+)([\d.]+)<\/span>/s', $html, $matches)) {
        $currency = trim($matches[1]);
        $amount = trim($matches[2]);

        logMessage("Successfully extracted - Currency: {$currency}, Amount: {$amount} from $url", 'INFO', AMO2JSON_SCRIPT_LOG_FILE);
        return ['amount' => $amount, 'currency' => $currency, 'error' => null];
    } else {
        $error = "CurrencyAmount element not found using regex on page: $url";
        logMessage($error, 'WARNING', AMO2JSON_SCRIPT_LOG_FILE);
        return ['amount' => null, 'currency' => null, 'error' => $error];
    }
}

// Define currency mapping for AmoCRM select field
const AMO_CURRENCY_ENUM_IDS = [
    'USD' => 456991,
    'EUR' => 456993,
    'KZT' => 456995,
    'RUB' => 456997,
    'GBP' => 456999,
    'TL' => 519775,
];

?>
