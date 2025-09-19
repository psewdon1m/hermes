#!/bin/bash

# Скрипт для проверки конфликтов с существующими сервисами

echo "=== Проверка конфликтов с существующими сервисами ==="
echo

# Проверка портов
echo "1. Проверка занятых портов:"
echo "   Порт 80 (HTTP):"
if netstat -tuln | grep -q ":80 "; then
    echo "   [ERROR] Порт 80 занят"
    netstat -tuln | grep ":80 "
else
    echo "   [OK] Порт 80 свободен"
fi

echo "   Порт 443 (HTTPS):"
if netstat -tuln | grep -q ":443 "; then
    echo "   [ERROR] Порт 443 занят"
    netstat -tuln | grep ":443 "
else
    echo "   [OK] Порт 443 свободен"
fi

echo "   Порт 3000 (App):"
if netstat -tuln | grep -q ":3000 "; then
    echo "   [ERROR] Порт 3000 занят"
    netstat -tuln | grep ":3000 "
else
    echo "   [OK] Порт 3000 свободен"
fi

echo "   Порт 3478 (TURN):"
if netstat -tuln | grep -q ":3478 "; then
    echo "   [ERROR] Порт 3478 занят"
    netstat -tuln | grep ":3478 "
else
    echo "   [OK] Порт 3478 свободен"
fi

echo

# Проверка процессов
echo "2. Проверка запущенных процессов:"
echo "   Caddy:"
if pgrep -f caddy > /dev/null; then
    echo "   [WARNING] Caddy запущен (может конфликтовать с nginx)"
    pgrep -f caddy
else
    echo "   [OK] Caddy не запущен"
fi

echo "   Nginx:"
if pgrep -f nginx > /dev/null; then
    echo "   [ERROR] Nginx запущен"
    pgrep -f nginx
else
    echo "   [OK] Nginx не запущен"
fi

echo "   Docker:"
if pgrep -f docker > /dev/null; then
    echo "   [OK] Docker запущен"
else
    echo "   [ERROR] Docker не запущен"
fi

echo

# Проверка SSL сертификатов
echo "3. Проверка SSL сертификатов:"
if [ -d "/etc/ssl/certs" ]; then
    echo "   [OK] Директория SSL сертификатов существует"
    ls -la /etc/ssl/certs/ | head -5
else
    echo "   [WARNING] Директория SSL сертификатов не найдена"
fi

echo

# Рекомендации
echo "4. Рекомендации:"
echo "   Если Caddy запущен и использует порты 80/443:"
echo "   - Остановите Caddy: sudo systemctl stop caddy"
echo "   - Отключите автозапуск: sudo systemctl disable caddy"
echo "   - Удалите Caddy файл: rm ~/callstack/infra/Caddyfile"
echo
echo "   Если порты свободны:"
echo "   - Используйте docker-compose.yml (с nginx)"
echo "   - Или docker-compose.prod.yml"
echo
