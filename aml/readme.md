# Установка и запуск скрипта

Это руководство объясняет, как установить и запустить скрипт с использованием `installer.js` и менеджера процессов `pm2`.

## Предварительные требования

*   **Установленный [Node.js](https://nodejs.org/) (последняя LTS версия рекомендуется).**
    *   **Linux (Debian/Ubuntu):**
        ```bash
        # Используйте NodeSource репозиторий для последних версий
        curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
        sudo apt-get install -y nodejs
        ```
    *   **macOS (используя Homebrew):**
        ```bash
        brew install node
        ```
    *   **Windows и другие системы:** Загрузите установщик с официального сайта [nodejs.org](https://nodejs.org/).
    *   Убедитесь, что у вас также установлен `npm` или `yarn`. Обычно `npm` устанавливается вместе с Node.js.

## Установка

1.  **Распакуйте архив:**
    Распакуйте предоставленный zip-архив с файлами скрипта в нужную директорию. Перейдите в эту директорию:
    ```bash
    unzip aml.zip -d <папка_назначения>
    cd <папка_назначения>
    ```
    *Замените `<папка_назначения>` на путь, куда вы хотите распаковать файлы.*

2.  **Установите зависимости:**
    Установите необходимые Node.js библиотеки:
    ```bash
    npm install dotenv-vault dotenv node-telegram-bot-api axios
    ```
    *Примечание: Если в будущем потребуются другие библиотеки, добавьте их в эту команду или используйте `npm install` при наличии файла `package.json`.*

3.  **Установите PM2:**
    PM2 - это менеджер процессов для Node.js приложений, который помогает управлять ими и поддерживать их в рабочем состоянии. Установите его глобально:
    ```bash
    npm install pm2 -g
    # или
    yarn global add pm2
    ```

## Запуск с помощью PM2

1.  **Запустите приложение:**
    Используйте PM2 для запуска вашего основного скрипта. **Важно:** Необходимо передать ключ для расшифровки файла `.env.vault` через переменную окружения `DOTENV_KEY`.
    ```bash
    DOTENV_KEY='your_dotenv_key_here' pm2 start alldsp-aml-bot.js --name aml-bot
    ```
    *   Замените `'your_dotenv_key_here'` на ваш актуальный ключ `DOTENV_KEY`.
    *   `--name aml-bot`: Задает имя процессу в PM2 для удобства управления (можно изменить).

    **Примечание:** Если вы не хотите передавать ключ напрямую в командной строке, вы можете использовать [файл конфигурации экосистемы PM2](https://pm2.keymetrics.io/docs/usage/application-declaration/) или установить переменную `DOTENV_KEY` в среде вашего сервера другим способом.

2.  **Управление процессом:**
    *   Посмотреть статус всех процессов: `pm2 list`
    *   Посмотреть логи конкретного приложения: `pm2 logs aml-bot`
    *   Остановить приложение: `pm2 stop aml-bot`
    *   Перезапустить приложение: `pm2 restart aml-bot`
    *   Удалить приложение из PM2: `pm2 delete aml-bot`

3.  **Автозапуск PM2 при старте системы (опционально):**
    Чтобы ваше приложение автоматически запускалось после перезагрузки сервера:
    ```bash
    pm2 startup
    ```
    PM2 выдаст команду, которую нужно выполнить с правами суперпользователя. После этого сохраните текущий список процессов:
    ```bash
    pm2 save
    ```

## Конфигурация окружения

Этот проект использует зашифрованные файлы окружения (`.env.vault`) для безопасного хранения конфигурации (например, токенов API). Для работы с переменными окружения используется библиотека `dotenv-vault`.

**Получение DOTENV_KEY:**

*   Ключ `DOTENV_KEY` необходим для расшифровки файла `.env.vault`.
*   Этот ключ обычно генерируется при создании `.env.vault` с помощью инструментов `dotenv-vault` (например, `npx dotenv-vault build`).
*   **Если вы получили этот проект от кого-то другого, запросите у них `DOTENV_KEY`.** Он не должен храниться в системе контроля версий.
*   Храните `DOTENV_KEY` безопасно. Он должен быть установлен как переменная окружения на вашем сервере или передан при запуске скрипта, как показано в разделе "Запуск с помощью PM2".

**Файл `allowedusers.txt` (Опционально):**

*   Для ограничения доступа к боту создайте файл `allowedusers.txt` в той же директории, что и `alldsp-aml-bot.js`.
*   В этот файл нужно добавлять **имена пользователей Telegram (username)**, по одному на строку. Можно указывать с символом `@` или без него - он будет удален при проверке. Регистр символов не учитывается (например, `MyUser` и `myuser` будут считаться одинаковыми).
*   Пример содержимого `allowedusers.txt`:
    ```text
    user1
    @another_user
    telegram_user_name
    ```
*   **Важно:** Пользователи без установленного `username` в Telegram не смогут использовать бота, если файл `allowedusers.txt` существует и не пуст.
*   Если файл `allowedusers.txt` отсутствует или пуст, бот будет отвечать всем пользователям, у которых есть `username`. Если файл существует и содержит имена пользователей, бот будет игнорировать команды от пользователей, чьих имен нет в файле (или у кого нет `username`).

Для получения дополнительной информации о том, как работать с переменными окружения и их шифрованием, посетите [dotenv.org](https://dotenv.org/). Вам потребуется установить `dotenv-vault` (как указано в шаге установки) для расшифровки файла `.env.vault` во время выполнения.
