<?php


// Function to display Nginx error log entries
function displayNginxErrorLog() {
    $logFilePath = 'error.log'; // Path to your Nginx log file
    if (file_exists($logFilePath)) {
        $logContent = file_get_contents($logFilePath);
        $logEntries = explode(PHP_EOL, $logContent);

        echo "<h3>Nginx Error Log:</h3>";
        echo "<pre>";
        foreach ($logEntries as $entry) {
            echo htmlspecialchars($entry) . "<br>";
        }
        echo "</pre>";
    } else {
        echo "Nginx error log file not found: " . htmlspecialchars($logFilePath);
    }
}

// Call the function to display Nginx error logs (you might want to wrap this in a conditional or place it in a specific part of your page)
displayNginxErrorLog();


?>