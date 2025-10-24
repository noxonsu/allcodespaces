# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TeleWin - платформа пассивного дохода на рекламе в Telegram для управления и публикации рекламных кампаний в группах Telegram.

Проект состоит из двух основных компонентов:
- **web_app/** - Django/DRF backend с админ-панелью
- **bot/** - Telegram бот на python-telegram-bot для управления сообщениями

## Tech Stack

**Backend (web_app/):**
- Python 3.13+ (Django 5.2, DRF)
- PostgreSQL + Redis
- Celery + Celery Beat для асинхронных задач
- Gunicorn, Nginx
- Jazzmin (кастомная Django админка)
- Prometheus + Grafana для мониторинга

**Bot (bot/):**
- python-telegram-bot (v22)
- Starlette + Uvicorn для webhook сервера
- Pydantic V2 для валидации

## Development Commands

### Docker-based Development (Recommended)

Все команды выполняются из корневой папки проекта через Makefile:

```bash
# Development
make up-b      # Запуск с пересборкой контейнеров
make up        # Запуск без пересборки
make down      # Остановка контейнеров

# Production/Staging
make up-b-stag # Запуск staging с пересборкой
make up-stag   # Запуск staging
make down-stag # Остановка staging
```

Docker compose файлы находятся в `web_app/`:
- `docker-compose.yml` - для разработки
- `docker-compose.stag.yml` - для прод/staging

### Testing

```bash
# Backend tests (web_app)
cd web_app
python3 -m pytest tests/ -v

# Bot tests
cd bot
python3 -m pytest tests/ -v
```

### Code Quality

```bash
# Используется ruff для линтинга
ruff check .
```

## Architecture

### Core Models (web_app/core/models.py)

Основные модели системы:

1. **User** - кастомная модель пользователя с ролями (Admin/Publisher)
2. **ChannelAdmin** - владельцы/менеджеры каналов с формами сотрудничества
3. **Channel** - Telegram каналы с метриками (подписчики, охват, ER)
4. **Campaign** - рекламные кампании с бюджетом и таргетингом
5. **CampaignChannel** - связь кампаний и каналов + статусы публикации
6. **Message** - рекламные сообщения с медиа и кнопками

### Bot Architecture (bot/)

**Основные файлы:**
- `main.py` - Starlette app с webhook эндпоинтами
- `bot_handlers.py` - обработчики событий Telegram
- `services.py` - бизнес-логика взаимодействия с backend API
- `parsers.py` - Pydantic модели для валидации данных
- `utils.py` - хелперы для публикации сообщений

**Ключевые эндпоинты бота:**
- `/telegram` - webhook для Telegram updates
- `/api/campaign-channel/` - публикация кампаний через API

### Django Apps

Приложение `core` содержит всю основную логику:
- `admin.py` - конфигурация Jazzmin админки с инлайнами
- `views.py` - DRF views для API
- `signals.py` - Django сигналы для автоматизации
- `tasks.py` - Celery задачи
- `external_clients.py` - клиенты для внешних сервисов
- `exporter.py` - экспорт данных в Excel

### Settings & Configuration

**Django settings** (`web_app/web_app/settings.py`):
- Кастомная модель пользователя: `AUTH_USER_MODEL = "core.User"`
- Redis кэш + session backend
- Prometheus middleware для метрик
- CORS включен для всех origins
- Timezone: Europe/Moscow, Lang: ru
- Celery для фоновых задач

**Bot settings** (`bot/settings.py`):
- Pydantic Settings для конфигурации
- BOT_TOKEN, SCHEMA_DOMAIN из env

## Important Notes

### Environment Variables

Требуемые переменные окружения для backend:
- `SECRET_KEY` - Django secret
- `DEBUG` - режим отладки
- `DB_ENGINE`, `DB_NAME`, `DB_USERNAME`, `DB_PASS`, `DB_HOST`, `DB_PORT` - PostgreSQL

Для бота:
- `BOT_TOKEN` - Telegram bot token
- `SCHEMA_DOMAIN` - домен для webhook

### Database

- PostgreSQL используется как основная БД
- Redis для кэша и Celery broker
- Миграции: стандартный `python manage.py migrate`

### Static Files

- WhiteNoise для статики в продакшене
- Static root: `web_app/static/`
- Media root: `web_app/media/`
- Custom static в `web_app/core/static/`

### Celery Tasks

Используется для:
- Асинхронной публикации сообщений
- Периодических задач через Celery Beat
- Backend: django-db
- Broker: Redis

### Authentication

- Session + Token authentication для DRF
- Telegram OAuth для входа владельцев каналов
- SECURE_CROSS_ORIGIN_OPENER_POLICY для TG-login

### Monitoring

Stack: Prometheus + Grafana + Loki + Promtail
- django-prometheus middleware включен
- Конфиги в web_app/: `prometheus.yml`, `grafana_*.yml`, `promtail_config.yml`

## Common Workflows

### Добавление нового поля в модель

1. Изменить модель в `web_app/core/models.py`
2. Создать миграцию: `python manage.py makemigrations`
3. Применить: `python manage.py migrate`
4. Обновить serializer в `core/serializers.py` если нужно для API
5. Добавить в admin.py если нужно в админке

### Добавление нового обработчика бота

1. Создать функцию в `bot/bot_handlers.py`
2. Зарегистрировать handler в `bot/main.py` в функции `main()`
3. При необходимости добавить Pydantic парсер в `bot/parsers.py`

### Deployment

Проект использует Docker для деплоя:
1. Настроить переменные окружения
2. Использовать `make up-b-stag` для staging/prod
3. Nginx конфигурация в `web_app/nginx/`
4. CI/CD через GitHub Actions (`.github/workflows/main.yml`) - в процессе разработки
