# Руководство по Миграции API для Партнеров

## Критические изменения в API (2025)

Это руководство поможет партнерам обновить свои интеграции в связи с важными изменениями в API обработки лидов.

## ⚠️ BREAKING CHANGES

### 1. dealId теперь генерируется только сервером

**ДО (старое поведение):**
```json
{
    "action": "submit_partner_lead",
    "api_token": "your_token",
    "lead_data": [
        {
            "dealId": "partner_custom_id_123",  // ❌ Больше НЕ принимается
            "paymentUrl": "https://pay.openai.com/..."
        }
    ]
}
```

**ПОСЛЕ (новое поведение):**
```json
{
    "action": "submit_partner_lead", 
    "api_token": "your_token",
    "lead_data": [
        {
            // ✅ dealId НЕ передается - генерируется сервером
            "paymentUrl": "https://pay.openai.com/unique-url-1"
        }
    ]
}
```

**Что изменилось:**
- Поле `dealId` в запросе игнорируется
- Сервер всегда генерирует уникальный `dealId` в формате `timestamp_random`
- В ответе возвращается массив `generated_deal_ids` с новыми ID

### 2. Проверка дублирующихся paymentUrl

**Новое поведение:**
- Каждый `paymentUrl` должен быть уникальным в рамках всей системы
- При попытке отправить дубликат API вернет ошибку 400

**Пример ошибки дубликата:**
```json
{
    "status": "error",
    "message": "Duplicate paymentUrl found",
    "error_code": "DUPLICATE_PAYMENT_URL", 
    "duplicate_url": "https://pay.openai.com/duplicate-url"
}
```

### 3. Обновленный формат ответа

**ДО:**
```json
{
    "status": "success",
    "message": "Processed 2 leads. Added to main list: 1, Updated in main list: 1.",
    "processed_count": 2,
    "added_to_main_list_count": 1,
    "updated_in_main_list_count": 1,
    "errors": []
}
```

**ПОСЛЕ:**
```json
{
    "status": "success",
    "message": "Processed 2 leads. Added to main list: 2.",
    "processed_count": 2,
    "added_to_main_list_count": 2,
    "generated_deal_ids": ["1705312215_456789", "1705312220_789012"],
    "errors": []
}
```

**Что изменилось:**
- Убрано поле `updated_in_main_list_count` (больше нет обновлений существующих лидов)
- Добавлено поле `generated_deal_ids` с массивом сгенерированных ID

## Шаги Миграции

### Шаг 1: Обновить код отправки лидов

**PHP пример:**
```php
// СТАРЫЙ код - УБРАТЬ:
// $lead['dealId'] = 'custom_partner_id'; 

// НОВЫЙ код:
$leads = [
    [
        'paymentUrl' => 'https://pay.openai.com/unique-url-1', // Обязательно уникальный!
        'customerName' => 'John Doe',
        'customerEmail' => 'john@example.com'
        // dealId НЕ передаем - генерируется сервером
    ]
];
```

### Шаг 2: Обновить обработку ответа

**PHP пример:**
```php
$response = json_decode($api_response, true);

if ($response['status'] === 'success') {
    // НОВЫЙ способ получения dealId:
    $generated_ids = $response['generated_deal_ids'];
    
    // Сохранить сопоставление ваших ID с серверными:
    foreach ($leads as $index => $lead) {
        $your_internal_id = $lead['your_internal_id'];
        $server_deal_id = $generated_ids[$index];
        
        // Сохранить в вашей БД для дальнейшего отслеживания
        saveIdMapping($your_internal_id, $server_deal_id);
    }
}
```

### Шаг 3: Убедиться в уникальности paymentUrl

```php
// Проверка уникальности перед отправкой:
function ensureUniqueUrls($leads) {
    $urls = array_column($leads, 'paymentUrl');
    $unique_urls = array_unique($urls);
    
    if (count($urls) !== count($unique_urls)) {
        throw new Exception('Duplicate paymentUrl found in request');
    }
    
    return $leads;
}

$leads = ensureUniqueUrls($leads);
```

