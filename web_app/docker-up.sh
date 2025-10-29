#!/bin/bash

# Проверка занятости портов 80 и 443
check_port() {
    netstat -tlnp 2>/dev/null | grep -q ":$1 " && return 0 || return 1
}

# Профили по умолчанию (без reverse-proxy)
PROFILES="web-app,bot,db"

# Проверяем порты 80 и 443
if check_port 80 || check_port 443; then
    echo "⚠️  Порты 80 и/или 443 уже заняты"
    echo "ℹ️  Запускаем без reverse-proxy (nginx уже работает на хосте)"
    PROFILES="web-app,bot,db"
else
    echo "✅ Порты 80 и 443 свободны"
    echo "ℹ️  Запускаем с reverse-proxy"
    PROFILES="all"
fi

echo "🚀 Запуск с профилями: $PROFILES"

# Передаем все аргументы в docker-compose
docker-compose --profile ${PROFILES//,/ --profile } "$@"
