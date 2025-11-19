<?php
// gpt_payment_api/partner_portal/index.php
session_start();

require_once __DIR__ . '/../../config.php';
require_once __DIR__ . '/../../logger.php';
require_once __DIR__ . '/../lib/db.php';
require_once __DIR__ . '/../lib/partner_transaction_logger.php';
require_once __DIR__ . '/auth.php';

// Определяем текущее действие
$page = $_GET['page'] ?? 'dashboard';

// Если не авторизован и пытается получить доступ не к странице логина, редирект на логин
if (!partner_is_logged_in() && $page !== 'login') {
    header('Location: index.php?page=login');
    exit;
}

// Если авторизован и пытается зайти на страницу логина, редирект на дашборд
if (partner_is_logged_in() && $page === 'login') {
    header('Location: index.php?page=dashboard');
    exit;
}

logMessage("[PARTNER_PORTAL] Portal access. Page: {$page}, Logged in: " . (partner_is_logged_in() ? 'Yes' : 'No'));

include __DIR__ . '/templates/header.php';

switch ($page) {
    case 'login':
        include __DIR__ . '/templates/login.php';
        break;
    case 'dashboard':
        include __DIR__ . '/templates/dashboard.php';
        break;
    case 'transactions':
        include __DIR__ . '/templates/transactions.php';
        break;
    case 'api_docs':
        include __DIR__ . '/templates/api_docs.php';
        break;
    case 'api_test':
        include __DIR__ . '/templates/api_test.php';
        break;
    default:
        include __DIR__ . '/templates/dashboard.php';
        break;
}

include __DIR__ . '/templates/footer.php';
?>
