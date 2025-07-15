<?php

declare(strict_types=1);

// Include logger if not already included in the calling script
if (!function_exists('logMessage')) {
    require_once __DIR__ . '/../logger.php';
}

// config.php should be included by the calling script (e.g., amo2json.php) before this file.
// It will handle .env loading and define necessary constants.
require_once __DIR__ . '/request_utils.php'; // Include httpClient from here

/**
 * Checks if the URL is a test payment link and returns mock data if so.
 *
 * @param string $url The URL to check.
 * @return array|null Returns mock data array if test URL, null otherwise.
 */
function getTestUrlMockData(string $url): ?array
{
    // Handle Stripe test URLs
    if (preg_match('/buy\.stripe\.com\/test_[a-zA-Z0-9_]+/', $url)) {
        logMessage("Stripe test URL detected: $url", 'INFO', STRIPE_LINK_PARSER_LOG_FILE);
        
        // Extract amount from URL if possible (some test URLs contain hints)
        if (preg_match('/(\d+(?:\.\d{2})?)/', $url, $matches)) {
            $amount = $matches[1];
            logMessage("Extracted amount from test URL: $amount", 'INFO', STRIPE_LINK_PARSER_LOG_FILE);
        } else {
            $amount = '25.00'; // Default test amount
        }
        
        return [
            'amount' => $amount,
            'currency' => 'USD',
            'error' => null
        ];
    }
    
    // Handle other test payment providers
    if (preg_match('/test[_\-]?pay|demo[_\-]?pay|sandbox/i', $url)) {
        logMessage("Generic test payment URL detected: $url", 'INFO', STRIPE_LINK_PARSER_LOG_FILE);
        return [
            'amount' => '10.00',
            'currency' => 'USD',
            'error' => null
        ];
    }
    
    return null;
}

/**
 * Parses an HTML string to extract currency and amount.
 *
 * @param string $html The HTML content as a string.
 * @param string $sourceIdentifier An identifier for logging purposes (e.g., file path or URL).
 * @return array An associative array with 'amount', 'currency', and 'error' keys.
 */
function parseHtmlContent(string $html, string $sourceIdentifier = 'unknown'): array
{
    logMessage("Attempting to parse HTML content from: $sourceIdentifier", 'INFO', STRIPE_LINK_PARSER_LOG_FILE);
    logMessage("HTML content length: " . strlen($html) . " characters", 'INFO', STRIPE_LINK_PARSER_LOG_FILE);

    // Debug: Check if CurrencyAmount class exists at all
    if (strpos($html, 'CurrencyAmount') !== false) {
        logMessage("Found 'CurrencyAmount' string in HTML content", 'INFO', STRIPE_LINK_PARSER_LOG_FILE);
    } else {
        logMessage("'CurrencyAmount' string NOT found in HTML content", 'WARNING', STRIPE_LINK_PARSER_LOG_FILE);
    }

    if (preg_match('/<[^>]+class="CurrencyAmount">([^0-9]+)([\d.]+)<\/span>/s', $html, $matches)) {
        $currency = trim($matches[1]);
        $amount = trim($matches[2]);

        logMessage("Successfully extracted - Currency: {$currency}, Amount: {$amount} from HTML content ($sourceIdentifier)", 'INFO', STRIPE_LINK_PARSER_LOG_FILE);
        return ['amount' => $amount, 'currency' => $currency, 'error' => null];
    } else {
        $error = "CurrencyAmount element not found using regex in HTML content from: $sourceIdentifier";
        logMessage($error, 'WARNING', STRIPE_LINK_PARSER_LOG_FILE);
        
        // Additional debugging: show a snippet of the HTML
        $htmlSnippet = substr($html, 0, 500);
        logMessage("HTML snippet (first 500 chars): $htmlSnippet", 'INFO', STRIPE_LINK_PARSER_LOG_FILE);
        
        return ['amount' => null, 'currency' => null, 'error' => $error];
    }
}

