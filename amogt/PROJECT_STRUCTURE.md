# Структура Проекта AMOGT

## Полное Дерево Файлов

```
/amogt/
├── data_production/                 # 📁 Продакшн данные
│   ├── allLeads.json               # 📄 Основной файл лидов (продакшн)
│   ├── amo_fields.json             # 📄 Структура полей AmoCRM
│   ├── amo_tokens.json             # 🔐 OAuth2 токены AmoCRM
│   ├── id_of_deals_sent_to_amo.txt # 📄 ID обработанных сделок
│   ├── pipelines.json              # 📄 Воронки и этапы AmoCRM
│   ├── recieved_amo_ids.txt        # 📄 ID полученных сделок AmoCRM
│   └── zeno_report.json            # 📄 Отчеты операторов
├── data_test/                      # 📁 Тестовые данные
│   ├── allLeads.json               # 📄 Основной файл лидов (тест)
│   ├── amo_fields.json             # 📄 Структура полей AmoCRM (тест)
│   ├── amo_fields.txt              # 📄 Дополнительные поля (текст)
│   ├── amo_tokens.json             # 🔐 OAuth2 токены AmoCRM (тест)
│   ├── blocked_deals.txt           # 📄 Заблокированные сделки
│   ├── field_mapping.json          # 📄 Маппинг полей
│   ├── id_of_deals_sent_to_amo.txt # 📄 ID обработанных сделок
│   ├── my-project-1337-*.json      # 🔐 Ключ сервисного аккаунта Google
│   ├── mycity2_key.json            # 🔐 Ключ сервисного аккаунта Google
│   ├── pipelines.json              # 📄 Воронки и этапы AmoCRM
│   ├── recieved_amo_ids.txt        # 📄 ID полученных сделок AmoCRM
│   ├── recieved_api_ids.txt        # 📄 ID лидов от партнеров
│   ├── screenshotone_debug.html    # 🐛 Отладка ScreenshotOne
│   ├── stripe_debug.html           # 🐛 Отладка Stripe
│   └── zeno_report.json            # 📄 Отчеты операторов (тест)
├── gpt_payment_api/                # 🚀 API платежей и партнеров
│   ├── admin/                      # 👤 Административная панель
│   │   ├── templates/              # 🎨 HTML шаблоны админки
│   │   │   ├── dashboard.php       # 📊 Главная страница админки
│   │   │   ├── footer.php          # 🦶 Подвал страниц
│   │   │   ├── header.php          # 🎯 Заголовок страниц
│   │   │   ├── instructions.php    # 📖 Инструкции по API
│   │   │   ├── login.php           # 🔑 Страница авторизации
│   │   │   ├── manage_partners.php # 🤝 Управление партнерами
│   │   │   ├── manage_rates.php    # 💱 Управление курсами валют
│   │   │   └── view_transactions.php # 💳 Просмотр транзакций
│   │   ├── auth.php                # 🔐 Аутентификация администратора
│   │   ├── index.php               # 🏠 Главный файл админки
│   │   ├── partners.php            # 👥 Управление партнерами
│   │   ├── rates.php               # 📈 Управление курсами
│   │   └── transactions.php        # 💰 Управление транзакциями
│   ├── lib/                        # 📚 Библиотеки платежного API
│   │   ├── auth_partner.php        # 🔑 Аутентификация партнеров
│   │   ├── db.php                  # 🗄️ Работа с базой данных
│   │   ├── payment_core.php        # 💎 Основная логика платежей
│   │   └── utils.php               # 🛠️ Вспомогательные функции
│   └── api.php                     # ⚡ Главный API эндпоинт
├── lib/                            # 📚 Общие библиотеки
│   ├── amo_auth_utils.php          # 🔐 Утилиты аутентификации AmoCRM
│   ├── json_storage_utils.php      # 📄 Работа с JSON файлами
│   ├── payment_link_parser.php     # 🔗 Парсинг ссылок на оплату
│   └── request_utils.php           # 🌐 HTTP запросы и блокировки
├── logs_production/                # 📋 Логи продакшн
│   ├── amo2json.log               # 📝 Логи вебхука AmoCRM
│   ├── amo2json.log~              # 📝 Бэкап логов
│   ├── app.log                    # 📝 Общие логи приложения
│   └── zeno_report.log            # 📝 Логи отчетов операторов
├── logs_test/                     # 📋 Логи тестирования
│   ├── .htaccess                  # 🛡️ Защита логов
│   ├── amo2json.log               # 📝 Логи вебхука AmoCRM (тест)
│   ├── amo2us.log                 # 📝 Логи AmoCRM операций
│   ├── app.log                    # 📝 Общие логи приложения (тест)
│   ├── excel2amo.log              # 📝 Логи синхронизации Excel
│   ├── index.php                  # 🛡️ Защита от прямого доступа
│   └── zeno_report.log            # 📝 Логи отчетов операторов (тест)
├── .env.example                   # ⚙️ Пример конфигурации
├── .env.production               # ⚙️ Продакшн конфигурация
├── .env.test                     # ⚙️ Тестовая конфигурация
├── .gitignore                    # 🚫 Игнорируемые Git файлы
├── .htaccess                     # ⚙️ Настройки Apache
├── .wakatime-project             # ⏱️ Конфиг WakaTime
├── alldeals_json.php             # 📊 Просмотр и управление лидами
├── amo2json_webhook.php          # 🔗 Вебхук AmoCRM
├── composer.json                 # 📦 Зависимости Composer
├── config.php                    # ⚙️ Основная конфигурация
├── index.php                     # 🏠 Главная страница проекта
├── logger.php                    # 📝 Система логирования
├── readme.md                     # 📖 Документация проекта
├── stripe_debug.html             # 🐛 Отладка Stripe
├── test_amo2json.php             # 🧪 Тест вебхука AmoCRM
├── test_amo_auth.php             # 🧪 Тест аутентификации AmoCRM
├── test_data_report.php          # 🧪 Тест отчетов данных
├── test_partner_api.php          # 🧪 Тест API партнеров
├── test_stripe_parser.php        # 🧪 Тест парсера Stripe
├── test_webhook_sender.html      # 🧪 Тест отправки вебхуков
├── test_zeno_report.php          # 🧪 Тест отчетов Zeno
└── zeno_report.php               # 📊 Эндпоинт отчетов операторов
```

