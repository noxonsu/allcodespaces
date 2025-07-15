<?php
/**
 * Тест различных способов передачи URL с фрагментом
 */

// Тестовый URL с фрагментом
$testUrl = 'https://checkout.stripe.com/c/pay/cs_test_123#fidkdWxOYHwnPyd1blpxYHZxWjA0QHBAdjJrUVVwUVRqN1Q1RDhpdks';

echo "=== Тестирование различных способов передачи URL с фрагментом ===\n\n";

// 1. Обычный GET запрос (не будет работать с фрагментом)
echo "1. GET запрос с обычным URL:\n";
$getUrl = 'https://your-api.com/api.php?method=getamountandcurrency&token=your_token&url=' . urlencode($testUrl);
echo "URL: " . $getUrl . "\n";
echo "Фрагмент потеряется в браузере\n\n";

// 2. GET запрос с base64 кодированием
echo "2. GET запрос с base64 кодированием:\n";
$base64Url = base64_encode($testUrl);
$getBase64Url = 'https://your-api.com/api.php?method=getamountandcurrency&token=your_token&url_base64=' . $base64Url;
echo "URL: " . $getBase64Url . "\n";
echo "Base64 URL: " . $base64Url . "\n";
echo "Декодированный URL: " . base64_decode($base64Url) . "\n\n";

// 3. POST запрос с JSON
echo "3. POST запрос с JSON:\n";
$postData = [
    'method' => 'getamountandcurrency',
    'token' => 'your_token',
    'url' => $testUrl
];
echo "POST данные: " . json_encode($postData, JSON_PRETTY_PRINT) . "\n\n";

// 4. Демонстрация как http_build_query обрабатывает фрагмент
echo "4. Как http_build_query обрабатывает фрагмент:\n";
$params = ['url' => $testUrl];
$queryString = http_build_query($params);
echo "Исходный URL: " . $testUrl . "\n";
echo "После http_build_query: " . $queryString . "\n";
echo "Фрагмент закодирован как: " . (strpos($queryString, '%23') !== false ? 'Да (%23)' : 'Нет') . "\n\n";

// 5. Тестирование curl команд
echo "5. Примеры curl команд:\n\n";

echo "GET с обычным URL (не сработает с фрагментом):\n";
echo "curl -X GET 'https://your-api.com/api.php?method=getamountandcurrency&token=your_token&url=" . urlencode($testUrl) . "'\n\n";

echo "GET с base64:\n";
echo "curl -X GET 'https://your-api.com/api.php?method=getamountandcurrency&token=your_token&url_base64=" . $base64Url . "'\n\n";

echo "POST с JSON:\n";
echo "curl -X POST 'https://your-api.com/api.php?method=getamountandcurrency&token=your_token' \\\n";
echo "  -H 'Content-Type: application/json' \\\n";
echo "  -d '" . json_encode($postData) . "'\n\n";

// 6. Тестирование декодирования на стороне сервера
echo "6. Тестирование декодирования на стороне сервера:\n";
echo "Исходный URL: " . $testUrl . "\n";
echo "URL-кодированный: " . urlencode($testUrl) . "\n";
echo "URL-декодированный: " . urldecode(urlencode($testUrl)) . "\n";
echo "Фрагмент сохраняется: " . (strpos(urldecode(urlencode($testUrl)), '#') !== false ? 'Да' : 'Нет') . "\n\n";
