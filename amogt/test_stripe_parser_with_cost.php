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

function testApiCall($url, $method, $postData = null) {
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 120);
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
    curl_setopt($ch, CURLOPT_USERAGENT, 'Mozilla/5.0 Test Client');
    
    if ($method === 'POST' && $postData) {
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, $postData);
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'Content-Type: application/json',
            'Content-Length: ' . strlen($postData)
        ]);
    }
    
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);
    curl_close($ch);
    
    if ($error) {
        echo "cURL Error: " . $error . "\n";
        return null;
    }
    
    echo "HTTP Code: " . $httpCode . "\n";
    echo "Response: " . $response . "\n";
    
    $data = json_decode($response, true);
    if ($data && $data['status'] === 'success') {
        echo "✓ SUCCESS: Amount: {$data['amount']}, Currency: {$data['currency']}";
        if (isset($data['cost_in_rub'])) {
            echo ", Cost: {$data['cost_in_rub']} RUB";
        }
        if (isset($data['exchange_rate'])) {
            echo ", Rate: {$data['exchange_rate']}";
        }
        echo "\n";
    } else {
        echo "✗ FAILED: " . ($data['message'] ?? 'Unknown error') . "\n";
    }
    
    return $data;
}

echo "=== Testing API getamountandcurrency method with cost calculation ===\n";

foreach ($testUrls as $index => $testUrl) {
    echo "\n--- Test #" . ($index + 1) . " ---\n";
    echo "URL: " . $testUrl . "\n";
    
    // Тест 1: GET запрос
    echo "\n1. Testing GET request:\n";
    $getUrl = $apiUrl . '?' . http_build_query([
        'action' => 'getamountandcurrency',
        'api_token' => $apiToken,
        'url' => $testUrl
    ]);
    
    testApiCall($getUrl, 'GET');
    
    // Тест 2: POST запрос с JSON
    echo "\n2. Testing POST request with JSON:\n";
    $postData = json_encode([
        'action' => 'getamountandcurrency',
        'api_token' => $apiToken,
        'url' => $testUrl
    ]);
    
    testApiCall($apiUrl, 'POST', $postData);
    
    // Тест 3: GET запрос с base64 URL (для URL с фрагментами)
    if (strpos($testUrl, '#') !== false) {
        echo "\n3. Testing GET request with base64 URL:\n";
        $base64Url = base64_encode($testUrl);
        $getUrl = $apiUrl . '?' . http_build_query([
            'action' => 'getamountandcurrency',
            'api_token' => $apiToken,
            'url_base64' => $base64Url
        ]);
        
        testApiCall($getUrl, 'GET');
    }
    
    echo "\n" . str_repeat('-', 60) . "\n";
}

echo "\n=== Legacy parsePaymentLink Test ===\n";
$legacyResult = parsePaymentLink($testUrls[0]);
echo "Legacy parsePaymentLink result:\n";
print_r($legacyResult);

echo "\n=== Test Complete ===\n";
echo "Спокойной ночи! 😴\n";

?>
