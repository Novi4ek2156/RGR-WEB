#!/bin/bash
echo "========================================"
echo "      VideoHub - Запуск сервера"
echo "========================================"
echo ""

# Check Python
if ! command -v python3 &>/dev/null; then
    echo "[ОШИБКА] Python3 не найден"
    exit 1
fi

echo "[1/2] Установка зависимостей..."
pip3 install -r requirements.txt -q

echo "[2/2] Запуск сервера..."
echo ""
echo " Ваш IP в сети:"
ifconfig 2>/dev/null | grep "inet " | grep -v 127.0.0.1 || ip addr | grep "inet " | grep -v 127.0.0.1
echo ""
echo " Откройте браузер: http://localhost:5000"
echo " Нажмите Ctrl+C для остановки"
echo "========================================"

python3 backend/app.py
