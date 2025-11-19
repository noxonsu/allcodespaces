# Мониторинг интеграции с микросервисом парсинга

## Метрики Prometheus

### Publication Request Endpoint

**publication_requests_total**
- Общее количество запросов на публикацию
- Labels: `status`, `format`
- Статусы: `received`, `success`, `error`, `no_creative`, `channel_not_found`, `validation_error`

**publication_requests_success_total**
- Успешные публикации
- Labels: `format`

**publication_requests_failed_total**
- Неудачные запросы
- Labels: `error_type`, `format`
- Error types: `validation_error`, `channel_not_found`, `processing_error`

**publication_requests_no_creative_total**
- Запросы где не найден креатив
- Labels: `format`

**publication_request_duration_seconds**
- Время обработки запроса (histogram)
- Labels: `status`, `format`
- Buckets: 0.1, 0.5, 1.0, 2.0, 5.0, 10.0, 30.0 секунд

**active_publication_requests**
- Количество запросов в обработке (gauge)

### Creative Selection

**creative_selection_duration_seconds**
- Время выбора креатива (histogram)
- Labels: `format`
- Buckets: 0.01, 0.05, 0.1, 0.5, 1.0 секунд

### Bot Publication

**bot_publication_attempts_total**
- Попытки отправить публикацию в бот
- Labels: `status` (success/error)

**bot_publication_duration_seconds**
- Время отправки в бот (histogram)
- Buckets: 0.1, 0.5, 1.0, 2.0, 5.0, 10.0 секунд

### Authentication

**microservice_auth_attempts_total**
- Попытки авторизации
- Labels: `result`
- Results: `success`, `invalid_key`, `missing_header`, `invalid_format`, `not_configured`

### Outgoing Webhooks

**webhook_sent_total**
- Отправленные webhook уведомления
- Labels: `event_type`, `status`
- Event types: `channel_added`, `channel_deleted`, `channel_restored`
- Status: `success`, `timeout`, `error`, `unexpected_error`, `not_configured`

**webhook_duration_seconds**
- Время отправки webhook (histogram)
- Labels: `event_type`
- Buckets: 0.1, 0.5, 1.0, 2.0, 5.0 секунд

## Grafana Dashboard

### Панели для мониторинга

1. **Publication Requests Overview**
   - Rate of requests per second
   - Success rate (%)
   - Error rate (%)
   - P50/P95/P99 latency

2. **Status Breakdown**
   - Pie chart: success/error/no_creative/validation_error
   - Time series: requests by status

3. **Format Distribution**
   - Requests by format (sponsorship/fixed_slot/autopilot)
   - Success rate by format

4. **Authentication**
   - Auth attempts by result
   - Failed auth attempts rate

5. **Bot Integration**
   - Bot publication success rate
   - Bot response time

6. **Outgoing Webhooks**
   - Webhook success rate by event type
   - Webhook latency

### Примеры PromQL запросов

**Request Rate:**
```promql
rate(publication_requests_total[5m])
```

**Success Rate:**
```promql
rate(publication_requests_success_total[5m]) / rate(publication_requests_total{status="received"}[5m]) * 100
```

**P95 Latency:**
```promql
histogram_quantile(0.95, rate(publication_request_duration_seconds_bucket[5m]))
```

**Error Rate:**
```promql
rate(publication_requests_failed_total[5m])
```

**Active Requests:**
```promql
active_publication_requests
```

## Алерты

### Критичные

**High Error Rate**
```yaml
alert: PublicationRequestHighErrorRate
expr: rate(publication_requests_failed_total[5m]) > 0.1
for: 5m
labels:
  severity: critical
annotations:
  summary: "High publication request error rate"
  description: "Error rate is {{ $value }} errors/sec"
```

**High Latency**
```yaml
alert: PublicationRequestHighLatency
expr: histogram_quantile(0.95, rate(publication_request_duration_seconds_bucket[5m])) > 10
for: 5m
labels:
  severity: warning
annotations:
  summary: "High publication request latency"
  description: "P95 latency is {{ $value }}s"
```

**No Creative Found Rate**
```yaml
alert: PublicationRequestNoCreativeHighRate
expr: rate(publication_requests_no_creative_total[10m]) > 0.5
for: 10m
labels:
  severity: warning
annotations:
  summary: "High no-creative rate"
  description: "{{ $value }} requests/sec cannot find suitable creative"
```

**Authentication Failures**
```yaml
alert: MicroserviceAuthFailures
expr: rate(microservice_auth_attempts_total{result!="success"}[5m]) > 0.1
for: 5m
labels:
  severity: warning
annotations:
  summary: "Microservice authentication failures"
  description: "{{ $value }} failed auth attempts/sec"
```

**Webhook Failures**
```yaml
alert: WebhookHighErrorRate
expr: rate(webhook_sent_total{status!="success"}[5m]) > 0.1
for: 5m
labels:
  severity: warning
annotations:
  summary: "High webhook error rate"
  description: "{{ $value }} webhook errors/sec"
```

## Retry Механизм

### Publication Request
- Retry автоматически не выполняется на уровне endpoint
- Микросервис должен повторить запрос при получении ошибки
- Все запросы логируются в PublicationRequest для анализа

### Outgoing Webhooks
- Встроенный retry через `urllib3.util.retry.Retry`
- Параметры:
  - total=3 (3 попытки)
  - backoff_factor=1 (1s, 2s, 4s)
  - status_forcelist=[429, 500, 502, 503, 504]
- Логирование всех попыток

### Bot Publication
- Timeout: 30 секунд
- При ошибке логируется, но не прерывает создание PublicationRequest
- Status SUCCESS указывает что CampaignChannel создан

## Логирование

### Структура логов

**Publication Request:**
```
INFO: Publication request received: channel_id=..., format=...
INFO: Creative selected in 0.05s: campaign_id=...
INFO: Publication created: campaign_channel_id=...
INFO: Sent publication request to bot: 200
ERROR: Error processing publication request: ...
```

**Webhook:**
```
INFO: Sending channel_added event for channel ... to ...
INFO: Successfully sent channel_added event: 200
ERROR: Failed to send channel_deleted event: timeout
```

**Authentication:**
```
WARNING: Invalid microservice API key attempt
ERROR: Microservice authentication not configured
```

## Best Practices

1. **Мониторинг success rate** - должен быть >95%
2. **Латентность P95** - должна быть <5s
3. **No creative rate** - если >10% нужно добавить больше кампаний
4. **Auth failures** - проверить правильность API ключа
5. **Webhook errors** - проверить доступность микросервиса

## Troubleshooting

### Высокий error rate
1. Проверить логи PublicationRequest в админке
2. Найти повторяющиеся ошибки
3. Проверить доступность каналов
4. Проверить форматы креативов

### Долгая обработка
1. Проверить creative_selection_duration_seconds
2. Оптимизировать запросы к БД
3. Добавить индексы если нужно

### No creative found
1. Проверить что есть активные кампании
2. Проверить supported_formats каналов
3. Проверить бюджет кампаний
4. Проверить даты кампаний

### Webhook failures
1. Проверить PARSER_MICROSERVICE_URL
2. Проверить доступность микросервиса
3. Проверить логи webhook_sent_total
4. Проверить network connectivity
