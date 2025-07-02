# API Обработки Лидов через Партнеров

Этот документ описывает API, предназначенное для интеграции с внешними партнерами, позволяя им использовать внутренние разработки для проведения оплат ChatGPT и отправки лидов на обработку, а также для операторов для отправки отчетов по лидам.

> 📁 **[Подробная структура проекта](PROJECT_STRUCTURE.md)** - Полное дерево файлов с описанием  
> 📊 **[Система транзакций партнеров](PARTNER_TRANSACTIONS_README.md)** - Документация по системе логирования  
> 🔄 **[Руководство по миграции API](API_MIGRATION_GUIDE.md)** - Обновление интеграций для партнеров  
> 📝 **[История изменений](CHANGELOG.md)** - Детальная история всех изменений

## ⚠️ ВАЖНЫЕ ИЗМЕНЕНИЯ В API (2025)

**Внимание партнерам:** В API были внесены критические изменения:

### Изменения в логике dealId:
- ✅ **dealId теперь всегда генерируется сервером** - партнеры больше не могут передавать собственные dealId
- ✅ **Уникальные dealId гарантированы** - используется timestamp + случайное число
- ❌ **Партнерские dealId больше не принимаются** - любые переданные dealId будут проигнорированы

### Защита от дублирования:
- ✅ **Проверка дублей paymentUrl** - одинаковые URL будут отклонены с ошибкой 400
- ✅ **Централизованное хранение лидов** - все лиды (API и webhook) сохраняются в одном файле
- ✅ **Консистентная структура данных** - единообразный формат для всех источников лидов

### Улучшения окружения:
- ✅ **Разделение prod/test окружений** - корректное использование директорий данных и логов
- ✅ **Улучшенная обработка ошибок** - детальные сообщения об ошибках для партнеров
- ✅ **Обновленные тесты** - поддержка переменных окружения и продакшн URL

**Для обновления интеграции** см. [Руководство по миграции API](API_MIGRATION_GUIDE.md).

## Обзор

API предоставляет следующие основные возможности:
1.  **Аутентификация и идентификация партнеров** по уникальному API токену.
2.  **Управление балансом партнеров**: просмотр текущего баланса.
3.  **Расчет стоимости платежа**: определение стоимости платежа в валюте баланса партнера на основе актуальных курсов.
4.  **Проведение платежей**: списание средств с баланса партнера для оплаты услуг.
5.  **Отслеживание статуса транзакций**.
6.  **Прием лидов от партнеров**: получение данных от партнеров для дальнейшей обработки (интегрировано в основной API платежей).
7.  **Прием отчетов по лидам (Zeno Report)**: эндпоинт для операторов для отправки результатов обработки лидов.

Административная панель позволяет управлять партнерами, их балансами и курсами валют.

## Структура Проекта

```
/amogt/
├── data_production/                 # Продакшн данные
│   ├── allLeads.json               # Основной файл лидов (продакшн)
│   ├── amo_fields.json             # Структура полей AmoCRM
│   ├── amo_tokens.json             # OAuth2 токены AmoCRM
│   ├── id_of_deals_sent_to_amo.txt # ID обработанных сделок
│   ├── pipelines.json              # Воронки и этапы AmoCRM
│   ├── recieved_amo_ids.txt        # ID полученных сделок AmoCRM
│   └── zeno_report.json            # Отчеты операторов
├── data_test/                      # Тестовые данные
│   ├── allLeads.json               # Основной файл лидов (тест)
│   ├── amo_fields.json             # Структура полей AmoCRM (тест)
│   ├── amo_tokens.json             # OAuth2 токены AmoCRM (тест)
│   ├── blocked_deals.txt           # Заблокированные сделки
│   ├── field_mapping.json          # Маппинг полей
│   ├── id_of_deals_sent_to_amo.txt # ID обработанных сделок
│   ├── my-project-1337-*.json      # Ключ сервисного аккаунта Google
│   ├── mycity2_key.json            # Ключ сервисного аккаунта Google
│   ├── pipelines.json              # Воронки и этапы AmoCRM
│   ├── recieved_amo_ids.txt        # ID полученных сделок AmoCRM
│   ├── recieved_api_ids.txt        # ID лидов от партнеров
│   └── zeno_report.json            # Отчеты операторов (тест)
├── gpt_payment_api/                # API платежей и партнеров
│   ├── admin/                      # Административная панель
│   │   ├── templates/              # HTML шаблоны админки
│   │   │   ├── dashboard.php       # Главная страница админки
│   │   │   ├── header.php          # Заголовок страниц
│   │   │   ├── footer.php          # Подвал страниц
│   │   │   ├── login.php           # Страница авторизации
│   │   │   ├── manage_partners.php # Управление партнерами
│   │   │   ├── manage_rates.php    # Управление курсами валют
│   │   │   ├── view_transactions.php # Просмотр транзакций
│   │   │   └── instructions.php    # Инструкции по API
│   │   ├── auth.php                # Аутентификация администратора
│   │   ├── index.php               # Главный файл админки
│   │   ├── partners.php            # Управление партнерами
│   │   ├── rates.php               # Управление курсами
│   │   └── transactions.php        # Управление транзакциями
│   ├── lib/                        # Библиотеки платежного API
│   │   ├── auth_partner.php        # Аутентификация партнеров
│   │   ├── db.php                  # Работа с базой данных
│   │   ├── payment_core.php        # Основная логика платежей
│   │   └── utils.php               # Вспомогательные функции
│   └── api.php                     # Главный API эндпоинт
├── lib/                            # Общие библиотеки
│   ├── amo_auth_utils.php          # Утилиты аутентификации AmoCRM
│   ├── json_storage_utils.php      # Работа с JSON файлами
│   ├── payment_link_parser.php     # Парсинг ссылок на оплату
│   └── request_utils.php           # HTTP запросы и блокировки
├── logs_production/                # Логи продакшн
│   ├── amo2json.log               # Логи вебхука AmoCRM
│   ├── app.log                    # Общие логи приложения
│   └── zeno_report.log            # Логи отчетов операторов
├── logs_test/                     # Логи тестирования
│   ├── amo2json.log               # Логи вебхука AmoCRM (тест)
│   ├── app.log                    # Общие логи приложения (тест)
│   ├── excel2amo.log              # Логи синхронизации Excel
│   └── zeno_report.log            # Логи отчетов операторов (тест)
├── .env.example                   # Пример конфигурации
├── .env.production               # Продакшн конфигурация
├── .env.test                     # Тестовая конфигурация
├── .gitignore                    # Игнорируемые Git файлы
├── .htaccess                     # Настройки Apache
├── alldeals_json.php             # Просмотр и управление лидами
├── amo2json_webhook.php          # Вебхук AmoCRM
├── composer.json                 # Зависимости Composer
├── config.php                    # Основная конфигурация
├── index.php                     # Главная страница проекта
├── logger.php                    # Система логирования
├── readme.md                     # Документация проекта
├── stripe_debug.html             # Отладка Stripe
├── test_amo2json.php             # Тест вебхука AmoCRM
├── test_amo_auth.php             # Тест аутентификации AmoCRM
├── test_data_report.php          # Тест отчетов данных
├── test_partner_api.php          # Тест API партнеров
├── test_stripe_parser.php        # Тест парсера Stripe
├── test_webhook_sender.html      # Тест отправки вебхуков
├── test_zeno_report.php          # Тест отчетов Zeno
└── zeno_report.php               # Эндпоинт отчетов операторов
```

