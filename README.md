# P2P Call App - Система видеозвонков с Telegram ботом

## Описание

P2P Call App - это современная система для видеозвонков, интегрированная с Telegram ботом. Система использует WebRTC для прямых соединений между пользователями, TURN сервер для обхода NAT, и Redis для управления комнатами.

## Возможности

- **Видеозвонки** - Высококачественные видеозвонки через WebRTC
- **Telegram бот** - Создание комнат через Telegram (Python + aiogram 3.x)
- **Безопасность** - SSL/TLS шифрование
- **TURN сервер** - Обход NAT и firewall
- **Адаптивность** - Работает на всех устройствах
- **Docker** - Простое развертывание
- **Асинхронность** - Полная поддержка async/await
- **Тестирование** - Встроенные тесты и мониторинг

## Архитектура

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Telegram Bot  │    │   Web Client    │    │   Mobile App    │
└─────────┬───────┘    └─────────┬───────┘    └─────────┬───────┘
          │                      │                      │
          │                      │                      │
          ▼                      ▼                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                        Nginx (Reverse Proxy)                   │
└─────────────────────────────────────────────────────────────────┘
          │                      │                      │
          ▼                      ▼                      ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Node.js App   │    │   TURN Server   │    │     Redis       │
│   (Express +    │    │   (Coturn)      │    │   (Sessions)    │
│   Socket.IO)    │    │                 │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## Версия 2.0.0

**Основные изменения:**
- Переписан Telegram бот с Node.js на Python (aiogram 3.x)
- Асинхронная архитектура с полной поддержкой async/await
- Улучшенная производительность и стабильность
- Современная система тестирования и мониторинга
- Оптимизированная структура проекта

## Быстрый старт

> **Полная документация:** 
> См. [COMPLETE_GUIDE.md](COMPLETE_GUIDE.md) - единое руководство по загрузке на GitHub, развертыванию и устранению неполадок.

### 1. Клонирование проекта
```bash
git clone https://github.com/psewdon1m/hermes.git
cd calltg
```

### 2. Настройка переменных окружения
```bash
cp env.example .env
nano .env
```

**Обязательные параметры:**
- `TELEGRAM_BOT_TOKEN` - токен вашего Telegram бота
- `DOMAIN` - ваш домен (например, example.com)
- `TURN_SECRET` - секретный ключ для TURN сервера

### 3. Развертывание
```bash
chmod +x quick-deploy.sh
./quick-deploy.sh
```

### 4. Тестирование
```bash
# Откройте браузер
http://localhost:3000/call.html

# Или используйте Telegram бота
# Найдите вашего бота и отправьте /start
```

## Подробное руководство

**Полная документация**: [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md)

### Подготовка сервера

1. **Требования:**
   - Ubuntu 20.04+ или Debian 11+
   - 2GB RAM (рекомендуется 4GB+)
   - 2 CPU ядра
   - 20GB свободного места
   - Статический IP

2. **Установка Docker:**
   ```bash
   curl -fsSL https://get.docker.com -o get-docker.sh
   sudo sh get-docker.sh
   sudo usermod -aG docker $USER
   sudo reboot
   ```

3. **Установка Docker Compose:**
   ```bash
   sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
   sudo chmod +x /usr/local/bin/docker-compose
   ```

### Настройка Telegram бота

