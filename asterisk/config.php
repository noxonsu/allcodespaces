<?php

// Ensure Composer's autoloader is loaded
require_once __DIR__ . '/vendor/autoload.php';

// Enable error reporting -- useful for all included files
error_reporting(E_ALL);
ini_set('display_errors', 1);

// Load .env file
try {
    // This usage is correct for vlucas/phpdotenv
    $dotenv = Dotenv\Dotenv::createImmutable(__DIR__);
    $dotenv->load();
} catch (Exception $e) {
    die('Could not load .env file. Please ensure it exists and is readable. Error: ' . $e->getMessage());
}

// --- Google Sheets Configuration ---
$googleSheetId = $_ENV['GOOGLE_SHEET_ID'] ?? null;
if (!$googleSheetId) {
    die('GOOGLE_SHEET_ID is not set in your .env file.');
}

// --- ARI Configuration ---
$ariUsername = $_ENV['ARI_USERNAME'] ?? null;
$ariPassword = $_ENV['ARI_PASSWORD'] ?? null;
$ariHost = $_ENV['ARI_HOST'] ?? null;
$ariPort = $_ENV['ARI_PORT'] ?? null;

// Check ARI configuration
if (!$ariUsername || !$ariPassword || !$ariHost || !$ariPort) {
    custom_log('Warning: One or more ARI configuration values are missing from .env file.');
}

$googleCredentialsPath = __DIR__ . '/my-project-1337-458418-4b4c595d74d5.json'; // Path to your service account JSON
$operatorSheetName = 'Федоровка'; // As per your screenshot
$operatorDataRange = $operatorSheetName . '!A2:D'; // Fetch FIO, Queue, Department, Password

// --- Directories ---
$analysisDir = __DIR__ . '/analysis';
$transcriptionsDir = __DIR__ . '/transcriptions';
$commentsDir = __DIR__ . '/comments';

// Create directories if they don't exist
if (!is_dir($analysisDir)) mkdir($analysisDir, 0755, true);
if (!is_dir($transcriptionsDir)) mkdir($transcriptionsDir, 0755, true);
if (!is_dir($commentsDir)) mkdir($commentsDir, 0755, true);

// Load DEBUG setting from .env
$debug = isset($_ENV['DEBUG']) ? filter_var($_ENV['DEBUG'], FILTER_VALIDATE_BOOLEAN) : false;

function custom_log($message) {
    global $debug;
    // Log to file
    error_log($message . "\n", 3, __DIR__ . '/error.log'); // Corrected this line
    // Log to browser only if debug is true
    if ($debug) {
        echo "<div style='color: red; background: #fff; padding: 5px; margin: 5px;'>" . htmlspecialchars($message) . "</div>";
    }
}

// Debug function
function debugLog($message) {
    custom_log("[DEBUG] " . $message);
    // Echoing to browser console can be problematic if headers are already sent or if output is not HTML.
    // Consider conditional echoing or removing it if it causes issues in non-HTML contexts.
    if (php_sapi_name() !== 'cli' && !headers_sent()) {
         // echo "<script>console.log(\"[DEBUG] " . htmlspecialchars(addslashes($message)) . "\");</script>";
    }
}

?>
