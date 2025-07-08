# Payment Parser Puppeteer Service

Сервис для парсинга платежных ссылок с помощью Puppeteer. Предназначен для извлечения суммы и валюты из URL платежных систем.

## Функциональность

- Парсинг ссылок на оплату из популярных платежных систем
- Кэширование результатов для повышения производительности
- Защита от атак и валидация безопасности
- Rate limiting для предотвращения DoS атак
- Логирование всех операций

## Поддерживаемые платежные системы

- OpenAI Pay
- Stripe
- PayPal
- Paddle
- Razorpay
- Square
- Apple Pay
- Authorize.Net
- Braintree
- Coinbase
- Google Pay
- Shopify
- Amazon Pay
- Klarna
- Afterpay
- Affirm
- WorldPay
- 2Checkout
- Mollie
- Adyen
- SumUp
- WePay
- Dwolla
- BlueSnap
- FastSpring
- Chargebee
- Recurly
- Paymill
- GoCardless

## Безопасность

### Проверки безопасности:
- Валидация доменов (только разрешенные платежные системы)
- Проверка на подозрительные символы и паттерны
- Защита от Directory Traversal атак
- Блокировка локальных и приватных IP адресов
- Ограничение длины URL (max 2048 символов)
- Проверка на подозрительные поддомены
- Rate limiting (100 запросов на IP за 15 минут)
- CORS настройки (только localhost)
- Helmet.js для дополнительной безопасности

### Защита от инъекций:
- Блокировка JavaScript протоколов
- Защита от CRLF инъекций
- Фильтрация HTML/JS символов
- Блокировка Data URLs и File URLs

## Установка

1. Установите зависимости:
```bash
npm install
```

2. Настройте переменные окружения в `.env`:
```env
PORT=3018
NODE_ENV=production
PUPPETEER_CACHE_DIR=/tmp/puppeteer_cache
```

3. Запустите сервис:
```bash
npm start
```

## Использование

### API Endpoints

#### GET /parse
Парсит платежную ссылку и возвращает сумму и валюту.

**Параметры:**
- `url` (required) - URL платежной страницы

**Пример запроса:**
```bash
curl "http://localhost:3018/parse?url=https://pay.openai.com/c/pay/cs_live_a1NI1dJLxjzVOohUerqJUkzOlTnzrkY1Zk5YeKkqF1qBtOkrAKeaufJteI"
```

**Пример ответа:**
```json
{
  "success": true,
  "amount": 20,
  "currency": "USD",
  "url": "https://pay.openai.com/c/pay/cs_live_a1NI1dJLxjzVOohUerqJUkzOlTnzrkY1Zk5YeKkqF1qBtOkrAKeaufJteI",
  "title": "Stripe Checkout",
  "hostname": "pay.openai.com",
  "parsed_at": "2025-07-08T21:55:56.608Z"
}
```

#### GET /health
Проверка здоровья сервиса.

**Пример ответа:**
```json
{
  "status": "healthy",
  "timestamp": "2025-07-08T21:55:41.306Z",
  "uptime": 13.975921363,
  "cache_stats": {
    "hits": 0,
    "misses": 0,
    "keys": 0,
    "ksize": 0,
    "vsize": 0
  }
}
```

#### GET /cache/stats
Получение статистики кэша.

#### POST /cache/clear
Очистка кэша.

## Управление сервисом

Используйте скрипт `manage.sh` для управления сервисом:

```bash
# Запуск сервиса
./manage.sh start

# Остановка сервиса
./manage.sh stop

# Перезапуск сервиса
./manage.sh restart

# Проверка статуса
./manage.sh status

# Просмотр логов
./manage.sh logs

# Тестирование
./manage.sh test

# Установка как системный сервис
./manage.sh install

# Удаление системного сервиса
./manage.sh uninstall
```

## Логирование

Все операции логируются в файл `logs/puppeteer.log`. Логи содержат:
- Время выполнения запросов
- Ошибки парсинга
- Результаты валидации безопасности
- Статистику кэша

## Производительность

- Кэширование результатов на 5 минут
- Оптимизация Puppeteer (отключение изображений, стилей)
- Ограничение количества одновременных запросов
- Graceful shutdown при остановке сервиса

## Ошибки и отладка

### Типичные ошибки:

1. **Domain not allowed** - URL содержит недопустимый домен
2. **URL contains suspicious characters** - URL содержит подозрительные символы
3. **Failed to parse payment details** - Не удалось извлечь сумму или валюту
4. **Invalid currency** - Неизвестная валюта
5. **Too many requests** - Превышен лимит запросов

### Отладка:

1. Проверьте логи: `./manage.sh logs`
2. Проверьте здоровье сервиса: `curl http://localhost:3018/health`
3. Проверьте статистику кэша: `curl http://localhost:3018/cache/stats`

## Интеграция с API

Сервис интегрируется с основным API через endpoint `getamountandcurrency`:

```php
// Пример использования в PHP
$url = "https://pay.openai.com/c/pay/...";
$response = file_get_contents("http://localhost:3018/parse?url=" . urlencode($url));
$data = json_decode($response, true);

if ($data['success']) {
    $amount = $data['amount'];
    $currency = $data['currency'];
    // Используйте данные...
}
```

## Системные требования

- Node.js 16+
- Chrome/Chromium для Puppeteer
- 512MB RAM минимум
- 1GB свободного места на диске

## Безопасность в продакшене

1. Запускайте сервис от непривилегированного пользователя
2. Используйте firewall для ограничения доступа
3. Регулярно обновляйте зависимости
4. Мониторьте логи на подозрительную активность
5. Используйте HTTPS для внешних соединений
