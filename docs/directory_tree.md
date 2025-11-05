# Дерево директорий проекта Hermes

```
hermes/
├── api/                           # API сервер (Node.js/Express)
│   ├── Dockerfile                 # Docker образ для API
│   ├── package.json              # Зависимости API сервера
│   └── src/                      # Исходный код API
│       ├── app.js                # Создание Express приложения
│       ├── server.js             # Запуск сервера
│       ├── lib/                  # Библиотеки и утилиты
│       │   ├── env.js            # Переменные окружения
│       │   ├── errors.js         # Обработчики ошибок
│       │   ├── ratelimit.js      # Rate limiting middleware
│       │   └── redis.js          # Redis клиент
│       ├── routes/               # API маршруты
│       │   ├── call.js           # Маршруты для звонков
│       │   └── join.js           # Маршруты для присоединения
│       └── services/             # Бизнес-логика
│           ├── calls.js          # Управление звонками
│           ├── tokens.js         # JWT токены
│           └── turn.js           # TURN сервер интеграция
├── caddy/                        # HTTP/HTTPS прокси
│   ├── Caddyfile                 # Конфигурация Caddy
│   └── Dockerfile                # Docker образ для Caddy
├── coturn/                       # TURN/STUN сервер
│   └── turnserver.conf           # Конфигурация CoTURN
├── docker-compose.yml            # Docker Compose конфигурация
├── .env                          # Переменные окружения
├── log-output/                   # Выходные логи
│   └── actual.logs               # Файл логов
├── logger/                       # Сервис логирования
│   ├── Dockerfile                # Docker образ для логгера
│   ├── package.json              # Зависимости логгера
│   └── src/
│       └── index.js              # Основной файл логгера
├── redis/                        # Redis сервер
│   └── Dockerfile                # Docker образ для Redis
├── scripts/                      # Скрипты
│   └── follow-logs.sh            # Скрипт для отслеживания логов
├── signal/                       # WebSocket сигнальный сервер
│   ├── Dockerfile                # Docker образ для signal сервера
│   ├── package.json              # Зависимости signal сервера
│   └── src/
│       └── server.js             # WebSocket сервер
└── web/                          # Веб-клиент
    ├── client.js                 # Основной клиентский код
    ├── index.html                # HTML страница
    ├── media-session.js          # Управление медиа потоками
    ├── signaling-session.js      # WebSocket сигналинг
    └── ui-controls.js            # Управление интерфейсом
```