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

// Debug function
function debugLog($message) {
    error_log("[DEBUG] " . $message);
    // Echoing to browser console can be problematic if headers are already sent or if output is not HTML.
    // Consider conditional echoing or removing it if it causes issues in non-HTML contexts.
    if (php_sapi_name() !== 'cli' && !headers_sent()) {
         // echo "<script>console.log(\"[DEBUG] " . htmlspecialchars(addslashes($message)) . "\");</script>";
    }
}

?>
