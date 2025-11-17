
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


## Production/Stag

для запуска проекта на прод

- в корневой папке проекта где находится файл Makefile
    - запустить в терминале ``` make up-b-stag ``` для запуска проекта и создать containers

планировалось добавить CI/CD.

## Auto-Testing Setup

- GitHub Actions workflow `.github/workflows/telewin-ci.yml` runs on every push/PR.
- The matrix job installs dependencies from `web_app/pyproject.toml` and `bot/pyproject.toml` using Python 3.13.
- `pytest` executes for both the Django backend and Telegram bot, and Docker images from `web_app/dockerb` and `bot/docker` are built afterwards to ensure the stack still compiles.
