@echo off
echo ========================================
echo       VideoHub - Запуск сервера
echo ========================================
echo.

REM Проверяем Python
python --version >nul 2>&1
if errorlevel 1 (
    echo [ОШИБКА] Python не найден. Скачайте на https://python.org
    pause
    exit /b 1
)

echo [1/2] Установка зависимостей...
pip install -r requirements.txt -q
if errorlevel 1 (
    echo [ОШИБКА] Не удалось установить зависимости
    pause
    exit /b 1
)

echo [2/2] Запуск сервера...
echo.
echo  Ваш IP в сети:
ipconfig | findstr /i "IPv4"
echo.
echo  Откройте браузер: http://localhost:5000
echo  Для доступа с телефона используйте IP выше
echo  (порт 5000)
echo.
echo  Нажмите Ctrl+C для остановки
echo ========================================

python backend/app.py
pause
