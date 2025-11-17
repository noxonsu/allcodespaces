
# TeleWin
- это проект для управления и публикации кампаний в группах Telegram
- бэкэнд построен на Python Django
- каналы поддерживают мягкое удаление через флаг is_deleted (скрыты из списков и расчётов, восстанавливаются при повторной установке бота)


## Стэк 
- Python (Django/DRF)
- python-telegram-bot
- Starlette
- PydanticV2
- Postgresql
- Redis
- Celery
- Nginx
- Jquery/bootstrap/html5

## мониторинг
- Grafana
- Promethus
- Grafana/loki
- Grafana/promtail

## Docker
- Docker файлы находятся в папке web_app
  - файл docker-compose.yml для Dev
  - файл docker-compose.stag.yml для прод
  

## Dev
запустить приложение для разработки довольно просто
- основной дев‑домен: https://telewin.wpmix.net (стейджовая копия фронтенда/админки)
- тестовый Telegram-бот для авторизации и проверки сценариев — @nashbudjetbot (см. `web_app/.env`)
- в корневой папке проекта где находится файл Makefile
    - запустить в терминале ```make up-b ```  для запуска проекта и создать containers
    - запустить в терминале ``` make up ``` для запуска проекта
- при первом запуске (или после обновлений статики) убедитесь, что выполнен `python3 manage.py collectstatic --no-input` — в docker-compose это теперь делается автоматически перед стартом приложения и складывает файлы в `web_app/staticfiles` (раздается через общий volume `static`)
- кампании и креативы поддерживают форматы «Спонсорство», «Фикс-слот» и «Автопилот»; для фикс-слота указывайте дату и время публикации
- предпросмотр креативов: в админке на форме креатива появилась кнопка «Отправить предпросмотр», она создаёт deeplink `/start` на бота через API `/api/message/<id>/preview/`; бот забирает данные по токену через `/api/message/preview/resolve/` (токен одноразовый)

### Миграции базы данных
- При появлении ошибок типа "column does not exist" система автоматически покажет красивую страницу с инструкцией
- Для запуска миграций в Docker: `docker-compose -f web_app/docker-compose.yml exec web-app python manage.py migrate`
- Для создания новых миграций: `python3 manage.py makemigrations` → `python3 manage.py migrate`
- Middleware `DatabaseMigrationCheckMiddleware` перехватывает ошибки БД и показывает понятное сообщение вместо DEBUG-страницы Django

## Как писать инструкции для ручного тестера
- Тестер не технарь: используйте простые шаги без команд и без терминала.
- Давайте ссылки на стейдж-домен `https://telewin.wpmix.net` и указывайте логины/роли, если нужны.
- Шаги делайте пронумерованными: куда зайти, что включить/выключить, что должно получиться.
- Избегайте внутренней терминологии разработки; пишите формулировки типа «откройте страницу…», «выберите чекбокс…», «убедитесь, что элемент не показывается».


## Production/Stag

для запуска проекта на прод

- в корневой папке проекта где находится файл Makefile
    - запустить в терминале ``` make up-b-stag ``` для запуска проекта и создать containers

планировалось добавить CI/CD.

## Auto-Testing Setup

This project now has automated testing for every commit.

## Contributing (важно)
- Всегда начинай с прочтения README (этого файла) в корне проекта.
- Работаем через docker-compose (см. `web_app/docker-compose.yml`); локальные команды прогоняем внутри контейнеров (`docker compose … exec web-app …`). Логи с `timeout`.
- Отчёт и инструкции для тестера публикуем напрямую в issue после коммита/пуша (для этой задачи — в https://github.com/marsiandeployer/TELEWIN/issues/51), подписываемся как codex.
- В коммитах обязательно указываем ID задачи/issue в сообщении (например, `feature/preview-token-api #51`), а в отчётах ссылаемся на коммит или issue.
