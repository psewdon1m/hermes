# Структура каталогов Hermes

```
hermes/
├── api/                           # API сервис (Node.js/Express)
│   ├── Dockerfile                 # Docker образ для API
│   ├── package.json               # зависимости API сервиса
│   └── src/                       # исходники API
│       ├── app.js                 # конфигурация Express приложения
│       ├── server.js              # точка входа сервиса
│       ├── lib/                   # утилиты и вспомогательные модули
│       │   ├── env.js             # загрузка переменных окружения
│       │   ├── errors.js          # описание ошибок и фабрики
│       │   ├── ratelimit.js       # middleware для rate limiting
│       │   └── redis.js           # клиент Redis
│       ├── routes/                # HTTP роуты
│       │   ├── call.js            # обработчик создания звонка
│       │   └── join.js            # обработчик присоединения
│       └── services/              # слой сервисов
│           ├── calls.js           # доменная логика звонков
│           ├── tokens.js          # выпуск JWT
│           └── turn.js            # выдача TURN-учеток
├── caddy/                        # HTTP/HTTPS прокси
│   ├── Caddyfile                 # конфигурация Caddy
│   └── Dockerfile                # Docker образ для Caddy
├── coturn/                       # TURN/STUN сервер
│   └── turnserver.conf           # конфигурация CoTURN
├── docker-compose.yml            # оркестрация сервисов
├── .env                          # переменные окружения
├── docs/                         # документация проекта
├── log-output/                   # выгрузки логов и диагностика
│   └── actual.logs               # пример журнала
├── logger/                       # сервис логирования
│   ├── Dockerfile
│   ├── package.json
│   └── src/
│       └── index.js
├── redis/                        # конфигурация Redis
│   └── Dockerfile
├── scripts/                      # вспомогательные скрипты
│   ├── follow-logs.sh            # просмотр логов в реальном времени
│   └── start-web-test-server.ps1 # локальный статический сервер
├── signal/                       # WebSocket сигналинг
│   ├── Dockerfile
│   ├── package.json
│   └── src/
│       └── server.js
└── web/                          # веб-клиент
    ├── index.html                # лендинг с приветствием и CTA
    ├── join.html                 # страница подключения к звонку
    ├── landing.js                # логика создания звонка и работа с API
    ├── background-animation.js   # канвас-анимация абстрактного фона
    ├── client.js                 # основной скрипт звонка
    ├── media-session.js          # управление WebRTC-медиа
    ├── signaling-session.js      # работа с WebSocket-сигналингом
    ├── ui-controls.js            # управление элементами интерфейса
    ├── device-info.js            # определение профиля клиента и окружения
    └── src/                      # SVG/PNG ассеты (иконки, заглушки, favicon)
```
