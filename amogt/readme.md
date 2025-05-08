# Интеграция AMO CRM и Excel Таблиц (через Google Drive)

Этот скрипт на Node.js обеспечивает интеграцию AMO CRM с Excel Таблицами, хранящимися на Google Drive:
1.  **Задача 1**: Передача полей «Номер сделки» и «Ссылка на оплату» из AMO CRM в Excel Таблицу на Google Drive при нажатии кнопки «Сохранить» в AMO CRM (требует настройки вебхука).
2.  **Задача 2**: Чтение новых строк из Excel Таблицы на Google Drive и обновление соответствующих сделок в AMO CRM с полями: Сумма, Валюта, Почта, Карта, Статус и статическими значениями.

## Требования
- Node.js (версия 16 или выше)
- Google Drive аккаунт для хранения Excel файлов (`.xlsx`)
- Проект в Google Cloud с включенным Google Drive API
- Аккаунт AMO CRM с доступом к API
- Базовые знания работы с переменными окружения и командной строкой

## Инструкция по настройке

### 1. Установка зависимостей
Склонируйте репозиторий или скопируйте файлы проекта. Установите необходимые пакеты Node.js:

```bash
npm init -y
npm install axios dotenv xlsx express googleapis # express если используется вебхук-сервер
```

### 2. Настройка Google Drive API и Excel Файлов
Для работы с Excel Таблицами на Google Drive нужны `GOOGLE_DRIVE_FILE_ID_AMO2EXCEL`, `GOOGLE_DRIVE_FILE_ID_EXCEL2AMO`, `SHEET_NAME` и файл ключей сервисного аккаунта `mycity2_key.json`.

