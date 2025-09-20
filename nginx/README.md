# Nginx Configuration Files

Эта директория содержит конфигурационные файлы nginx для проекта tgcall.space.

## Структура файлов

```
nginx/
├── nginx.conf                    # Основной конфигурационный файл nginx
├── fastcgi.conf                  # Конфигурация FastCGI
├── sites-available/
│   └── tgcall.space.conf        # Конфигурация сайта (доступная)
├── sites-enabled/
│   └── tgcall.space.conf        # Конфигурация сайта (активная)
└── snippets/
    ├── fastcgi-php.conf         # Фрагмент для PHP FastCGI
    └── snakeoil.conf            # Фрагмент для самоподписанных SSL сертификатов
```

## Описание конфигурации

### nginx.conf
Основной конфигурационный файл содержит:
- Настройки безопасности (заголовки, rate limiting)
- Настройки сжатия (gzip)
- Настройки логирования
- Включение конфигураций сайтов

### tgcall.space.conf
Конфигурация сайта включает:
- **HTTP → HTTPS редирект** (порт 80 → 443)
- **SSL/TLS настройки** с Let's Encrypt сертификатами
- **Rate limiting** для API и логина
- **Кэширование статических файлов**
- **Безопасность** (заголовки, блокировка скрытых файлов)
- **PHP поддержка** через FastCGI
- **Health check** эндпоинт

## Установка и использование

### 1. Копирование файлов на сервер
```bash
# Скопировать конфигурацию nginx
sudo cp nginx/nginx.conf /etc/nginx/
sudo cp nginx/fastcgi.conf /etc/nginx/

# Скопировать конфигурацию сайта
sudo cp nginx/sites-available/tgcall.space.conf /etc/nginx/sites-available/
sudo cp nginx/sites-enabled/tgcall.space.conf /etc/nginx/sites-enabled/

# Скопировать фрагменты
sudo cp nginx/snippets/* /etc/nginx/snippets/
```

### 2. Проверка конфигурации
```bash
# Проверить синтаксис конфигурации
sudo nginx -t

# Перезагрузить nginx
sudo systemctl reload nginx
```

### 3. Настройка SSL сертификатов
Конфигурация настроена для использования Let's Encrypt сертификатов:
```bash
# Установить certbot
sudo apt install certbot python3-certbot-nginx

# Получить сертификат
sudo certbot --nginx -d tgcall.space -d www.tgcall.space
```

## Важные настройки

### Rate Limiting
- **API эндпоинты**: 10 запросов/сек с burst=10
- **Логин**: 1 запрос/сек с burst=3
- **Общие запросы**: 10 запросов/сек с burst=20

### Безопасность
- HSTS заголовки
- XSS защита
- Content Security Policy
- Блокировка скрытых файлов
- Современные SSL/TLS настройки

### Кэширование
- Статические файлы кэшируются на 1 год
- Gzip сжатие включено

## Мониторинг

### Логи
- Access log: `/var/log/nginx/tgcall.space.access.log`
- Error log: `/var/log/nginx/tgcall.space.error.log`

### Health Check
```bash
curl https://tgcall.space/health
# Должен вернуть: healthy
```

## Настройка для разработки

Для локальной разработки можно:
1. Изменить `server_name` на `localhost`
2. Отключить SSL (закомментировать SSL блок)
3. Изменить `root` директорию на локальную
4. Настроить proxy_pass для API бэкенда

## Примечания

- Конфигурация оптимизирована для продакшена
- API бэкенд пока возвращает 404 (нужно настроить proxy_pass)
- PHP поддержка включена (требует php-fpm)
- Все пути к сертификатам указывают на Let's Encrypt
