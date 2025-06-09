<div class="container mt-4">
    <h2>Инструкции по использованию GPT Payment API</h2>
    
    <div class="row">
        <div class="col-md-12">
            <div class="card">
                <div class="card-header">
                    <h4>Основные возможности админ-панели</h4>
                </div>
                <div class="card-body">
                    <h5>1. Управление партнерами</h5>
                    <p>В разделе "Партнеры" вы можете:</p>
                    <ul>
                        <li>Добавлять новых партнеров (с указанием имени и начального баланса). При добавлении генерируется уникальный API токен.</li>
                        <li>Просматривать список существующих партнеров, их ID, токенов, балансов и дат создания.</li>
                        <li>Изменять баланс существующего партнера.</li>
                        <li>Удалять партнера.</li>
                    </ul>

                    <h5>2. Управление курсами валют</h5>
                    <p>В разделе "Курсы валют" вы можете:</p>
                    <ul>
                        <li>Устанавливать/обновлять курс для пары "Иностранная валюта -> Базовая валюта баланса".</li>
                        <li>Просматривать список установленных курсов.</li>
                        <li>Удалять курс.</li>
                    </ul>

                    <h5>3. Мониторинг транзакций</h5>
                    <p>В разделе "Транзакции" доступно:</p>
                    <ul>
                        <li>Отображение списка всех проведенных транзакций с детальной информацией (ID транзакции, ID и имя партнера, суммы, статус, дата).</li>
                    </ul>
                </div>
            </div>

            <div class="card mt-4">
                <div class="card-header">
                    <h4>API для партнеров</h4>
                </div>
                <div class="card-body">
                    <h5>Базовый URL</h5>
                    <code>https://<?= $_SERVER['HTTP_HOST'] ?>/amogt/gpt_payment_api/api.php</code>

                    <h5 class="mt-3">Авторизация</h5>
                    <p>Все запросы должны содержать параметр <code>api_token</code> с вашим уникальным ключом API. Параметр может передаваться методом GET или POST.</p>
                    <code>api_token=ВАШ_API_ТОКЕН</code>

                    <h5 class="mt-3">Основные эндпоинты</h5>
                    
                    <div class="mt-3">
                        <strong>1. Получение баланса партнера</strong><br>
                        <code>action=get_balance</code><br>
                        <small class="text-muted">Метод: GET или POST</small><br>
                        <small class="text-muted">Возвращает текущий баланс партнера.</small><br>
                        <strong>Параметры:</strong>
                        <ul><li><code>api_token</code> (string, required)</li></ul>
                        <strong>Успешный ответ (200 OK):</strong>
                        <pre class="bg-light p-2 mt-1">
{
    "status": "success",
    "partner_name": "Имя Партнера",
    "balance": 1000.50
}
                        </pre>
                    </div>

                    <div class="mt-3">
                        <strong>2. Получение стоимости платежа</strong><br>
                        <code>action=get_payment_cost</code><br>
                        <small class="text-muted">Метод: POST</small><br>
                        <small class="text-muted">Определение стоимости платежа в валюте баланса партнера.</small><br>
                        <strong>Параметры:</strong>
                        <ul>
                            <li><code>api_token</code> (string, required)</li>
                            <li><code>payment_amount</code> (float, required): Сумма платежа в оригинальной валюте.</li>
                            <li><code>payment_currency</code> (string, required): Трехбуквенный код оригинальной валюты (например, USD, EUR).</li>
                        </ul>
                        <strong>Успешный ответ (200 OK):</strong>
                        <pre class="bg-light p-2 mt-1">
{
    "status": "success",
    "cost_in_balance_units": 9000.00,
    "original_amount": 100.00,
    "original_currency": "USD",
    "rate_used": 90.00,
    "rate_currency_pair": "USD_RUB"
}
                        </pre>
                    </div>

                    <div class="mt-3">
                        <strong>3. Проведение платежа</strong><br>
                        <code>action=process_payment</code><br>
                        <small class="text-muted">Метод: POST</small><br>
                        <small class="text-muted">Списание средств с баланса партнера для оплаты услуг.</small><br>
                        <strong>Параметры:</strong>
                        <ul>
                            <li><code>api_token</code> (string, required)</li>
                            <li><code>payment_amount</code> (float, required): Сумма платежа в оригинальной валюте.</li>
                            <li><code>payment_currency</code> (string, required): Трехбуквенный код оригинальной валюты.</li>
                            <li><code>service_details</code> (string, optional): Описание оплачиваемого сервиса. По умолчанию "ChatGPT Payment".</li>
                        </ul>
                        <strong>Успешный ответ (200 OK):</strong>
                        <pre class="bg-light p-2 mt-1">
{
    "status": "success",
    "message": "Payment processed successfully.",
    "transaction_id": "txn_xxxxxxxxxxxx",
    "new_balance": 950.50
}
                        </pre>
                    </div>

                    <div class="mt-3">
                        <strong>4. Получение статуса транзакции</strong><br>
                        <code>action=get_transaction_status</code><br>
                        <small class="text-muted">Метод: GET или POST</small><br>
                        <small class="text-muted">Отслеживание статуса конкретной транзакции.</small><br>
                        <strong>Параметры:</strong>
                        <ul>
                            <li><code>api_token</code> (string, required)</li>
                            <li><code>transaction_id</code> (string, required): ID транзакции.</li>
                        </ul>
                        <strong>Успешный ответ (200 OK):</strong>
                        <pre class="bg-light p-2 mt-1">
{
    "status": "success",
    "transaction": {
        "id": "txn_xxxxxxxxxxxx",
        "partner_id": "partner_yyyyy",
        "partner_name": "Имя Партнера",
        "payment_amount": 100.00,
        "payment_currency": "USD",
        // ... другие поля транзакции
        "status": "success",
        "timestamp": "YYYY-MM-DD HH:MM:SS"
    }
}
                        </pre>
                    </div>
                </div>
            </div>

            <div class="card mt-4">
                <div class="card-header">
                    <h4>Дополнительные API для партнеров (Интегрировано в основной API)</h4>
                </div>
                <div class="card-body">
                    <h5>Отправка лидов на обработку (пакетная)</h5>
                    <p>Этот функционал позволяет партнерам отправлять массив лидов для добавления или обновления в системе (сохраняются в тот же список, что и лиды из AmoCRM, но с указанием ID партнера). Теперь это часть основного API, описанного выше.</p>
                    <p><strong>URL:</strong> <code>https://<?= $_SERVER['HTTP_HOST'] ?>/amogt/gpt_payment_api/api.php</code></p>
                    <p><strong>Action:</strong> <code>submit_partner_lead</code></p>
                    <p><strong>Метод:</strong> POST</p>
                    <p><strong>Формат запроса:</strong> JSON (тело запроса)</p>
                    <strong>Параметры (в теле JSON-запроса):</strong>
                    <ul>
                        <li><code>action</code> (string, required): Должен быть <code>"submit_partner_lead"</code>.</li>
                        <li><code>api_token</code> (string, required): Уникальный API токен партнера для аутентификации.</li>
                        <li><code>lead_data</code> (array, required): Массив JSON-объектов, где каждый объект представляет лид. Каждый лид должен содержать как минимум <code>dealId</code>. Другие поля, такие как <code>paymentUrl</code>, <code>created_at</code>, <code>last_updated</code> и любые пользовательские поля, также могут быть включены. Поле <code>partnerId</code> будет добавлено/перезаписано сервером на основе <code>api_token</code>.</li>
                    </ul>
                    <strong>Пример тела запроса:</strong>
                    <pre class="bg-light p-2 mt-1">
{
    "action": "submit_partner_lead",
    "api_token": "ВАШ_API_ТОКЕН",
    "lead_data": [
        {
            "dealId": "14252569",
            "paymentUrl": "https://pay.openai.com/...",
            "created_at": "2025-06-09 08:47:02",
            "last_updated": "2025-06-09 08:47:02",
            "custom_field_example": "some_value"
        },
        {
            "dealId": "14254221",
            "paymentUrl": "https://pay.openai.com/...",
            "custom_notes": "Another lead with different data"
        }
    ]
}
                    </pre>
                    <strong>Успешный ответ (200 OK):</strong>
                    <pre class="bg-light p-2 mt-1">
{
    "status": "success",
    "message": "Processed X leads.",
    "processed_count": X,
    "errors": [] // Массив ошибок, если какие-то лиды не удалось обработать
}
                    </pre>
                    <strong>Возможные ошибки:</strong>
                    <ul>
                        <li><code>400 Bad Request</code>: Неверный JSON или отсутствуют обязательные параметры (<code>action</code>, <code>api_token</code>, <code>lead_data</code> как массив, или <code>dealId</code> в одном из лидов).</li>
                        <li><code>401 Unauthorized</code>: Неверный или отсутствующий <code>api_token</code>.</li>
                        <li><code>405 Method Not Allowed</code>: Использован метод, отличный от POST.</li>
                        <li><code>429 Too Many Requests</code>: Другой процесс уже обрабатывает запрос (из-за lock-файла).</li>
                        <li><code>500 Internal Server Error</code>: Ошибка на стороне сервера при сохранении лидов.</li>
                    </ul>
                </div>
            </div>
            
            <div class="card mt-4">
                <div class="card-header">
                    <h4>Примеры использования</h4>
                </div>
                <div class="card-body">
                    <h5>PHP пример (получение баланса)</h5>
                    <pre class="bg-light p-3">