## Описание Основных Файлов

### Корневые файлы
*   **`config.php`** - Основная конфигурация проекта, загружает переменные из `.env` файлов в зависимости от окружения
*   **`logger.php`** - Централизованная система логирования с поддержкой различных уровней (INFO, WARNING, ERROR)
*   **`index.php`** - Главная страница проекта с возможностью запуска периодических задач
*   **`alldeals_json.php`** - Веб-интерфейс для просмотра и управления файлом `allLeads.json`
*   **`amo2json_webhook.php`** - Вебхук для приема данных из AmoCRM и сохранения в локальную базу
*   **`zeno_report.php`** - Эндпоинт для приема отчетов от операторов/автоматизации о статусе обработки лидов

### Платежное API (`gpt_payment_api/`)
*   **`api.php`** - Главный API эндпоинт, обрабатывает запросы партнеров (баланс, платежи, прием лидов)
*   **`admin/index.php`** - Административная панель для управления партнерами и транзакциями
*   **`lib/auth_partner.php`** - Класс для аутентификации партнеров по API токенам
*   **`lib/payment_core.php`** - Основная логика обработки платежей и управления балансами
*   **`lib/db.php`** - Работа с JSON-базой данных партнеров и транзакций

### Общие библиотеки (`lib/`)
*   **`amo_auth_utils.php`** - Функции для OAuth2 аутентификации с AmoCRM
*   **`json_storage_utils.php`** - Универсальные функции для работы с JSON файлами
*   **`payment_link_parser.php`** - Парсинг ссылок на оплату (Stripe, PayPal и др.)
*   **`request_utils.php`** - HTTP запросы, блокировки файлов, cURL операции

### Тестовые файлы
*   **`test_*.php`** - Набор скриптов для тестирования различных компонентов системы
*   **`test_webhook_sender.html`** - HTML форма для тестирования отправки вебхуков
*   **`stripe_debug.html`** - Отладочная страница для тестирования Stripe интеграции

### Данные и логи
*   **`data_test/` и `data_production/`** - Разделенные по окружениям файлы данных
*   **`logs_test/` и `logs_production/`** - Разделенные по окружениям лог файлы
*   **`.env.*`** - Конфигурационные файлы для разных окружений

## Конфигурация

Основные настройки API и админки должны быть заданы в файле `.env` в корневой директории `amogt/`.
*   `GPT_ADMIN_USERNAME`, `GPT_ADMIN_PASSWORD_HASH`
*   Настройки AmoCRM (`AMO_DOMAIN`, `AMO_INTEGRATION_ID` и т.д.)
*   Прочие настройки, как указано в `config.php`.

## Настройка окружений и ID AmoCRM

Проект поддерживает два окружения: `test` (тестовое) и `production` (рабочее). Конфигурация для каждого окружения хранится в соответствующих `.env` файлах:
*   `amogt/.env.test` - для тестового окружения.
*   `amogt/.env.production` - для рабочего окружения.

Файл `amogt/config.php` автоматически загружает переменные из нужного `.env` файла в зависимости от значения переменной окружения `APP_ENV`.
*   Если `APP_ENV` установлена в `production`, будет загружен `amogt/.env.production`.
*   В противном случае (если `APP_ENV` не установлена или имеет другое значение), будет загружен `amogt/.env.test`.

В этих `.env` файлах необходимо указать актуальные ID воронок, статусов и пользовательских полей для вашего экземпляра AmoCRM.

### Как установить окружение (APP_ENV)

Для выбора окружения (test или production) необходимо установить системную переменную окружения `APP_ENV`.

*   **Для Apache (через `.htaccess`):**
    Вы можете добавить следующую строку в файл `amogt/.htaccess` (или в конфигурацию VirtualHost вашего Apache сервера), чтобы установить окружение `production`:
    ```apache
    SetEnv APP_ENV production
    ```
    Если эта строка отсутствует или закомментирована, по умолчанию будет использоваться `test` окружение.

*   **В терминале (для текущей сессии):**
    ```bash
    export APP_ENV=production
    ```
    Эта команда установит `APP_ENV` только для текущей сессии терминала.

*   **Для постоянной установки (Linux/macOS):**
    Добавьте `export APP_ENV=production` в ваш файл `.bashrc`, `.zshrc` или `.profile`.

*   **На веб-сервере (Nginx + PHP-FPM):**
    Вам нужно будет добавить `env[APP_ENV] = production` в конфигурацию вашего PHP-FPM пула (например, `www.conf`) и перезагрузить PHP-FPM.

**Важно:** Устанавливайте `APP_ENV=production` только в тех окружениях, которые действительно являются production, чтобы избежать случайного использования production-ключей в тестовых средах.

### Как получить ID из AmoCRM

ID полей, воронок и статусов можно получить несколькими способами:

1.  **Через интерфейс AmoCRM (для полей):**
    *   Перейдите в AmoCRM -> Настройки -> Поля.
    *   При наведении на название поля или при его редактировании в URL или в инструментах разработчика браузера можно увидеть ID поля.

2.  **Через API AmoCRM:**
    *   Вы можете использовать API AmoCRM для получения списков полей, воронок и статусов вместе с их ID.
    *   Например, для получения полей сделок: `GET /api/v4/leads/custom_fields`
    *   Для получения воронок и их статусов: `GET /api/v4/leads/pipelines`

