<?php
// Assumes config.php (for $commentsDir) is included.
// Access global config variables
global $commentsDir;

function getUniqueValues($array, $key) {
    $values = [];
    foreach ($array as $item) {
        if (isset($item[$key]) && !empty(trim($item[$key])) && !in_array(trim($item[$key]), $values)) {
            $values[] = trim($item[$key]);
        }
    }
    sort($values);
    return $values;
}

function formatDuration($seconds) {
    $min = floor($seconds / 60);
    $sec = $seconds % 60;
    return sprintf('%02d:%02d', $min, $sec);
}

function getComment($sessionIdGenerated, $currentCommentsDir) {
    $commentFilePath = $currentCommentsDir . '/' . $sessionIdGenerated . '.txt';
    if (file_exists($commentFilePath) && filesize($commentFilePath) > 0) {
        return htmlspecialchars(file_get_contents($commentFilePath));
    }
    return 'Нет комментария.';
}
?>