### Шаг 4: Обновить обработку ошибок

```php
if ($response['status'] === 'error') {
    switch ($response['error_code'] ?? null) {
        case 'DUPLICATE_PAYMENT_URL':
            // Обработать дубликат URL
            logError("Duplicate URL: " . $response['duplicate_url']);
            break;
            
        case 'INSUFFICIENT_FUNDS':
            // Уведомить о недостатке средств
            notifyLowBalance();
            break;
            
        default:
            // Общая обработка ошибок
            logError("API Error: " . $response['message']);
    }
}
```

## Тестирование Миграции

### 1. Создать тестовые переменные окружения

```bash
# Создать test_api.env:
API_TOKEN=your_test_token
API_URL=https://test-domain.com/amogt/gpt_payment_api/api.php
```

### 2. Протестировать новое поведение

```php
// test_new_api.php
<?php
$test_leads = [
    [
        'paymentUrl' => 'https://pay.openai.com/test-unique-url-' . time(),
        'customerName' => 'Test Customer'
    ]
];

$response = submitLeadsToAPI($test_leads, $api_token, $api_url);

// Проверить что dealId генерируется сервером:
if (preg_match('/^\d+_\d+$/', $response['generated_deal_ids'][0])) {
    echo "✅ dealId format correct\n";
} else {
    echo "❌ dealId format incorrect\n";
}
?>
```

### 3. Протестировать обработку дублей

```php
// Отправить один и тот же URL дважды:
$duplicate_url = 'https://pay.openai.com/test-duplicate-' . time();

$leads1 = [['paymentUrl' => $duplicate_url]];
$leads2 = [['paymentUrl' => $duplicate_url]]; // Дубликат

$response1 = submitLeadsToAPI($leads1, $api_token, $api_url);
$response2 = submitLeadsToAPI($leads2, $api_token, $api_url);

// Второй запрос должен вернуть ошибку:
if ($response2['status'] === 'error' && $response2['error_code'] === 'DUPLICATE_PAYMENT_URL') {
    echo "✅ Duplicate detection works\n";
}
```

## Обратная Совместимость

### Что НЕ изменилось:
- ✅ Формат API токена
- ✅ URL эндпоинта  
- ✅ HTTP метод (POST)
- ✅ Структура `lead_data` (кроме `dealId`)
- ✅ Обработка пользовательских полей
- ✅ Система аутентификации

### Что ИЗМЕНИЛОСЬ:
- ❌ `dealId` больше не принимается от партнера
- ❌ Дублирующиеся `paymentUrl` отклоняются
- ❌ Формат ответа (убраны поля обновления, добавлены `generated_deal_ids`)

## FAQ

**Q: Можно ли вернуть старое поведение с партнерскими dealId?**
A: Нет, это изменение сделано для обеспечения целостности данных и предотвращения конфликтов.

**Q: Как отслеживать свои лиды после миграции?**
A: Используйте `generated_deal_ids` из ответа API и сохраняйте сопоставление с вашими внутренними ID.

**Q: Что делать, если у меня уже есть лиды с дублирующимися URL?**
A: Очистите свою базу данных от дублей или добавьте уникальные параметры к URL перед отправкой.

**Q: Как проверить, что миграция прошла успешно?**
A: Запустите тестовый скрипт и убедитесь, что получаете `generated_deal_ids` в правильном формате.

## Поддержка

Если у вас возникли проблемы с миграцией:

1. Проверьте логи: `logs_test/submit_partner_lead.log`
2. Протестируйте на тестовом окружении
3. Убедитесь, что используете уникальные `paymentUrl`
4. Обратитесь к администратору с конкретными сообщениями об ошибках

**Дата вступления изменений в силу:** Немедленно после обновления кода  
**Последнее обновление документа:** 2025-01-15