3.  **Из файлов `data/amo_fields.json` и `data/pipelines.json`:**
    Эти файлы в директории `amogt/data/` содержат JSON-структуры с описанием пользовательских полей и воронок (включая статусы) соответственно. Они, вероятно, являются экспортом или кэшем данных из вашего AmoCRM.
    *   **`amogt/data/amo_fields.json`**:
        *   Найдите нужное поле по его имени (`"name": "Имя поля"`).
        *   Соответствующий `"id"` будет ID этого поля.
        *   Для полей типа `select` (выпадающий список), таких как "Валюта запроса", внутри объекта поля будет массив `enums`, где каждый элемент содержит `"id"` (это Enum ID) и `"value"` (значение).
        Пример для поля "Валюта запроса":
        ```json
        {
            "id": 636815,
            "name": "Валюта запроса",
            "type": "select",
            // ... другие свойства ...
            "enums": [
                {"id": 456991, "value": "USD", "sort": 500},
                {"id": 456993, "value": "EUR", "sort": 1},
                // ... другие валюты ...
            ]
        }
        ```
        Здесь `636815` - это ID поля "Валюта запроса", а `456991` - это Enum ID для значения "USD".

    *   **`amogt/data/pipelines.json`**:
        *   Этот файл содержит массив воронок в `_embedded.pipelines`.
        *   Каждая воронка имеет `"id"` и `"name"`.
        *   Внутри каждой воронки в `_embedded.statuses` находится массив статусов (этапов) этой воронки, каждый со своим `"id"` и `"name"`.
        Пример для "Основной воронки" (ID `8824470`):
        ```json
        {
            "id": 8824470,
            "name": "Воронка",
            // ... другие свойства ...
            "_embedded": {
                "statuses": [
                    {
                        "id": 71325730,
                        "name": "Неразобранное",
                        // ...
                    },
                    {
                        "id": 74304782,
                        "name": "CHATGPT",
                        // ...
                    }
                    // ... другие статусы ...
                ]
            }
        }
        ```
        Здесь `8824470` - ID воронки, `74304782` - ID статуса "CHATGPT".

### Переменные для ID в `.env` файлах:

Убедитесь, что следующие переменные установлены в ваших `.env.test` и `.env.production` файлах с корректными ID для соответствующего окружения:

*   `AMO_MAIN_PIPELINE_ID`
*   `AMO_CHATGPT_STATUS_ID`
*   `AMO_FINAL_OPERATOR_STATUS_ID`
*   `AMO_CF_ID_PAYMENT_LINK`
*   `AMO_CF_ID_REQUEST_AMOUNT`
*   `AMO_CF_ID_REQUEST_CURRENCY`
*   `AMO_CURRENCY_ENUM_ID_USD`
*   `AMO_CURRENCY_ENUM_ID_EUR`
*   `AMO_CURRENCY_ENUM_ID_KZT`
*   `AMO_CURRENCY_ENUM_ID_RUB`
*   `AMO_CURRENCY_ENUM_ID_GBP`
*   `AMO_CURRENCY_ENUM_ID_TL`
*   `AMO_CURRENCY_ENUM_ID_TRY`

## Общая схема работы с лидами

Лиды в системе могут поступать из двух источников и обрабатываются следующим образом:

1.  **Лиды из AmoCRM**:
    *   Поступают через вебхук на скрипт `amogt/amo2json.php`.
    *   Данные о лиде (включая `dealId` и `paymentUrl`) сохраняются в основной файл данных лидов: `amogt/allLeads.json`.
    *   Этот файл используется для дальнейшей обработки и отображения.

2.  **Лиды от Партнеров**:
    *   Поступают через основной API `amogt/gpt_payment_api/api.php` с `action=submit_partner_lead`.
    *   Партнер передает массив лидов, каждый из которых должен содержать `paymentUrl` (обязательно) и опционально `dealId` (уникальный ID лида со стороны партнера).
    *   Перед сохранением, `dealId` каждого лида проверяется на дубликат в файле `amogt/recieved_api_ids.txt`. Если ID уже существует, лид пропускается. Новые ID добавляются в этот файл.
    *   Данные успешно принятых лидов (с добавлением `partnerId` и `partner_name` на основе API токена) также сохраняются в основной файл `amogt/allLeads.json`.

3.  **Обработка лидов и Отчетность (Операторы/Zeno)**:
    *   Система автоматизации (например, Zeno) получает список лидов для обработки из `amogt/alldeals_json.php`.
    *   После выполнения работы по лиду, система автоматизации (или оператор вручную) отправляет отчет через эндпоинт `amogt/zeno_report.php`.
    *   **Параметры `zeno_report.php`**:
        *   `GET id={lead_id}`: Где `{lead_id}` - это `dealId` из `allLeads.json`.
        *   `GET status={status}`: Статус обработки лида. Ожидаемые значения: "Успешно", "ОШИБКА!".
        *   `GET amount={amount}` (optional): Сумма (если применимо).
        *   `GET currency={currency}` (optional): Валюта (если применимо).
        *   `GET email={email}` (optional): Email (если применимо).
        *   `GET card={card}` (optional): Карта (если применимо).
        *   `GET partner_id={partner_id}` (optional): ID партнера, если отчет относится к партнерскому лиду (это значение можно взять из поля `partnerId` лида, полученного из `amodeals_json.php`). **Если это поле передано, обновление данных в AmoCRM производиться не будет.**
        *   *Любые другие поля, которые система автоматизации хочет передать в отчете через GET-параметры.*
    *   **Логика `zeno_report.php`**:
        *   Все отчеты сохраняются в `amogt/zeno_report.json`.
        *   Если в запросе **присутствует `partner_id`**, это означает, что отчет по партнерскому лиду, и никаких действий с AmoCRM не производится.
        *   Если `partner_id` **отсутствует**:
            *   Скрипт проверяет, не был ли уже обработан данный `lead_id` для AmoCRM (по файлу `amogt/id_of_deals_sent_to_amo.txt`).
            *   Если `lead_id` новый, он добавляется в `id_of_deals_sent_to_amo.txt`.
            *   Производится поиск сделки в AmoCRM по `lead_id`.
            *   Если сделка найдена и ее поле статуса ("Статус оплаты ChatGPT") пустое, то поля сделки обновляются, и, если отчетный статус не "ОШИБКА!", сделка переводится на этап "Финальный Операторский".

