# 🎬 WatchVideo — Тестовая видеоплатформа

Веб-платформа для потокового видео с Python (Flask) бэкендом и HTML/CSS/JS фронтендом.  
Дизайн вдохновлён YouTube: тёмная тема, сетка видео, кастомный плеер.

---

## 📋 Функциональность

| Функция | Описание |
|---|---|
| Регистрация / Вход | JWT-авторизация, валидация на бэкенде |
| Загрузка видео | MP4, WebM, OGG, MOV, AVI, MKV — до 4 ГБ, drag & drop |
| Потоковое воспроизведение | HTTP Range requests — видео не скачивается целиком |
| Лайки / дизлайки | Переключаемые реакции, показ счётчиков |
| Комментарии | Добавление и удаление своих комментариев |
| Подписка | Подписка на каналы (авторов) |
| Поиск | Поиск видео по названию |
| Сохранность данных | SQLite-база и файлы видео сохраняются при перезапуске |
| Доступ по сети | Сервер слушает `0.0.0.0` — доступен с любого устройства в сети |

---

## 🚀 Быстрый старт

### 1. Требования

- **Python 3.9+** — скачать на [python.org](https://www.python.org/downloads/)
- Windows / macOS / Linux

### 2. Установка зависимостей

Откройте терминал/CMD в папке `videoplatform` и выполните:

```bash
pip install -r requirements.txt
```

> Если на Windows не работает `pip`, попробуйте `python -m pip install -r requirements.txt`

### 3. Запуск

```bash
python backend/app.py
```

Вы увидите:

```
🎬  WatchVideo запущен!
   Локально:  http://localhost:3000
   В сети:    откройте CMD и выполните: ipconfig
              используйте IPv4-адрес, например http://192.168.x.x:3000
```

### 4. Узнать свой IP-адрес (для доступа с других устройств)

**Windows:**
```
ipconfig
```
Ищите строку `IPv4-адрес` — например, `192.168.1.15`

**macOS/Linux:**
```bash
ifconfig | grep "inet "
```

Затем с любого устройства в той же Wi-Fi сети откройте браузер и введите:
```
http://192.168.1.15:3000
```

---

## 📁 Структура проекта

```
videoplatform/
├── backend/
│   └── app.py              # Flask сервер + все API
├── frontend/
│   ├── index.html          # Главная страница
│   ├── watch.html          # Страница просмотра видео
│   └── static/
│       ├── css/
│       │   ├── main.css    # Основные стили
│       │   ├── watch.css   # Стили плеера
│       │   └── modals.css  # Стили модальных окон
│       └── js/
│           ├── api.js      # Работа с API, JWT
│           ├── auth.js     # Авторизация
│           ├── main.js     # Логика главной страницы
│           └── watch.js    # Логика плеера
├── uploads/                # Загруженные видео (создаётся автоматически)
├── thumbnails/             # Обложки видео (создаётся автоматически)
├── data.db                 # База данных SQLite (создаётся автоматически)
└── requirements.txt        # Python-зависимости
```

---

## 🔌 API эндпоинты

| Метод | URL | Описание |
|---|---|---|
| POST | `/api/auth/register` | Регистрация пользователя |
| POST | `/api/auth/login` | Вход (получение JWT) |
| POST | `/api/auth/refresh` | Обновление токена |
| GET | `/api/auth/me` | Информация о себе |
| GET | `/api/videos` | Список видео (поиск, пагинация) |
| GET | `/api/videos/<uuid>` | Данные одного видео |
| POST | `/api/videos/upload` | Загрузка видео (multipart) |
| DELETE | `/api/videos/<uuid>` | Удаление видео |
| GET | `/api/stream/<uuid>` | Потоковое воспроизведение (Range) |
| POST | `/api/videos/<uuid>/like` | Лайк / дизлайк |
| GET | `/api/videos/<uuid>/comments` | Список комментариев |
| POST | `/api/videos/<uuid>/comments` | Добавить комментарий |
| DELETE | `/api/comments/<id>` | Удалить комментарий |
| POST | `/api/users/<id>/subscribe` | Подписаться / отписаться |

---

## ✅ Валидация при регистрации

- **Email**: обязательный, проверка формата, уникальность
- **Username**: 3–50 символов, только буквы/цифры/_, уникальность
- **Password**: минимум 6 символов
- **Confirm Password**: должен совпадать с паролем

Ошибки возвращаются с кодом `422` в виде JSON `{ "errors": { "field": "message" } }`

---

## 💡 Советы

- Данные (видео, пользователи, комментарии) **сохраняются** при перезапуске сервера
- При первом запуске автоматически создаётся база `data.db` и папки `uploads/`, `thumbnails/`
- Для разработки можно поменять `debug=False` на `debug=True` в последней строке `app.py`
- JWT-ключ в `app.py` (`JWT_SECRET_KEY`) лучше поменять на уникальный в реальном проекте

---

## 🛠 Технологии

- **Backend**: Python 3, Flask, Flask-SQLAlchemy, Flask-JWT-Extended, Flask-CORS, Pillow
- **Database**: SQLite (через SQLAlchemy ORM)
- **Frontend**: Vanilla HTML5, CSS3, JavaScript (без сборщиков)
- **Auth**: JWT (access + refresh tokens)
- **Video**: HTML5 `<video>`, HTTP Range requests

---

## 🌐 Публичная ссылка для доступа извне

Чтобы отправить ссылку другу — не только в своей сети, но через интернет — используй туннель. Все варианты бесплатные:

---

### Вариант 1: localhost.run (без регистрации, самый простой)

Запусти сервер, затем в другом терминале:

```bash
ssh -R 80:localhost:3000 nokey@localhost.run
```

Через несколько секунд увидишь ссылку вида:
```
https://abcdef123456.lhr.life
```
Отправляй кому угодно. Работает, пока открыт терминал.

---

### Вариант 2: Cloudflare Tunnel (надёжнее)

```bash
# Установка
wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared-linux-amd64.deb

# Запуск (регистрация не нужна)
cloudflared tunnel --url http://localhost:3000
```

Получишь ссылку вида `https://something.trycloudflare.com`.

---

### Вариант 3: Tailscale (для доверенных людей, без публичного домена)

Tailscale создаёт VPN-сеть между устройствами. Каждому участнику нужно установить приложение на tailscale.com (бесплатно). Даёшь свой Tailscale-адрес (например `http://100.x.x.x:3000`) — он работает как постоянная ссылка.

---

> **Во всех вариантах:** ссылка работает пока запущен сервер (`python3 backend/app.py`). При выключении сайт недоступен, но все данные сохраняются на диске.
