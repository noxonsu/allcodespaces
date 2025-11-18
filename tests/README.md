# TeleWin Automated Tests

Автоматизированные smoke-тесты для проверки доступности основных экранов приложения.

## Цель

Простейшая проверка, которая выявляет базовые ошибки:
- Недокатанные миграции БД
- Ошибки импорта
- 500-ые ошибки на базовых страницах
- Проблемы с доступом к данным

## Структура

- `admin-smoke-test.js` - тесты админских экранов (требует авторизации)
- `user-smoke-test.js` - тесты пользовательских экранов (без авторизации)
- `screenshots/` - скриншоты всех проверенных страниц

## Установка

```bash
npm install
```

## Запуск тестов

### Все тесты
```bash
npm run test:all
```

### Только админка
```bash
npm run test:admin
```

### Только пользовательские экраны
```bash
npm run test:user
```

## Переменные окружения

Можно переопределить через env-переменные:

```bash
BASE_URL=https://telewin.wpmix.net \
ADMIN_USERNAME=AlexeyFrolov \
ADMIN_PASSWORD=1234Fgtn@ \
npm run test:admin
```

## Что проверяется

### Admin Smoke Test
- ✅ Главная админки `/admin/`
- ✅ Список каналов `/admin/core/channel/`
- ✅ Список кампаний `/admin/core/campaign/`
- ✅ Список креативов `/admin/core/message/`
- ✅ Статистика по каналам `/admin/core/campaignchannel/`
- ✅ Пользователи `/admin/core/user/`
- ✅ Администраторы каналов `/admin/core/channeladmin/`
- ✅ Юридические лица `/admin/core/legalentity/`
- ✅ Финансовые операции `/admin/core/channeltransaction/`
- ✅ Выплаты `/admin/core/payout/`
- ✅ Токены предпросмотра `/admin/core/messagepreviewtoken/`
- ✅ Токены авторизации `/admin/core/userlogintoken/`

### User Smoke Test
- ✅ Главная страница `/`
- ✅ Страница входа `/login/`
- ✅ API документация Swagger `/docs/`
- ✅ API документация Redoc `/redoc/`

## Критерии успешного теста

Тест считается пройденным, если:
1. HTTP статус код = 200 (или 3xx для редиректов в user-тесте)
2. Нет Django ошибок в HTML (ProgrammingError, OperationalError, Traceback)
3. Страница загрузилась без timeout (30 сек)

## Результаты

После запуска создаются:
- Скриншоты всех страниц в `screenshots/`
- JSON-отчет: `screenshots/admin-test-report.json`
- JSON-отчет: `screenshots/user-test-report.json`

## Интеграция в CI/CD

Тесты можно добавить в GitHub Actions или другой CI:

```yaml
- name: Run smoke tests
  run: |
    npm install
    npm run test:all
```

Exit code:
- `0` - все тесты прошли
- `1` - есть упавшие тесты

## Примечания

- Тесты проверяют **только GET-запросы**
- Не модифицируют данные в БД
- Используют headless Chrome/Chromium
- Работают с любым доменом (staging/production)
