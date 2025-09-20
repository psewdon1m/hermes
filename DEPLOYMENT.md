# Руководство по развертыванию TGCall

## Обзор системы

TGCall - это система видеозвонков на базе WebRTC, состоящая из микросервисов:
- **Frontend** - React SPA для веб-интерфейса
- **API Service** - REST API для управления звонками
- **Signal Service** - WebSocket сервер для WebRTC сигналинга
- **Redis** - хранение состояния звонков
- **Coturn** - TURN/STUN сервер для NAT traversal
- **Nginx** - обратный прокси и SSL терминация

## Предварительные требования

### Системные требования
- Ubuntu 20.04+ или аналогичная Linux система
- Docker 20.10+
- Docker Compose 2.0+
- Минимум 2GB RAM, 2 CPU cores
- 10GB свободного места на диске

### Сетевые требования
- Открытые порты: 80, 443, 3478 (UDP), 5349
- Домен tgcall.us должен указывать на IP сервера
- SSL сертификаты (Let's Encrypt)

## Пошаговое развертывание

### 1. Подготовка сервера

```bash
# Обновление системы
sudo apt update && sudo apt upgrade -y

# Установка Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER

# Установка Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Перезагрузка для применения изменений группы
sudo reboot
```

### 2. Клонирование репозитория

```bash
# Клонирование проекта
git clone <repository-url> tgcall
cd tgcall

# Создание директории для SSL сертификатов
sudo mkdir -p /etc/letsencrypt/live/tgcall.us
```

### 3. Настройка переменных окружения

Создайте файл `.env` в корне проекта:

```bash
# Основные настройки
NODE_ENV=production
DOMAIN=tgcall.us
TURN_DOMAIN=tgcall.us

# Порты
FRONTEND_PORT=3000
API_PORT=3001
SIGNAL_PORT=3002
REDIS_PORT=6379
NGINX_HTTP_PORT=8080
NGINX_HTTPS_PORT=8443
TURN_UDP_PORT=3478
TURN_TLS_PORT=5349

# Redis
REDIS_URL=redis://redis:6379

# JWT и TURN секреты (сгенерируйте свои)
JWT_SECRET=your-super-secret-jwt-key-here
TURN_SECRET=your-super-secret-turn-key-here

# TURN сервер
TURN_USERNAME=turnuser
TURN_PASSWORD=turnpass
TURN_REALM=tgcall.us

# Лимиты
MAX_PEERS_PER_CALL=2
INACTIVE_TTL_SECONDS=3600
```

### 4. Получение SSL сертификатов

```bash
# Установка certbot
sudo apt install certbot

# Получение сертификата (замените email на ваш)
sudo certbot certonly --standalone -d tgcall.us -d www.tgcall.us --email your-email@example.com --agree-tos --non-interactive

# Проверка сертификатов
sudo ls -la /etc/letsencrypt/live/tgcall.us/
```

### 5. Сборка и запуск контейнеров

```bash
# Сборка образов
docker-compose build

# Запуск в фоновом режиме
docker-compose up -d

# Проверка статуса
docker-compose ps
```

### 6. Проверка работоспособности

```bash
# Проверка логов
docker-compose logs -f

# Проверка API
curl http://localhost:3001/health

# Проверка frontend
curl http://localhost:3000

# Проверка nginx
curl http://localhost:8080/health
```

### 7. Настройка Nginx (если используется внешний)

Если вы используете внешний nginx вместо контейнера:

```bash
# Копирование конфигурации
sudo cp nginx/nginx.conf /etc/nginx/
sudo cp nginx/sites-enabled/tgcall.conf /etc/nginx/sites-available/
sudo ln -s /etc/nginx/sites-available/tgcall.conf /etc/nginx/sites-enabled/

# Проверка конфигурации
sudo nginx -t

# Перезагрузка nginx
sudo systemctl reload nginx
```

## Мониторинг и обслуживание

### Просмотр логов

```bash
# Все сервисы
docker-compose logs -f

# Конкретный сервис
docker-compose logs -f api
docker-compose logs -f signal
docker-compose logs -f frontend
```

### Обновление системы

```bash
# Остановка сервисов
docker-compose down

# Обновление кода
git pull

# Пересборка и запуск
docker-compose build
docker-compose up -d
```

### Резервное копирование

```bash
# Создание бэкапа Redis данных
docker-compose exec redis redis-cli BGSAVE

# Копирование SSL сертификатов
sudo cp -r /etc/letsencrypt /backup/letsencrypt-$(date +%Y%m%d)
```

## Устранение неполадок

### Проблемы с SSL

```bash
# Проверка сертификатов
sudo certbot certificates

# Обновление сертификатов
sudo certbot renew --dry-run
```

### Проблемы с TURN сервером

```bash
# Проверка TURN сервера
docker-compose logs coturn

# Тестирование TURN
turnutils_stunclient tgcall.us
```

### Проблемы с WebRTC

1. Проверьте, что порты 3478 (UDP) и 5349 открыты
2. Убедитесь, что TURN сервер доступен
3. Проверьте логи signal сервиса

### Проблемы с производительностью

```bash
# Мониторинг ресурсов
docker stats

# Очистка неиспользуемых образов
docker system prune -a
```

## Безопасность

### Рекомендации

1. **Измените все пароли по умолчанию** в `.env` файле
2. **Настройте файрвол**:
   ```bash
   sudo ufw allow 22
   sudo ufw allow 80
   sudo ufw allow 443
   sudo ufw allow 3478/udp
   sudo ufw allow 5349
   sudo ufw enable
   ```

3. **Регулярно обновляйте систему**:
   ```bash
   sudo apt update && sudo apt upgrade -y
   docker-compose pull
   docker-compose up -d
   ```

4. **Настройте мониторинг** (опционально):
   - Prometheus + Grafana
   - ELK Stack для логов

## Масштабирование

### Горизонтальное масштабирование

Для увеличения нагрузки можно:

1. **Добавить больше API инстансов**:
   ```yaml
   api:
     deploy:
       replicas: 3
   ```

2. **Использовать внешний Redis** (AWS ElastiCache, Redis Cloud)

3. **Добавить балансировщик нагрузки** перед nginx

### Вертикальное масштабирование

Увеличьте ресурсы сервера:
- CPU: 4+ cores
- RAM: 8GB+
- Диск: SSD 50GB+

## Поддержка

При возникновении проблем:

1. Проверьте логи: `docker-compose logs`
2. Проверьте статус сервисов: `docker-compose ps`
3. Проверьте сетевую связность
4. Проверьте SSL сертификаты
5. Проверьте конфигурацию TURN сервера

## Автоматизация

Для автоматического развертывания можно использовать:

- **GitHub Actions** для CI/CD
- **Ansible** для конфигурации сервера
- **Terraform** для инфраструктуры
- **Docker Swarm** или **Kubernetes** для оркестрации
