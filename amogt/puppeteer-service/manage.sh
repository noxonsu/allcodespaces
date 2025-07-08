#!/bin/bash

# Скрипт для управления Puppeteer сервисом парсинга платежных ссылок
# Использование: ./manage.sh {start|stop|restart|status|logs}

SERVICE_NAME="payment-parser"
SERVICE_DIR="/workspaces/allcodespaces/amogt/puppeteer-service"
SERVICE_FILE="$SERVICE_DIR/payment-parser.service"
SYSTEMD_SERVICE_FILE="/etc/systemd/system/$SERVICE_NAME.service"

case "$1" in
    start)
        echo "Запуск сервиса $SERVICE_NAME..."
        cd $SERVICE_DIR
        nohup node server.js > logs/service.log 2>&1 &
        echo $! > /tmp/payment-parser.pid
        echo "Сервис запущен. PID: $(cat /tmp/payment-parser.pid)"
        ;;
    stop)
        echo "Остановка сервиса $SERVICE_NAME..."
        if [ -f /tmp/payment-parser.pid ]; then
            PID=$(cat /tmp/payment-parser.pid)
            kill $PID 2>/dev/null || true
            rm -f /tmp/payment-parser.pid
            echo "Сервис остановлен."
        else
            echo "PID файл не найден. Сервис может быть уже остановлен."
        fi
        ;;
    restart)
        echo "Перезапуск сервиса $SERVICE_NAME..."
        $0 stop
        sleep 2
        $0 start
        ;;
    status)
        if [ -f /tmp/payment-parser.pid ]; then
            PID=$(cat /tmp/payment-parser.pid)
            if ps -p $PID > /dev/null 2>&1; then
                echo "Сервис $SERVICE_NAME запущен. PID: $PID"
                echo "Проверка здоровья:"
                curl -s http://localhost:3018/health | jq '.' 2>/dev/null || echo "Сервис не отвечает"
            else
                echo "Сервис $SERVICE_NAME не запущен (PID файл существует, но процесс не найден)"
                rm -f /tmp/payment-parser.pid
            fi
        else
            echo "Сервис $SERVICE_NAME не запущен"
        fi
        ;;
    logs)
        echo "Логи сервиса $SERVICE_NAME:"
        if [ -f $SERVICE_DIR/logs/service.log ]; then
            tail -f $SERVICE_DIR/logs/service.log
        else
            echo "Файл логов не найден"
        fi
        ;;
    install)
        echo "Установка системного сервиса..."
        sudo cp $SERVICE_FILE $SYSTEMD_SERVICE_FILE
        sudo systemctl daemon-reload
        sudo systemctl enable $SERVICE_NAME
        echo "Сервис установлен. Используйте: sudo systemctl start $SERVICE_NAME"
        ;;
    uninstall)
        echo "Удаление системного сервиса..."
        sudo systemctl stop $SERVICE_NAME 2>/dev/null || true
        sudo systemctl disable $SERVICE_NAME 2>/dev/null || true
        sudo rm -f $SYSTEMD_SERVICE_FILE
        sudo systemctl daemon-reload
        echo "Сервис удален"
        ;;
    test)
        echo "Тестирование сервиса..."
        TEST_URL="https://pay.openai.com/c/pay/cs_live_a1NI1dJLxjzVOohUerqJUkzOlTnzrkY1Zk5YeKkqF1qBtOkrAKeaufJteI"
        echo "Тестируем с URL: $TEST_URL"
        curl -s "http://localhost:3018/parse?url=$(echo $TEST_URL | sed 's/#.*//')" | jq '.' 2>/dev/null || echo "Ошибка тестирования"
        ;;
    *)
        echo "Использование: $0 {start|stop|restart|status|logs|install|uninstall|test}"
        exit 1
        ;;
esac

exit 0
