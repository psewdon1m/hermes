# Технический паспорт проекта Hermes

## Общее описание

**Hermes** — само‑хостируемый WebRTC стек для проведения приватных видеозвонков P2P. Репозиторий содержит весь набор сервисов (API, сигналинг, TURN/STUN, веб‑клиент, телеграм‑бот и логгер) и готов к запуску через Docker Compose. Основной домен и внешние URL задаются переменными окружения, все секреты хранятся в `.env`.

## Состав системы

### Основные компоненты

1. **API сервис** (`api/`) — REST API (Node.js/Express) для создания звонков, выдачи токенов и параметров подключения.
2. **Signal сервис** (`signal/`) — WebSocket сервер для обмена SDP/ICE сообщениями и доставки клиентских логов.
3. **Caddy** (`caddy/`) — фронтовой HTTP/HTTPS сервер, который терминирует TLS и проксирует трафик на API, сигналинг и статику.
4. **CoTURN** (`coturn/`) — TURN/STUN сервер, работающий на 3478/5349 портах и выдающий креды по HMAC‑секрету.
5. **Web клиент** (`web/`) — статический лендинг и страница `/join`, реализующая медиа‑клиент WebRTC.
6. **Telegram‑бот** (`bot/`) — сервис на Aiogram, который вызывает API, рассылает короткие ссылки и поддерживает inline‑шаринг.
7. **Redis** (`redis/`) — единое хранилище для сессий, токенов, rate limit и Pub/Sub журналов.
8. **Logger** (`logger/`) — подписчик на `logs:*`, сохраняющий события звонков в консоль и файл (`log-output/observer.log`).

### Схема взаимодействий

```
[Web Client]  <->  [Caddy] <-> [API / Signal] <-> [Redis]
[Telegram Bot] ---> [Caddy/API]
                              \-> [CoTURN]
                               -> [Logger]
```

## Компоненты

### 1. API (api/)

- **Стек:** Node.js 20, Express, Zod, Redis, собственная реализация HS256 JWT.
- **Функции:**
  - Создание звонка с 6‑символьным OTC кодом (TTL 15 минут).
  - Генерация joinToken (JWT, TTL = `JOIN_TOKEN_TTL_SECONDS`, по умолчанию 24 часа) и сопоставление его с 16‑символьным `joinCode` (base64url) через `joinTokens.js`.
  - Короткие ссылки `/join?code=...` для offerer/answerer и их разрешение.
  - Выдача ICE серверов (`TURN_DOMAIN` + `TURN_SECRET`) и публичного `WS_PUBLIC`.
  - Rate limiting: глобальный лимит 60 req/min/IP и отдельный brute‑force лимитер для `/api/call/resolve` (40 попыток/IP, 25/код за 5 минут).
  - Health endpoints `/healthz` и `/api/healthz`.
- **Основные маршруты:**
  - `POST /api/call/create` — выдача `callId`, `code`, `joinUrl`, `joinCode`, `joinToken`.
  - `POST /api/call/resolve` — обмен OTC кода на `joinCode`/`joinToken` (роль answerer).
  - `POST /api/join` — прием `token` или `code` и возврат `callId`, `role`, `iceServers`, `wsUrl`, `token`.
- **Безопасность:**
  - Все JWT подписываются `JWT_SECRET` (HS256).
  - Join‑коды валидируются регуляркой `[A-Za-z0-9_-]{12,32}`.
  - Redis используется как единственный источник истины; при деградации чтения API работает в fail‑open режиме.

### 2. Signal (signal/)

- **Стек:** Node.js + `ws`, Redis (ioredis).
- **Функции:**
  - Веб‑сокет `/ws` с проверкой JWT (тот же `JWT_SECRET`), валидация `callId/peerId/sig`.
  - Отслеживание активных пиров в Redis (`call:{callId}:peers`), повторное подключение, ограничение `MAX_PEERS_PER_CALL` (по умолчанию 2).
  - Рассылка служебных событий (`peer-joined`, `peer-left`, `peer-reconnected`) и ретрансляция пользовательских сообщений `type/payload`.
  - Прием клиентских логов (`type: log`) и публикация в `logs:{callId}` для Logger/наблюдателей.
  - Тайм‑ауты по `INACTIVE_TTL_SECONDS` для автоматического закрытия комнат без пиров.

