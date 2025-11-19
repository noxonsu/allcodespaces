<?php
// gpt_payment_api/admin/templates/view_transactions.php
// Предполагается, что $transactionsData уже определен в transactions.php и отсортирован
?>
<h2>Просмотр транзакций</h2>

<?php if (empty($transactionsData)): ?>
    <p>Транзакций пока нет.</p>
<?php else: ?>
    <table>
        <thead>
            <tr>
                <th>ID Транзакции</th>
                <th>ID Партнера</th>
                <th>Имя Партнера</th>
                <th>Сумма платежа</th>
                <th>Валюта платежа</th>
                <th>Списано с баланса (<?php echo BALANCE_CURRENCY; ?>)</th>
                <th>Статус</th>
                <th>Описание сервиса</th>
                <th>Сообщение об ошибке</th>
                <th>Дата и время</th>
            </tr>
        </thead>
        <tbody>
            <?php foreach ($transactionsData as $transaction): ?>
            <tr>
                <td><?php echo htmlspecialchars($transaction['id']); ?></td>
                <td><?php echo htmlspecialchars($transaction['partner_id']); ?></td>
                <td><?php echo htmlspecialchars($transaction['partner_name'] ?? 'N/A'); ?></td>
                <td><?php echo htmlspecialchars(number_format((float)($transaction['payment_amount'] ?? 0), 2, '.', '')); ?></td>
                <td><?php echo htmlspecialchars($transaction['payment_currency'] ?? ''); ?></td>
                <td><?php echo htmlspecialchars(number_format((float)($transaction['amount_deducted'] ?? 0), 2, '.', '')); ?></td>
                <td>
                    <?php
                    $status_text = htmlspecialchars($transaction['status'] ?? 'UNKNOWN');
                    $status_class = '';
                    if ($status_text === 'success') {
                        $status_class = 'feedback success';
                    } elseif ($status_text === 'failed' || $status_text === 'error' || $status_text === 'insufficient_funds') {
                        $status_class = 'feedback error';
                    }
                    echo "<span class='{$status_class}' style='padding: 2px 5px; display: inline-block;'>{$status_text}</span>";
                    ?>
                </td>
                <td><?php echo htmlspecialchars($transaction['service_details'] ?? ''); ?></td>
                <td><?php echo htmlspecialchars($transaction['error_message'] ?? ''); ?></td>
                <td><?php echo htmlspecialchars($transaction['timestamp']); ?></td>
            </tr>
            <?php endforeach; ?>
        </tbody>
    </table>
<?php endif; ?>
