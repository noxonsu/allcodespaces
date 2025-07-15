<?php
// templates/api_test.php
if (!partner_is_logged_in()) {
    header('Location: index.php?page=login');
    exit;
}

$partner = get_current_partner();

// Отладочная информация
$debugInfo = [
    'session_data' => [
        'partner_logged_in' => $_SESSION['partner_logged_in'] ?? 'not_set',
        'partner_id' => $_SESSION['partner_id'] ?? 'not_set',
        'partner_name' => $_SESSION['partner_name'] ?? 'not_set',
        'partner_token' => $_SESSION['partner_token'] ?? 'not_set'
    ],
    'partner_data' => $partner
];

if (!$partner) {
    $apiTestError = 'Ошибка: партнер не найден в сессии. Данные сессии: ' . json_encode($debugInfo['session_data']);
} elseif (!isset($partner['api_token'])) {
    $apiTestError = 'Ошибка: токен партнера не найден в данных партнера. Данные партнера: ' . json_encode($partner);
}

// Загружаем курсы валют из админки
$db = new DB();
$rates = [];
try {
    $ratesData = $db->read('exchange_rates') ?? [];
    foreach ($ratesData as $pair => $data) {
        // Извлекаем валюту из пары типа "USD_RUB"
        if (strpos($pair, '_RUB') !== false) {
            $currency = str_replace('_RUB', '', $pair);
            $rates[$currency] = $data['rate'];
        }
    }
} catch (Exception $e) {
    logMessage("[PARTNER_PORTAL] Error loading currency rates: " . $e->getMessage());
    $rates = [
        'USD' => 95.0,
        'EUR' => 105.0,
        'GBP' => 115.5,
        'TRY' => 3.2,
        'KZT' => 0.2
    ]; // Значения по умолчанию
}

$apiTestResult = null;
$apiTestError = null;
$fullTestResults = [];

// Тестовые URL для полного тестирования
$testUrls = [
    'https://pay.openai.com/c/pay/cs_live_a1NI1dJLxjzVOohUerqJUkzOlTnzrkY1Zk5YeKkqF1qBtOkrAKeaufJteI#fidpamZkaWAnPyd3cCcpJ3ZwZ3Zmd2x1cWxqa1BrbHRwYGtgdnZAa2RnaWBhJz9jZGl2YCknZHVsTmB8Jz8ndW5aaWxzYFowNE1Kd1ZyRjNtNGt9QmpMNmlRRGJXb1xTd38xYVA2Y1NKZGd8RmZOVzZ1Z0BPYnBGU0RpdEZ9YX1GUHNqV200XVJyV2RmU2xqc1A2bklOc3Vub20yTHRuUjU1bF1Udm9qNmsnKSdjd2poVmB3c2B3Jz9xd3BgKSdpZHxqcHFRfHVgJz8ndmxrYmlgWmxxYGgnKSdga2RnaWBVaWRmYG1qaWFgd3YnP3F3cGB4JSUl',
    'https://pay.stripe.com/pay/link_example#fragment',
    'https://pay.openai.com/simple/link'
];