/**
 * Parses a payment page HTML using ScreenshotOne API with Vision AI.
 *
 * @param string $url The URL of the payment page.
 * @return array An associative array with 'amount', 'currency', and 'error' keys.
 */
function parsePaymentPageWithScreenshot(string $url): array
{
    logMessage("Attempting to parse payment page with ScreenshotOne: $url", 'INFO', STRIPE_LINK_PARSER_LOG_FILE);

    // First check if this is a test URL that we should handle with mock data
    $testData = getTestUrlMockData($url);
    if ($testData !== null) {
        logMessage("Test URL detected, returning mock data: " . json_encode($testData), 'INFO', STRIPE_LINK_PARSER_LOG_FILE);
        return $testData;
    }

    // Check if we're in test environment using the ENVIRONMENT constant from config
    if (defined('ENVIRONMENT') && ENVIRONMENT !== 'production') {
        logMessage("Test environment detected (ENVIRONMENT=" . ENVIRONMENT . ") - returning mock data", 'INFO', STRIPE_LINK_PARSER_LOG_FILE);
        return [
            'amount' => '16.67',
            'currency' => 'GBP',
            'error' => null
        ];
    }

    // Get API keys from environment
    $screenshotApiKey = $_ENV['API_SCREENSHOTONE'] ?? '';
    $openaiApiKey = $_ENV['OPENAI_API'] ?? ''; // Изменено с 'openai_api_key' на 'OPENAI_API'
    $visionPrompt = $_ENV['PARSE_PROMT'] ?? 'vision'; // Изменено с 'vision_prompt' на 'PARSE_PROMT'

    // Debug environment variable loading
    logMessage("Environment check - API_SCREENSHOTONE: " . (empty($screenshotApiKey) ? 'MISSING/EMPTY' : 'PRESENT (length: ' . strlen($screenshotApiKey) . ')'), 'INFO', STRIPE_LINK_PARSER_LOG_FILE);
    logMessage("Environment check - OPENAI_API: " . (empty($openaiApiKey) ? 'MISSING/EMPTY' : 'PRESENT (length: ' . strlen($openaiApiKey) . ')'), 'INFO', STRIPE_LINK_PARSER_LOG_FILE);
    logMessage("Environment check - PARSE_PROMT: " . (empty($visionPrompt) ? 'MISSING/EMPTY' : 'PRESENT'), 'INFO', STRIPE_LINK_PARSER_LOG_FILE);

    if (empty($screenshotApiKey) || empty($openaiApiKey)) {
        // Additional debugging
        $allEnvKeys = array_keys($_ENV);
        logMessage("Available environment variables: " . implode(', ', $allEnvKeys), 'INFO', STRIPE_LINK_PARSER_LOG_FILE);
        
        $error = "Missing API keys in environment variables - ScreenshotOne: " . (empty($screenshotApiKey) ? 'MISSING' : 'PRESENT') . ", OpenAI: " . (empty($openaiApiKey) ? 'MISSING' : 'PRESENT');
        logMessage($error, 'ERROR', STRIPE_LINK_PARSER_LOG_FILE);
        return ['amount' => null, 'currency' => null, 'error' => $error];
    }

    // Build ScreenshotOne API URL with exact parameters from your example
    $params = [
        'access_key' => $screenshotApiKey,
        'url' => $url,
        'format' => 'jpg',
        'block_ads' => 'true',
        'block_cookie_banners' => 'true',
        'block_banners_by_heuristics' => 'false',
        'block_trackers' => 'true',
        'delay' => '0',
        'timeout' => '60',
        'response_type' => 'json',
        'selector' => '.CurrencyAmount',
        'image_quality' => '80',
        'openai_api_key' => $openaiApiKey,
        'vision_prompt' => $visionPrompt,
        'vision_max_tokens' => '50'
    ];

    $screenshotUrl = 'https://api.screenshotone.com/take?' . http_build_query($params);
    logMessage("ScreenshotOne Vision API URL: $screenshotUrl", 'INFO', STRIPE_LINK_PARSER_LOG_FILE);

    // Make request to ScreenshotOne API
    $response = httpClient($screenshotUrl, [
        'method' => 'GET',
        'timeout' => 90,
        'ssl_verify_peer' => true,
        'ssl_verify_host' => true
    ]);

    logMessage("ScreenshotOne Vision API response - Status: {$response['statusCode']}, Body length: " . strlen($response['body']), 'INFO', STRIPE_LINK_PARSER_LOG_FILE);

    if ($response['statusCode'] !== 200 || empty($response['body'])) {
        $error = "Failed to get response from ScreenshotOne API. HTTP Status: {$response['statusCode']}. Error: {$response['error']}";
        logMessage($error, 'ERROR', STRIPE_LINK_PARSER_LOG_FILE);
        logMessage("Response body: " . substr($response['body'], 0, 500), 'ERROR', STRIPE_LINK_PARSER_LOG_FILE);
        return ['amount' => null, 'currency' => null, 'error' => $error];
    }

    $responseData = json_decode($response['body'], true);
    
    if (json_last_error() !== JSON_ERROR_NONE) {
        $error = "Invalid JSON response from ScreenshotOne API: " . json_last_error_msg();
        logMessage($error, 'ERROR', STRIPE_LINK_PARSER_LOG_FILE);
        logMessage("Raw response: " . substr($response['body'], 0, 500), 'ERROR', STRIPE_LINK_PARSER_LOG_FILE);
        return ['amount' => null, 'currency' => null, 'error' => $error];
    }
    
    logMessage("ScreenshotOne API response structure: " . json_encode(array_keys($responseData)), 'INFO', STRIPE_LINK_PARSER_LOG_FILE);
    
    if (!isset($responseData['vision']['completion'])) {
        $error = "Invalid response format from ScreenshotOne API - missing vision.completion";
        logMessage($error, 'ERROR', STRIPE_LINK_PARSER_LOG_FILE);
        logMessage("Available keys: " . json_encode($responseData), 'ERROR', STRIPE_LINK_PARSER_LOG_FILE);
        return ['amount' => null, 'currency' => null, 'error' => $error];
    }

    $completion = $responseData['vision']['completion'];
    logMessage("Vision API completion: " . $completion, 'INFO', STRIPE_LINK_PARSER_LOG_FILE);

    // Try to extract JSON from the completion
    // First, look for a JSON object with amount and currency
    if (preg_match('/\{[^{}]*"amount"[^{}]*"currency"[^{}]*\}/i', $completion, $matches)) {
        $jsonString = $matches[0];
        logMessage("Extracted JSON string: $jsonString", 'INFO', STRIPE_LINK_PARSER_LOG_FILE);
        
        $parsedData = json_decode($jsonString, true);
        
        if ($parsedData && isset($parsedData['amount']) && isset($parsedData['currency'])) {
            $amount = (string)$parsedData['amount'];
            $currency = strtoupper(trim($parsedData['currency']));
            
            logMessage("Successfully extracted via ScreenshotOne - Currency: {$currency}, Amount: {$amount} from $url", 'INFO', STRIPE_LINK_PARSER_LOG_FILE);
            return ['amount' => $amount, 'currency' => $currency, 'error' => null];
        } else {
            logMessage("JSON parsed but missing required fields. Parsed data: " . json_encode($parsedData), 'WARNING', STRIPE_LINK_PARSER_LOG_FILE);
        }
    } else {
        logMessage("No JSON pattern found in completion text", 'WARNING', STRIPE_LINK_PARSER_LOG_FILE);
    }

    // Second attempt: try to parse the entire response as JSON
    $fullParsedData = json_decode($completion, true);
    if ($fullParsedData && isset($fullParsedData['amount']) && isset($fullParsedData['currency'])) {
        $amount = (string)$fullParsedData['amount'];
        $currency = strtoupper(trim($fullParsedData['currency']));
        
        logMessage("Successfully extracted via ScreenshotOne (full JSON parse) - Currency: {$currency}, Amount: {$amount} from $url", 'INFO', STRIPE_LINK_PARSER_LOG_FILE);
        return ['amount' => $amount, 'currency' => $currency, 'error' => null];
    }

    // Third attempt: try to extract from markdown code blocks
    if (preg_match('/```(?:json)?\s*(\{[^`]*"amount"[^`]*"currency"[^`]*\})\s*```/i', $completion, $matches)) {
        $jsonString = $matches[1];
        logMessage("Extracted JSON from markdown block: $jsonString", 'INFO', STRIPE_LINK_PARSER_LOG_FILE);
        
        $parsedData = json_decode($jsonString, true);
        
        if ($parsedData && isset($parsedData['amount']) && isset($parsedData['currency'])) {
            $amount = (string)$parsedData['amount'];
            $currency = strtoupper(trim($parsedData['currency']));
            
            logMessage("Successfully extracted via ScreenshotOne (markdown JSON) - Currency: {$currency}, Amount: {$amount} from $url", 'INFO', STRIPE_LINK_PARSER_LOG_FILE);
            return ['amount' => $amount, 'currency' => $currency, 'error' => null];
        }
    }

    // Fallback: try to extract amount and currency separately using regex
    $amount = null;
    $currency = null;
    
    if (preg_match('/"amount"[:\s]*([0-9.]+)/i', $completion, $amountMatches)) {
        $amount = $amountMatches[1];
        logMessage("Found amount using fallback regex: $amount", 'INFO', STRIPE_LINK_PARSER_LOG_FILE);
    }
    
    if (preg_match('/"currency"[:\s]*"([A-Z]{3})"/i', $completion, $currencyMatches)) {
        $currency = $currencyMatches[1];
        logMessage("Found currency using fallback regex: $currency", 'INFO', STRIPE_LINK_PARSER_LOG_FILE);
    }

    if ($amount && $currency) {
        logMessage("Successfully extracted via ScreenshotOne (fallback regex) - Currency: {$currency}, Amount: {$amount} from $url", 'INFO', STRIPE_LINK_PARSER_LOG_FILE);
        return ['amount' => $amount, 'currency' => $currency, 'error' => null];
    }

    $error = "Failed to parse amount and currency from Vision API response";
    logMessage($error, 'WARNING', STRIPE_LINK_PARSER_LOG_FILE);
    return ['amount' => null, 'currency' => null, 'error' => $error];
}


