<?php
$currentPartner = get_current_partner();
if (!$currentPartner) {
    header('Location: index.php?page=login');
    exit;
}

// Параметры фильтрации
$limit = isset($_GET['limit']) ? min(max((int)$_GET['limit'], 1), 1000) : 50;
$status_filter = $_GET['status'] ?? '';

try {
    $allTransactions = PartnerTransactionLogger::getPartnerTransactions($currentPartner['id'], 1000);
    
    // Фильтрация по статусу
    if ($status_filter && $status_filter !== 'all') {
        $allTransactions = array_filter($allTransactions, function($txn) use ($status_filter) {
            return $txn['status'] === $status_filter;
        });
    }
    
    // Применяем лимит
    $transactions = array_slice($allTransactions, 0, $limit);
    $stats = PartnerTransactionLogger::getPartnerStats($currentPartner['id']);
} catch (Exception $e) {
    $error = "Ошибка загрузки транзакций: " . $e->getMessage();
    $transactions = [];
    $allTransactions = [];
    $stats = [];
}

$statusOptions = [
    'all' => 'Все статусы',
    'charged' => 'Списано',
    'completed' => 'Выполнено',
    'failed' => 'Ошибка',
    'pending' => 'В ожидании'
];
?>

<div class="d-flex justify-content-between flex-wrap flex-md-nowrap align-items-center pt-3 pb-2 mb-3 border-bottom">
    <h1 class="h2">Мои транзакции</h1>
    <div class="btn-toolbar mb-2 mb-md-0">
        <div class="btn-group mr-2">
            <button type="button" class="btn btn-sm btn-outline-secondary" onclick="location.reload()">
                <i class="fas fa-sync"></i> Обновить
            </button>
        </div>
    </div>
</div>

<?php if (isset($error)): ?>
    <div class="alert alert-danger">
        <i class="fas fa-exclamation-triangle"></i> <?= htmlspecialchars($error) ?>
    </div>
<?php endif; ?>

<!-- Фильтры -->
<div class="row mb-3">
    <div class="col-12">
        <div class="card">
            <div class="card-body">
                <form method="GET" class="form-inline">
                    <input type="hidden" name="page" value="transactions">
                    
                    <div class="form-group mr-3">
                        <label for="status" class="mr-2">Статус:</label>
                        <select name="status" id="status" class="form-control">
                            <?php foreach ($statusOptions as $value => $label): ?>
                                <option value="<?= $value ?>" <?= $status_filter === $value ? 'selected' : '' ?>>
                                    <?= htmlspecialchars($label) ?>
                                </option>
                            <?php endforeach; ?>
                        </select>
                    </div>
                    
                    <div class="form-group mr-3">
                        <label for="limit" class="mr-2">Показать:</label>
                        <select name="limit" id="limit" class="form-control">
                            <option value="50" <?= $limit == 50 ? 'selected' : '' ?>>50</option>
                            <option value="100" <?= $limit == 100 ? 'selected' : '' ?>>100</option>
                            <option value="200" <?= $limit == 200 ? 'selected' : '' ?>>200</option>
                            <option value="500" <?= $limit == 500 ? 'selected' : '' ?>>500</option>
                        </select>
                    </div>
                    
                    <button type="submit" class="btn btn-primary mr-2">Применить</button>
                    <a href="index.php?page=transactions" class="btn btn-secondary">Сбросить</a>
                </form>
            </div>
        </div>
    </div>
</div>

<!-- Краткая статистика -->
<div class="row mb-4">
    <div class="col-md-3">
        <div class="card stats-card">
            <div class="card-body text-center">
                <div class="stats-number text-primary"><?= count($allTransactions) ?></div>
                <div class="stats-label">Найдено транзакций</div>
            </div>
        </div>
    </div>
    <div class="col-md-3">
        <div class="card stats-card">
            <div class="card-body text-center">
                <div class="stats-number text-info">$<?= number_format(array_sum(array_column($transactions, 'charge_amount_usd')), 2) ?></div>
                <div class="stats-label">Сумма на странице</div>
            </div>
        </div>
    </div>
    <div class="col-md-3">
        <div class="card stats-card">
            <div class="card-body text-center">
                <div class="stats-number text-success">
                    <?= count(array_filter($transactions, fn($t) => $t['status'] === 'completed')) ?>
                </div>
                <div class="stats-label">Выполнено</div>
            </div>
        </div>
    </div>
    <div class="col-md-3">
        <div class="card stats-card">
            <div class="card-body text-center">
                <div class="stats-number text-danger">
                    <?= count(array_filter($transactions, fn($t) => $t['status'] === 'failed')) ?>
                </div>
                <div class="stats-label">Ошибок</div>
            </div>
        </div>
    </div>
</div>

