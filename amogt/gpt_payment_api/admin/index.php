<?php
// gpt_payment_api/admin/index.php
session_start();

require_once __DIR__ . '/../../config.php'; // Общий конфиг проекта
require_once __DIR__ . '/../../logger.php';   // Логгер
require_once __DIR__ . '/../lib/db.php';
require_once __DIR__ . '/auth.php';

// Определяем текущее действие
$page = $_GET['page'] ?? 'dashboard';

// Если не авторизован и пытается получить доступ не к странице логина, редирект на логин
if (!is_logged_in() && $page !== 'login') {
    header('Location: index.php?page=login');
    exit;
}

// Если авторизован и пытается зайти на страницу логина, редирект на дашборд
if (is_logged_in() && $page === 'login') {
    header('Location: index.php?page=dashboard');
    exit;
}

logMessage("[GPT_ADMIN] Admin page access. Page: {$page}, Logged in: " . (is_logged_in() ? 'Yes' : 'No'));

include __DIR__ . '/templates/header.php';

switch ($page) {
    case 'login':
        include __DIR__ . '/templates/login.php';
        break;
    case 'dashboard':
        include __DIR__ . '/templates/dashboard.php';
        break;
    case 'partners':
        include __DIR__ . '/partners.php';
        break;
    case 'rates':
        include __DIR__ . '/rates.php';
        break;
    case 'transactions':
        include __DIR__ . '/transactions.php';
        break;
    case 'leads':
        include __DIR__ . '/leads.php';
        break;
    case 'instructions':
        include __DIR__ . '/templates/instructions.php';
        break;
    case 'logout':
        logout();
        header('Location: index.php?page=login');
        exit;
    default:
        http_response_code(404);
        echo "<h1>404 - Страница не найдена</h1>";
        logMessage("[GPT_ADMIN] Page not found: {$page}");
        break;
}

include __DIR__ . '/templates/footer.php';
?>