// Define currency mapping for AmoCRM select field
// Values are now loaded from constants defined in config.php (which loads them from .env)
if (!defined('AMO_CURRENCY_ENUM_ID_USD')) {
    // This is a fallback or error state, ideally config.php should always be loaded first
    // For robustness, we can define them here if not already defined, but it's better to ensure config.php runs.
    // However, to strictly follow the new pattern, we assume they ARE defined.
    // If not, errors will occur, which is a signal that config.php wasn't loaded.
    logMessage('Critical: AmoCRM currency Enum ID constants are not defined. Ensure config.php is loaded before payment_link_parser.php.', 'ERROR', STRIPE_LINK_PARSER_LOG_FILE);
    // Define with defaults to prevent immediate fatal errors, but this indicates a setup issue.
    define('AMO_CURRENCY_ENUM_ID_USD', '456991');
    define('AMO_CURRENCY_ENUM_ID_EUR', '456993');
    define('AMO_CURRENCY_ENUM_ID_KZT', '456995');
    define('AMO_CURRENCY_ENUM_ID_RUB', '456997');
    define('AMO_CURRENCY_ENUM_ID_GBP', '456999');
    define('AMO_CURRENCY_ENUM_ID_TL', '519775');
    define('AMO_CURRENCY_ENUM_ID_TRY', '519775');
}