### 3. CoTURN (coturn/)

- **Конфигурация:** `coturn/turnserver.conf` + секрет `TURN_SECRET`.
- **Порты:** 3478 (UDP/TCP STUN/TURN), 5349 (TLS), медиадиапазон 49152–65535.
- **Авторизация:** short‑term креденшелы (`username = ts:user`, `credential = HMAC-SHA1(username, TURN_SECRET)`), TTL 600 секунд.
- **Развертывание:** контейнер coturn, работающий в host‑network и использующий TLS файлы, полученные скриптом `scripts/issue-cert.sh`.

### 4. Web клиент (web/)

- **Стек:** Vanilla JS + ES6 modules, без сборщика.
- **Файлы:**
  - `index.html` / `landing.js` — лендинг и форма создания звонка (Telegram ID опционален).
  - `join.html` + `client.js`, `media-session.js`, `signaling-session.js` — основной WebRTC клиент.
  - `ui-controls.js`, `background-animation.js`, `device-info.js`, `i18n.js` — UI, анимации и локализация (en/ru).
  - `src/` — SVG/PNG ассеты (иконки, fallback, og-card).
- **Особенности:** адаптивный интерфейс (desktop/tablet/mobile), копирование коротких ссылок, автопереход по созданному коду, логирование событий через сигналинг.

### 5. Telegram‑бот (bot/)

- **Стек:** Python 3.11, Aiogram 3, httpx, python-dotenv.
- **Возможности:**
  - Команды `/start`, `/createCall`, inline‑кнопки для мгновенного создания звонка.
  - Inline‑режим (`switch_inline_query`) для пересылки коротких ссылок без выходa из чата.
  - Кнопка «Скопировать ссылку» (callback `copy_link:*`) с уведомлением `show_alert`.
  - Логирование в stdout и `bot.log`.
- **Интеграция:** использует `CALL_API_BASE` для вызова `POST /api/call/create`, токен `TG_BOT_TOKEN` подается через `.env`. Контейнер монтирует папку `bot/` для горячей правки.

### 6. Redis (redis/)

- **Роль:** хранилище состояний и rate limit.
- **Ключи:**
  - `call:{callId}` — данные звонка (статус, таймстемпы, initiator).
  - `call:{callId}:peers` — множество подключенных пиров.
  - `otc:{code}` — ссылка OTC → `callId` (TTL 15 минут).
  - `join:code:{code}` — JSON `{token, callId, role}` (TTL = `JOIN_TOKEN_TTL_SECONDS`).
  - `rl:ip:{ip}:g60` — глобальный лимит 60 req/min.
  - `rl:ip:{ip}:resolve`, `rl:code:{hash}` — антибрут для resolve.
  - `logs:{callId}` — Pub/Sub канал клиентских логов.

### 7. Logger (logger/)

- **Стек:** Node.js + `ioredis` + `colorette`.
- **Функции:** подписка на `logs:*`, цветной вывод в stdout, фильтрация по `LOGGER_CALL_FILTER`, управление деталями (`LOGGER_INCLUDE_DETAIL`), запись в файл `log-output/observer.log`.
- **Сигналы:** корректно завершает соединение по `SIGINT/SIGTERM`.

### 8. Caddy и инфраструктура

- **Caddy** проксирует `/` → `web/`, `/api/*` → API, `/ws` → Signal, терминирует TLS через `SERVER_NAME` + смонтированные сертификаты.
- **Docker Compose** (`docker-compose.yml`) описывает все сервисы и монтирует:
  - `log-output/` для логгера;
  - TLS файлы (`SSL_CERT_HOST_PATH`, `SSL_KEY_HOST_PATH`);
  - исходники бота (горячая перезагрузка).

## Конфигурация окружения

### Базовые переменные

