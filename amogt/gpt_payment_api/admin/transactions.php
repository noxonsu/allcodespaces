<?php
// gpt_payment_api/admin/transactions.php
if (session_status() == PHP_SESSION_NONE) {
    session_start();
}
if (!is_logged_in()) {
    header('Location: index.php?page=login');
    exit;
}

require_once __DIR__ . '/../lib/db.php';
require_once __DIR__ . '/../../logger.php';

$db = new DB();
$transactionsData = $db->read('transactions');

// Сортировка транзакций по дате (от новых к старым)
if (!empty($transactionsData)) {
    usort($transactionsData, function($a, $b) {
        return strtotime($b['timestamp']) - strtotime($a['timestamp']);
    });
}

logMessage("[GPT_ADMIN_TRANSACTIONS] Viewing transactions page. Count: " . count($transactionsData));

// Загружаем шаблон для просмотра транзакций
include __DIR__ . '/templates/view_transactions.php';
?>