1. Откройте [@BotFather](https://t.me/BotFather) в Telegram
2. Отправьте `/newbot`
3. Следуйте инструкциям
4. Скопируйте полученный токен в `.env`

### Настройка домена

1. Убедитесь, что домен указывает на ваш сервер:
   ```bash
   nslookup yourdomain.com
   ```

2. Откройте необходимые порты:
   ```bash
   sudo ufw allow 80
   sudo ufw allow 443
   sudo ufw allow 3000
   sudo ufw allow 3478
   sudo ufw enable
   ```

### Развертывание

#### Автоматическое развертывание
```bash
./quick-deploy.sh
```

#### Ручное развертывание
```bash
# Проверка конфликтов
./scripts/check-conflicts.sh

# Изоляция Caddy (если установлен)
# sudo systemctl stop caddy
# sudo systemctl disable caddy
# rm ~/callstack/infra/Caddyfile

# Развертывание
docker-compose up -d --build

# Проверка статуса
docker-compose ps
```

## Тестирование

**Подробное руководство по тестированию**: [DEPLOYMENT_GUIDE.md#тестирование](DEPLOYMENT_GUIDE.md#тестирование)

### Автоматические тесты
```bash
# Все тесты
./scripts/run-tests.sh

# Отдельные компоненты
./scripts/test-api.sh
./scripts/test-webrtc.sh
./scripts/test-bot.sh
```

### Ручное тестирование

#### Web интерфейс
1. Откройте `http://localhost:3000/call.html`
2. Создайте комнату с ID: `test-room`
3. Откройте вторую вкладку и присоединитесь к той же комнате
4. Проверьте видео/аудио соединение

#### Telegram бот
1. Найдите вашего бота в Telegram
2. Отправьте `/start`
3. Отправьте `/call`
4. Проверьте создание ссылки

#### API
```bash
# Проверка ICE серверов
curl http://localhost:3000/api/ice-servers

# Создание комнаты
curl -X POST http://localhost:3000/api/rooms \
  -H "Content-Type: application/json" \
  -d '{"roomId": "test-room"}'
```

## Мониторинг

### Проверка здоровья системы
```bash
./scripts/health-check.sh
```

### Мониторинг в реальном времени
```bash
./scripts/monitor-system.sh
```

### Просмотр логов
```bash
# Все сервисы
docker-compose logs -f

# Конкретный сервис
docker-compose logs -f app
docker-compose logs -f bot
docker-compose logs -f redis
```

## Устранение неполадок

**Полное руководство по устранению неполадок**: [TROUBLESHOOTING.md](TROUBLESHOOTING.md)

### Частые проблемы

#### Контейнеры не запускаются
```bash
# Проверка логов
docker-compose logs

# Пересборка
docker-compose down
docker-compose up -d --build --force-recreate
```

#### Проблемы с портами
```bash
# Проверка занятых портов
netstat -tuln | grep :80
netstat -tuln | grep :443

# Остановка конфликтующих сервисов
sudo systemctl stop apache2
sudo systemctl stop nginx
sudo systemctl stop caddy
```

#### Проблемы с SSL
```bash
# Проверка сертификатов
ls -la ssl/

# Генерация новых сертификатов
./scripts/setup-ssl.sh
```

### Восстановление
```bash
# Остановка всех сервисов
docker-compose down

# Очистка данных
docker-compose down -v

# Перезапуск
docker-compose up -d --build
```

## Структура проекта

```
calltg/
├── bot/                           # Telegram бот
│   ├── bot.py                    # Основной файл бота
│   └── config.py                 # Конфигурация бота
├── server/                       # Node.js сервер
│   └── index.js                  # Основной файл сервера
├── public/                       # Веб интерфейс
│   ├── call.html                 # HTML страница для звонков
│   ├── css/                      # Стили
│   └── js/                       # JavaScript
├── scripts/                      # Скрипты управления
│   ├── run-tests.sh              # Полное тестирование
│   ├── test-api.sh               # Тестирование API
│   ├── test-webrtc.sh            # Тестирование WebRTC
│   ├── test-bot.sh               # Тестирование бота
│   ├── monitor-system.sh         # Мониторинг системы
│   ├── health-check.sh           # Проверка здоровья
│   ├── check-conflicts.sh        # Проверка конфликтов
│   ├── setup-ssl.sh              # Настройка SSL
│   ├── setup-turn-ssl.sh         # SSL для TURN сервера
│   ├── start-all.sh              # Запуск всех сервисов
│   └── backup.sh                 # Резервное копирование
├── docker-compose.yml            # Основная конфигурация
├── docker-compose.dev.yml        # Конфигурация для разработки
├── docker-compose.prod.yml       # Конфигурация для продакшна
├── Dockerfile                    # Docker образ
├── .env                          # Переменные окружения
├── env.example                   # Пример переменных
├── README.md                     # Основная документация
├── DEPLOYMENT_GUIDE.md           # Полное руководство по развертыванию
├── TROUBLESHOOTING.md            # Руководство по устранению неполадок
├── quick-deploy.sh               # Быстрое развертывание
├── nginx.conf                    # Конфигурация Nginx
├── turnserver.conf               # Конфигурация TURN сервера
├── package.json                  # Зависимости Node.js
├── requirements.txt              # Зависимости Python
└── CHANGELOG.md                  # История изменений
```

## Конфигурация

### Переменные окружения

| Переменная | Описание | Пример |
|------------|----------|---------|
| `TELEGRAM_BOT_TOKEN` | Токен Telegram бота | `123456789:ABC...` |
| `DOMAIN` | Домен системы | `example.com` |
| `TURN_SECRET` | Секретный ключ TURN | `your-secret-key` |
| `TURN_USERNAME` | Имя пользователя TURN | `turnuser` |
| `TURN_PASSWORD` | Пароль TURN | `turnpass` |
| `REDIS_URL` | URL Redis | `redis://redis:6379` |
| `SERVER_URL` | URL сервера | `https://example.com` |
| `NODE_ENV` | Окружение Node.js | `production` |
| `LOG_LEVEL` | Уровень логирования | `INFO` |

### Docker Compose

Система использует следующие сервисы:
- **app** - Node.js приложение (Express + Socket.IO)
- **bot** - Python Telegram бот
- **redis** - Redis для сессий и комнат
- **nginx** - Reverse proxy и SSL терминация
- **turnserver** - TURN сервер для WebRTC

## Безопасность

### SSL сертификаты
- Автоматическая генерация самоподписанных сертификатов
- Поддержка Let's Encrypt
- Автоматическое обновление сертификатов

### Firewall
```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow 80
sudo ufw allow 443
sudo ufw enable
```

### Мониторинг безопасности
```bash
# ./scripts/security-scan.sh  # Скрипт не реализован
```

## Производительность

### Оптимизация
- Кэширование в Redis
- Сжатие статических файлов
- Оптимизация Docker образов
- Мониторинг ресурсов

### Масштабирование
- Горизонтальное масштабирование через Docker Swarm
- Балансировка нагрузки через nginx
- Кластеризация Redis

## Обслуживание

### Обновление
```bash
git pull origin main
docker-compose down
docker-compose up -d --build
```

### Резервное копирование
```bash
./scripts/backup.sh
```

### Очистка
```bash
docker system prune -a
docker volume prune
docker network prune
```

## API документация

### Endpoints

#### GET /api/ice-servers
Получение списка ICE серверов для WebRTC.

**Ответ:**
```json
{
  "iceServers": [
    {
      "urls": "stun:stun.l.google.com:19302"
    },
    {
      "urls": "turn:yourdomain.com:3478",
      "username": "turnuser",
      "credential": "turnpass"
    }
  ]
}
```

#### POST /api/rooms
Создание новой комнаты.

**Запрос:**
```json
{
  "roomId": "room-123"
}
```

**Ответ:**
```json
{
  "roomId": "room-123",
  "createdAt": "2024-01-01T00:00:00Z"
}
```

#### GET /api/rooms
Получение списка активных комнат.

**Ответ:**
```json
{
  "rooms": [
    {
      "roomId": "room-123",
      "createdAt": "2024-01-01T00:00:00Z",
      "participants": 2
    }
  ]
}
```

## WebSocket API

### События

#### Соединение с комнатой
```javascript
socket.emit('join-room', {
  roomId: 'room-123',
  userId: 'user-456'
});
```

#### Получение ICE candidate
```javascript
socket.on('ice-candidate', (candidate) => {
  // Обработка ICE candidate
});
```

#### Получение offer/answer
```javascript
socket.on('offer', (offer) => {
  // Обработка offer
});

socket.on('answer', (answer) => {
  // Обработка answer
});
```

## Telegram Bot API

### Команды

- `/start` - Начало работы с ботом
- `/call` - Создание новой комнаты для звонка
- `/help` - Справка по командам

### Inline кнопки

- "Присоединиться к звонку" - Ссылка на комнату
- "Создать новую комнату" - Создание новой комнаты

## Лицензия

MIT License

## Поддержка

- **Документация**: [README.md](README.md)
- **Проблемы**: [Issues](https://github.com/your-username/calltg/issues)
- **Обсуждения**: [Discussions](https://github.com/your-username/calltg/discussions)

## Вклад в проект

1. Fork проекта
2. Создайте feature branch (`git checkout -b feature/amazing-feature`)
3. Commit изменения (`git commit -m 'Add amazing feature'`)
4. Push в branch (`git push origin feature/amazing-feature`)
5. Откройте Pull Request

## Благодарности

- [WebRTC](https://webrtc.org/) - Технология для видеозвонков
- [Socket.IO](https://socket.io/) - WebSocket библиотека
- [aiogram](https://aiogram.dev/) - Telegram Bot API
- [Coturn](https://github.com/coturn/coturn) - TURN сервер
- [Docker](https://www.docker.com/) - Контейнеризация

---

**Удачного развертывания!** 🚀