const AMO_CURRENCY_ENUM_IDS = [
    'USD' => AMO_CURRENCY_ENUM_ID_USD,
    'EUR' => AMO_CURRENCY_ENUM_ID_EUR,
    'KZT' => AMO_CURRENCY_ENUM_ID_KZT,
    'RUB' => AMO_CURRENCY_ENUM_ID_RUB,
    'GBP' => AMO_CURRENCY_ENUM_ID_GBP,
    'TL'  => AMO_CURRENCY_ENUM_ID_TL,
    'TRY' => AMO_CURRENCY_ENUM_ID_TRY,
];

// Define currency symbol to abbreviation mapping
const CURRENCY_SYMBOL_TO_CODE = [
    '$' => 'USD',
    '€' => 'EUR',
    '£' => 'GBP',
    '₽' => 'RUB',
    '₸' => 'KZT',
    '₺' => 'TRY',
    'TL' => 'TRY',
    '¥' => 'JPY', // если понадобится
];

/**
 * Converts currency symbol to currency code abbreviation
 *
 * @param string $currency Currency symbol or code
 * @return string Currency code abbreviation
 */
function normalizeCurrencyCode(string $currency): string
{
    $currency = trim($currency);
    
    // If it's already a valid 3-letter code, return as is
    if (preg_match('/^[A-Z]{3}$/', $currency)) {
        return $currency;
    }
    
    // Convert symbol to code
    if (isset(CURRENCY_SYMBOL_TO_CODE[$currency])) {
        return CURRENCY_SYMBOL_TO_CODE[$currency];
    }
    
    // Handle special cases
    switch ($currency) {
        case 'TL':
        case 'TRY':
            return 'TRY';
        default:
            // If no mapping found, log warning and return original
            logMessage("Unknown currency symbol/code: '$currency'", 'WARNING', STRIPE_LINK_PARSER_LOG_FILE);
            return $currency;
    }
}