Таким образом, `amogt/allLeads.json` является центральным хранилищем данных о лидах, а `recieved_api_ids.txt` и `id_of_deals_sent_to_amo.txt` служат для предотвращения дублирующей обработки и обновлений.

## Эндпоинты API

### Основной API Партнеров (Платежи и Прием Лидов)

Все запросы к этому API должны отправляться на `ваш_домен/amogt/gpt_payment_api/api.php`.
Метод передачи параметров: `GET` или `POST` (для `submit_partner_lead` - `POST` с JSON телом).
Формат ответа: JSON.

#### Общие параметры для большинства запросов (если не указано иное):
*   `api_token` (string, required): Уникальный API токен партнера. Передается как GET/POST параметр, либо в JSON теле для `submit_partner_lead`.

#### 1. Получение баланса партнера
*   **Action**: `get_balance`
    *   **Метод**: `GET`
    *   **Параметры**: `api_token`
    *   **Успешный ответ (200 OK)**:
        ```json
        {
            "status": "success",
            "balance": 100.50,
            "currency": "USD",
            "partner_name": "Имя партнера"
        }
        ```
    *   **Ошибки**: 401 (неверный токен), 500 (внутренняя ошибка сервера).

#### 2. Расчет стоимости платежа
*   **Action**: `calculate_payment_cost`
    *   **Метод**: `GET`
    *   **Параметры**:
        *   `api_token` (string, required): API токен партнера.
        *   `amount` (float, required): Сумма платежа в валюте ChatGPT (USD).
        *   `currency` (string, required): Валюта платежа (например, "USD").
    *   **Успешный ответ (200 OK)**:
        ```json
        {
            "status": "success",
            "original_amount": 20.00,
            "original_currency": "USD",
            "converted_amount": 18.00,
            "converted_currency": "EUR",
            "exchange_rate": 0.9
        }
        ```
    *   **Ошибки**: 400 (неверные параметры), 401, 500.

#### 3. Проведение платежа
*   **Action**: `make_payment`
    *   **Метод**: `POST`
    *   **Параметры**:
        *   `api_token` (string, required): API токен партнера.
        *   `amount` (float, required): Сумма платежа в валюте ChatGPT (USD).
        *   `currency` (string, required): Валюта платежа (например, "USD").
        *   `transaction_id` (string, required): Уникальный ID транзакции со стороны партнера для предотвращения дублей.
        *   `description` (string, optional): Описание платежа.
    *   **Успешный ответ (200 OK)**:
        ```json
        {
            "status": "success",
            "message": "Payment processed successfully.",
            "transaction_id": "уникальный_ID_транзакции",
            "new_balance": 80.50
        }
        ```
    *   **Ошибки**: 400, 401, 402 (недостаточно средств), 409 (дубликат `transaction_id`), 500.

#### 4. Получение статуса транзакции
*   **Action**: `get_transaction_status`
    *   **Метод**: `GET`
    *   **Параметры**:
        *   `api_token` (string, required): API токен партнера.
        *   `transaction_id` (string, required): ID транзакции, статус которой нужно получить.
    *   **Успешный ответ (200 OK)**:
        ```json
        {
            "status": "success",
            "transaction_id": "уникальный_ID_транзакции",
            "payment_status": "completed", // "pending", "failed", "completed"
            "amount": 20.00,
            "currency": "USD",
            "timestamp": "2023-10-27 10:00:00"
        }
        ```
    *   **Ошибки**: 400, 401, 404 (транзакция не найдена), 500.

#### 5. Отправка лидов от партнера (пакетная)
*   **Action**: `submit_partner_lead`
*   **Метод**: `POST`
*   **Формат запроса**: JSON (тело запроса)
*   **⚠️ ВАЖНО:** `dealId` теперь всегда генерируется сервером! Не передавайте собственные dealId.
*   **Параметры (в теле JSON-запроса)**:
    *   `action` (string, required): Должен быть `"submit_partner_lead"`.
    *   `api_token` (string, required): Уникальный API токен партнера для аутентификации.
    *   `lead_data` (array, required): Массив JSON-объектов, где каждый объект представляет лид. Каждый лид должен содержать как минимум `paymentUrl` (обязательно и уникально). Поля `dealId`, `created_at` и `last_updated` всегда генерируются сервером и игнорируются, если переданы партнером. Любые другие пользовательские поля также могут быть включены. Поле `partnerId` будет добавлено/перезаписано сервером на основе `api_token`.
*   **Пример тела запроса**:
    ```json
    {
        "action": "submit_partner_lead",
        "api_token": "ВАШ_API_ТОКЕН",
        "lead_data": [
            {
                "paymentUrl": "https://pay.openai.com/unique-url-1",
                "customerName": "John Doe",
                "customerEmail": "john@example.com",
                "custom_field_example": "some_value"
            },
            {
                "paymentUrl": "https://stripe.com/pay/unique-url-2",
                "custom_notes": "Another lead with different data"
            }
        ]
    }
    ```
*   **Успешный ответ (200 OK)**:
    ```json
    {
        "status": "success",
        "message": "Processed X leads. Added to main list: Y.",
        "processed_count": X,
        "added_to_main_list_count": Y,
        "generated_deal_ids": ["12345678_1641234567", "12345679_1641234568"],
        "errors": [] // Массив ошибок, если какие-то лиды не удалось обработать
    }
    ```
*   **Возможные ошибки**:
    *   **400 Bad Request**: Отсутствует paymentUrl, дублирующийся paymentUrl, недостаточно средств (если включено списание)
    *   **401 Unauthorized**: Неверный или отсутствующий API токен
    *   **402 Payment Required**: Недостаточно средств на балансе (если включено автоматическое списание)
    *   **405 Method Not Allowed**: Неверный HTTP метод (только POST)
    *   **429 Too Many Requests**: Слишком много запросов (rate limiting)
    *   **500 Internal Server Error**: Внутренняя ошибка сервера
*   **Пример ошибки (дубликат paymentUrl)**:
    ```json
    {
        "status": "error",
        "message": "Duplicate paymentUrl found",
        "error_code": "DUPLICATE_PAYMENT_URL",
        "duplicate_url": "https://pay.openai.com/duplicate-url"
    }
    ```

## Тестирование API

### Подготовка к тестированию

