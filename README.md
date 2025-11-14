
# TeleWin
- это проект для управления и публикации кампаний в группах Telegram
- бэкэнд построен на Python Django


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


## Production/Stag

для запуска проекта на прод

- в корневой папке проекта где находится файл Makefile
    - запустить в терминале ``` make up-b-stag ``` для запуска проекта и создать containers

планировалось добавить CI/CD.

## Auto-Testing Setup

This project now has automated testing for every commit.
