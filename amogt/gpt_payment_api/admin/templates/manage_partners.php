<?php
// gpt_payment_api/admin/templates/manage_partners.php
// Предполагается, что $partnersData, $feedback_message и $feedback_type уже определены в partners.php
?>
<h2>Управление партнерами</h2>

<?php if (!empty($feedback_message)): ?>
    <div class="feedback <?php echo $feedback_type; ?>">
        <?php echo htmlspecialchars($feedback_message); ?>
    </div>
<?php endif; ?>

<h3>Добавить нового партнера</h3>
<form method="POST" action="index.php?page=partners">
    <div class="form-group">
        <label for="partner_name">Имя партнера:</label>
        <input type="text" id="partner_name" name="partner_name" required>
    </div>
    <div class="form-group">
        <label for="initial_balance">Начальный баланс (<?php echo BALANCE_CURRENCY; ?>):</label>
        <input type="number" id="initial_balance" name="initial_balance" step="0.01" min="0" required value="0.00">
    </div>
    <div class="form-group">
        <input type="submit" name="add_partner" value="Добавить партнера">
    </div>
</form>

<h3>Список партнеров</h3>
<?php if (empty($partnersData)): ?>
    <p>Партнеры еще не добавлены.</p>
<?php else: ?>
    <table>
        <thead>
            <tr>
                <th>ID</th>
                <th>Имя</th>
                <th>API Токен</th>
                <th>Баланс (<?php echo BALANCE_CURRENCY; ?>)</th>
                <th>Дата создания</th>
                <th>Действия</th>
            </tr>
        </thead>
        <tbody>
            <?php foreach ($partnersData as $partner): ?>
            <tr>
                <td><?php echo htmlspecialchars($partner['id']); ?></td>
                <td><?php echo htmlspecialchars($partner['name']); ?></td>
                <td><input type="text" value="<?php echo htmlspecialchars($partner['token']); ?>" readonly style="width: 95%;"></td>
                <td>
                    <form method="POST" action="index.php?page=partners" style="display: inline-flex; align-items: center;">
                        <input type="hidden" name="partner_id" value="<?php echo htmlspecialchars($partner['id']); ?>">
                        <input type="number" name="new_balance" value="<?php echo htmlspecialchars(number_format((float)$partner['balance'], 2, '.', '')); ?>" step="0.01" min="0" required style="width: 100px; margin-right: 5px;">
                        <input type="submit" name="update_balance" value="Обновить">
                    </form>
                </td>
                <td><?php echo htmlspecialchars($partner['created_at']); ?></td>
                <td>
                    <form method="POST" action="index.php?page=partners" style="display: inline;" onsubmit="return confirm('Вы уверены, что хотите удалить этого партнера? Это действие необратимо.');">
                        <input type="hidden" name="partner_id_to_delete" value="<?php echo htmlspecialchars($partner['id']); ?>">
                        <input type="submit" name="delete_partner" value="Удалить" class="btn-delete">
                    </form>
                </td>
            </tr>
            <?php endforeach; ?>
        </tbody>
    </table>
<?php endif; ?>