1. **Настройка переменных окружения для тестов:**
   ```bash
   # Создать файл test_api.env в корне amogt/
   cp test_api.env.example test_api.env
   
   # Отредактировать файл test_api.env:
   API_TOKEN=your_test_token_here
   API_URL=https://yourdomain.com/amogt/gpt_payment_api/api.php
   ```

2. **Установка окружения:**
   ```bash
   # Для тестирования (по умолчанию):
   # APP_ENV не устанавливается или устанавливается в 'test'
   
   # Для продакшн:
   export APP_ENV=production
   # или в .htaccess: SetEnv APP_ENV production
   ```

### Запуск тестов

1. **Тест партнерского API:**
   ```bash
   php test_partner_api.php
   ```
   
   Этот тест проверяет:
   - Получение баланса партнера
   - Отправку лидов через API
   - Обработку ошибок и дублей
   - Генерацию dealId на сервере

2. **Тест парсера ссылок:**
   ```bash
   php test_stripe_parser.php
   ```
   
   Проверяет корректность парсинга:
   - Stripe Payment Links (включая тестовые)
   - PayPal Invoice Links
   - Извлечение суммы и валюты

3. **Тест отчетов Zeno:**
   ```bash
   php test_zeno_report.php
   ```

4. **Тест вебхука AmoCRM:**
   ```bash
   php test_amo2json.php
   ```

### Тестирование через веб-интерфейс

- **Отправка тестовых вебхуков:** `test_webhook_sender.html`
- **Отладка Stripe:** `stripe_debug.html` (в data_test/)
- **Просмотр лидов:** `alldeals_json.php`

### Ожидаемые результаты тестов

При корректной настройке вы должны увидеть:
```
✅ Partner authentication: SUCCESS
✅ Balance retrieval: SUCCESS  
✅ Lead submission: SUCCESS
✅ Server-generated dealId: SUCCESS
✅ Duplicate paymentUrl rejection: SUCCESS
```

## Настройка Окружений

### Переменные окружения

Проект использует `.env` файлы для конфигурации:

- **`.env.test`** - для разработки и тестирования
- **`.env.production`** - для продакшн среды
- **`.env.example`** - шаблон с описанием переменных

### Ключевые изменения в файловой структуре

После рефакторинга все файлы данных и логов автоматически разделяются по окружениям:

```
amogt/
├── data_production/           # Продакшн данные
│   ├── allLeads.json         # ← Все лиды (API + webhook)
│   └── ...
├── data_test/                # Тестовые данные  
│   ├── allLeads.json         # ← Все лиды (API + webhook)
│   └── ...
├── logs_production/          # Продакшн логи
├── logs_test/               # Тестовые логи
```

### Установка APP_ENV

**Apache + .htaccess (рекомендуется для продакшн):**
```apache
# В amogt/.htaccess
SetEnv APP_ENV production
```

**Linux/macOS командная строка:**
```bash
# Временно для сессии:
export APP_ENV=production

# Постоянно (добавить в ~/.bashrc):
echo 'export APP_ENV=production' >> ~/.bashrc
```

**Nginx + PHP-FPM:**
```ini
# В www.conf
env[APP_ENV] = production
```

Этот раздел описывает, как внешние системы автоматизации (например, Zeno) должны взаимодействовать с API для получения списка задач (лидов) и отправки отчетов об их выполнении.

### 1. Получение списка активных лидов (задач)

Для получения полного списка текущих лидов, которые требуют обработки, система автоматизации должна выполнить GET-запрос к следующему эндпоинту:

*   **URL**: `https://ваш_домен/amogt/amodeals_json.php` (без параметров)
*   **Метод**: `GET`
*   **Успешный ответ (200 OK)**:
    ```json
    {
        "deals": [
            {
                "dealId": "14252569",
                "paymentUrl": "https://pay.openai.com/...",
                "created_at": "2025-06-09 08:47:02",
                "last_updated": "2025-06-09 08:47:02",
                "partnerId": "partner_id_если_есть", // Поле будет присутствовать, если лид от партнера
                "partner_name": "Имя партнера если есть" 
                // ... другие поля, которые были сохранены для лида ...
            },
            // ... другие лиды
        ],
        "total": X, // Общее количество лидов
        "message": "Current deals in JSON file.",
        "info": {
            'usage' => 'How to use this script:',
            'delete_all' => 'To delete all deals: ?deleteall=1',
            'view_all' => 'To view all deals: access without parameters',
            'example_delete_all' => 'Example: amodeals_json.php?deleteall=1',
            'note' => 'This script primarily manages a local JSON file of deal IDs.'
        }
    }
    ```
*   **Примечание**: Система автоматизации должна сама определить, какие из полученных лидов являются "новыми" или "необработанными" (например, сравнивая с ранее полученными ID или проверяя наличие отчета в `zeno_report.json`).

### 2. Отправка отчета о выполнении задачи

После выполнения работы по лиду, система автоматизации отправляет отчет через следующий эндпоинт:

*   **URL**: `https://ваш_домен/amogt/zeno_report.php?id={lead_id}`
    *   `{lead_id}`: ID лида (соответствует `dealId` из файла `allLeads.json`).
*   **Метод**: `GET` (данные передаются через GET-параметры)
*   **Параметры (в GET-запросе)**:
    *   `status` (string, required): Статус обработки лида. Ожидаемые значения: "Успешно", "ОШИБКА!".
    *   `amount` (string, optional): Сумма (если применимо).
    *   `currency` (string, optional): Валюта (если применимо).
    *   `email` (string, optional): Email (если применимо).
    *   `card` (string, optional): Карта (если применимо).
    *   `partner_id` (string, optional): ID партнера, если отчет относится к партнерскому лиду (это значение можно взять из поля `partnerId` лида, полученного из `amodeals_json.php`). **Если это поле передано, обновление данных в AmoCRM производиться не будет.**
    *   *Любые другие поля, которые система автоматизации хочет передать в отчете.*
*   **Успешный ответ (200 OK)**:
    ```json
    {
        "status": "success",
        "message": "Report received and processed.",
        "report_id": "уникальный_ID_отчета",
        "lead_id": "ID_лида",
        "amo_status": "success/skipped/failed",
        "amo_message": "Сообщение об обновлении AmoCRM"
    }
    ```