// Обработка POST запроса для тестирования API
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['test_api'])) {
    $testUrl = trim($_POST['payment_url'] ?? '');
    
    if (empty($testUrl)) {
        $apiTestError = 'Пожалуйста, введите URL платежа';
    } else {
        // Вызываем API для получения валюты и суммы
        $apiUrl = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on' ? 'https' : 'http') . '://' . $_SERVER['HTTP_HOST'] . '/chatgptbot_connector/gpt_payment_api/api.php';
        
        // Определяем токен - пробуем api_token, потом token
        $apiToken = $partner['api_token'] ?? $partner['token'] ?? null;
        
        if (!$apiToken) {
            $apiTestError = 'Токен партнера не найден. Данные партнера: ' . json_encode($partner);
        } else {
            $postData = json_encode([
                'action' => 'getamountandcurrency',
                'api_token' => $apiToken,
                'url' => $testUrl
            ]);
        
            $ch = curl_init();
            curl_setopt($ch, CURLOPT_URL, $apiUrl);
            curl_setopt($ch, CURLOPT_POST, true);
            curl_setopt($ch, CURLOPT_POSTFIELDS, $postData);
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_TIMEOUT, 120);
            curl_setopt($ch, CURLOPT_HTTPHEADER, [
                'Content-Type: application/json',
                'Content-Length: ' . strlen($postData)
            ]);
            
            $response = curl_exec($ch);
            $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            $curlError = curl_error($ch);
            curl_close($ch);
            
            if ($curlError) {
                $apiTestError = 'Ошибка cURL: ' . $curlError;
            } elseif ($httpCode !== 200) {
                $apiTestError = 'API вернул код: ' . $httpCode . '. Ответ: ' . $response;
            } else {
                $apiTestResult = json_decode($response, true);
                
                // Если получили результат, рассчитываем стоимость списания
                if ($apiTestResult && $apiTestResult['status'] === 'success') {
                    $amount = floatval($apiTestResult['amount']);
                    $currency = $apiTestResult['currency'];
                    
                    // Используем PaymentCore для расчета стоимости
                    require_once __DIR__ . '/../../lib/payment_core.php';
                    
                    $costDetails = PaymentCore::getPaymentCost($amount, $currency);
                    if ($costDetails) {
                        $apiTestResult['cost_in_rub'] = $costDetails['cost_in_balance_units'];
                        $apiTestResult['rate_used'] = $costDetails['rate_used'];
                        $apiTestResult['currency_pair'] = $costDetails['rate_currency_pair'];
                    } else {
                        // Fallback для случая, когда курс не найден
                        if ($currency === 'RUB') {
                            $costInRub = $amount;
                            $apiTestResult['cost_in_rub'] = round($costInRub, 2);
                            $apiTestResult['rate_used'] = 1.0;
                            $apiTestResult['currency_pair'] = 'RUB_RUB';
                        } else {
                            $apiTestResult['cost_in_rub'] = 'Курс не найден';
                            $apiTestResult['rate_used'] = 'Не найден';
                            $apiTestResult['currency_pair'] = $currency . '_RUB';
                        }
                    }
                }
            }
        }
    }
}

// Обработка полного тестирования
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['run_full_test'])) {
    $apiUrl = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on' ? 'https' : 'http') . '://' . $_SERVER['HTTP_HOST'] . '/chatgptbot_connector/gpt_payment_api/api.php';
    
    // Определяем токен - пробуем api_token, потом token
    $apiToken = $partner['api_token'] ?? $partner['token'] ?? null;
    
    if (!$apiToken) {
        $apiTestError = 'Токен партнера не найден для полного теста. Данные партнера: ' . json_encode($partner);
    } else {
        foreach ($testUrls as $index => $testUrl) {
            $testResult = [
                'url' => $testUrl,
                'get_test' => null,
                'post_test' => null,
                'base64_test' => null
            ];
            
            // Тест 1: GET запрос
            $getUrl = $apiUrl . '?' . http_build_query([
                'action' => 'getamountandcurrency',
                'api_token' => $apiToken,
                'url' => $testUrl
            ]);
        
        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $getUrl);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 120);
        curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
        curl_setopt($ch, CURLOPT_USERAGENT, 'Mozilla/5.0 Test Client');
        
        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $error = curl_error($ch);
        curl_close($ch);
        
        $testResult['get_test'] = [
            'http_code' => $httpCode,
            'error' => $error,
            'response' => $response ? json_decode($response, true) : null
        ];
        
        // Тест 2: POST запрос с JSON
        $postData = json_encode([
            'action' => 'getamountandcurrency',
            'api_token' => $apiToken,
            'url' => $testUrl
        ]);
        
        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $apiUrl);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, $postData);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 120);
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'Content-Type: application/json',
            'Content-Length: ' . strlen($postData)
        ]);
        curl_setopt($ch, CURLOPT_USERAGENT, 'Mozilla/5.0 Test Client');
        
        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $error = curl_error($ch);
        curl_close($ch);
        
        $testResult['post_test'] = [
            'http_code' => $httpCode,
            'error' => $error,
            'response' => $response ? json_decode($response, true) : null
        ];
        
        // Тест 3: GET запрос с base64 URL (для URL с фрагментами)
        if (strpos($testUrl, '#') !== false) {
            $base64Url = base64_encode($testUrl);
            $getUrl = $apiUrl . '?' . http_build_query([
                'action' => 'getamountandcurrency',
                'api_token' => $apiToken,
                'url_base64' => $base64Url
            ]);
            
            $ch = curl_init();
            curl_setopt($ch, CURLOPT_URL, $getUrl);
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_TIMEOUT, 120);
            curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
            curl_setopt($ch, CURLOPT_USERAGENT, 'Mozilla/5.0 Test Client');
            
            $response = curl_exec($ch);
            $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            $error = curl_error($ch);
            curl_close($ch);
            
            $testResult['base64_test'] = [
                'http_code' => $httpCode,
                'error' => $error,
                'response' => $response ? json_decode($response, true) : null
            ];
        }
        
        $fullTestResults[] = $testResult;
    }
    }
}
?>

