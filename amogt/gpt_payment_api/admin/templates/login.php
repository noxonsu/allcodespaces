<?php
// gpt_payment_api/admin/templates/login.php
if (session_status() == PHP_SESSION_NONE) {
    session_start(); // Убедимся, что сессия запущена для доступа к $_SESSION['login_error']
}
?>
<h2>Вход в админку</h2>

<?php
if (isset($_SESSION['login_error'])) {
    echo '<div class="feedback error">' . htmlspecialchars($_SESSION['login_error']) . '</div>';
    unset($_SESSION['login_error']); // Очищаем ошибку после отображения
}
?>

<form method="POST" action="index.php?page=login">
    <div class="form-group">
        <label for="username">Имя пользователя:</label>
        <input type="text" id="username" name="username" required>
    </div>
    <div class="form-group">
        <label for="password">Пароль:</label>
        <input type="password" id="password" name="password" required>
    </div>
    <div class="form-group">
        <input type="submit" value="Войти">
    </div>
</form>
