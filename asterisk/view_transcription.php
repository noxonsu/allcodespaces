<?php
// filepath: /workspaces/allcodespaces/asterisk/view_transcription.php
session_start();

if (!isset($_SESSION['authenticated']) || !$_SESSION['authenticated']) {
    header('HTTP/1.1 403 Forbidden');
    die('Доступ запрещен. Пожалуйста, войдите в систему.');
}

if (!isset($_GET['id']) || empty($_GET['id'])) {
    header('HTTP/1.1 400 Bad Request');
    die('Уникальный идентификатор звонка не указан.');
}

$uniqueId = basename($_GET['id']); // Basic sanitization
$transcriptionFilePath = __DIR__ . '/transcriptions/' . $uniqueId . '.txt';

if (file_exists($transcriptionFilePath)) {
    header('Content-Type: text/plain; charset=utf-8');
    header('Content-Disposition: inline; filename="' . $uniqueId . '.txt"');
    readfile($transcriptionFilePath);
    exit;
} else {
    header('HTTP/1.1 404 Not Found');
    die('Файл транскрипции не найден.');
}
?>