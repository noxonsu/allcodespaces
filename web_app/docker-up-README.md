# Docker Smart Startup

## Проблема

При запуске `docker-compose --profile all` поднимается `reverse-proxy` контейнер с nginx, который занимает порты 80 и 443. Это конфликтует с nginx на хосте, который уже использует эти порты для других сайтов (habab.ru и др.).

## Решение

Создан умный wrapper-скрипт `docker-up.sh`, который:
1. Проверяет, заняты ли порты 80 и 443
2. Если заняты - запускает **без** reverse-proxy (профили: web-app, bot, db)
3. Если свободны - запускает **с** reverse-proxy (профиль: all)

## Использование

### Через Makefile (рекомендуется)

```bash
# Development
make up       # Запуск с автоопределением профилей
make up-b     # То же + пересборка образов

# Staging/Production
make up-stag    # Запуск staging
make up-b-stag  # Staging + пересборка
```

### Напрямую через скрипт

```bash
cd web_app

# Обычный запуск
./docker-up.sh up -d

# С пересборкой
./docker-up.sh up -d --build

# Staging файл
./docker-up.sh -f docker-compose.stag.yml up -d
```

## Как это работает

**Скрипт проверяет порты:**
```bash
netstat -tlnp | grep ":80 "
netstat -tlnp | grep ":443 "
```

**Если порты заняты (nginx на хосте):**
- Запускается только: web-app, bot, db
- reverse-proxy НЕ поднимается
- Вывод: `⚠️ Порты 80 и/или 443 уже заняты`

**Если порты свободны:**
- Запускается профиль `all` (включая reverse-proxy)
- Вывод: `✅ Порты 80 и 443 свободны`

## Docker Compose Profiles

В `docker-compose.yml` сервисы разделены по профилям:

- **web-app** - Django приложение (порт 8000)
- **bot** - Telegram бот (порт 8001)
- **db** - PostgreSQL
- **reverse-proxy** - Nginx (порты 80, 443)
- **all** - все сервисы вместе

## Важно

- После удаления `reverse-proxy_con` контейнера обязательно перезапустить nginx на хосте
- При запуске через `make up` старые контейнеры автоматически останавливаются (зависимость `up:down`)
- Логи можно смотреть: `docker logs -f <container_name>`

## Troubleshooting

**Если reverse-proxy все равно поднялся:**
```bash
docker stop reverse-proxy_con
docker rm reverse-proxy_con
sudo systemctl restart nginx
```

**Проверить что заняло порты:**
```bash
sudo netstat -tlnp | grep -E ":(80|443)"
# или
sudo ss -tlnp | grep -E ":(80|443)"
```

**Вручную указать профили:**
```bash
cd web_app
docker-compose --profile web-app --profile bot --profile db up -d
```
