<?php
// filepath: /workspaces/allcodespaces/asterisk/download_recording.php
session_start();

if (!isset($_SESSION['authenticated']) || !$_SESSION['authenticated']) {
    header('HTTP/1.1 403 Forbidden');
    die('Доступ запрещен. Пожалуйста, войдите в систему.');
}

if (!isset($_GET['id']) || empty($_GET['id'])) {
    header('HTTP/1.1 400 Bad Request');
    die('Уникальный идентификатор звонка не указан.');
}

$uniqueIdToFind = $_GET['id'];
$callsJsonPath = __DIR__ . '/calls.json';
$downloadUrl = null;

if (!file_exists($callsJsonPath)) {
    header('HTTP/1.1 500 Internal Server Error');
    die('Файл данных о звонках (calls.json) не найден.');
}

$jsonContent = file_get_contents($callsJsonPath);
$data = json_decode($jsonContent, true);

if (json_last_error() === JSON_ERROR_NONE && isset($data['calls']) && is_array($data['calls'])) {
    foreach ($data['calls'] as $call) {
        if (isset($call['uniqueid']) && $call['uniqueid'] === $uniqueIdToFind) {
            if (isset($call['download_url']) && !empty($call['download_url'])) {
                $downloadUrl = $call['download_url'];
                break;
            }
        }
    }
} else {
    header('HTTP/1.1 500 Internal Server Error');
    die('Ошибка при чтении или обработке файла данных о звонках.');
}

if ($downloadUrl) {
    header('Location: ' . $downloadUrl);
    exit;
} else {
    header('HTTP/1.1 404 Not Found');
    die('Ссылка на скачивание записи для данного звонка не найдена.');
}
?>