- `SERVER_NAME` — основной домен (используется Caddy, API, TURN).
- `API_ORIGIN` — публичный URL API (по умолчанию `https://SERVER_NAME`).
- `WS_PUBLIC` — публичный WebSocket URL (`wss://SERVER_NAME/ws`).
- `DOMAIN` — алиас для генерации ссылок (`join?code=...`), обычно равен `SERVER_NAME`.
- `CALL_API_BASE` — базовый URL, который использует телеграм‑бот.
- `REDIS_URL` — строка подключения к Redis (по умолчанию `redis://redis:6379`).

### Секреты и токены

- `JWT_SECRET` — ключ HS256 для API/Signal/Join.
- `TURN_SECRET` — ключ для генерации TURN кредов.
- `JOIN_TOKEN_TTL_SECONDS` — TTL JWT и join‑кодов (3600–86400).
- `JOIN_CODE_MAX_ATTEMPTS` — количество попыток подбора уникального кода (по умолчанию 6).
- `TG_BOT_TOKEN` — токен телеграм‑бота.

### TLS и инфраструктура

- `SSL_CERT_HOST_PATH`, `SSL_KEY_HOST_PATH` — пути до fullchain/privkey на хосте; выдаются через `scripts/issue-cert.sh`.
- `LETSENCRYPT_EMAIL` — почта для certbot (опционально).

### Логирование

- `LOGGER_CALL_FILTER` — выводить только конкретный `callId` (пусто = все).
- `LOGGER_INCLUDE_DETAIL` — `1/0` для включения payload.detail.

## Поток данных

1. Пользователь на лендинге вводит (или не вводит) Telegram ID и нажимает CTA. `landing.js` вызывает `POST /api/call/create`.
2. API создает `callId`, OTC код, `joinToken` (роль offerer) и соответствующий `joinCode`, после чего возвращает короткую ссылку `/join?code=...`.
3. Клиент копирует ссылку и либо переходит сразу (offerer), либо делится кодом с собеседником. Телеграм‑бот выполняет ту же операцию по команде `/createCall`.
4. Ответчик вызывает `POST /api/call/resolve` по 6‑символьному коду и получает `joinCode`/`joinToken` (роль answerer).
5. При открытии `/join` клиент отправляет `POST /api/join` с `code` или `token`, получает `iceServers`, `wsUrl` и определенную роль.
6. Клиент открывает WebSocket (`wsUrl?callId=...&peerId=...&sig=token`) и проходит сигналинг/ICE обмен через Signal + CoTURN.
7. В процессе UI отправляет технические логи (`type: log`), которые через Redis получает Logger и (при необходимости) наблюдатели.
8. Завершение звонка очищает множества пиров; при отсутствии активности Redis снова ставит TTL на `call:{callId}`.

## Безопасность и надежность

- Все чувствительные ключи живут только в `.env`, пример находится в `example.env`.
- API и Signal повторно вычисляют подписи JWT и отклоняют `bad_jwt`, `bad_jwt_sig`, `jwt_expired`, `bad_join_code`.
- Redis лимитирует brute‑force и эластично переживает кратковременные сбои (middleware работает в fail-open, чтобы звонки продолжались).
- TURN креденшелы краткоживущие (10 минут) и не пересекаются между звонками.
- CORS разрешен только для `https://example.com` (или вашего домена); при необходимости список дополняется.

## Инструменты и скрипты

- `scripts/start-web-test-server.ps1` — локальный Node HTTP сервер для раздачи `web/` на `http://localhost:3000`.
- `scripts/issue-cert.sh` — обертка над certbot для получения TLS и копирования в `SSL_*_HOST_PATH`.
- `scripts/logs.sh` — tail `log-output/observer.log` с записью в `project-logs.log`.
- `scripts/replace-domain.sh` — массовая замена домена в репозитории.
- `scripts/commands.txt` — шпаргалка по curl и локальному dev-server.

## Документация

- `docs/api_usage.md` — спецификация HTTP API.
- `docs/directory_tree.md` — актуальное дерево репозитория.
- `docs/versions.md` — история изменений интерфейса и клиента.
- Настоящий паспорт должен использоваться как основа для онбординга и ревью инфраструктурных изменений.