*   **Ошибки**: 400 (неверные параметры), 500 (внутренняя ошибка сервера).
*   **Логика на стороне сервера (`zeno_report.php`)**:
    1.  Отчет сохраняется в `amogt/zeno_report.json`.
    2.  Если в запросе **присутствует `partner_id`**, это означает, что отчет по партнерскому лиду, и никаких действий с AmoCRM не производится.
    3.  Если `partner_id` **отсутствует**:
        *   Скрипт проверяет, не был ли уже обработан данный `lead_id` для AmoCRM (по файлу `amogt/id_of_deals_sent_to_amo.txt`).
        *   Если не обработан, `lead_id` добавляется в `amogt/id_of_deals_sent_to_amo.txt`.
        *   Производится поиск сделки в AmoCRM по `lead_id`.
        *   Если сделка найдена и ее поле статуса ("Статус оплаты ChatGPT") пустое, то поля сделки обновляются, и, если отчетный статус не "ОШИБКА!", сделка переводится на этап "Финальный Операторский".

Таким образом, `amogt/allLeads.json` является центральным хранилищем данных о лидах, а `recieved_api_ids.txt` и `id_of_deals_sent_to_amo.txt` служат для предотвращения дублирующей обработки и обновлений.

## Рабочие Процессы (Workflows)

### 1. Процесс обработки лида из AmoCRM
```
AmoCRM Сделка → amo2json_webhook.php → parsePaymentLink() → [ENVIRONMENT]_data/allLeads.json
     ↓
Система автоматизации (Zeno) → alldeals_json.php → получение задач
     ↓
Обработка лида → zeno_report.php → обновление AmoCRM (если не партнерский)
```

### 2. Процесс обработки лида от партнера (ОБНОВЛЕНО)
```
Партнер → POST /api.php?action=submit_partner_lead → валидация токена
     ↓
Проверка дублей paymentUrl → parsePaymentLink() → генерация dealId (сервер)
     ↓
Сохранение в [ENVIRONMENT]_data/allLeads.json
     ↓
Система автоматизации → получение через alldeals_json.php
     ↓
Отчет через zeno_report.php (с partner_id) → только сохранение, без AmoCRM
```

### 3. Процесс платежа партнера
```
Партнер → calculate_payment_cost → получение курса и суммы
     ↓
make_payment → списание с баланса → создание транзакции
     ↓
get_transaction_status → отслеживание статуса
```

### 4. Административные процессы
```
Админ → вход в admin/ → управление партнерами/курсами
     ↓
Создание партнера → генерация API токена → сохранение в JSON
     ↓
Обновление курсов → изменение rates.json → применение к новым платежам
```

### 5. Новая логика генерации dealId
```
Партнер отправляет лид БЕЗ dealId → API генерирует уникальный dealId
     ↓
Формат: timestamp_randomnumber (например: 1704067200_123456)
     ↓
Гарантия уникальности через timestamp + случайное число
```

## Мониторинг и Логирование

### Структура логов (разделена по окружениям)
- **`logs_production/`** (продакшн логи):
  - `amo2json.log` - все операции с AmoCRM вебхуком
  - `app.log` - общие операции приложения
  - `zeno_report.log` - отчеты операторов
  - `submit_partner_lead.log` - лиды от партнеров

- **`logs_test/`** (тестовые логи):  
  - `amo2json.log` - тестовые операции с AmoCRM
  - `app.log` - общие тестовые операции
  - `excel2amo.log` - синхронизация Excel (только в тесте)
  - `zeno_report.log` - тестовые отчеты операторов

### Уровни логирования
- **INFO** - обычные операции (генерация dealId, сохранение лидов)
- **WARNING** - потенциальные проблемы (дубли paymentUrl, недостаток средств)
- **ERROR** - критические ошибки (ошибки API, файловые операции)

### Автоматическое разделение по окружениям
Система автоматически определяет окружение через переменную `APP_ENV` и записывает логи в соответствующие директории:

```php
// Автоматический выбор директории логов:
if ($_ENV['APP_ENV'] === 'production') {
    $log_dir = 'logs_production/';
} else {
    $log_dir = 'logs_test/';
}
```

### Безопасность и Доступ
- Все логи защищены `.htaccess`
- Чувствительные данные не логируются в полном объеме
- API токены маскируются в логах как `***masked***`
- paymentUrl логируются только частично для отладки

### Примеры лог-записей

**Успешная генерация dealId:**
```
[2025-01-15 10:30:15] INFO: Generated dealId for partner partner_123: 1705312215_456789
```

**Обнаружение дубля paymentUrl:**
```
[2025-01-15 10:31:20] WARNING: Duplicate paymentUrl detected: https://pay.openai.com/***partial***
```

**Ошибка API:**
```
[2025-01-15 10:32:10] ERROR: Failed to save lead data: Permission denied for allLeads.json
```

## Примеры интеграции

### Пример интеграции с новым API (PHP)

```php
<?php
function submitLeadsToAPI($leads, $api_token, $api_url) {
    $data = [
        'action' => 'submit_partner_lead',
        'api_token' => $api_token,
        'lead_data' => $leads // НЕ включайте dealId - он генерируется сервером!
    ];
    
    $options = [
        'http' => [
            'header' => "Content-type: application/json\r\n",
            'method' => 'POST',
            'content' => json_encode($data)
        ]
    ];
    
    $context = stream_context_create($options);
    $result = file_get_contents($api_url, false, $context);
    
    return json_decode($result, true);
}

// Пример использования:
$leads = [
    [
        'paymentUrl' => 'https://pay.openai.com/unique-url-1',
        'customerName' => 'John Doe',
        'customerEmail' => 'john@example.com'
    ],
    [
        'paymentUrl' => 'https://stripe.com/pay/unique-url-2',  
        'customerPhone' => '+1234567890'
    ]
];

$response = submitLeadsToAPI($leads, 'your_api_token', 'https://yourdomain.com/amogt/gpt_payment_api/api.php');

if ($response['status'] === 'success') {
    echo "Лиды отправлены успешно. Сгенерированные ID: " . implode(', ', $response['generated_deal_ids']);
} else {
    echo "Ошибка: " . $response['message'];
}
?>
```

### Пример интеграции (JavaScript/Node.js)