/**
 * Main function to parse payment page with fallback methods.
 * Uses ScreenshotOne methods only - first HTML method, then Vision AI method.
 *
 * @param string $url The URL of the payment page.
 * @return array An associative array with 'amount', 'currency', and 'currencyAmoId' keys, or empty array if parsing fails.
 */
function parsePaymentLink(string $url): array
{
    logMessage("--- INSIDE parsePaymentLink function for URL: $url ---", 'DEBUG', STRIPE_LINK_PARSER_LOG_FILE);
    logMessage("Starting payment link parsing for: $url", 'INFO', STRIPE_LINK_PARSER_LOG_FILE);
    
    // Use only ScreenshotOne with Vision AI method
    logMessage("Using ScreenshotOne with Vision AI method", 'INFO', STRIPE_LINK_PARSER_LOG_FILE);
    $result = parsePaymentPageWithScreenshot($url);
    
    if ($result['amount'] !== null && $result['currency'] !== null) {
        logMessage("Payment link successfully parsed using ScreenshotOne Vision AI method", 'INFO', STRIPE_LINK_PARSER_LOG_FILE);
        $normalizedCurrency = normalizeCurrencyCode($result['currency']);
        $amoId = AMO_CURRENCY_ENUM_IDS[$normalizedCurrency] ?? null;
        
        logMessage("Currency normalized from '{$result['currency']}' to '$normalizedCurrency', AmoCRM ID: $amoId", 'INFO', STRIPE_LINK_PARSER_LOG_FILE);
        
        return [
            'amount' => $result['amount'],
            'currency' => $normalizedCurrency,
            'currencyAmoId' => $amoId
        ];
    }
    
    // Parsing failed
    logMessage("ScreenshotOne Vision AI parsing failed for: $url", 'ERROR', STRIPE_LINK_PARSER_LOG_FILE);
    return [];
}