<!-- Таблица транзакций -->
<div class="row">
    <div class="col-12">
        <div class="card">
            <div class="card-header">
                <h6 class="card-title mb-0">
                    <i class="fas fa-list"></i> Список транзакций 
                    <small class="text-muted">(показано <?= count($transactions) ?> из <?= count($allTransactions) ?>)</small>
                </h6>
            </div>
            <div class="card-body">
                <?php if (empty($transactions)): ?>
                    <div class="text-center text-muted py-4">
                        <i class="fas fa-search fa-3x mb-3"></i>
                        <p>Транзакции не найдены</p>
                        <small>Попробуйте изменить фильтры или отправить новую заявку через API</small>
                    </div>
                <?php else: ?>
                    <div class="table-responsive">
                        <table class="table table-striped table-hover">
                            <thead>
                                <tr>
                                    <th>Дата создания</th>
                                    <th>ID лида</th>
                                    <th>ID лида партнера</th>
                                    <th>Списано</th>
                                    <th>Статус транзакции</th>
                                    <th>Статус выполнения</th>
                                    <th>Детали выполнения</th>
                                    <th>Действия</th>
                                </tr>
                            </thead>
                            <tbody>
                                <?php foreach ($transactions as $txn): ?>
                                    <tr>
                                        <td>
                                            <small><?= date('d.m.Y H:i:s', strtotime($txn['created_at'])) ?></small>
                                            <?php if ($txn['updated_at'] !== $txn['created_at']): ?>
                                                <br><small class="text-muted">Обновлено: <?= date('d.m.Y H:i', strtotime($txn['updated_at'])) ?></small>
                                            <?php endif; ?>
                                        </td>
                                        <td>
                                            <code><?= htmlspecialchars($txn['lead_id']) ?></code>
                                        </td>
                                        <td>
                                            <?= $txn['partner_deal_id'] ? htmlspecialchars($txn['partner_deal_id']) : '<span class="text-muted">—</span>' ?>
                                        </td>
                                        <td>
                                            <span class="badge badge-info">$<?= number_format($txn['charge_amount_usd'], 2) ?></span>
                                            <br><small class="text-muted">
                                                Баланс: $<?= number_format($txn['partner_balance_before'], 2) ?> → $<?= number_format($txn['partner_balance_after'], 2) ?>
                                            </small>
                                        </td>
                                        <td>
                                            <?php
                                            $statusClasses = [
                                                'charged' => 'warning',
                                                'completed' => 'success',
                                                'failed' => 'danger',
                                                'pending' => 'secondary'
                                            ];
                                            $statusClass = $statusClasses[$txn['status']] ?? 'secondary';
                                            ?>
                                            <span class="badge badge-<?= $statusClass ?>"><?= htmlspecialchars($txn['status']) ?></span>
                                        </td>
                                        <td>
                                            <?php if ($txn['completion_status']): ?>
                                                <?php if ($txn['completion_status'] === 'Выполнено'): ?>
                                                    <span class="badge badge-success">Выполнено</span>
                                                <?php else: ?>
                                                    <span class="badge badge-danger">Ошибка</span>
                                                <?php endif; ?>
                                            <?php else: ?>
                                                <span class="text-muted">Ожидание</span>
                                            <?php endif; ?>
                                        </td>
                                        <td>
                                            <?php if (isset($txn['completion_details']) && $txn['completion_details']): ?>
                                                <?php if (isset($txn['completion_details']['amount'])): ?>
                                                    <strong><?= htmlspecialchars($txn['completion_details']['amount']) ?> 
                                                    <?= htmlspecialchars($txn['completion_details']['currency'] ?? '') ?></strong><br>
                                                <?php endif; ?>
                                                <?php if (isset($txn['completion_details']['email'])): ?>
                                                    <small class="text-muted"><?= htmlspecialchars($txn['completion_details']['email']) ?></small>
                                                <?php endif; ?>
                                            <?php else: ?>
                                                <span class="text-muted">—</span>
                                            <?php endif; ?>
                                        </td>
                                        <td>
                                            <button type="button" class="btn btn-sm btn-outline-info" 
                                                    onclick="showTransactionDetails('<?= htmlspecialchars($txn['transaction_id']) ?>')">
                                                <i class="fas fa-eye"></i>
                                            </button>
                                        </td>
                                    </tr>
                                <?php endforeach; ?>
                            </tbody>
                        </table>
                    </div>
                <?php endif; ?>
            </div>
        </div>
    </div>
</div>

<!-- Модальное окно для деталей транзакции -->
<div class="modal fade" id="transactionModal" tabindex="-1" role="dialog">
    <div class="modal-dialog modal-lg" role="document">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">Детали транзакции</h5>
                <button type="button" class="close" data-dismiss="modal">&times;</button>
            </div>
            <div class="modal-body" id="transactionDetails">
                Загрузка...
            </div>
        </div>
    </div>
</div>

<script>
function showTransactionDetails(transactionId) {
    const transactions = <?= json_encode($transactions) ?>;
    const transaction = transactions.find(t => t.transaction_id === transactionId);
    
    if (!transaction) {
        alert('Транзакция не найдена');
        return;
    }
    
    let html = `
        <div class="row">
            <div class="col-md-6">
                <h6>Основная информация</h6>
                <table class="table table-sm">
                    <tr><td><strong>ID транзакции:</strong></td><td><code>${transaction.transaction_id}</code></td></tr>
                    <tr><td><strong>ID лида:</strong></td><td><code>${transaction.lead_id}</code></td></tr>
                    <tr><td><strong>ID лида партнера:</strong></td><td>${transaction.partner_deal_id || '—'}</td></tr>
                    <tr><td><strong>Списано:</strong></td><td>$${transaction.charge_amount_usd}</td></tr>
                    <tr><td><strong>Статус:</strong></td><td><span class="badge badge-info">${transaction.status}</span></td></tr>
                    <tr><td><strong>Создано:</strong></td><td>${transaction.created_at}</td></tr>
                    <tr><td><strong>Обновлено:</strong></td><td>${transaction.updated_at}</td></tr>
                </table>
            </div>
            <div class="col-md-6">
                <h6>Данные заявки от партнера</h6>
                <pre class="small bg-light p-2" style="max-height: 300px; overflow-y: auto;">${JSON.stringify(transaction.lead_data_received, null, 2)}</pre>
            </div>
        </div>
    `;
    
    if (transaction.completion_details) {
        html += `
            <div class="row mt-3">
                <div class="col-12">
                    <h6>Детали выполнения</h6>
                    <pre class="small bg-light p-2">${JSON.stringify(transaction.completion_details, null, 2)}</pre>
                </div>
            </div>
        `;
    }
    
    document.getElementById('transactionDetails').innerHTML = html;
    $('#transactionModal').modal('show');
}
</script>