$apiKey = 'ВАШ_API_ТОКЕН';
$apiUrl = '<?= $_SERVER['REQUEST_SCHEME'] ?>://<?= $_SERVER['HTTP_HOST'] ?>/amogt/gpt_payment_api/api.php';

$data = [
    'action' => 'get_balance',
    'api_token' => $apiKey
];

// Для GET запроса
$urlWithParams = $apiUrl . '?' . http_build_query($data);

$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, $urlWithParams);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
// Если нужно использовать POST:
// curl_setopt($ch, CURLOPT_URL, $apiUrl);
// curl_setopt($ch, CURLOPT_POST, true);
// curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query($data));


$response = curl_exec($ch);
curl_close($ch);

echo $response;
                    </pre>

                    <h5 class="mt-4">JavaScript пример (получение стоимости платежа)</h5>
                    <pre class="bg-light p-3">
const apiKey = 'ВАШ_API_ТОКЕН';
const apiUrl = '<?= $_SERVER['REQUEST_SCHEME'] ?>://<?= $_SERVER['HTTP_HOST'] ?>/amogt/gpt_payment_api/api.php';

const params = new URLSearchParams();
params.append('action', 'get_payment_cost');
params.append('api_token', apiKey);
params.append('payment_amount', '100');
params.append('payment_currency', 'USD');

fetch(apiUrl, {
    method: 'POST',
    headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params
})
.then(response => response.json())
.then(data => console.log(data))
.catch(error => console.error('Error:', error));
                    </pre>
                </div>
            </div>

            <div class="card mt-4">
                <div class="card-header">
                    <h4>Коды ошибок API</h4>
                </div>
                <div class="card-body">
                    <ul>
                        <li><code>400 Bad Request</code> - Неверные параметры запроса (например, отсутствует обязательный параметр, неверный формат данных) или указано неверное действие (<code>action</code>).</li>
                        <li><code>401 Unauthorized</code> - Неверный или отсутствующий <code>api_token</code>, или партнер не найден.</li>
                        <li><code>402 Payment Required</code> - Недостаточно средств на балансе для проведения платежа (только для <code>process_payment</code>).</li>
                        <li><code>404 Not Found</code> - Запрошенный ресурс не найден (например, транзакция по указанному ID для <code>get_transaction_status</code>).</li>
                        <li><code>500 Internal Server Error</code> - Внутренняя ошибка сервера (например, не удалось рассчитать стоимость платежа из-за отсутствия курса валюты, или другая непредвиденная ошибка при обработке платежа).</li>
                    </ul>
                </div>
            </div>
        </div>
    </div>
</div>
