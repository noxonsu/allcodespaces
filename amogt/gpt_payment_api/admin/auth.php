<?php
// gpt_payment_api/admin/auth.php

if (session_status() == PHP_SESSION_NONE) {
    session_start();
}

require_once __DIR__ . '/../../config.php'; // Для доступа к ADMIN_USERNAME и ADMIN_PASSWORD
require_once __DIR__ . '/../../logger.php';

// Загрузка учетных данных администратора из .env, если они там определены
// Предполагается, что config.php уже загрузил переменные окружения
$admin_username = getenv('GPT_ADMIN_USERNAME') ?: 'admin';
$admin_password_hash = getenv('GPT_ADMIN_PASSWORD_HASH') ?: password_hash('superadmin', PASSWORD_DEFAULT); // Хэш пароля по умолчанию 'superadmin'

function attempt_login(string $username, string $password): bool {
    global $admin_username, $admin_password_hash;
    logMessage("[GPT_ADMIN_AUTH] Attempting login for user: {$username}");
    if ($username === $admin_username && password_verify($password, $admin_password_hash)) {
        $_SESSION['gpt_admin_logged_in'] = true;
        $_SESSION['gpt_admin_username'] = $username;
        logMessage("[GPT_ADMIN_AUTH] Login successful for user: {$username}");
        return true;
    }
    logMessage("[GPT_ADMIN_AUTH] Login failed for user: {$username}");
    return false;
}

function is_logged_in(): bool {
    return isset($_SESSION['gpt_admin_logged_in']) && $_SESSION['gpt_admin_logged_in'] === true;
}

function logout(): void {
    logMessage("[GPT_ADMIN_AUTH] User logged out: " . ($_SESSION['gpt_admin_username'] ?? 'Unknown'));
    $_SESSION = array();
    if (ini_get("session.use_cookies")) {
        $params = session_get_cookie_params();
        setcookie(session_name(), '', time() - 42000,
            $params["path"], $params["domain"],
            $params["secure"], $params["httponly"]
        );
    }
    session_destroy();
}

function get_current_admin_username(): ?string {
    return $_SESSION['gpt_admin_username'] ?? null;
}

// Обработка POST запроса на логин
if ($_SERVER["REQUEST_METHOD"] == "POST" && isset($_POST['username']) && isset($_POST['password']) && (basename($_SERVER['PHP_SELF']) == 'index.php' && ($_GET['page'] ?? '') == 'login')) {
    $username = trim($_POST['username']);
    $password = $_POST['password'];
    if (attempt_login($username, $password)) {
        header("Location: index.php?page=dashboard"); // Редирект на дашборд после успешного логина
        exit;
    } else {
        // Устанавливаем сообщение об ошибке, которое можно будет показать на странице логина
        $_SESSION['login_error'] = "Неверное имя пользователя или пароль.";
        logMessage("[GPT_ADMIN_AUTH] Login attempt failed, setting error message.");
        // Остаемся на странице логина (или редирект обратно, если это отдельный обработчик)
        // В данном случае, так как это включаемый файл, index.php продолжит выполнение и покажет login.php
    }
}
?>
