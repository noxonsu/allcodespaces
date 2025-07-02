<?php
$currentPartner = get_current_partner();
if (!$currentPartner) {
    header('Location: index.php?page=login');
    exit;
}
?>

<div class="d-flex justify-content-between flex-wrap flex-md-nowrap align-items-center pt-3 pb-2 mb-3 border-bottom">
    <h1 class="h2">API документация</h1>
</div>

<div class="row">
    <div class="col-12">
        <div class="card">
            <div class="card-header">
                <h5 class="card-title mb-0"><i class="fas fa-code"></i> Интеграция с API</h5>
            </div>
            <div class="card-body">
                
                <h6>Ваши данные для интеграции</h6>
                <div class="alert alert-info">
                    <p><strong>API токен:</strong> <code id="apiToken"><?= htmlspecialchars($currentPartner['token']) ?></code> 
                        <button class="btn btn-sm btn-outline-secondary ml-2" onclick="copyToClipboard('apiToken')">
                            <i class="fas fa-copy"></i> Копировать
                        </button>
                    </p>
                    <p><strong>ID партнера:</strong> <code><?= htmlspecialchars($currentPartner['id']) ?></code></p>
                    <p><strong>Стоимость обработки заявки:</strong> <span class="badge badge-warning">$<?= LEAD_PROCESSING_COST_USD ?></span></p>
                </div>

                <h6>Отправка заявки</h6>
                <p>Для отправки заявки используйте POST запрос:</p>
                
                <div class="card bg-light">
                    <div class="card-header">
                        <small class="text-muted">Эндпоинт</small>
                    </div>
                    <div class="card-body">
                        <code>POST <?= (isset($_SERVER['HTTPS']) ? 'https' : 'http') ?>://<?= $_SERVER['HTTP_HOST'] ?>/amogt/gpt_payment_api/api.php</code>
                    </div>
                </div>

                <div class="mt-3">
                    <h6>Формат JSON запроса:</h6>
                    <pre class="bg-light p-3"><code>{
  "action": "submit_partner_lead",
  "api_token": "<?= htmlspecialchars($currentPartner['token']) ?>",
  "lead_data": [
    {
      "paymentUrl": "https://stripe.com/payment/link/...",
      "customerName": "Имя клиента",
      "customerEmail": "email@example.com",
      "customerPhone": "+7 (XXX) XXX-XX-XX",
      "productName": "Название товара",
      "customField1": "Дополнительное поле 1",
      "customField2": "Дополнительное поле 2"
    }
  ]
}</code></pre>
                </div>

                <div class="mt-3">
                    <h6>Пример успешного ответа:</h6>
                    <pre class="bg-light p-3"><code>{
  "status": "success",
  "message": "Processed 1 leads. Added to main list: 1, Updated in main list: 0.",
  "processed_count": 1,
  "added_to_main_list_count": 1,
  "updated_in_main_list_count": 0,
  "total_cost_charged": 25,
  "remaining_balance": 975.00
}</code></pre>
                </div>

                <div class="mt-3">
                    <h6>Пример ответа с ошибками:</h6>
                    <pre class="bg-light p-3"><code>{
  "status": "success",
  "message": "Processed 1 leads. Added to main list: 1, Updated in main list: 0. Some leads had issues (see errors array).",
  "processed_count": 1,
  "added_to_main_list_count": 1,
  "updated_in_main_list_count": 0,
  "total_cost_charged": 25,
  "remaining_balance": 950.00,
  "errors": [
    "Lead at index 1: Failed to parse payment details from URL: invalid-url. Invalid payment URL format."
  ],
  "error_count": 1
}</code></pre>
                </div>

                <div class="mt-3">
                    <h6>Пример ответа с дублированием paymentUrl:</h6>
                    <pre class="bg-light p-3"><code>{
  "status": "error",
  "message": "No leads were processed successfully.",
  "processed_count": 0,
  "added_to_main_list_count": 0,
  "updated_in_main_list_count": 0,
  "total_cost_charged": 0,
  "remaining_balance": 1000.00,
  "errors": [
    "Lead at index 0: Lead with paymentUrl 'https://buy.stripe.com/test_xyz123' already exists in the system."
  ],
  "error_count": 1
}</code></pre>
                </div>

                <div class="mt-3">
                    <h6>Пример ответа при недостатке средств:</h6>
                    <pre class="bg-light p-3"><code>{
  "status": "insufficient_funds",
  "message": "Insufficient funds. Required: 50 USD, Current balance: 25.00 USD",
  "required_balance": 50,
  "current_balance": 25.00,
  "cost_per_lead": 25,
  "leads_count": 2
}</code></pre>
                </div>

                <div class="mt-3">
                    <h6>Важные моменты:</h6>
                    <ul>
                        <li><strong>paymentUrl</strong> - обязательное поле, должно содержать валидную ссылку на оплату Stripe</li>
                        <li><strong>dealId</strong> - всегда генерируется сервером автоматически для обеспечения уникальности</li>
                        <li>Если заявка с таким <strong>paymentUrl</strong> уже существует в системе, она будет отклонена как дубликат</li>
                        <li>С вашего баланса автоматически спишется <strong>$<?= LEAD_PROCESSING_COST_USD ?></strong> за каждую <em>успешно обработанную</em> заявку</li>
                        <li>Если баланса недостаточно для всех заявок, запрос будет отклонен с кодом 402</li>
                        <li>Если ссылка на оплату невалидна, лид будет пропущен и не будет списания</li>
                        <li>Все дополнительные поля будут сохранены и доступны в вашем личном кабинете</li>
                        <li>Статус каждой заявки отслеживается в реальном времени</li>
                    </ul>
                </div>

                <h6 class="mt-4">Проверка баланса</h6>
                <p>Для проверки текущего баланса:</p>
                
                <div class="card bg-light">
                    <div class="card-body">
                        <code>GET <?= (isset($_SERVER['HTTPS']) ? 'https' : 'http') ?>://<?= $_SERVER['HTTP_HOST'] ?>/amogt/gpt_payment_api/api.php?action=get_balance&api_token=<?= htmlspecialchars($currentPartner['token']) ?></code>
                    </div>
                </div>

                <h6 class="mt-4">Получение списка транзакций</h6>
                <p>Для получения списка ваших транзакций через API:</p>
                
                <div class="card bg-light">
                    <div class="card-body">
                        <code>GET <?= (isset($_SERVER['HTTPS']) ? 'https' : 'http') ?>://<?= $_SERVER['HTTP_HOST'] ?>/amogt/gpt_payment_api/api.php?action=get_transactions&api_token=<?= htmlspecialchars($currentPartner['token']) ?>&limit=100</code>
                    </div>
                </div>

                <h6 class="mt-4">Коды ошибок</h6>
                <div class="table-responsive">
                    <table class="table table-sm">
                        <thead>
                            <tr>
                                <th>Код</th>
                                <th>Описание</th>
                                <th>Решение</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td><code>400</code></td>
                                <td>Неверный формат данных или все лиды провалили валидацию</td>
                                <td>Проверьте JSON структуру запроса и валидность paymentUrl</td>
                            </tr>
                            <tr>
                                <td><code>401</code></td>
                                <td>Неверный API токен</td>
                                <td>Убедитесь, что используете правильный токен</td>
                            </tr>
                            <tr>
                                <td><code>402</code></td>
                                <td>Недостаточно средств для обработки всех заявок</td>
                                <td>Пополните баланс или отправьте меньше заявок</td>
                            </tr>
                            <tr>
                                <td><code>429</code></td>
                                <td>Слишком много запросов</td>
                                <td>Подождите и повторите запрос</td>
                            </tr>
                            <tr>
                                <td><code>500</code></td>
                                <td>Внутренняя ошибка сервера</td>
                                <td>Обратитесь в техническую поддержку</td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <h6 class="mt-4">Поля ответа API</h6>
                <div class="table-responsive">
                    <table class="table table-sm">
                        <thead>
                            <tr>
                                <th>Поле</th>
                                <th>Тип</th>
                                <th>Описание</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td><code>status</code></td>
                                <td>string</td>
                                <td>success или error</td>
                            </tr>
                            <tr>
                                <td><code>message</code></td>
                                <td>string</td>
                                <td>Описание результата операции</td>
                            </tr>
                            <tr>
                                <td><code>processed_count</code></td>
                                <td>integer</td>
                                <td>Количество успешно обработанных лидов</td>
                            </tr>
                            <tr>
                                <td><code>total_cost_charged</code></td>
                                <td>float</td>
                                <td>Общая сумма списанная с баланса (USD)</td>
                            </tr>
                            <tr>
                                <td><code>remaining_balance</code></td>
                                <td>float</td>
                                <td>Остаток баланса после операции (USD)</td>
                            </tr>
                            <tr>
                                <td><code>errors</code></td>
                                <td>array</td>
                                <td>Массив ошибок для проблемных лидов (если есть)</td>
                            </tr>
                            <tr>
                                <td><code>error_count</code></td>
                                <td>integer</td>
                                <td>Количество лидов с ошибками (если есть)</td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <div class="alert alert-warning mt-4">
                    <h6><i class="fas fa-exclamation-triangle"></i> Безопасность</h6>
                    <ul class="mb-0">
                        <li>Никогда не передавайте ваш API токен третьим лицам</li>
                        <li>Используйте HTTPS для всех запросов в продакшн среде</li>
                        <li>Регулярно проверяйте транзакции в личном кабинете</li>
                        <li>При компрометации токена немедленно обратитесь к администратору</li>
                    </ul>
                </div>

            </div>
        </div>
    </div>
</div>

<script>
function copyToClipboard(elementId) {
    const element = document.getElementById(elementId);
    const text = element.textContent;
    
    if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(function() {
            // Показываем уведомление об успешном копировании
            const btn = element.nextElementSibling;
            const originalText = btn.innerHTML;
            btn.innerHTML = '<i class="fas fa-check"></i> Скопировано';
            btn.classList.remove('btn-outline-secondary');
            btn.classList.add('btn-success');
            
            setTimeout(function() {
                btn.innerHTML = originalText;
                btn.classList.remove('btn-success');
                btn.classList.add('btn-outline-secondary');
            }, 2000);
        });
    } else {
        // Fallback для старых браузеров
        const textArea = document.createElement('textarea');
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        alert('Токен скопирован в буфер обмена');
    }
}
</script>
