<?php
// gpt_payment_api/admin/templates/dashboard.php
if (session_status() == PHP_SESSION_NONE) {
    session_start();
}
if (!is_logged_in()) {
    header('Location: index.php?page=login');
    exit;
}
require_once __DIR__ . '/../../lib/db.php'; // Путь к DB классу

$db = new DB();
$partners = $db->read('partners');
$transactions = $db->read('transactions');
$rates = $db->read('exchange_rates');

$total_partners = count($partners);
$total_transactions = count($transactions);
$total_rates = count($rates);

// Пример расчета общего баланса всех партнеров (если это нужно)
$total_system_balance = 0;
foreach ($partners as $partner) {
    $total_system_balance += (float)($partner['balance'] ?? 0);
}

logMessage("[GPT_ADMIN_DASHBOARD] Dashboard loaded. Partners: {$total_partners}, Transactions: {$total_transactions}, Rates: {$total_rates}");
?>

<h2>Дашборд</h2>
<p>Добро пожаловать в админ-панель API Оплаты ChatGPT, <strong><?php echo htmlspecialchars(get_current_admin_username() ?? 'Администратор'); ?></strong>!</p>

<div style="display: flex; justify-content: space-around; margin-bottom: 20px;">
    <div style="border: 1px solid #ccc; padding: 15px; text-align: center; width: 30%;">
        <h3>Партнеры</h3>
        <p style="font-size: 2em;"><?php echo $total_partners; ?></p>
        <a href="index.php?page=partners">Управление партнерами</a>
    </div>
    <div style="border: 1px solid #ccc; padding: 15px; text-align: center; width: 30%;">
        <h3>Транзакции</h3>
        <p style="font-size: 2em;"><?php echo $total_transactions; ?></p>
        <a href="index.php?page=transactions">Просмотр транзакций</a>
    </div>
    <div style="border: 1px solid #ccc; padding: 15px; text-align: center; width: 30%;">
        <h3>Курсы валют</h3>
        <p style="font-size: 2em;"><?php echo $total_rates; ?></p>
        <a href="index.php?page=rates">Управление курсами</a>
    </div>
</div>

<h3>Сводка</h3>
<ul>
    <li>Общий баланс всех партнеров: <strong><?php echo number_format($total_system_balance, 2, '.', ' '); ?> <?php echo BALANCE_CURRENCY; ?></strong></li>
    <!-- Здесь можно добавить другую сводную информацию -->
</ul>
