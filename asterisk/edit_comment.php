<?php
session_start();
// Basic security check - ensure user is authenticated if your main page has auth
if (!isset($_SESSION['authenticated']) || !$_SESSION['authenticated']) {
    die("Доступ запрещен. Пожалуйста, войдите в систему.");
}

error_reporting(E_ALL);
ini_set('display_errors', 1);

$commentsDir = __DIR__ . '/comments';
if (!is_dir($commentsDir)) {
    mkdir($commentsDir, 0755, true);
}

$sessionIdGenerated = isset($_GET['session_id']) ? basename($_GET['session_id']) : null; // Sanitize: basename
$callerNumber = isset($_GET['caller_number']) ? htmlspecialchars($_GET['caller_number']) : 'Неизвестный номер';
$message = '';
$commentContent = '';

if (!$sessionIdGenerated) {
    die("Ошибка: ID сессии не указан.");
}

// Validate session_id format to prevent directory traversal or invalid characters
// A simple check: allow alphanumeric, underscores, hyphens, dots, and plus sign. Adjust if your IDs are different.
if (!preg_match('/^[a-zA-Z0-9_.\-\+]+$/', $sessionIdGenerated)) {
    die("Ошибка: Недопустимый формат ID сессии. Получено: " . htmlspecialchars($sessionIdGenerated));
}

$commentFilePath = $commentsDir . '/' . $sessionIdGenerated . '.txt';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (isset($_POST['comment'])) {
        $newComment = $_POST['comment'];
        if (file_put_contents($commentFilePath, $newComment) !== false) {
            $message = "Комментарий успешно сохранен!";
            $commentContent = $newComment;
        } else {
            $message = "Ошибка при сохранении комментария.";
            custom_log("Failed to write comment to: " . $commentFilePath);
        }
    }
}

if (file_exists($commentFilePath)) {
    $commentContent = file_get_contents($commentFilePath);
}

?>
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <title>Редактировать комментарий</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background-color: #f4f4f4; }
        .container { background-color: #fff; padding: 20px; border-radius: 5px; box-shadow: 0 0 10px rgba(0,0,0,0.1); }
        h1 { color: #333; }
        textarea { width: 98%; min-height: 150px; padding: 10px; border: 1px solid #ddd; border-radius: 4px; margin-bottom: 10px; }
        button { padding: 10px 20px; background-color: #5cb85c; color: white; border: none; border-radius: 4px; cursor: pointer; }
        button:hover { background-color: #4cae4c; }
        .message { padding: 10px; margin-bottom: 15px; border-radius: 4px; }
        .success { background-color: #dff0d8; color: #3c763d; border: 1px solid #d6e9c6; }
        .error { background-color: #f2dede; color: #a94442; border: 1px solid #ebccd1; }
        .info { margin-bottom: 15px; font-size: 0.9em; color: #555; }
    </style>
</head>
<body>
    <div class="container">
        <h1>Редактировать комментарий</h1>
        <div class="info">
            <strong>ID Сессии:</strong> <?php echo htmlspecialchars($sessionIdGenerated); ?><br>
            <strong>Номер звонящего:</strong> <?php echo htmlspecialchars($callerNumber); ?>
        </div>

        <?php if ($message): ?>
            <div class="message <?php echo (strpos($message, 'успешно') !== false) ? 'success' : 'error'; ?>">
                <?php echo htmlspecialchars($message); ?>
            </div>
        <?php endif; ?>

        <form method="POST" action="">
            <textarea name="comment" placeholder="Введите ваш комментарий..."><?php echo htmlspecialchars($commentContent); ?></textarea><br>
            <button type="submit">Сохранить комментарий</button>
        </form>
        <br>
        <button onclick="window.close();">Закрыть</button>
    </div>
</body>
</html>
