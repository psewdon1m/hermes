# Структура каталогов Hermes

```
hermes/
├── .env                       # рабочий env-файл (не коммитим)
├── .gitignore
├── README.md                  # обзор архитектуры и инструкции
├── docker-compose.yml         # оркестрация всех сервисов
├── example.env                # шаблон .env со всеми переменными
├── api/                       # REST API (Node.js/Express)
│   ├── Dockerfile
│   ├── package.json
│   └── src/
│       ├── app.js             # сборка приложения + CORS
│       ├── server.js          # точка входа
│       ├── lib/               # вспомогательные модули (env, redis, joinTokens)
│       ├── routes/            # call.js и join.js
│       └── services/          # calls/tokens/turn
├── bot/                       # Telegram-бот (Aiogram + httpx)
│   ├── Dockerfile
│   ├── call_api.py
│   ├── config.py
│   ├── handlers.py
│   ├── main.py
│   └── requirements.txt
├── caddy/                     # фронтовой прокси + TLS
│   ├── Caddyfile
│   └── Dockerfile
├── coturn/                    # конфигурация CoTURN
│   └── turnserver.conf
├── docs/                      # документация
│   ├── api_usage.md           # HTTP-контракты
│   ├── codex.md               # правила работы
│   ├── directory_tree.md      # текущий файл
│   ├── git_managment.md
│   ├── project_passport.md    # техпаспорт на русском
│   └── versions.md            # changelog
├── logger/                    # подписчик Redis logs:*
│   ├── Dockerfile
│   ├── package.json
│   └── src/index.js
├── log-output/                # примонтированный volume с observer.log
├── redis/                     # Dockerfile для Redis
│   └── Dockerfile
├── scripts/                   # утилиты и шпаргалки
│   ├── commands.txt           # curl-примеры, dev-сервер
│   ├── issue-cert.sh          # certbot + копирование TLS
│   ├── logs.sh                # tail + запись в project-logs.log
│   ├── replace-domain.sh      # массовая замена домена
│   └── start-web-test-server.ps1
├── signal/                    # WebSocket сигналинг
│   ├── Dockerfile
│   ├── package.json
│   └── src/server.js
├── web/                       # статический лендинг и UI звонка
│   ├── background-animation.js
│   ├── client.js
│   ├── device-info.js
│   ├── i18n.js
│   ├── index.html             # data-page="landing"
│   ├── join.html              # data-page="join"
│   ├── landing.js
│   ├── media-session.js
│   ├── signaling-session.js
│   ├── ui-controls.js
│   └── src/                   # SVG/PNG ассеты (иконки, плейсхолдеры)
```

> `log-output/` создаётся автоматически контейнером logger и хранит `observer.log`. Для локального просмотра используйте `scripts/logs.sh` — скрипт одновременно отображает tail и сохраняет копию в `project-logs.log`.
