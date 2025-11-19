<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>GPT Payment API - Админка</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 0; background-color: #f4f4f4; color: #333; }
        .container { width: 90%; max-width: 1200px; margin: 20px auto; background-color: #fff; padding: 20px; box-shadow: 0 0 10px rgba(0,0,0,0.1); }
        header { background-color: #333; color: #fff; padding: 10px 0; text-align: center; }
        header h1 { margin: 0; }
        nav ul { list-style-type: none; padding: 0; margin: 0; text-align: center; background-color: #444; }
        nav ul li { display: inline; }
        nav ul li a { display: inline-block; padding: 10px 20px; color: #fff; text-decoration: none; }
        nav ul li a:hover { background-color: #555; }
        .content { margin-top: 20px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #f2f2f2; }
        .form-group { margin-bottom: 15px; }
        .form-group label { display: block; margin-bottom: 5px; }
        .form-group input[type="text"], .form-group input[type="number"], .form-group input[type="password"], .form-group select {
            width: calc(100% - 22px); padding: 10px; border: 1px solid #ddd; border-radius: 4px;
        }
        .form-group input[type="submit"], button {
            background-color: #5cb85c; color: white; padding: 10px 15px; border: none; border-radius: 4px; cursor: pointer;
        }
        .form-group input[type="submit"]:hover, button:hover { background-color: #4cae4c; }
        .btn-delete { background-color: #d9534f; }
        .btn-delete:hover { background-color: #c9302c; }
        .feedback { padding: 10px; margin-bottom: 20px; border-radius: 4px; }
        .feedback.success { background-color: #dff0d8; color: #3c763d; border: 1px solid #d6e9c6; }
        .feedback.error { background-color: #f2dede; color: #a94442; border: 1px solid #ebccd1; }
    </style>
</head>
<body>
    <header>
        <h1>Админка API Оплаты ChatGPT</h1>
    </header>
    <?php if (is_logged_in()): ?>
    <nav>
        <ul>
            <li><a href="index.php?page=dashboard">Дашборд</a></li>
            <li><a href="index.php?page=partners">Партнеры</a></li>
            <li><a href="index.php?page=rates">Курсы валют</a></li>
            <li><a href="index.php?page=transactions">Транзакции</a></li>
            <li><a href="index.php?page=instructions">Инструкции</a></li>
            <li><a href="index.php?page=logout">Выход (<?php echo htmlspecialchars(get_current_admin_username() ?? ''); ?>)</a></li>
        </ul>
    </nav>
    <?php endif; ?>
    <div class="container">
        <div class="content">