## Категории Файлов

### 🚀 Основные API файлы
- `api.php` - Главный API эндпоинт
- `amo2json_webhook.php` - Вебхук AmoCRM
- `zeno_report.php` - API отчетов
- `alldeals_json.php` - API просмотра лидов

### 👤 Административные файлы
- `gpt_payment_api/admin/` - Полная админ панель
- `config.php` - Конфигурация системы
- `logger.php` - Система логирования

### 📚 Библиотеки и утилиты
- `lib/` - Общие библиотеки
- `gpt_payment_api/lib/` - Специфичные для API библиотеки

### 🗄️ Данные и состояние
- `data_production/`, `data_test/` - Данные по окружениям
- `logs_production/`, `logs_test/` - Логи по окружениям

### 🧪 Тестирование и отладка
- `test_*.php` - Модульные и интеграционные тесты
- `*_debug.html` - Отладочные интерфейсы

### ⚙️ Конфигурация
- `.env.*` - Файлы окружений
- `.htaccess` - Настройки веб-сервера
- `composer.json` - Зависимости PHP

## Типы Файлов по Назначению

| Тип | Описание | Примеры |
|-----|----------|---------|
| 🚀 **API** | Веб-эндпоинты | `api.php`, `webhook.php` |
| 👤 **Admin** | Административный интерфейс | `admin/*.php` |
| 📚 **Library** | Переиспользуемый код | `lib/*.php` |
| 🗄️ **Data** | Хранение данных | `*.json`, `*.txt` |
| 📝 **Logs** | Логирование | `logs_*/*.log` |
| 🧪 **Tests** | Тестирование | `test_*.php` |
| 🐛 **Debug** | Отладка | `*debug.html` |
| ⚙️ **Config** | Конфигурация | `.env.*`, `config.php` |
| 🛡️ **Security** | Безопасность | `.htaccess`, `auth.php` |

## Потоки Данных

```
┌─────────────┐    ┌──────────────────┐    ┌─────────────┐
│   AmoCRM    │───▶│ amo2json_webhook │───▶│ allLeads    │
└─────────────┘    └──────────────────┘    └─────────────┘
                                                   │
┌─────────────┐    ┌──────────────────┐           │
│  Partners   │───▶│   submit_lead    │───────────┘
└─────────────┘    └──────────────────┘           │
                                                   ▼
┌─────────────┐    ┌──────────────────┐    ┌─────────────┐
│    Zeno     │◀───│ alldeals_json    │◀───│ JSON Files  │
└─────────────┘    └──────────────────┘    └─────────────┘
       │
       ▼
┌─────────────┐    ┌──────────────────┐    ┌─────────────┐
│   Reports   │───▶│  zeno_report     │───▶│   AmoCRM    │
└─────────────┘    └──────────────────┘    └─────────────┘
```

## Уровни Доступа

| Уровень | Файлы | Защита |
|---------|-------|--------|
| **Публичный** | `index.php`, `api.php` | Токены API |
| **Вебхуки** | `amo2json_webhook.php` | Секретные ключи |
| **Админ** | `admin/*` | Логин/пароль |
| **Данные** | `data_*/*` | Файловая система |
| **Логи** | `logs_*/*` | `.htaccess` |
| **Конфиг** | `.env.*` | `.gitignore` |

---

*Последнее обновление: 2 июля 2025 г.*
