<?php

// Configuration
// Убедитесь, что этот URL соответствует пути к вашему amo2json.php
// Добавляем API ключ из .env.production для тестирования
require_once __DIR__ . '/config.php'; // Подключаем config для доступа к константам
$apiKey = defined('WEBHOOK_API_KEY') ? WEBHOOK_API_KEY : 'YOUR_DEFAULT_API_KEY'; // Получаем API ключ
$api_url = 'https://paysaasbot.ru/chatgptbot_connector/amo2json_webhook.php?apikey=' . urlencode($apiKey); // Добавляем API ключ в URL

// Sample webhook data for testing (имитация вебхука AmoCRM)
$webhook_data_add = [
    'leads' => [
        'add' => [
            [
                'id' => '12345678', // Пример ID сделки
                'name' => 'Тестовая сделка на добавление',
                'status_id' => '142',
                'pipeline_id' => '123',
                'custom_fields' => [
                    [
                        'id' => '835906', // ID пользовательского поля "Ссылка на оплату"
                        'name' => 'Ссылка на оплату',
                        'values' => [
                            [
                                'value' => 'https://example.com/payment/12345678' // Пример ссылки на оплату
                            ]
                        ]
                    ]
                ]
            ]
        ]
    ]
];

$webhook_data_update = [
    'leads' => [
        'update' => [
            [
                'id' => '87654321', // Пример ID сделки
                'name' => 'Тестовая сделка на обновление',
                'status_id' => '143',
                'pipeline_id' => '123',
                'custom_fields' => [
                    [
                        'id' => '835906', // ID пользовательского поля "Ссылка на оплату"
                        'name' => 'Ссылка на оплату',
                        'values' => [
                            [
                                'value' => 'https://example.com/payment/87654321_updated' // Пример обновленной ссылки
                            ]
                        ]
                    ]
                ]
            ]
        ]
    ]
];

echo "=== Testing amo2json.php ===\n";
echo "URL: $api_url\n";

// --- Test Scenario 1: Lead Add ---
echo "\n=== Test Scenario 1: Lead Add ===\n";
echo "Sending request with 'add' webhook data...\n";
sendWebhookRequest($api_url, $webhook_data_add);

// --- Test Scenario 2: Lead Update ---
echo "\n=== Test Scenario 2: Lead Update ===\n";
echo "Sending request with 'update' webhook data...\n";
sendWebhookRequest($api_url, $webhook_data_update);

// --- Test Scenario 3: Missing Deal ID ---
echo "\n=== Test Scenario 3: Missing Deal ID ===\n";
$missing_deal_id_data = $webhook_data_add;
unset($missing_deal_id_data['leads']['add'][0]['id']);
echo "Sending request with missing 'id'...\n";
sendWebhookRequest($api_url, $missing_deal_id_data);

// --- Test Scenario 4: Missing Payment URL ---
echo "\n=== Test Scenario 4: Missing Payment URL ===\n";
$missing_payment_url_data = $webhook_data_add;
unset($missing_payment_url_data['leads']['add'][0]['custom_fields'][0]['values'][0]['value']);
echo "Sending request with missing 'paymentUrl'...\n";
sendWebhookRequest($api_url, $missing_payment_url_data);

echo "\n=== Test Complete ===\n";

/**
 * Sends a cURL POST request with webhook data.
 * @param string $url The URL to send the request to.
 * @param array $data The data to send in the POST request (will be form-urlencoded).
 */
function sendWebhookRequest(string $url, array $data): void
{
    $curl = curl_init();

    // Для вебхуков AmoCRM данные обычно отправляются как application/x-www-form-urlencoded,
    // а не как JSON в теле запроса. $_POST в PHP автоматически парсит этот формат.
    // Поэтому мы используем http_build_query.
    $post_fields = http_build_query($data);

    curl_setopt_array($curl, [
        CURLOPT_URL => $url,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $post_fields,
        CURLOPT_HTTPHEADER => [
            'Content-Type: application/x-www-form-urlencoded',
            'Content-Length: ' . strlen($post_fields)
        ],
        CURLOPT_TIMEOUT => 30,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_SSL_VERIFYPEER => false, // Для тестовых сред
        CURLOPT_VERBOSE => false
    ]);

    $response = curl_exec($curl);
    $http_code = curl_getinfo($curl, CURLINFO_HTTP_CODE);
    $curl_error = curl_error($curl);

    curl_close($curl);

    if ($curl_error) {
        echo "cURL Error: $curl_error\n";
        return;
    }

    echo "HTTP Code: $http_code\n";
    echo "Response Body:\n";

    $response_data = json_decode($response, true);

    if (json_last_error() === JSON_ERROR_NONE) {
        echo json_encode($response_data, JSON_PRETTY_PRINT) . "\n";
    } else {
        echo "Raw response (not valid JSON):\n$response\n";
        echo "JSON decode error: " . json_last_error_msg() . "\n";
    }
    echo str_repeat("-", 50) . "\n";
}

?>
