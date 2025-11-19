#!/bin/bash

# Скрипт для запуска Puppeteer сервиса парсинга ссылок оплаты

SERVICE_DIR="/workspaces/allcodespaces/amogt/puppeteer-service"
PID_FILE="$SERVICE_DIR/payment-parser.pid"
LOG_FILE="$SERVICE_DIR/payment-parser.log"
PORT=3001

cd "$SERVICE_DIR"

case "$1" in
    start)
        if [ -f "$PID_FILE" ]; then
            PID=$(cat "$PID_FILE")
            if kill -0 "$PID" 2>/dev/null; then
                echo "Service already running with PID $PID"
                exit 1
            else
                echo "Stale PID file found, removing..."
                rm -f "$PID_FILE"
            fi
        fi

        echo "Starting payment parser service..."
        nohup node payment-parser.js > "$LOG_FILE" 2>&1 &
        echo $! > "$PID_FILE"
        echo "Service started with PID $(cat $PID_FILE)"
        ;;
    
    stop)
        if [ -f "$PID_FILE" ]; then
            PID=$(cat "$PID_FILE")
            if kill -0 "$PID" 2>/dev/null; then
                echo "Stopping service with PID $PID..."
                kill "$PID"
                rm -f "$PID_FILE"
                echo "Service stopped"
            else
                echo "Service not running"
                rm -f "$PID_FILE"
            fi
        else
            echo "PID file not found, service might not be running"
        fi
        ;;
    
    restart)
        $0 stop
        sleep 2
        $0 start
        ;;
    
    status)
        if [ -f "$PID_FILE" ]; then
            PID=$(cat "$PID_FILE")
            if kill -0 "$PID" 2>/dev/null; then
                echo "Service is running with PID $PID"
                echo "Service URL: http://localhost:$PORT"
            else
                echo "Service not running (stale PID file)"
            fi
        else
            echo "Service not running"
        fi
        ;;
    
    logs)
        if [ -f "$LOG_FILE" ]; then
            tail -f "$LOG_FILE"
        else
            echo "Log file not found"
        fi
        ;;
    
    *)
        echo "Usage: $0 {start|stop|restart|status|logs}"
        exit 1
        ;;
esac
