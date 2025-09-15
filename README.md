
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
- в корневой папке проекта где находится файл Makefile
    - запустить в терминале ```make up-b ```  для запуска проекта и создать containers 
    - запустить в терминале ``` make up ``` для запуска проекта


## Production/Stag

для запуска проекта на прод

- в корневой папке проекта где находится файл Makefile
    - запустить в терминале ``` make up-b-stag ``` для запуска проекта и создать containers

планировалось добавить CI/CD.