<div class="container-fluid">
    <div class="row">
        <div class="col-md-12">
            <div class="card">
                <div class="card-header">
                    <h4 class="card-title">
                        <i class="fas fa-flask"></i> Тестирование API расчета стоимости
                    </h4>
                    
                    <!-- Вкладки навигации -->
                    <ul class="nav nav-tabs mt-3" id="testTabs" role="tablist">
                        <li class="nav-item">
                            <a class="nav-link active" id="simple-test-tab" data-toggle="tab" href="#simple-test" role="tab">
                                <i class="fas fa-search"></i> Простой тест
                            </a>
                        </li>
                        <li class="nav-item">
                            <a class="nav-link" id="full-test-tab" data-toggle="tab" href="#full-test" role="tab">
                                <i class="fas fa-list-check"></i> Полный тест
                            </a>
                        </li>
                        <li class="nav-item">
                            <a class="nav-link" id="rates-tab" data-toggle="tab" href="#rates" role="tab">
                                <i class="fas fa-exchange-alt"></i> Курсы валют
                            </a>
                        </li>
                    </ul>
                </div>
                <div class="card-body">
                    <div class="tab-content" id="testTabsContent">
                        <!-- Простой тест -->
                        <div class="tab-pane fade show active" id="simple-test" role="tabpanel">
                            <div class="row">
                                <!-- Форма тестирования -->
                                <div class="col-md-6">
                                    <h5>Тест API getamountandcurrency</h5>
                                    
                                    <!-- Отладочная информация -->
                                    <div class="alert alert-info mb-3">
                                        <small>
                                            <strong>Партнер:</strong> <?= htmlspecialchars($partner['name'] ?? 'Не найден') ?><br>
                                            <strong>ID:</strong> <?= htmlspecialchars($partner['id'] ?? 'Не найден') ?><br>
                                            <strong>API Токен:</strong> 
                                            <div class="input-group input-group-sm mt-1">
                                                <input type="text" class="form-control" 
                                                       id="api-token-test" 
                                                       value="<?= htmlspecialchars($partner['api_token'] ?? $partner['token'] ?? 'Не найден') ?>" 
                                                       readonly>
                                                <div class="input-group-append">
                                                    <button class="btn btn-outline-secondary" 
                                                            onclick="copyToClipboard('api-token-test')" 
                                                            title="Скопировать токен">
                                                        <i class="fas fa-copy"></i>
                                                    </button>
                                                </div>
                                            </div>
                                        </small>
                                    </div>
                                    
                                    <!-- Отладочная информация сессии (если есть ошибки) -->
                                    <?php if (isset($debugInfo)): ?>
                                        <div class="alert alert-warning mb-3">
                                            <small>
                                                <strong>Отладочная информация:</strong><br>
                                                <pre><?= htmlspecialchars(json_encode($debugInfo, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE)) ?></pre>
                                            </small>
                                        </div>
                                    <?php endif; ?>
                                    
                            <form method="post" class="mb-4">
                                <div class="form-group">
                                    <label for="payment_url">URL платежа:</label>
                                    <input type="url" 
                                           id="payment_url" 
                                           name="payment_url" 
                                           class="form-control" 
                                           placeholder="https://pay.openai.com/c/pay/..." 
                                           value="<?= htmlspecialchars($_POST['payment_url'] ?? '') ?>"
                                           required>
                                    <small class="form-text text-muted">
                                        Введите URL платежной страницы для получения суммы и валюты
                                    </small>
                                </div>
                                <button type="submit" name="test_api" class="btn btn-primary">
                                    <i class="fas fa-search"></i> Получить данные платежа
                                </button>
                            </form>
                            
                            <!-- Результат тестирования -->
                            <?php if ($apiTestError): ?>
                                <div class="alert alert-danger">
                                    <strong>Ошибка:</strong> <?= htmlspecialchars($apiTestError) ?>
                                </div>
                            <?php endif; ?>
                            
                            <?php if ($apiTestResult): ?>
                                <div class="alert alert-<?= $apiTestResult['status'] === 'success' ? 'success' : 'danger' ?>">
                                    <h6>Результат API:</h6>
                                    <?php if ($apiTestResult['status'] === 'success'): ?>
                                        <ul class="mb-0">
                                            <li><strong>Сумма:</strong> <?= htmlspecialchars($apiTestResult['amount']) ?></li>
                                            <li><strong>Валюта:</strong> <?= htmlspecialchars($apiTestResult['currency']) ?></li>
                                            <li><strong>Курс:</strong> <?= $apiTestResult['rate_used'] ?> (<?= htmlspecialchars($apiTestResult['currency_pair'] ?? '') ?>)</li>
                                            <li><strong>К списанию с баланса:</strong> <?= $apiTestResult['cost_in_rub'] ?> RUB</li>
                                            <li><strong>Время парсинга:</strong> <?= htmlspecialchars($apiTestResult['parsed_at']) ?></li>
                                        </ul>
                                        <?php if (!empty($apiTestResult['vision_text'])): ?>
                                            <hr>
                                            <small><strong>Распознанный текст:</strong> <?= htmlspecialchars($apiTestResult['vision_text']) ?></small>
                                        <?php endif; ?>
                                    <?php else: ?>
                                        <strong>Ошибка:</strong> <?= htmlspecialchars($apiTestResult['message']) ?>
                                    <?php endif; ?>
                                </div>
                            <?php endif; ?>
                        </div>
                    </div>
                </div>
                
                <!-- Полный тест API -->
                <div class="tab-pane fade" id="full-test" role="tabpanel">
                    <div class="row">
                        <div class="col-md-12">
                            <div class="d-flex justify-content-between align-items-center mb-3">
                                <h5>Полное тестирование API</h5>
                                <form method="post" style="display: inline;">
                                    <button type="submit" name="run_full_test" class="btn btn-primary">
                                        <i class="fas fa-play"></i> Запустить полный тест
                                    </button>
                                </form>
                            </div>
                            
                            <?php if (!empty($fullTestResults)): ?>
                                <div class="accordion" id="fullTestAccordion">
                                    <?php foreach ($fullTestResults as $index => $testResult): ?>
                                        <div class="card">
                                            <div class="card-header" id="heading<?= $index ?>">
                                                <h2 class="mb-0">
                                                    <button class="btn btn-link btn-block text-left" type="button" 
                                                            data-toggle="collapse" data-target="#collapse<?= $index ?>" 
                                                            aria-expanded="<?= $index === 0 ? 'true' : 'false' ?>" 
                                                            aria-controls="collapse<?= $index ?>">
                                                        <strong>Тест #<?= $index + 1 ?>:</strong> <?= htmlspecialchars($testResult['url']) ?>
                                                    </button>
                                                </h2>
                                            </div>
                                            <div id="collapse<?= $index ?>" class="collapse <?= $index === 0 ? 'show' : '' ?>" 
                                                 aria-labelledby="heading<?= $index ?>" data-parent="#fullTestAccordion">
                                                <div class="card-body">
                                                    <div class="row">
                                                        <!-- GET тест -->
                                                        <div class="col-md-4">
                                                            <h6>GET запрос</h6>
                                                            <?php $getTest = $testResult['get_test']; ?>
                                                            <div class="alert alert-<?= $getTest['http_code'] == 200 ? 'success' : 'danger' ?> p-2">
                                                                <small>
                                                                    <strong>HTTP:</strong> <?= $getTest['http_code'] ?><br>
                                                                    <?php if ($getTest['error']): ?>
                                                                        <strong>Ошибка:</strong> <?= htmlspecialchars($getTest['error']) ?><br>
                                                                    <?php endif; ?>
                                                                    <?php if ($getTest['response']): ?>
                                                                        <?php if ($getTest['response']['status'] === 'success'): ?>
                                                                            <strong>✓ Сумма:</strong> <?= htmlspecialchars($getTest['response']['amount']) ?><br>
                                                                            <strong>✓ Валюта:</strong> <?= htmlspecialchars($getTest['response']['currency']) ?><br>
                                                                            <strong>✓ Стоимость:</strong> <?= htmlspecialchars($getTest['response']['cost_in_balance_currency'] ?? 'N/A') ?> RUB
                                                                        <?php else: ?>
                                                                            <strong>✗ Ошибка:</strong> <?= htmlspecialchars($getTest['response']['message']) ?>
                                                                        <?php endif; ?>
                                                                    <?php endif; ?>
                                                                </small>
                                                            </div>
                                                        </div>
                                                        
                                                        <!-- POST тест -->
                                                        <div class="col-md-4">
                                                            <h6>POST запрос</h6>
                                                            <?php $postTest = $testResult['post_test']; ?>
                                                            <div class="alert alert-<?= $postTest['http_code'] == 200 ? 'success' : 'danger' ?> p-2">
                                                                <small>
                                                                    <strong>HTTP:</strong> <?= $postTest['http_code'] ?><br>
                                                                    <?php if ($postTest['error']): ?>
                                                                        <strong>Ошибка:</strong> <?= htmlspecialchars($postTest['error']) ?><br>
                                                                    <?php endif; ?>
                                                                    <?php if ($postTest['response']): ?>
                                                                        <?php if ($postTest['response']['status'] === 'success'): ?>
                                                                            <strong>✓ Сумма:</strong> <?= htmlspecialchars($postTest['response']['amount']) ?><br>
                                                                            <strong>✓ Валюта:</strong> <?= htmlspecialchars($postTest['response']['currency']) ?><br>
                                                                            <strong>✓ Стоимость:</strong> <?= htmlspecialchars($postTest['response']['cost_in_balance_currency'] ?? 'N/A') ?> RUB
                                                                        <?php else: ?>
                                                                            <strong>✗ Ошибка:</strong> <?= htmlspecialchars($postTest['response']['message']) ?>
                                                                        <?php endif; ?>
                                                                    <?php endif; ?>
                                                                </small>
                                                            </div>
                                                        </div>
                                                        
                                                        <!-- Base64 тест -->
                                                        <div class="col-md-4">
                                                            <h6>Base64 GET запрос</h6>
                                                            <?php if ($testResult['base64_test']): ?>
                                                                <?php $base64Test = $testResult['base64_test']; ?>
                                                                <div class="alert alert-<?= $base64Test['http_code'] == 200 ? 'success' : 'danger' ?> p-2">
                                                                    <small>
                                                                        <strong>HTTP:</strong> <?= $base64Test['http_code'] ?><br>
                                                                        <?php if ($base64Test['error']): ?>
                                                                            <strong>Ошибка:</strong> <?= htmlspecialchars($base64Test['error']) ?><br>
                                                                        <?php endif; ?>
                                                                        <?php if ($base64Test['response']): ?>
                                                                            <?php if ($base64Test['response']['status'] === 'success'): ?>
                                                                                <strong>✓ Сумма:</strong> <?= htmlspecialchars($base64Test['response']['amount']) ?><br>
                                                                                <strong>✓ Валюта:</strong> <?= htmlspecialchars($base64Test['response']['currency']) ?><br>
                                                                                <strong>✓ Стоимость:</strong> <?= htmlspecialchars($base64Test['response']['cost_in_balance_currency'] ?? 'N/A') ?> RUB
                                                                            <?php else: ?>
                                                                                <strong>✗ Ошибка:</strong> <?= htmlspecialchars($base64Test['response']['message']) ?>
                                                                            <?php endif; ?>
                                                                        <?php endif; ?>
                                                                    </small>
                                                                </div>
                                                            <?php else: ?>
                                                                <div class="alert alert-secondary p-2">
                                                                    <small>Не применимо (URL без #)</small>
                                                                </div>
                                                            <?php endif; ?>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    <?php endforeach; ?>
                                </div>
                            <?php else: ?>
                                <div class="alert alert-info">
                                    <p><strong>Полный тест API включает:</strong></p>
                                    <ul>
                                        <li>Тестирование GET запросов с обычными URL</li>
                                        <li>Тестирование POST запросов с JSON данными</li>
                                        <li>Тестирование GET запросов с base64-кодированными URL (для фрагментов)</li>
                                        <li>Проверка всех способов передачи параметров</li>
                                    </ul>
                                    <p>Нажмите кнопку "Запустить полный тест" для начала тестирования.</p>
                                </div>
                            <?php endif; ?>
                        </div>
                    </div>
                </div>
                
                <!-- Курсы валют -->
                <div class="tab-pane fade" id="rates" role="tabpanel">
                    <div class="row">
                        <div class="col-md-8">
                            <h5>Текущие курсы валют</h5>
                            <div class="table-responsive">
                                <table class="table table-sm table-striped">
                                    <thead>
                                        <tr>
                                            <th>Валюта</th>
                                            <th>Курс к RUB</th>
                                            <th>Комиссия</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr>
                                            <td><strong>RUB</strong></td>
                                            <td>1.00</td>
                                            <td>+15%</td>
                                        </tr>
                                        <?php foreach ($rates as $currency => $rate): ?>
                                            <tr>
                                                <td><strong><?= htmlspecialchars($currency) ?></strong></td>
                                                <td><?= number_format($rate, 2) ?></td>
                                                <td>+15%</td>
                                            </tr>
                                        <?php endforeach; ?>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                        <div class="col-md-4">
                            <div class="alert alert-info">
                                <h6><i class="fas fa-info-circle"></i> Расчет стоимости:</h6>
                                <ul class="mb-0">
                                    <li><strong>RUB:</strong> Сумма платежа + 15% комиссии</li>
                                    <li><strong>USD:</strong> Сумма × курс USD/RUB + 15% комиссии</li>
                                    <li><strong>EUR:</strong> Сумма × курс EUR/RUB + 15% комиссии</li>
                                    <li><strong>GBP:</strong> Сумма × курс GBP/RUB + 15% комиссии</li>
                                    <li><strong>Другие валюты:</strong> По актуальному курсу + 15% комиссии</li>
                                </ul>
                            </div>
                            
                            <small class="text-muted">
                                <i class="fas fa-clock"></i> Курсы валют настраиваются администратором системы и обновляются регулярно.
                            </small>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
    
    <!-- Примеры использования -->
    <div class="row mt-4">
        <div class="col-md-12">
            <div class="card">
                <div class="card-header">
                    <h5 class="card-title">
                        <i class="fas fa-code"></i> Примеры использования API
                    </h5>
                </div>
                <div class="card-body">
                    <div class="row">
                        <div class="col-md-6">
                            <h6>POST запрос (рекомендуется):</h6>
                            <pre><code>curl -X POST <?= (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on' ? 'https' : 'http') . '://' . $_SERVER['HTTP_HOST'] ?>/chatgptbot_connector/gpt_payment_api/api.php \
  -H "Content-Type: application/json" \
  -d '{
    "action": "getamountandcurrency",
    "api_token": "<?= htmlspecialchars($partner['api_token']) ?>",
    "url": "https://pay.openai.com/c/pay/..."
  }'</code></pre>
                        </div>
                        <div class="col-md-6">
                            <h6>GET запрос с base64:</h6>
                            <pre><code>curl "<?= (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on' ? 'https' : 'http') . '://' . $_SERVER['HTTP_HOST'] ?>/chatgptbot_connector/gpt_payment_api/api.php?action=getamountandcurrency&api_token=<?= htmlspecialchars($partner['api_token']) ?>&url_base64=BASE64_ENCODED_URL"</code></pre>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</div>

<!-- Подключение Bootstrap JS для работы вкладок -->
<script>
$(document).ready(function() {
    // Активация вкладок Bootstrap
    $('#testTabs a').on('click', function (e) {
        e.preventDefault();
        $(this).tab('show');
    });
});

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

<style>
.card {
    box-shadow: 0 0.125rem 0.25rem rgba(0, 0, 0, 0.075);
    border: 1px solid rgba(0, 0, 0, 0.125);
}

.table-sm td, .table-sm th {
    padding: 0.3rem;
}

pre {
    background-color: #f8f9fa;
    border: 1px solid #e9ecef;
    border-radius: 0.25rem;
    padding: 0.75rem;
    font-size: 0.875rem;
    overflow-x: auto;
}

.alert {
    border-radius: 0.25rem;
}
</style>