```javascript
async function submitLeads(leads, apiToken, apiUrl) {
    const data = {
        action: 'submit_partner_lead',
        api_token: apiToken,
        lead_data: leads // dealId НЕ передаем!
    };
    
    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data)
        });
        
        const result = await response.json();
        
        if (result.status === 'success') {
            console.log('Лиды отправлены:', result.generated_deal_ids);
            return result;
        } else {
            throw new Error(result.message);
        }
    } catch (error) {
        console.error('Ошибка отправки лидов:', error);
        throw error;
    }
}

// Использование:
const leads = [
    {
        paymentUrl: 'https://pay.openai.com/unique-url-1',
        customerName: 'John Doe'
    }
];

submitLeads(leads, 'your_api_token', 'https://yourdomain.com/amogt/gpt_payment_api/api.php')
    .then(response => console.log('Успех:', response))
    .catch(error => console.error('Ошибка:', error));
```

## Troubleshooting

### Частые проблемы и решения

#### 1. Ошибка "Duplicate paymentUrl found"
**Причина:** Партнер пытается отправить лид с paymentUrl, который уже существует в системе.

**Решение:**
- Убедитесь, что каждый paymentUrl уникален
- Не отправляйте один и тот же лид повторно
- Проверьте логи для определения дублирующегося URL

#### 2. Ошибка "Invalid API token"
**Причина:** Неверный или отсутствующий API токен.

**Решение:**
- Проверьте правильность API токена
- Убедитесь, что токен активен в админской панели
- Проверьте, что токен передается в правильном поле

#### 3. Ошибка "Insufficient funds"
**Причина:** На балансе партнера недостаточно средств для обработки лидов.

**Решение:**
- Пополните баланс через административную панель
- Проверьте текущий баланс через API: `?action=get_balance`

#### 4. dealId не генерируется или неправильный формат
**Причина:** Партнер пытается передать собственный dealId или ожидает старое поведение.

**Решение:**
- НЕ передавайте dealId в lead_data - он игнорируется
- dealId всегда генерируется сервером в формате `timestamp_random`
- Используйте возвращаемые `generated_deal_ids` для отслеживания

#### 5. Лиды не попадают в правильное окружение
**Причина:** Неправильно настроена переменная APP_ENV.

**Решение:**
```bash
# Проверить текущее окружение:
php -r "echo getenv('APP_ENV') ?: 'test';"

# Установить продакшн (для Apache):
echo "SetEnv APP_ENV production" >> .htaccess

# Проверить директории данных:
ls -la data_production/ data_test/
```

#### 6. Логи не записываются или записываются в неправильную директорию
**Причина:** Проблемы с правами доступа или неправильным окружением.

**Решение:**
```bash
# Проверить права:
chmod 755 logs_production/ logs_test/
chmod 644 logs_production/*.log logs_test/*.log

# Проверить владельца:
chown www-data:www-data logs_* -R
```

### Отладка

#### Включение расширенного логирования
В `config.php` можно временно увеличить уровень логирования:
```php
// Добавить для отладки:
define('DEBUG_MODE', true);
define('LOG_LEVEL', 'DEBUG');
```

#### Проверка конфигурации
```php
// test_config_check.php
<?php
require_once 'config.php';
echo "Environment: " . ENVIRONMENT . "\n";
echo "Data directory: " . DATA_DIR . "\n";
echo "Logs directory: " . LOGS_DIR . "\n";
echo "All leads file: " . ALL_LEADS_FILE_PATH . "\n";
?>
```

#### Мониторинг файлов в реальном времени
```bash
# Мониторинг логов:
tail -f logs_production/app.log

# Мониторинг лидов:
watch -n 5 'wc -l data_production/allLeads.json'
```

## Масштабирование и Производительность

### Блокировки
- `submit_partner_lead.lock` - предотвращение одновременной обработки лидов
- Автоматическое снятие блокировок при завершении или таймауте
- Защита от race conditions при генерации dealId

### Оптимизации после рефакторинга
- **Единый файл лидов** - `allLeads.json` для всех источников (API + webhook)
- **Проверка дублей по paymentUrl** - O(n) поиск по всем существующим лидам
- **Серверная генерация dealId** - гарантия уникальности через timestamp + random
- **Разделение окружений** - prod/test данные и логи изолированы
- **Минимальные HTTP запросы к AmoCRM** - только при необходимости обновления

### Ограничения
- **Файловая база данных** - подходит для средних нагрузок (до 10k лидов)
- **Последовательная обработка лидов** - блокировка предотвращает параллельную обработку
- **Зависимость от файловой системы** - требует регулярного бэкапа JSON файлов
- **Проверка дублей O(n)** - время поиска растет линейно с количеством лидов

### Рекомендации по масштабированию

#### Для больших объемов (>10k лидов):
1. **Переход на базу данных** (MySQL/PostgreSQL):
   - Индексы на `paymentUrl` и `dealId`
   - Более быстрая проверка дублей
   - Атомарные транзакции

2. **Кэширование:**
   - Redis для хранения списка существующих paymentUrl
   - Memcached для кэширования партнерских данных

3. **Очереди сообщений:**
   - RabbitMQ/Redis Queue для асинхронной обработки лидов
   - Разделение приема и обработки лидов

#### Мониторинг производительности:
```bash
# Размер файла лидов:
ls -lh data_production/allLeads.json

# Количество лидов:
jq length data_production/allLeads.json

# Частота обновлений:
stat data_production/allLeads.json
```

### Backup и восстановление

#### Автоматический бэкап:
```bash
#!/bin/bash
# backup_script.sh
DATE=$(date +%Y%m%d_%H%M%S)
cp data_production/allLeads.json "backups/allLeads_${DATE}.json"
cp data_production/zeno_report.json "backups/zeno_report_${DATE}.json"
```

#### Восстановление:
```bash
# Восстановить из бэкапа:
cp backups/allLeads_YYYYMMDD_HHMMSS.json data_production/allLeads.json
```

### Блокировки
- `submit_partner_lead.lock` - предотвращение одновременной обработки лидов
- Автоматическое снятие блокировок при завершении

### Оптимизации
- JSON файлы для быстрого доступа
- Проверка дублей через ID файлы
- Минимальные HTTP запросы к AmoCRM

### Ограничения
- Файловая база данных (подходит для средних нагрузок)
- Последовательная обработка лидов
- Зависимость от файловой системы

## Детальное Описание Функций Файлов

### API Эндпоинты

#### Основной API (`api.php`)
Главный файл API платежной системы, который обрабатывает следующие действия:
- `get_balance` - получение баланса партнера
- `calculate_payment_cost` - расчет стоимости платежа
- `make_payment` - проведение платежа
- `get_transaction_status` - получение статуса транзакции
- `submit_partner_lead` - прием лидов от партнеров