#### А. Настройка Google Drive API и получение `key.json`
1.  Перейдите в [Google Cloud Console](https://console.cloud.google.com/).
2.  Создайте новый проект или выберите существующий.
3.  Включите **Google Drive API**:
    -   Перейдите в «APIs & Services» > «Library».
    -   Найдите «Google Drive API» и нажмите «Enable».
4.  Создайте учетные данные сервисного аккаунта:
    -   Перейдите в «APIs & Services» > «Credentials».
    -   Нажмите «Create Credentials» > «Service Account».
    -   Заполните данные и создайте сервисный аккаунт.
    -   Скачайте JSON-файл ключей. **Переименуйте этот файл в `mycity2_key.json` и поместите его в корень проекта.**

#### Б. Создание Excel файлов на Google Drive и получение их ID
1.  Создайте два Excel файла (`.xlsx`) на вашем Google Drive:
    *   Один файл для Задачи 1 (AMO -> Excel on Drive). Данные будут записываться сюда.
    *   Один файл для Задачи 2 (Excel on Drive -> AMO). Данные будут читаться отсюда.
    *   Вы можете создать пустые файлы или файлы с заголовками.
2.  Получите ID каждого файла:
    *   Откройте Excel файл на Google Drive.
    *   `FILE_ID` — это длинная строка в URL. Например, в:
        `https://docs.google.com/spreadsheets/d/FILE_ID/edit` (даже если это Excel, URL может быть похож)
        Или, если вы загрузили Excel, URL может быть вида: `https://drive.google.com/file/d/FILE_ID/view`
    *   Скопируйте эти ID для файла `.env` как `GOOGLE_DRIVE_FILE_ID_AMO2EXCEL` и `GOOGLE_DRIVE_FILE_ID_EXCEL2AMO`.

#### В. Предоставление доступа сервисному аккаунту
1.  Откройте JSON-файл (`mycity2_key.json`) и найдите `client_email` (например, `service-account@project.iam.gserviceaccount.com`).
2.  Для каждого Excel файла на Google Drive, который будет использовать скрипт:
    *   Нажмите «Поделиться» (Share).
    *   Добавьте `client_email` сервисного аккаунта.
    *   Предоставьте права «Редактор» (Editor), чтобы скрипт мог читать и записывать файлы.

#### Г. Настройка `SHEET_NAME`
1.  `SHEET_NAME` — это название конкретного листа (вкладки) внутри ваших Excel файлов (например, «Sheet1»).
2.  Убедитесь, что структура листа соответствует задачам:
    -   Для **Задачи 1** (лист в файле `GOOGLE_DRIVE_FILE_ID_AMO2EXCEL`): Первая строка должна быть заголовком (например, "Deal Number", "Payment Link"). Скрипт будет добавлять данные, начиная со второй строки.
    -   Для **Задачи 2** (лист в файле `GOOGLE_DRIVE_FILE_ID_EXCEL2AMO`): Первая строка должна быть заголовком. Ожидаемые заголовки (или порядок столбцов): A: Номер сделки, B: Ссылка на оплату, C: Сумма, D: Валюта, E: Почта, F: Карта, G: Статус.
3.  Скопируйте точное название листа для файла `.env` (если отличается от "Sheet1"). Скрипт использует это имя для обоих процессов.

### 3. Настройка AMO CRM API
Для работы с AMO CRM используются OAuth 2.0. Вам понадобятся `AMO_DOMAIN`, `AMO_INTEGRATION_ID`, `AMO_SECRET_KEY`. При первом запуске также потребуется `AMO_AUTH_CODE`.

#### Получение `AMO_DOMAIN`
1.  Войдите в свой аккаунт AMO CRM.
2.  `AMO_DOMAIN` — это полный домен вашего экземпляра AMO CRM (например, `https://yourcompany.amocrm.ru` или `https://yourcompany.amocrm.com`).
3.  Скопируйте этот URL для файла `.env`.

#### Получение `AMO_INTEGRATION_ID` и `AMO_SECRET_KEY`
1.  В AMO CRM перейдите в «Настройки» (или amoMarket -> три точки -> Создать интеграцию).
2.  Создайте новую интеграцию типа "Внешний сервис" (oAuth 2.0).
    -   Укажите название, описание.
    -   В качестве "Ссылка для перенаправления" (Redirect URI) укажите URL, который будет обрабатывать ответ AmoCRM. **Этот URL должен быть точно таким же, как значение, которое вы укажете для `AMO_REDIRECT_URI` в вашем `.env` файле.** Например, `https://yourcompany.amocrm.ru` (если ваш сервер не обрабатывает специальный путь для редиректа) или другой настроенный вами URL.
    -   Предоставьте необходимые доступы (чтение/запись сделок).
3.  После создания интеграции вы получите `ID интеграции` и `Секретный ключ`. Скопируйте их в файл `.env` как `AMO_INTEGRATION_ID` и `AMO_SECRET_KEY`.

#### Получение `AMO_AUTH_CODE` (для первого запуска)
1.  После настройки `.env` с `AMO_INTEGRATION_ID`, `AMO_SECRET_KEY`, `AMO_DOMAIN`, запустите скрипт.
2.  Он выведет в консоль URL для получения кода авторизации. Перейдите по этому URL в браузере.
3.  Авторизуйтесь в AmoCRM и разрешите доступ приложению.
4.  Вы будете перенаправлены на указанный `redirect_uri` (ваш `AMO_DOMAIN`). В адресной строке браузера найдите параметр `code=АВТОРИЗАЦИОННЫЙ_КОД`.
5.  Скопируйте этот `АВТОРИЗАЦИОННЫЙ_КОД` и вставьте его в файл `.env` как `AMO_AUTH_CODE`.
6.  Перезапустите скрипт. Он использует этот код для получения access/refresh токенов и сохранит их в `amo_tokens.json`. После этого `AMO_AUTH_CODE` из `.env` больше не нужен для последующих запусков, пока токены действительны.

### 4. Настройка пользовательских полей в AMO CRM
Скрипт обновляет пользовательские поля в AMO CRM для **Задачи 2**. Создайте эти поля в AMO CRM. Вместо ID полей, теперь скрипт использует **точные имена полей**, как они заданы в AmoCRM.

1.  Перейдите в AMO CRM в «Настройки» > «Поля» (для сделок).
2.  Создайте или найдите нужные поля. Запишите их **точные имена**.
3.  Обновите соответствующие переменные в файле `.env` с **именами полей** (например, `AMO_CF_NAME_AMOUNT_ISSUED="Сумма кредита"`). См. примеры в `config.js` и `.env` для имен переменных (`AMO_CF_NAME_...`). Если переменная в `.env` не установлена, будет использовано значение по умолчанию из `config.js`.

Пример пользовательских полей (имена могут отличаться в вашей CRM):
- Сумма выдана
- Валюта
- Счет списания
- Дата списания
- Администратор
- Карта
- Оплаченный сервис
- Почта
- Срок оплаты
- Статус

### 5. Настройка переменных окружения
Создайте файл `.env` в корне проекта.

Пример `.env` файла:
```env
# Это конфигурационный файл, не запускайте его с помощью node!

# Настройки Google Drive для Excel Файлов
GOOGLE_DRIVE_FILE_ID_AMO2EXCEL=ВАШ_GOOGLE_DRIVE_FILE_ID_ДЛЯ_AMO_В_EXCEL
GOOGLE_DRIVE_FILE_ID_EXCEL2AMO=ВАШ_GOOGLE_DRIVE_FILE_ID_ДЛЯ_EXCEL_В_AMO
SHEET_NAME=Sheet1 # Имя листа по умолчанию в Excel файлах

# Настройки AMO CRM (OAuth 2.0)
AMO_DOMAIN=https://yourcompany.amocrm.ru
AMO_INTEGRATION_ID=ВАШ_ID_ИНТЕГРАЦИИ
AMO_SECRET_KEY=ВАШ_СЕКРЕТНЫЙ_КЛЮЧ
AMO_REDIRECT_URI=https://yourcompany.amocrm.ru
AMO_AUTH_CODE= # Вставьте сюда код авторизации при первом запуске

# Имена Пользовательских полей AMO CRM (для Задачи 2 - excel2amo.js)
# Укажите ТОЧНЫЕ имена полей, как они настроены в вашей AmoCRM.
# Если не указаны, будут использованы значения по умолчанию из config.js (на русском).
# AMO_CF_NAME_AMOUNT_ISSUED="Сумма выдана"
# AMO_CF_NAME_CURRENCY="Валюта"
# AMO_CF_NAME_WITHDRAWAL_ACCOUNT="Счет списания"
# AMO_CF_NAME_WITHDRAWAL_DATE="Дата списания"
# AMO_CF_NAME_ADMINISTRATOR="Администратор"
# AMO_CF_NAME_CARD="Карта"
# AMO_CF_NAME_PAID_SERVICE="Оплаченный сервис"
# AMO_CF_NAME_EMAIL="Почта"
# AMO_CF_NAME_PAYMENT_TERM="Срок оплаты"
# AMO_CF_NAME_STATUS="Статус"


# Опционально, для excel2amo.js, если используется прямой токен вместо OAuth
# AMO_TOKEN=ВАШ_ПРЯМОЙ_API_ТОКЕН_ЕСЛИ_ИСПОЛЬЗУЕТСЯ

# Опционально
# NAMEPROMPT=имя_вашего_проекта
# PORT=3000 # Порт для вебхук-сервера
```

### 6. Запуск скрипта
**Важно:** Убедитесь, что вы запускаете скрипт `allcdsps-amogtindex.js`.

1.  Убедитесь, что все зависимости установлены и файл `.env` настроен.
2.  Установите PM2, если еще не установлен:
    ```bash
    npm install -g pm2
    ```
3.  Запустите главный скрипт с помощью PM2 (рекомендуется):
    ```bash
    pm2 start allcdsps-amogtindex.js --name amocrm-gdrive-excel-sync
    ```
    Или напрямую с помощью Node.js:
    ```bash
    node allcdsps-amogtindex.js
    ```
4.  Скрипт будет:
    -   Ожидать обновления из AMO CRM (для Задачи 1). Если `GOOGLE_DRIVE_FILE_ID_AMO2EXCEL` настроен.
    -   Периодически проверять Excel Таблицу на Google Drive (`GOOGLE_DRIVE_FILE_ID_EXCEL2AMO`) и обновлять AMO CRM (Задача 2). Если `GOOGLE_DRIVE_FILE_ID_EXCEL2AMO` настроен.

### 7. Настройка вебхука для Задачи 1
Модуль `amo2excel.js` содержит функцию `handleAmoWebhook`. Для полной реализации Задачи 1:
1.  Вам нужно реализовать HTTP-сервер (например, с использованием Express). Пример базовой настройки сервера может быть интегрирован в `allcdsps-amogtindex.js` или запущен как отдельный файл.
2.  В AMO CRM настройте вебхук (Настройки -> Интеграции -> Ваша интеграция -> Вебхуки), чтобы отправлять обновления сделок (например, при изменении статуса или сохранении) на URL вашего сервера (например, `https://ваш-сервер.com/webhook`).
3.  Функция `handleAmoWebhook` в `amo2excel.js` ожидает объект `dealData`, содержащий `id` сделки и массив `custom_fields_values`. Убедитесь, что ваш сервер передает данные в этом формате.

Пример настройки Express сервера (можно интегрировать в `allcdsps-amogtindex.js`):
```javascript
// В allcdsps-amogtindex.js или отдельном файле
const express = require('express');
const { handleAmoWebhook } = require('./amo2excel'); // Убедитесь, что путь правильный
const config = require('./config'); // Для доступа к PORT

function setupWebhookServer() {
    if (!config.GOOGLE_DRIVE_FILE_ID_AMO2EXCEL) {
        console.log("Сервер вебхуков для amo2excel (Drive) не запущен: GOOGLE_DRIVE_FILE_ID_AMO2EXCEL не сконфигурирован.");
        return;
    }

    const app = express();
    const port = process.env.PORT || 3000;
    app.use(express.json());

    app.post('/webhook', async (req, res) => {
        console.log('Webhook received:', JSON.stringify(req.body, null, 2));
        // Адаптируйте req.body к формату, ожидаемому handleAmoWebhook.
        // AmoCRM обычно отправляет данные о сделке в одном из полей, например, leads[add][0] или leads[update][0]
        // Пример адаптации:
        let dealData = null;
        if (req.body.leads) {
            if (req.body.leads.add && req.body.leads.add[0]) {
                dealData = req.body.leads.add[0];
            } else if (req.body.leads.update && req.body.leads.update[0]) {
                dealData = req.body.leads.update[0];
            }
            // Добавьте другие события, если необходимо, например, status
            else if (req.body.leads.status && req.body.leads.status[0]) {
                 dealData = req.body.leads.status[0];
            }
        } else if (req.body.id && req.body.custom_fields_values) { // Если вебхук шлет уже "чистые" данные сделки
            dealData = req.body;
        }


        if (dealData) {
            await handleAmoWebhook(dealData);
        } else {
            console.log("Webhook received, but no relevant deal data found in expected format.");
        }
        res.status(200).send('OK');
    });

    app.listen(port, () => {
        console.log(`Сервер вебхуков для amo2excel (Drive) запущен на порту ${port}`);
    });
}

// Вызовите setupWebhookServer() в функции main() вашего allcdsps-amogtindex.js,
// если вы хотите запустить его как часть основного процесса.
// main() в allcdsps-amogtindex.js уже содержит примерный код для этого.
```

### Устранение неполадок
-   **Ошибки Google Drive API**:
    *   Проверьте правильность `GOOGLE_DRIVE_FILE_ID_...` в `.env`.
    *   Убедитесь, что файл `mycity2_key.json` находится в корне проекта и корректен.
    *   Убедитесь, что Google Drive API включен в Google Cloud Console.
    *   Проверьте, что сервисный аккаунт (email из `mycity2_key.json`) имеет права «Редактор» для указанных Excel файлов на Google Drive.
-   **Ошибки Excel (при обработке)**: Проверьте `SHEET_NAME` в `.env`. Убедитесь, что структура данных в листах Excel соответствует ожиданиям скрипта.
-   **Ошибки AMO CRM API**: Проверьте `AMO_DOMAIN`, `AMO_INTEGRATION_ID`, `AMO_SECRET_KEY` в `.env`. При первом запуске убедитесь, что `AMO_AUTH_CODE` был правильно получен и введен.
-   **Ошибки пользовательских полей**: Убедитесь, что имена полей `AMO_CF_NAME_...` в `.env` (или значения по умолчанию) **точно совпадают** с именами полей в AMO CRM.
-   **Проблемы с вебхуком**: Убедитесь, что ваш сервер вебхуков общедоступен и URL правильно настроен в AMO CRM.

### Примечания
-   Скрипт выполняет Задачу 2 (синхронизация из Excel на Drive в AMO) с интервалом, заданным в `excel2amo.js` (по умолчанию 1 минута).
-   Защитите файл `.env`, `mycity2_key.json` и `amo_tokens.json`.
-   Для продакшена используйте PM2.

Для дополнительной информации:
- [Документация Google Drive API](https://developers.google.com/drive/api/v3/about-sdk)
- [Документация AMO CRM API](https://www.amocrm.ru/developers/content/api/auth)
- [Библиотека `xlsx` (SheetJS)](https://sheetjs.com/)