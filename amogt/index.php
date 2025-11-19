<?php // filepath: /workspaces/allcodespaces/amogt/index.php
#!/usr/bin/env php



declare(strict_types=1);

set_time_limit(35); // No time limit for script execution
// Show all errors for development
error_reporting(E_ALL);
ini_set('display_errors', '1');

//prevent double run
if (file_exists(__DIR__ . '/lockfile')) {
    echo "Script is already running.\n";
    exit(1);
}
file_put_contents(__DIR__ . '/lockfile', getmypid());

// Register shutdown function to remove lockfile
register_shutdown_function(function () {
    if (file_exists(__DIR__ . '/lockfile')) {
        unlink(__DIR__ . '/lockfile');
    }
});


// Set a default timezone if not set in php.ini
if (!ini_get('date.timezone')) {
    date_default_timezone_set('UTC'); // Or your preferred timezone
}

// Assume these files are in the same directory or adjust paths accordingly
require_once __DIR__ . '/logger.php'; // Add this line before other requires
require_once __DIR__ . '/config.php'; // Defines constants like AMO_DOMAIN, AMO_INTEGRATION_ID, etc.
require_once __DIR__ . '/lib/amo_auth_utils.php'; // New include for AmoCRM auth functions

function main(): void
{
    logMessage('[Main] Initial value of config.DEFAULT_SHEET_NAME: "' . (defined('DEFAULT_SHEET_NAME') ? DEFAULT_SHEET_NAME : 'NOT SET') . '"');
    
    logMessage("--- [Main] Starting execution at " . date('c') . " ---");
    
    logMessage("--- [Main] Execution finished at " . date('c') . " ---");
}

try {
    main();
} catch (Throwable $e) { // Catch Throwable to include Errors as well in PHP 7+
    logMessage('[Main] Critical error in main execution: ' . $e->getMessage() . PHP_EOL . $e->getTraceAsString());
    exit(1);
}

?>
