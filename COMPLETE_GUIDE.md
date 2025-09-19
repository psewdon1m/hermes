# Полное руководство по P2P Call App

## Содержание
1. [Загрузка проекта на GitHub](#загрузка-проекта-на-github)
2. [Быстрый старт](#быстрый-старт)
3. [Полное развертывание](#полное-развертывание)
4. [Устранение неполадок](#устранение-неполадок)

---

## Загрузка проекта на GitHub

### Для новичков - пошаговое руководство

### Шаг 1: Создание аккаунта на GitHub

1. Перейдите на [github.com](https://github.com)
2. Нажмите "Sign up" (Регистрация)
3. Заполните форму:
   - Username (имя пользователя) - выберите уникальное имя
   - Email (электронная почта)
   - Password (пароль)
4. Подтвердите email

### Шаг 2: Создание нового репозитория

1. Войдите в свой аккаунт GitHub
2. Нажмите зеленую кнопку "New" или "+" в правом верхнем углу
3. Выберите "New repository"
4. Заполните форму:
   - **Repository name**: `calltg` (или любое другое имя)
   - **Description**: `WebRTC Video Call System with Telegram Bot`
   - **Visibility**: Public (публичный) или Private (приватный)
   - **НЕ** ставьте галочки на "Add a README file", "Add .gitignore", "Choose a license"
5. Нажмите "Create repository"

### Шаг 3: Установка Git (если не установлен)

#### Для Windows:
1. Скачайте Git с [git-scm.com](https://git-scm.com/download/win)
2. Установите с настройками по умолчанию
3. Откройте PowerShell или Command Prompt

#### Проверка установки:
```bash
git --version
```

### Шаг 4: Настройка Git (первый раз)

```bash
# Замените на ваши данные
git config --global user.name "Ваше Имя"
git config --global user.email "ваш@email.com"
```

### Шаг 5: Инициализация Git в проекте

```bash
# Перейдите в папку проекта
cd C:\Users\psewdon1m\Downloads\calltg

# Инициализируйте Git репозиторий
git init

# Добавьте все файлы (кроме тех, что в .gitignore)
git add .

# Сделайте первый коммит
git commit -m "Initial commit: WebRTC Video Call System"
```

### Шаг 6: Подключение к GitHub

```bash
# Добавьте удаленный репозиторий (замените YOUR_USERNAME на ваше имя пользователя)
git remote add origin https://github.com/YOUR_USERNAME/calltg.git

# Переименуйте основную ветку в main (современный стандарт)
git branch -M main

# Загрузите проект на GitHub
git push -u origin main
```

### Шаг 7: Проверка

1. Обновите страницу вашего репозитория на GitHub
2. Вы должны увидеть все файлы проекта
3. Убедитесь, что файл `.env` НЕ загружен (он должен быть скрыт)

### Важные моменты безопасности

#### Файл .env НЕ должен быть на GitHub!
- В нем содержатся секретные ключи
- Он уже добавлен в `.gitignore`
- Если случайно загрузили - удалите из репозитория

#### Если .env уже загружен:
```bash
# Удалите из Git (но оставьте локально)
git rm --cached .env
git commit -m "Remove .env from repository"
git push
```

### Обновление проекта

Когда внесете изменения:

```bash
# Добавить изменения
git add .

# Сделать коммит
git commit -m "Описание изменений"

# Загрузить на GitHub
git push
```

### Следующие шаги

После загрузки на GitHub:

1. **Скопируйте ссылку на репозиторий** (например: `https://github.com/YOUR_USERNAME/calltg`)
2. **Обновите README.md** - замените `your-username` на ваше имя пользователя
3. **Поделитесь ссылкой** с другими разработчиками

### Частые проблемы

#### Ошибка аутентификации:
```bash
# Используйте Personal Access Token вместо пароля
# Создайте токен: GitHub → Settings → Developer settings → Personal access tokens
```

#### Файл слишком большой:
```bash
# Проверьте размер файлов
git ls-files | xargs ls -lh | sort -k5 -hr
```

#### Конфликт веток:
```bash
# Синхронизируйте с GitHub
git pull origin main
```

---

## Быстрый старт

### Для новичков - что делать прямо сейчас:

### 1. Загрузите проект на GitHub
Следуйте инструкции выше

### 2. Настройте переменные окружения
```bash
# Скопируйте пример конфигурации
cp env.example .env

# Отредактируйте файл (замените YOUR_BOT_TOKEN на реальный токен)
nano .env
```

### 3. Запустите проект
```bash
# Сделайте скрипт исполняемым
chmod +x quick-deploy.sh

# Запустите развертывание
./quick-deploy.sh
```

### 4. Проверьте работу
```bash
# Запустите тесты
./scripts/run-tests.sh

# Проверьте статус сервисов
./scripts/health-check.sh
```

### Что нужно настроить в .env:

1. **TELEGRAM_BOT_TOKEN** - получите у [@BotFather](https://t.me/BotFather)
2. **DOMAIN** - ваш домен (например: `yourdomain.com`)
3. **TURN_SECRET** - уже сгенерирован автоматически

### Тестирование:

1. Откройте Telegram
2. Найдите вашего бота
3. Отправьте `/start`
4. Отправьте `/call`
5. Перейдите по ссылке и протестируйте видеозвонок

---

## Полное развертывание

### Подготовка сервера

#### 1. Требования к серверу
- **ОС**: Ubuntu 20.04+ или Debian 11+
- **RAM**: Минимум 2GB, рекомендуется 4GB+
- **CPU**: 2 ядра
- **Диск**: 20GB свободного места
- **Сеть**: Статический IP, открытые порты 80, 443, 3000, 3478

#### 2. Установка Docker
```bash
# Обновление системы
sudo apt update && sudo apt upgrade -y

# Установка Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Добавление пользователя в группу docker
sudo usermod -aG docker $USER

# Установка Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Перезагрузка для применения изменений
sudo reboot
```

#### 3. Проверка установки
```bash
# Проверка Docker
docker --version
docker-compose --version

# Проверка прав
docker run hello-world
```

### Настройка окружения

#### 1. Клонирование проекта
```bash
# Переход в домашнюю директорию
cd ~

# Клонирование проекта (замените на ваш репозиторий)
git clone https://github.com/your-username/calltg.git
cd calltg

# Или загрузка архива
# wget https://github.com/your-username/calltg/archive/main.zip
# unzip main.zip
# mv calltg-main calltg
# cd calltg
```

#### 2. Настройка переменных окружения
```bash
# Копирование шаблона
cp env.example .env

# Редактирование .env файла
nano .env
```

**Обязательные параметры в .env:**
```bash
# Telegram Bot
TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here

# Домен
DOMAIN=yourdomain.com

# TURN сервер
TURN_USERNAME=turnuser
TURN_PASSWORD=turnpass
TURN_SECRET=your-secret-key-here

# Redis
REDIS_URL=redis://redis:6379

# Сервер
SERVER_URL=https://yourdomain.com
NODE_ENV=production
LOG_LEVEL=INFO
```

#### 3. Получение Telegram Bot Token
1. Откройте [@BotFather](https://t.me/BotFather) в Telegram
2. Отправьте `/newbot`
3. Следуйте инструкциям
4. Скопируйте полученный токен в `.env`

#### 4. Настройка домена
```bash
# Убедитесь, что домен указывает на ваш сервер
nslookup yourdomain.com

# Проверка доступности портов
sudo ufw allow 80
sudo ufw allow 443
sudo ufw allow 3000
sudo ufw allow 3478
sudo ufw enable
```

### Развертывание системы

#### 1. Проверка конфликтов
```bash
# Проверка портов и процессов
./scripts/check-conflicts.sh

# Если Caddy установлен, остановите его:
# sudo systemctl stop caddy
# sudo systemctl disable caddy
# rm ~/callstack/infra/Caddyfile
```

#### 2. Автоматическое развертывание
```bash
# Быстрое развертывание
chmod +x quick-deploy.sh
./quick-deploy.sh
```

#### 3. Ручное развертывание
```bash
# Остановка существующих контейнеров
docker-compose down

# Сборка и запуск
docker-compose up -d --build

# Проверка статуса
docker-compose ps
```

#### 4. Проверка развертывания
```bash
# Проверка логов
docker-compose logs -f

# Проверка статуса сервисов
docker-compose ps

# Проверка API
curl -f http://localhost:3000/api/ice-servers
```

### Тестирование

#### 1. Автоматические тесты
```bash
# Запуск всех тестов
./scripts/run-tests.sh

# Тестирование отдельных компонентов
./scripts/test-api.sh
./scripts/test-webrtc.sh
./scripts/test-bot.sh
```

#### 2. Ручное тестирование

##### Тест API
```bash
# Проверка ICE серверов
curl -X GET http://localhost:3000/api/ice-servers

# Проверка создания комнаты
curl -X POST http://localhost:3000/api/rooms \
  -H "Content-Type: application/json" \
  -d '{"roomId": "test-room"}'

# Проверка списка комнат
curl -X GET http://localhost:3000/api/rooms
```

##### Тест WebRTC
1. Откройте браузер
2. Перейдите на `https://yourdomain.com/call.html`
3. Введите ID комнаты
4. Проверьте подключение

##### Тест Telegram Bot
1. Найдите вашего бота в Telegram
2. Отправьте `/start`
3. Отправьте `/call`
4. Проверьте создание ссылки

### Мониторинг

#### 1. Логи
```bash
# Просмотр логов всех сервисов
docker-compose logs -f

# Логи конкретного сервиса
docker-compose logs -f app
docker-compose logs -f redis
docker-compose logs -f nginx
docker-compose logs -f turnserver

# Логи с фильтрацией
docker-compose logs -f app | grep ERROR
```

#### 2. Статистика
```bash
# Использование ресурсов
docker stats

# Статистика контейнеров
docker-compose ps

# Статистика сети
docker network ls
docker network inspect calltg_turn_network
```

#### 3. Мониторинг в реальном времени
```bash
# Запуск мониторинга
./scripts/monitor-system.sh

# Проверка здоровья сервисов
./scripts/health-check.sh
```

### Обслуживание

#### 1. Обновление
```bash
# Обновление кода
git pull origin main

# Пересборка и перезапуск
docker-compose down
docker-compose up -d --build
```

#### 2. Резервное копирование
```bash
# Создание бэкапа
./scripts/backup.sh
```

#### 3. Очистка
```bash
# Очистка неиспользуемых образов
docker image prune -a

# Очистка неиспользуемых томов
docker volume prune

# Очистка неиспользуемых сетей
docker network prune
```

### Безопасность

#### 1. Firewall
```bash
# Настройка UFW
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow 80
sudo ufw allow 443
sudo ufw enable
```

---

## Устранение неполадок

### Общие проблемы

#### 1. Контейнеры не запускаются

**Симптомы:**
- `docker-compose up` завершается с ошибкой
- Контейнеры показывают статус "Exited"

**Диагностика:**
```bash
# Проверка статуса контейнеров
docker-compose ps

# Просмотр логов
docker-compose logs

# Проверка конфигурации
docker-compose config
```

**Решения:**
```bash
# Пересборка контейнеров
docker-compose down
docker-compose up -d --build --force-recreate

# Очистка и пересборка
docker-compose down -v
docker system prune -a
docker-compose up -d --build
```

#### 2. Проблемы с портами

**Симптомы:**
- `Port already in use` ошибки
- Сервисы недоступны

**Диагностика:**
```bash
# Проверка занятых портов
netstat -tuln | grep :80
netstat -tuln | grep :443
netstat -tuln | grep :3000
netstat -tuln | grep :3478

# Проверка процессов
sudo lsof -i :80
sudo lsof -i :443
```

**Решения:**
```bash
# Остановка конфликтующих сервисов
sudo systemctl stop apache2
sudo systemctl stop nginx
sudo systemctl stop caddy

# Удаление Caddy (рекомендуется)
sudo systemctl stop caddy
sudo systemctl disable caddy
rm ~/callstack/infra/Caddyfile

# Изменение портов в docker-compose.yml
# ports:
#   - "8080:80"  # вместо "80:80"
#   - "8443:443" # вместо "443:443"
```

#### 3. Проблемы с переменными окружения

**Симптомы:**
- Сервисы не могут подключиться друг к другу
- Ошибки конфигурации

**Диагностика:**
```bash
# Проверка .env файла
cat .env

# Проверка переменных в контейнере
docker-compose exec app env | grep TELEGRAM
docker-compose exec bot env | grep REDIS
```

**Решения:**
```bash
# Проверка обязательных переменных
grep -E "TELEGRAM_BOT_TOKEN|DOMAIN|TURN_SECRET" .env

# Обновление переменных
nano .env
docker-compose restart
```

### Проблемы с Docker

#### 1. Docker не запускается

**Симптомы:**
- `Cannot connect to the Docker daemon`
- Docker Desktop не запускается

**Решения:**
```bash
# Запуск Docker
sudo systemctl start docker
sudo systemctl enable docker

# Проверка статуса
sudo systemctl status docker

# Перезапуск Docker
sudo systemctl restart docker
```

#### 2. Проблемы с образами

**Симптомы:**
- `Unable to find image` ошибки
- Медленная загрузка образов

**Решения:**
```bash
# Очистка кэша
docker system prune -a

# Принудительная загрузка образов
docker-compose pull

# Пересборка образов
docker-compose build --no-cache
```

### Проблемы с API

#### 1. API недоступен

**Симптомы:**
- `Connection refused` ошибки
- HTTP 500/502/503 ошибки

**Диагностика:**
```bash
# Проверка статуса контейнера
docker-compose ps app

# Просмотр логов
docker-compose logs app

# Проверка API
curl -v http://localhost:3000/api/ice-servers
```

**Решения:**
```bash
# Перезапуск приложения
docker-compose restart app

# Проверка зависимостей
docker-compose logs redis
docker-compose logs nginx
```

### Проблемы с WebRTC

#### 1. TURN сервер не работает

**Симптомы:**
- WebRTC соединения не устанавливаются
- Ошибки ICE candidates

**Диагностика:**
```bash
# Проверка TURN сервера
docker-compose logs turnserver

# Проверка портов
netstat -tuln | grep 3478

# Тест TURN сервера
turnutils_stunclient localhost
```

**Решения:**
```bash
# Перезапуск TURN сервера
docker-compose restart turnserver

# Проверка конфигурации
cat turnserver.conf

# Проверка переменных окружения
docker-compose exec turnserver env | grep TURN
```

### Проблемы с Telegram ботом

#### 1. Бот не отвечает

**Симптомы:**
- Команды не обрабатываются
- Нет ответов от бота

**Диагностика:**
```bash
# Проверка логов бота
docker-compose logs bot

# Проверка токена
curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getMe"

# Проверка webhook
curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getWebhookInfo"
```

**Решения:**
```bash
# Перезапуск бота
docker-compose restart bot

# Проверка переменных окружения
docker-compose exec bot env | grep TELEGRAM

# Очистка webhook
curl -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/deleteWebhook"
```

### Проблемы с сетью

#### 1. Внешний доступ недоступен

**Симптомы:**
- Сайт недоступен извне
- Ошибки DNS

**Диагностика:**
```bash
# Проверка DNS
nslookup yourdomain.com

# Проверка портов
sudo ufw status
netstat -tuln | grep :80

# Проверка с внешнего сервера
curl -I http://yourdomain.com
```

**Решения:**
```bash
# Настройка firewall
sudo ufw allow 80
sudo ufw allow 443
sudo ufw allow 3000
sudo ufw allow 3478

# Проверка nginx конфигурации
docker-compose logs nginx
```

### Проблемы с SSL

#### 1. SSL сертификаты не работают

**Симптомы:**
- `SSL certificate error` в браузере
- HTTPS недоступен

**Диагностика:**
```bash
# Проверка сертификатов
ls -la ssl/
openssl x509 -in ssl/cert.pem -text -noout

# Проверка SSL соединения
openssl s_client -connect localhost:443
```

**Решения:**
```bash
# Генерация новых сертификатов
./scripts/setup-ssl.sh

# Проверка nginx конфигурации
docker-compose logs nginx

# Перезапуск nginx
docker-compose restart nginx
```

### Проблемы с производительностью

#### 1. Высокое использование CPU

**Симптомы:**
- Медленная работа системы
- Высокая нагрузка

**Диагностика:**
```bash
# Проверка использования ресурсов
docker stats
htop
top

# Проверка логов
docker-compose logs | grep -i "cpu\|memory\|slow"
```

**Решения:**
```bash
# Ограничение ресурсов
# В docker-compose.yml:
# deploy:
#   resources:
#     limits:
#       cpus: '0.5'
#       memory: 512M

# Оптимизация Redis
docker-compose exec redis redis-cli CONFIG SET maxmemory 256mb
docker-compose exec redis redis-cli CONFIG SET maxmemory-policy allkeys-lru
```

### Восстановление системы

#### 1. Полное восстановление

```bash
# Остановка всех сервисов
docker-compose down -v

# Очистка системы
docker system prune -a
docker volume prune
docker network prune

# Перезапуск
./quick-deploy.sh
```

#### 2. Восстановление данных

```bash
# Восстановление Redis данных
docker-compose down
docker volume rm calltg_redis_data
docker-compose up -d

# Восстановление SSL сертификатов
cp backup/ssl/* ssl/
docker-compose restart nginx
```

#### 3. Восстановление конфигурации

```bash
# Восстановление .env
cp env.example .env
nano .env

# Восстановление docker-compose.yml
git checkout docker-compose.yml

# Перезапуск
docker-compose up -d --build
```

### Полезные команды

#### Диагностика
```bash
# Общая информация о системе
docker-compose ps
docker stats
docker system df

# Логи всех сервисов
docker-compose logs -f

# Проверка сети
docker network ls
docker network inspect calltg_turn_network

# Проверка томов
docker volume ls
docker volume inspect calltg_redis_data
```

#### Мониторинг
```bash
# Мониторинг в реальном времени
watch docker stats

# Мониторинг логов
docker-compose logs -f app
docker-compose logs -f bot
docker-compose logs -f redis

# Проверка здоровья
curl http://localhost:3000/api/ice-servers
curl https://yourdomain.com/api/ice-servers
```

#### Очистка
```bash
# Очистка контейнеров
docker-compose down
docker container prune

# Очистка образов
docker image prune -a

# Очистка томов
docker volume prune

# Полная очистка
docker system prune -a --volumes
```

---

## Заключение

Следуя этому руководству, вы сможете:

1. Загрузить проект на GitHub
2. Быстро запустить систему
3. Полностью развернуть на сервере
4. Протестировать функциональность
5. Настроить мониторинг
6. Устранить неполадки

**Удачного развертывания!**
