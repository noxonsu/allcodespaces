<?php
// gpt_payment_api/admin/templates/manage_rates.php
// Предполагается, что $ratesData, $feedback_message и $feedback_type уже определены в rates.php
?>
<h2>Управление курсами валют</h2>
<p>Здесь вы можете установить курсы различных валют по отношению к базовой валюте баланса (<strong><?php echo BALANCE_CURRENCY; ?></strong>).</p>
<p>Например, если базовая валюта RUB, и вы хотите установить курс USD, введите "USD" и курс "90". Это будет означать, что 1 USD = 90 RUB.</p>

<?php if (!empty($feedback_message)): ?>
    <div class="feedback <?php echo $feedback_type; ?>">
        <?php echo htmlspecialchars($feedback_message); ?>
    </div>
<?php endif; ?>

<h3>Установить/Обновить курс</h3>
<form method="POST" action="index.php?page=rates">
    <div class="form-group">
        <label for="currency_from">Код валюты (например, USD, EUR, GBP):</label>
        <input type="text" id="currency_from" name="currency_from" maxlength="3" pattern="[A-Za-z]{3}" title="Трехбуквенный код валюты" required>
    </div>
    <div class="form-group">
        <label for="rate_value">Курс к <?php echo BALANCE_CURRENCY; ?> (сколько единиц <?php echo BALANCE_CURRENCY; ?> за 1 единицу указанной валюты):</label>
        <input type="number" id="rate_value" name="rate_value" step="0.0001" min="0.0001" required>
    </div>
    <div class="form-group">
        <input type="submit" name="set_rate" value="Установить курс">
    </div>
</form>

<h3>Текущие курсы (к <?php echo BALANCE_CURRENCY; ?>)</h3>
<?php if (empty($ratesData)): ?>
    <p>Курсы валют еще не установлены.</p>
<?php else: ?>
    <table>
        <thead>
            <tr>
                <th>Валютная пара</th>
                <th>Курс (1 ИНОСТР_ВАЛЮТА = X <?php echo BALANCE_CURRENCY; ?>)</th>
                <th>Последнее обновление</th>
                <th>Действие</th>
            </tr>
        </thead>
        <tbody>
            <?php foreach ($ratesData as $pair => $details): ?>
            <tr>
                <td><?php echo htmlspecialchars($pair); ?></td>
                <td><?php echo htmlspecialchars(number_format((float)$details['rate'], 4, '.', '')); ?></td>
                <td><?php echo htmlspecialchars($details['last_updated']); ?></td>
                <td>
                    <form method="POST" action="index.php?page=rates" style="display: inline;" onsubmit="return confirm('Вы уверены, что хотите удалить этот курс?');">
                        <input type="hidden" name="currency_pair_to_delete" value="<?php echo htmlspecialchars($pair); ?>">
                        <input type="submit" name="delete_rate" value="Удалить" class="btn-delete">
                    </form>
                </td>
            </tr>
            <?php endforeach; ?>
        </tbody>
    </table>
<?php endif; ?>
