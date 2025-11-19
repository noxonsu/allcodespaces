<?php
$currentPartner = get_current_partner();
if (!$currentPartner) {
    header('Location: index.php?page=login');
    exit;
}

try {
    $stats = PartnerTransactionLogger::getPartnerStats($currentPartner['id']);
    $recentTransactions = PartnerTransactionLogger::getPartnerTransactions($currentPartner['id'], 5);
} catch (Exception $e) {
    $error = "Ошибка загрузки данных: " . $e->getMessage();
    $stats = [
        'total_transactions' => 0,
        'total_charged_usd' => 0,
        'completed_count' => 0,
        'failed_count' => 0,
        'pending_count' => 0,
        'last_transaction_date' => null
    ];
    $recentTransactions = [];
}
?>

<div class="d-flex justify-content-between flex-wrap flex-md-nowrap align-items-center pt-3 pb-2 mb-3 border-bottom">
    <h1 class="h2">Дашборд партнера</h1>
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

<!-- Информация о партнере -->
<div class="row mb-4">
    <div class="col-12">
        <div class="card stats-card">
            <div class="card-body">
                <div class="row">
                    <div class="col-md-6">
                        <h5 class="card-title">
                            <i class="fas fa-user-tie"></i> Добро пожаловать, <?= htmlspecialchars($currentPartner['name']) ?>!
                        </h5>
                        <p class="card-text text-muted">ID партнера: <?= htmlspecialchars($currentPartner['id']) ?></p>
                    </div>
                    <div class="col-md-3">
                        <div class="stats-label">API Токен</div>
                        <div class="input-group">
                            <input type="text" class="form-control form-control-sm" 
                                   id="api-token" 
                                   value="<?= htmlspecialchars($currentPartner['api_token'] ?? $currentPartner['token'] ?? 'Не найден') ?>" 
                                   readonly>
                            <div class="input-group-append">
                                <button class="btn btn-sm btn-outline-secondary" 
                                        onclick="copyToClipboard('api-token')" 
                                        title="Скопировать токен">
                                    <i class="fas fa-copy"></i>
                                </button>
                            </div>
                        </div>
                        <small class="text-muted">Используйте этот токен для API запросов</small>
                    </div>
                    <div class="col-md-3 text-right">
                        <div class="stats-label">Текущий баланс</div>
                        <div class="stats-number text-<?= (float)$currentPartner['balance'] > 0 ? 'success' : 'danger' ?>">
                            $<?= number_format((float)$currentPartner['balance'], 2) ?>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</div>

<!-- Статистика -->
<div class="row mb-4">
    <div class="col-md-3">
        <div class="card stats-card">
            <div class="card-body text-center">
                <div class="stats-number text-primary"><?= $stats['total_transactions'] ?></div>
                <div class="stats-label">Всего заявок</div>
            </div>
        </div>
    </div>
    <div class="col-md-3">
        <div class="card stats-card">
            <div class="card-body text-center">
                <div class="stats-number text-success"><?= $stats['completed_count'] ?></div>
                <div class="stats-label">Успешно выполнено</div>
            </div>
        </div>
    </div>
    <div class="col-md-3">
        <div class="card stats-card">
            <div class="card-body text-center">
                <div class="stats-number text-danger"><?= $stats['failed_count'] ?></div>
                <div class="stats-label">Ошибок</div>
            </div>
        </div>
    </div>
    <div class="col-md-3">
        <div class="card stats-card">
            <div class="card-body text-center">
                <div class="stats-number text-warning"><?= $stats['pending_count'] ?></div>
                <div class="stats-label">В обработке</div>
            </div>
        </div>
    </div>
</div>

<!-- Финансовая статистика -->
<div class="row mb-4">
    <div class="col-md-6">
        <div class="card stats-card">
            <div class="card-body">
                <h6 class="card-title"><i class="fas fa-dollar-sign"></i> Финансовая статистика</h6>
                <div class="row">
                    <div class="col-6">
                        <div class="stats-label">Всего потрачено</div>
                        <div class="stats-number h4 text-info">$<?= number_format($stats['total_charged_usd'], 2) ?></div>
                    </div>
                    <div class="col-6">
                        <div class="stats-label">Средняя стоимость</div>
                        <div class="stats-number h4 text-secondary">
                            $<?= $stats['total_transactions'] > 0 ? number_format($stats['total_charged_usd'] / $stats['total_transactions'], 2) : '0.00' ?>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
    <div class="col-md-6">
        <div class="card stats-card">
            <div class="card-body">
                <h6 class="card-title"><i class="fas fa-chart-pie"></i> Эффективность</h6>
                <div class="row">
                    <div class="col-6">
                        <div class="stats-label">Успешность</div>
                        <div class="stats-number h4 text-success">
                            <?= $stats['total_transactions'] > 0 ? round(($stats['completed_count'] / $stats['total_transactions']) * 100, 1) : 0 ?>%
                        </div>
                    </div>
                    <div class="col-6">
                        <div class="stats-label">Последняя заявка</div>
                        <div class="small text-muted">
                            <?= $stats['last_transaction_date'] ? date('d.m.Y H:i', strtotime($stats['last_transaction_date'])) : 'Нет данных' ?>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</div>

<!-- Последние транзакции -->
<div class="row">
    <div class="col-12">
        <div class="card">
            <div class="card-header d-flex justify-content-between align-items-center">
                <h6 class="card-title mb-0"><i class="fas fa-history"></i> Последние транзакции</h6>
                <a href="index.php?page=transactions" class="btn btn-sm btn-outline-primary">Все транзакции</a>
            </div>
            <div class="card-body">
                <?php if (empty($recentTransactions)): ?>
                    <div class="text-center text-muted py-4">
                        <i class="fas fa-inbox fa-3x mb-3"></i>
                        <p>У вас пока нет транзакций</p>
                        <small>Отправьте первую заявку через API для начала работы</small>
                    </div>
                <?php else: ?>
                    <div class="table-responsive">
                        <table class="table table-sm">
                            <thead>
                                <tr>
                                    <th>Дата</th>
                                    <th>ID лида</th>
                                    <th>Сумма</th>
                                    <th>Статус</th>
                                    <th>Результат</th>
                                </tr>
                            </thead>
                            <tbody>
                                <?php foreach ($recentTransactions as $txn): ?>
                                    <tr>
                                        <td>
                                            <small><?= date('d.m.Y H:i', strtotime($txn['created_at'])) ?></small>
                                        </td>
                                        <td>
                                            <code class="small"><?= htmlspecialchars($txn['lead_id']) ?></code>
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
                                            <?php if ($txn['completion_status']): ?>
                                                <?php if ($txn['completion_status'] === 'Выполнено'): ?>
                                                    <span class="badge badge-success">Выполнено</span>
                                                <?php else: ?>
                                                    <span class="badge badge-danger">Ошибка</span>
                                                <?php endif; ?>
                                            <?php else: ?>
                                                <span class="text-muted">—</span>
                                            <?php endif; ?>
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

<script>
function copyToClipboard(elementId) {
    const element = document.getElementById(elementId);
    element.select();
    element.setSelectionRange(0, 99999); // Для мобильных устройств
    
    try {
        document.execCommand('copy');
        // Показываем уведомление об успешном копировании
        const button = event.target.closest('button');
        const originalIcon = button.innerHTML;
        button.innerHTML = '<i class="fas fa-check text-success"></i>';
        setTimeout(() => {
            button.innerHTML = originalIcon;
        }, 2000);
    } catch (err) {
        console.error('Ошибка копирования: ', err);
    }
}
</script>