#### Вебхук AmoCRM (`amo2json_webhook.php`)
Принимает данные из AmoCRM при создании/обновлении сделок:
- Извлекает ссылки на оплату из полей сделки
- Парсит сумму и валюту из ссылок
- Сохраняет данные в `allLeads.json`
- Обновляет статусы сделок в AmoCRM

#### Отчеты операторов (`zeno_report.php`)
Принимает отчеты о результатах обработки лидов:
- Сохраняет отчеты в `zeno_report.json`
- Обновляет сделки в AmoCRM при успешной обработке
- Предотвращает дублирование обновлений

### Административные Файлы

#### Панель управления (`gpt_payment_api/admin/`)
- **`index.php`** - Главная страница с навигацией и статистикой
- **`partners.php`** - CRUD операции с партнерами (создание, редактирование, удаление)
- **`rates.php`** - Управление курсами валют
- **`transactions.php`** - Просмотр истории транзакций и их статусов
- **`auth.php`** - Аутентификация администратора через логин/пароль

#### Шаблоны (`admin/templates/`)
- **`header.php/footer.php`** - Общий макет страниц
- **`dashboard.php`** - Главная панель с метриками
- **`manage_partners.php`** - Форма управления партнерами
- **`manage_rates.php`** - Форма редактирования курсов
- **`view_transactions.php`** - Таблица транзакций
- **`login.php`** - Форма авторизации
- **`instructions.php`** - Документация по API

### Системные Библиотеки

#### Аутентификация (`lib/auth_partner.php`)
Класс `AuthPartner` с методами:
- `isTokenValid($token)` - проверка валидности токена
- `getPartnerByToken($token)` - получение данных партнера
- `generateToken()` - генерация нового токена

#### Платежная логика (`lib/payment_core.php`)
Основные функции обработки платежей:
- Списание средств с баланса партнера
- Валидация транзакций
- Расчет комиссий
- Работа с курсами валют

#### Работа с данными (`lib/json_storage_utils.php`)
Универсальные функции для JSON файлов:
- `loadDataFromFile($path)` - загрузка JSON данных
- `saveDataToFile($path, $data)` - сохранение JSON данных
- `loadLineDelimitedFile($path)` - загрузка построчных файлов
- `saveLineDelimitedFile($path, $lines)` - сохранение построчных файлов

### Парсинг и Интеграции

#### Парсер ссылок (`lib/payment_link_parser.php`)
Функция `parsePaymentLink($url)` поддерживает:
- Stripe Payment Links
- PayPal Invoice Links
- Custom payment URLs
- Извлечение суммы и валюты

#### AmoCRM интеграция (`lib/amo_auth_utils.php`)
OAuth2 функции для AmoCRM:
- `getAccessToken()` - получение токена доступа
- `refreshToken()` - обновление токена
- `makeApiRequest($endpoint, $data)` - выполнение API запросов

### Тестовые Файлы

#### Модульные тесты
- **`test_amo_auth.php`** - тестирование аутентификации AmoCRM
- **`test_stripe_parser.php`** - тестирование парсера Stripe
- **`test_partner_api.php`** - тестирование партнерского API
- **`test_zeno_report.php`** - тестирование отчетов операторов

#### Интеграционные тесты
- **`test_amo2json.php`** - полный тест вебхука AmoCRM
- **`test_data_report.php`** - тестирование отчетности данных

#### Отладочные инструменты
- **`stripe_debug.html`** - интерфейс для тестирования Stripe
- **`test_webhook_sender.html`** - отправка тестовых вебхуков

### Конфигурация и Безопасность

#### Файлы окружения
- **`.env.test`** - настройки для разработки и тестирования
- **`.env.production`** - настройки для продакшн среды
- **`.env.example`** - шаблон с описанием всех переменных

#### Безопасность
- **`.htaccess`** - настройки Apache (переменные окружения, защита файлов)
- **`.gitignore`** - исключение чувствительных файлов из Git
- **`logs_*/index.php`** - защита логов от прямого доступа

### Структуры Данных

#### Лиды (`allLeads.json`) - ОБНОВЛЕННАЯ СТРУКТУРА
```json
{
  "dealId": "1705312215_456789",        // Всегда генерируется сервером
  "paymentUrl": "https://pay.openai.com/unique-url",  // Уникальный URL
  "partnerId": "partner_123",           // ID партнера (если лид от партнера)
  "partner_name": "Partner Name",       // Имя партнера (если лид от партнера)
  "amount": 20.00,                      // Сумма (если распарсена)
  "currency": "USD",                    // Валюта (если распарсена)  
  "customerName": "John Doe",           // Пользовательские поля
  "customerEmail": "john@example.com",  // от партнера
  "created_at": "2025-01-15 10:30:15",
  "last_updated": "2025-01-15 10:30:15"
}
```

**Ключевые изменения:**
- `dealId` всегда в формате `timestamp_random` (например: `1705312215_456789`)
- `paymentUrl` должен быть уникальным в рамках всей системы
- Поля `partnerId` и `partner_name` присутствуют только для лидов от партнеров
- Консистентная структура для лидов из AmoCRM и от партнеров

#### Отчеты (`zeno_report.json`) - БЕЗ ИЗМЕНЕНИЙ
```json
{
  "report_id": "zenorep_1705312800_789",
  "lead_id": "1705312215_456789",      // Соответствует dealId из allLeads.json
  "status": "Успешно",
  "amount": "1000",
  "currency": "RUB", 
  "email": "user@example.com",
  "card": "****1234",
  "partner_id": "partner_123",         // Если отчет по партнерскому лиду
  "timestamp": "2025-01-15 11:00:00"   
}
```

#### Файлы отслеживания дублей

**`recieved_api_ids.txt` - УДАЛЕН**
Больше не используется, так как проверка дублей теперь происходит по `paymentUrl` в основном файле `allLeads.json`.

**`id_of_deals_sent_to_amo.txt` - БЕЗ ИЗМЕНЕНИЙ**
Продолжает использоваться для предотвращения повторных обновлений AmoCRM:
```
1705312215_456789
1705312300_789012
...
```

### Контакты для поддержки

При возникновении проблем, не описанных в данном руководстве:
1. Проверьте логи в соответствующей директории окружения
2. Убедитесь, что используете последнюю версию API
3. Обратитесь к администратору системы с конкретными сообщениями об ошибках
