<?php
// gpt_payment_api/admin/partner_transactions.php

require_once __DIR__ . '/auth.php'; // Проверка авторизации администратора
require_once __DIR__ . '/../lib/partner_transaction_logger.php';
require_once __DIR__ . '/../lib/db.php';

// Получаем все транзакции
$limit = isset($_GET['limit']) ? min(max((int)$_GET['limit'], 1), 2000) : 500;
$partnerId = $_GET['partner_id'] ?? null;

try {
    if ($partnerId) {
        $transactions = PartnerTransactionLogger::getPartnerTransactions($partnerId, $limit);
        $stats = PartnerTransactionLogger::getPartnerStats($partnerId);
        $pageTitle = "Транзакции партнера";
    } else {
        $transactions = PartnerTransactionLogger::getAllTransactions($limit);
        $stats = null;
        $pageTitle = "Все транзакции партнеров";
    }
    
    // Получаем список партнеров для фильтра
    $db = new DB();
    $partners = $db->read('partners');
    
} catch (Exception $e) {
    $error = "Ошибка получения транзакций: " . $e->getMessage();
    $transactions = [];
    $partners = [];
    $stats = null;
}

include __DIR__ . '/templates/header.php';
?>

<div class="container-fluid">
    <div class="row">
        <div class="col-12">
            <div class="card">
                <div class="card-header d-flex justify-content-between align-items-center">
                    <h3 class="card-title"><?= htmlspecialchars($pageTitle) ?></h3>
                    <div class="btn-group">
                        <a href="?limit=100" class="btn btn-outline-secondary <?= $limit == 100 ? 'active' : '' ?>">100</a>
                        <a href="?limit=500" class="btn btn-outline-secondary <?= $limit == 500 ? 'active' : '' ?>">500</a>
                        <a href="?limit=1000" class="btn btn-outline-secondary <?= $limit == 1000 ? 'active' : '' ?>">1000</a>
                    </div>
                </div>
                
                <?php if (isset($error)): ?>
                    <div class="alert alert-danger"><?= htmlspecialchars($error) ?></div>
                <?php endif; ?>
                
                <!-- Фильтр по партнерам -->
                <div class="card-body pb-2">
                    <form method="GET" class="form-inline">
                        <div class="form-group mr-3">
                            <label for="partner_id" class="mr-2">Партнер:</label>
                            <select name="partner_id" id="partner_id" class="form-control">
                                <option value="">Все партнеры</option>
                                <?php foreach ($partners as $partner): ?>
                                    <option value="<?= htmlspecialchars($partner['id']) ?>" 
                                            <?= $partnerId === $partner['id'] ? 'selected' : '' ?>>
                                        <?= htmlspecialchars($partner['name']) ?> (ID: <?= htmlspecialchars($partner['id']) ?>)
                                    </option>
                                <?php endforeach; ?>
                            </select>
                        </div>
                        <input type="hidden" name="limit" value="<?= $limit ?>">
                        <button type="submit" class="btn btn-primary">Фильтровать</button>
                        <?php if ($partnerId): ?>
                            <a href="?" class="btn btn-secondary ml-2">Сбросить</a>
                        <?php endif; ?>
                    </form>
                </div>
                
                <!-- Статистика партнера -->
                <?php if ($stats): ?>
                    <div class="card-body pt-0">
                        <div class="row">
                            <div class="col-md-3">
                                <div class="info-box">
                                    <span class="info-box-icon bg-info"><i class="fas fa-chart-line"></i></span>
                                    <div class="info-box-content">
                                        <span class="info-box-text">Всего транзакций</span>
                                        <span class="info-box-number"><?= $stats['total_transactions'] ?></span>
                                    </div>
                                </div>
                            </div>
                            <div class="col-md-3">
                                <div class="info-box">
                                    <span class="info-box-icon bg-success"><i class="fas fa-dollar-sign"></i></span>
                                    <div class="info-box-content">
                                        <span class="info-box-text">Всего списано</span>
                                        <span class="info-box-number">$<?= number_format($stats['total_charged_usd'], 2) ?></span>
                                    </div>
                                </div>
                            </div>
                            <div class="col-md-3">
                                <div class="info-box">
                                    <span class="info-box-icon bg-warning"><i class="fas fa-check-circle"></i></span>
                                    <div class="info-box-content">
                                        <span class="info-box-text">Выполнено / Ошибок</span>
                                        <span class="info-box-number"><?= $stats['completed_count'] ?> / <?= $stats['failed_count'] ?></span>
                                    </div>
                                </div>
                            </div>
                            <div class="col-md-3">
                                <div class="info-box">
                                    <span class="info-box-icon bg-secondary"><i class="fas fa-clock"></i></span>
                                    <div class="info-box-content">
                                        <span class="info-box-text">В ожидании</span>
                                        <span class="info-box-number"><?= $stats['pending_count'] ?></span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                <?php endif; ?>

                <div class="card-body">
                    <?php if (empty($transactions)): ?>
                        <div class="alert alert-info">Транзакции не найдены.</div>
                    <?php else: ?>
                        <div class="table-responsive">
                            <table class="table table-striped table-hover">
                                <thead>
                                    <tr>
                                        <th>ID транзакции</th>
                                        <th>Партнер</th>
                                        <th>ID лида</th>
                                        <th>ID лида партнера</th>
                                        <th>Списано (USD)</th>
                                        <th>Статус</th>
                                        <th>Дата создания</th>
                                        <th>Статус выполнения</th>
                                        <th>Действия</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <?php foreach ($transactions as $txn): ?>
                                        <tr>
                                            <td>
                                                <code class="small"><?= htmlspecialchars(substr($txn['transaction_id'], -12)) ?></code>
                                            </td>
                                            <td>
                                                <strong><?= htmlspecialchars($txn['partner_name']) ?></strong><br>
                                                <small class="text-muted"><?= htmlspecialchars($txn['partner_id']) ?></small>
                                            </td>
                                            <td>
                                                <code><?= htmlspecialchars($txn['lead_id']) ?></code>
                                            </td>
                                            <td>
                                                <?= $txn['partner_deal_id'] ? htmlspecialchars($txn['partner_deal_id']) : '<span class="text-muted">—</span>' ?>
                                            </td>
                                            <td>
                                                <span class="badge badge-info">$<?= number_format($txn['charge_amount_usd'], 2) ?></span>
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
                                                <small><?= date('d.m.Y H:i', strtotime($txn['created_at'])) ?></small>
                                            </td>
                                            <td>
                                                <?php if ($txn['completion_status']): ?>
                                                    <?php if ($txn['completion_status'] === 'Выполнено'): ?>
                                                        <span class="badge badge-success">Выполнено</span>
                                                    <?php else: ?>
                                                        <span class="badge badge-danger">Ошибка</span>
                                                    <?php endif; ?>
                                                    <?php if (isset($txn['completion_details']['amount'])): ?>
                                                        <br><small class="text-muted">
                                                            <?= htmlspecialchars($txn['completion_details']['amount']) ?> 
                                                            <?= htmlspecialchars($txn['completion_details']['currency'] ?? '') ?>
                                                        </small>
                                                    <?php endif; ?>
                                                <?php else: ?>
                                                    <span class="text-muted">—</span>
                                                <?php endif; ?>
                                            </td>
                                            <td>
                                                <button type="button" class="btn btn-sm btn-outline-info" 
                                                        onclick="showTransactionDetails('<?= htmlspecialchars($txn['transaction_id']) ?>')">
                                                    Детали
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
    // Найти транзакцию в текущих данных
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
                    <tr><td>ID транзакции:</td><td><code>${transaction.transaction_id}</code></td></tr>
                    <tr><td>Партнер:</td><td>${transaction.partner_name} (${transaction.partner_id})</td></tr>
                    <tr><td>ID лида:</td><td><code>${transaction.lead_id}</code></td></tr>
                    <tr><td>ID лида партнера:</td><td>${transaction.partner_deal_id || '—'}</td></tr>
                    <tr><td>Списано:</td><td>$${transaction.charge_amount_usd}</td></tr>
                    <tr><td>Баланс до:</td><td>$${transaction.partner_balance_before}</td></tr>
                    <tr><td>Баланс после:</td><td>$${transaction.partner_balance_after}</td></tr>
                    <tr><td>Создано:</td><td>${transaction.created_at}</td></tr>
                    <tr><td>Обновлено:</td><td>${transaction.updated_at}</td></tr>
                </table>
            </div>
            <div class="col-md-6">
                <h6>Данные заявки от партнера</h6>
                <pre class="small bg-light p-2">${JSON.stringify(transaction.lead_data_received, null, 2)}</pre>
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

<?php include __DIR__ . '/templates/footer.php'; ?>
