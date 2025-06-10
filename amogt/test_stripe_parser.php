<?php

require_once __DIR__ . '/config.php'; // Подключаем config.php для загрузки .env
require_once __DIR__ . '/lib/payment_link_parser.php';
require_once __DIR__ . '/logger.php'; // Для logMessage, если не включен через payment_link_parser.php



$filePath = 'amogt/debug_page.html'; // Путь к локальному HTML-файлу для отладки
$testUrl = 'https://pay.openai.com/c/pay/cs_live_a1aRkWMtKOYABBL3tpzkAHtib43SlgM9epwDVHcBU0d9GHeagFIhH2WTQH#fidpamZkaWAnPydgaycpJ3ZwZ3Zmd2x1cWxqa1BrbHRwYGtgdnZAa2RnaWBhJz9jZGl2YCknZHVsTmB8Jz8ndW5aaWxzYFowNE1Kd1ZyRjNtNGt9QmpMNmlRRGJXb1xTd38xYVA2Y1NKZGd8RmZOVzZ1Z0BPYnBGU0RpdEZ9YX1GUHNqV200XVJyV2RmU2xqc1A2bklOc3Vub20yTHRuUjU1bF1Udm9qNmsnKSdjd2poVmB3c2B3Jz9xd3BgKSdpZHxqcHFRfHVgJz8ndmxrYmlgWmxxYGgnKSdga2RnaWBVaWRmYG1qaWFgd3YnP3F3cGB4JSUl'; // Пример реальной ссылки

echo "=== Testing parsePaymentPage with local file ===\n";


$amountAndCurrency=parsePaymentLink($testUrl);
print_r($amountAndCurrency);
echo "\n=== Test Complete ===\n";

?>
