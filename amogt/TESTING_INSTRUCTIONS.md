# Инструкции по Тестированию API после Рефакторинга

## Быстрый Чек-лист для Проверки

### 1. Проверка окружения
```bash
# Проверить текущее окружение:
php -r "require 'config.php'; echo 'Environment: ' . ENVIRONMENT . PHP_EOL;"

# Проверить директории:
ls -la data_production/ data_test/ logs_production/ logs_test/
```

### 2. Тестирование генерации dealId
```bash
# Запустить тест партнерского API:
php test_partner_api.php

# Ожидаемый результат - dealId в формате timestamp_random:
# Generated dealId: 1705312215_456789
```

### 3. Тестирование дублей paymentUrl
```php
// В test_partner_api.php найти тест дублей:
// Должен вернуть ошибку: "Duplicate paymentUrl found"
```

### 4. Проверка разделения окружений
```bash
# Тест в test окружении:
export APP_ENV=test
php test_partner_api.php
# Данные должны попасть в data_test/allLeads.json

# Тест в production окружении:
export APP_ENV=production  
php test_partner_api.php
# Данные должны попасть в data_production/allLeads.json
```

### 5. Проверка логирования
```bash
# Проверить что логи пишутся в правильные директории:
tail -f logs_test/app.log     # В тестовом окружении
tail -f logs_production/app.log  # В продакшн окружении
```

## Настройка Тестового Окружения

### 1. Создать тестовые переменные
```bash
cd /workspaces/allcodespaces/amogt/

# Создать test_api.env:
cat > test_api.env << EOF
API_TOKEN=test_token_12345
API_URL=http://localhost/chatgptbot_connector/gpt_payment_api/api.php
EOF
```

### 2. Настроить права доступа
```bash
chmod 755 data_test data_production logs_test logs_production
chmod 644 data_test/*.json data_production/*.json
chmod 644 logs_test/*.log logs_production/*.log
```

### 3. Проверить конфигурацию AmoCRM
```bash
# Убедиться что .env файлы содержат правильные токены:
cat .env.test | grep AMO_
cat .env.production | grep AMO_
```

## Типичные Ошибки и Решения

### Ошибка: "dealId still accepted from partner"
**Причина:** API еще принимает dealId от партнеров  
**Решение:** Проверить что в api.php удалена логика принятия dealId

### Ошибка: "Duplicate paymentUrl not detected"
**Причина:** Проверка дублей не работает  
**Решение:** Убедиться что логика проверки дублей реализована в api.php

### Ошибка: "Data saved to wrong environment" 
**Причина:** Данные сохраняются не в ту директорию  
**Решение:** Проверить переменную APP_ENV и config.php

### Ошибка: "Permission denied" при записи
**Причина:** Неправильные права доступа  
**Решение:** 
```bash
sudo chown -R www-data:www-data data_* logs_*
chmod -R 755 data_* logs_*
```

## Контрольные Точки

После каждого изменения проверить:

- [ ] dealId генерируется сервером (формат timestamp_random)
- [ ] Дубли paymentUrl отклоняются с HTTP 400
- [ ] Данные сохраняются в правильное окружение  
- [ ] Логи пишутся в правильную директорию
- [ ] Тесты проходят успешно
- [ ] Структура лидов консистентна (API + webhook)
- [ ] API токены маскируются в логах
- [ ] Парсер поддерживает тестовые Stripe URL

## Команды для Быстрого Тестирования

```bash
# Полный цикл тестирования:
cd /workspaces/allcodespaces/amogt/

# 1. Тест API партнеров:
php test_partner_api.php

# 2. Тест парсера:
php test_stripe_parser.php  

# 3. Тест отчетов:
php test_zeno_report.php

# 4. Проверка файлов данных:
jq . data_test/allLeads.json | head -20
jq . data_production/allLeads.json | head -20

# 5. Проверка логов:
tail -n 20 logs_test/app.log
tail -n 20 logs_production/app.log
```

## Ожидаемые Результаты

### Успешный тест должен показать:
```
✅ Environment detection: test
✅ Partner token validation: SUCCESS
✅ Server dealId generation: 1705312215_456789
✅ Duplicate paymentUrl rejection: SUCCESS  
✅ Data saved to: data_test/allLeads.json
✅ Logs written to: logs_test/app.log
```

### Структура сгенерированного лида:
```json
{
  "dealId": "1705312215_456789",
  "paymentUrl": "https://pay.openai.com/unique-url",
  "partnerId": "test_partner",
  "partner_name": "Test Partner",
  "created_at": "2025-01-15 10:30:15",
  "last_updated": "2025-01-15 10:30:15"
}
```

## Контакты

При возникновении проблем с тестированием:
1. Проверить логи в соответствующей директории окружения
2. Убедиться в правильности настройки переменных окружения
3. Проверить права доступа к файлам и директориям
