<?php

require_once __DIR__ . '/config.php'; // Подключаем config.php для загрузки .env
require_once __DIR__ . '/lib/payment_link_parser.php';
require_once __DIR__ . '/logger.php'; // Для logMessage, если не включен через payment_link_parser.php

// Настройки для тестирования API из env 
$apiToken = '17f2a88beaf40bedfc15711d073e6622'; // Токен партнера
$apiUrl = 'https://paysaasbot.ru/chatgptbot_connector/gpt_payment_api/api.php';

// Тестовые URL для проверки
$testUrls = [
    'https://pay.openai.com/c/pay/cs_live_a1NI1dJLxjzVOohUerqJUkzOlTnzrkY1Zk5YeKkqF1qBtOkrAKeaufJteI#fidpamZkaWAnPyd3cCcpJ3ZwZ3Zmd2x1cWxqa1BrbHRwYGtgdnZAa2RnaWBhJz9jZGl2YCknZHVsTmB8Jz8ndW5aaWxzYFowNE1Kd1ZyRjNtNGt9QmpMNmlRRGJXb1xTd38xYVA2Y1NKZGd8RmZOVzZ1Z0BPYnBGU0RpdEZ9YX1GUHNqV200XVJyV2RmU2xqc1A2bklOc3Vub20yTHRuUjU1bF1Udm9qNmsnKSdjd2poVmB3c2B3Jz9xd3BgKSdpZHxqcHFRfHVgJz8ndmxrYmlgWmxxYGgnKSdga2RnaWBVaWRmYG1qaWFgd3YnP3F3cGB4JSUl',
    'https://pay.stripe.com/pay/link_example#fragment',
    'https://pay.openai.com/simple/link'
];

function testApiCall($url, $method, $apiUrl, $apiToken, $useBase64 = false) {
    if ($method === 'GET') {
        $params = [
            'action' => 'getamountandcurrency',
            'api_token' => $apiToken
        ];
        
        if ($useBase64) {
            $params['url_base64'] = base64_encode($url);
        } else {
            $params['url'] = $url;
        }
        
        $getUrl = $apiUrl . '?' . http_build_query($params);
        
        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $getUrl);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 120);
        curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
        curl_setopt($ch, CURLOPT_USERAGENT, 'Mozilla/5.0 Test Client');
    } else {
        // POST запрос
        $postData = json_encode([
            'action' => 'getamountandcurrency',
            'api_token' => $apiToken,
            'url' => $url
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
    }
    
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);
    curl_close($ch);
    
    if ($error) {
        return ['error' => $error, 'http_code' => $httpCode, 'response' => null];
    }
    
    $data = json_decode($response, true);
    return ['error' => null, 'http_code' => $httpCode, 'response' => $data, 'raw_response' => $response];
}

echo "=== Testing API getamountandcurrency method with cost calculation ===\n";

foreach ($testUrls as $index => $testUrl) {
    echo "\n" . str_repeat('=', 80) . "\n";
    echo "TEST #" . ($index + 1) . "\n";
    echo "URL: " . $testUrl . "\n";
    echo str_repeat('=', 80) . "\n";
    
    // Тест 1: GET запрос
    echo "\n1. GET запрос:\n";
    echo str_repeat('-', 40) . "\n";
    $result = testApiCall($testUrl, 'GET', $apiUrl, $apiToken);
    
    if ($result['error']) {
        echo "❌ cURL Error: " . $result['error'] . "\n";
    } else {
        echo "HTTP Code: " . $result['http_code'] . "\n";
        if ($result['response'] && $result['response']['status'] === 'success') {
            echo "✅ SUCCESS:\n";
            echo "   💰 Amount: " . $result['response']['amount'] . "\n";
            echo "   💱 Currency: " . $result['response']['currency'] . "\n";
            echo "   📊 Exchange Rate: " . ($result['response']['exchange_rate'] ?? 'N/A') . "\n";
            echo "   💸 Cost in RUB: " . ($result['response']['cost_in_balance_currency'] ?? 'Not calculated') . "\n";
            echo "   🔄 Currency Pair: " . ($result['response']['currency_pair'] ?? 'N/A') . "\n";
        } else {
            echo "❌ FAILED: " . ($result['response']['message'] ?? 'Unknown error') . "\n";
        }
    }
    
    // Тест 2: POST запрос
    echo "\n2. POST запрос:\n";
    echo str_repeat('-', 40) . "\n";
    $result = testApiCall($testUrl, 'POST', $apiUrl, $apiToken);
    
    if ($result['error']) {
        echo "❌ cURL Error: " . $result['error'] . "\n";
    } else {
        echo "HTTP Code: " . $result['http_code'] . "\n";
        if ($result['response'] && $result['response']['status'] === 'success') {
            echo "✅ SUCCESS:\n";
            echo "   💰 Amount: " . $result['response']['amount'] . "\n";
            echo "   💱 Currency: " . $result['response']['currency'] . "\n";
            echo "   📊 Exchange Rate: " . ($result['response']['exchange_rate'] ?? 'N/A') . "\n";
            echo "   💸 Cost in RUB: " . ($result['response']['cost_in_balance_currency'] ?? 'Not calculated') . "\n";
            echo "   🔄 Currency Pair: " . ($result['response']['currency_pair'] ?? 'N/A') . "\n";
        } else {
            echo "❌ FAILED: " . ($result['response']['message'] ?? 'Unknown error') . "\n";
        }
    }
    
    // Тест 3: GET запрос с base64 URL (для URL с фрагментами)
    if (strpos($testUrl, '#') !== false) {
        echo "\n3. GET запрос с Base64 URL:\n";
        echo str_repeat('-', 40) . "\n";
        $result = testApiCall($testUrl, 'GET', $apiUrl, $apiToken, true);
        
        if ($result['error']) {
            echo "❌ cURL Error: " . $result['error'] . "\n";
        } else {
            echo "HTTP Code: " . $result['http_code'] . "\n";
            if ($result['response'] && $result['response']['status'] === 'success') {
                echo "✅ SUCCESS:\n";
                echo "   💰 Amount: " . $result['response']['amount'] . "\n";
                echo "   💱 Currency: " . $result['response']['currency'] . "\n";
                echo "   📊 Exchange Rate: " . ($result['response']['exchange_rate'] ?? 'N/A') . "\n";
                echo "   💸 Cost in RUB: " . ($result['response']['cost_in_balance_currency'] ?? 'Not calculated') . "\n";
                echo "   🔄 Currency Pair: " . ($result['response']['currency_pair'] ?? 'N/A') . "\n";
            } else {
                echo "❌ FAILED: " . ($result['response']['message'] ?? 'Unknown error') . "\n";
            }
        }
    }
}

echo "\n" . str_repeat('=', 80) . "\n";
echo "✅ Тестирование завершено!\n";
echo "📝 Теперь в ответе API должна быть стоимость списания с комиссией 15%\n";
echo "🔗 Проверьте партнерский ЛК: новые вкладки для тестирования доступны\n";
echo str_repeat('=', 80) . "\n";

?>
