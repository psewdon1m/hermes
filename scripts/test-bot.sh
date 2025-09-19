#!/bin/bash

# Тестирование Telegram бота

set -e

echo "=== Тестирование Telegram бота ==="
echo

# Цвета
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Загрузка переменных окружения
if [ -f .env ]; then
    source .env
else
    echo -e "${RED}❌ Файл .env не найден${NC}"
    exit 1
fi

# Функция для проверки переменной окружения
check_env_var() {
    local var_name="$1"
    local var_value="${!var_name}"
    
    echo -n "Проверка $var_name... "
    
    if [ -n "$var_value" ] && [ "$var_value" != "your_telegram_bot_token_here" ]; then
        echo -e "${GREEN}✅ PASS${NC}"
        return 0
    else
        echo -e "${RED}❌ FAIL${NC} (не настроено)"
        return 1
    fi
}

# Функция для тестирования API Telegram
test_telegram_api() {
    echo -n "Тестирование Telegram API... "
    
    response=$(curl -s "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getMe" 2>/dev/null)
    
    if echo "$response" | jq -e '.ok' >/dev/null 2>&1; then
        bot_username=$(echo "$response" | jq -r '.result.username')
        echo -e "${GREEN}✅ PASS${NC} (бот: @$bot_username)"
        return 0
    else
        echo -e "${RED}❌ FAIL${NC} (ошибка API)"
        return 1
    fi
}

# Функция для проверки webhook
test_webhook() {
    echo -n "Проверка webhook... "
    
    response=$(curl -s "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getWebhookInfo" 2>/dev/null)
    
    if echo "$response" | jq -e '.ok' >/dev/null 2>&1; then
        webhook_url=$(echo "$response" | jq -r '.result.url')
        if [ "$webhook_url" = "null" ] || [ -z "$webhook_url" ]; then
            echo -e "${YELLOW}⚠️  WARNING${NC} (webhook не настроен)"
        else
            echo -e "${GREEN}✅ PASS${NC} (webhook: $webhook_url)"
        fi
        return 0
    else
        echo -e "${RED}❌ FAIL${NC} (ошибка получения webhook)"
        return 1
    fi
}

# Функция для проверки логов бота
check_bot_logs() {
    echo -n "Проверка логов бота... "
    
    if docker-compose logs bot | grep -i "error\|exception\|failed" | grep -v "deprecated" | wc -l | grep -q "^0$"; then
        echo -e "${GREEN}✅ PASS${NC}"
        return 0
    else
        error_count=$(docker-compose logs bot | grep -i "error\|exception\|failed" | grep -v "deprecated" | wc -l)
        echo -e "${RED}❌ FAIL${NC} (найдено $error_count ошибок)"
        return 1
    fi
}

# Функция для проверки подключения к Redis
test_redis_connection() {
    echo -n "Проверка подключения бота к Redis... "
    
    if docker-compose exec -T bot python3 -c "
import redis
import os
try:
    r = redis.from_url(os.getenv('REDIS_URL', 'redis://redis:6379'))
    r.ping()
    print('SUCCESS')
except Exception as e:
    print('FAIL:', str(e))
" 2>/dev/null | grep -q "SUCCESS"; then
        echo -e "${GREEN}✅ PASS${NC}"
        return 0
    else
        echo -e "${RED}❌ FAIL${NC}"
        return 1
    fi
}

# Функция для проверки подключения к API сервера
test_server_connection() {
    echo -n "Проверка подключения бота к API сервера... "
    
    if docker-compose exec -T bot python3 -c "
import requests
import os
try:
    server_url = os.getenv('SERVER_URL', 'http://app:3000')
    response = requests.get(f'{server_url}/api/ice-servers', timeout=5)
    if response.status_code == 200:
        print('SUCCESS')
    else:
        print('FAIL: HTTP', response.status_code)
except Exception as e:
    print('FAIL:', str(e))
" 2>/dev/null | grep -q "SUCCESS"; then
        echo -e "${GREEN}✅ PASS${NC}"
        return 0
    else
        echo -e "${RED}❌ FAIL${NC}"
        return 1
    fi
}

echo "1. Проверка конфигурации"
echo "======================="

check_env_var "TELEGRAM_BOT_TOKEN"
check_env_var "DOMAIN"
check_env_var "SERVER_URL"

echo
echo "2. Проверка Telegram API"
echo "======================="

test_telegram_api
test_webhook

echo
echo "3. Проверка контейнера бота"
echo "=========================="

# Проверка запуска контейнера бота
echo -n "Проверка запуска контейнера бота... "
if docker-compose ps | grep -q "bot.*Up"; then
    echo -e "${GREEN}✅ PASS${NC}"
else
    echo -e "${RED}❌ FAIL${NC} (контейнер бота не запущен)"
fi

# Проверка логов бота
check_bot_logs

echo
echo "4. Проверка подключений"
echo "======================"

test_redis_connection
test_server_connection

echo
echo "5. Проверка функциональности"
echo "==========================="

# Проверка обработчиков команд
echo -n "Проверка обработчиков команд... "
if docker-compose logs bot | grep -i "start.*handler\|call.*handler" >/dev/null; then
    echo -e "${GREEN}✅ PASS${NC}"
else
    echo -e "${RED}❌ FAIL${NC} (обработчики команд не найдены)"
fi

# Проверка создания ссылок
echo -n "Проверка создания ссылок... "
if docker-compose logs bot | grep -i "room.*created\|link.*generated" >/dev/null; then
    echo -e "${GREEN}✅ PASS${NC}"
else
    echo -e "${YELLOW}⚠️  WARNING${NC} (создание ссылок не обнаружено в логах)"
fi

echo
echo "6. Тестирование производительности"
echo "================================="

# Проверка времени отклика бота
echo -n "Проверка времени отклика бота... "
start_time=$(date +%s.%N)
docker-compose exec -T bot python3 -c "
import requests
import os
try:
    server_url = os.getenv('SERVER_URL', 'http://app:3000')
    response = requests.get(f'{server_url}/api/ice-servers', timeout=5)
    print('SUCCESS')
except Exception as e:
    print('FAIL')
" >/dev/null 2>&1
end_time=$(date +%s.%N)
response_time=$(echo "$end_time - $start_time" | bc)

if (( $(echo "$response_time < 2.0" | bc -l) )); then
    echo -e "${GREEN}✅ PASS${NC} (время: ${response_time}s)"
else
    echo -e "${RED}❌ FAIL${NC} (время: ${response_time}s, слишком медленно)"
fi

echo
echo "7. Проверка безопасности"
echo "======================="

# Проверка отсутствия токена в логах
echo -n "Проверка безопасности логов... "
if docker-compose logs bot | grep -i "$TELEGRAM_BOT_TOKEN" >/dev/null; then
    echo -e "${RED}❌ FAIL${NC} (токен найден в логах)"
else
    echo -e "${GREEN}✅ PASS${NC}"
fi

# Проверка валидности токена
echo -n "Проверка валидности токена... "
if [[ "$TELEGRAM_BOT_TOKEN" =~ ^[0-9]+:[A-Za-z0-9_-]+$ ]]; then
    echo -e "${GREEN}✅ PASS${NC}"
else
    echo -e "${RED}❌ FAIL${NC} (неверный формат токена)"
fi

echo
echo "8. Ручное тестирование"
echo "====================="

echo -e "${BLUE}Для полного тестирования бота выполните следующие шаги:${NC}"
echo
echo "1. Найдите вашего бота в Telegram:"
if [ -n "$TELEGRAM_BOT_TOKEN" ] && [ "$TELEGRAM_BOT_TOKEN" != "your_telegram_bot_token_here" ]; then
    bot_info=$(curl -s "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getMe" 2>/dev/null)
    if echo "$bot_info" | jq -e '.ok' >/dev/null 2>&1; then
        bot_username=$(echo "$bot_info" | jq -r '.result.username')
        echo "   @$bot_username"
    else
        echo "   (не удалось получить информацию о боте)"
    fi
else
    echo "   (токен не настроен)"
fi
echo
echo "2. Отправьте команды боту:"
echo "   /start - начать работу с ботом"
echo "   /call - создать новую комнату для звонка"
echo "   /help - получить справку"
echo
echo "3. Проверьте:"
echo "   - Получение ответов от бота"
echo "   - Создание ссылок на комнаты"
echo "   - Корректность ссылок"
echo "   - Работу inline кнопок"
echo
echo "4. Проверьте логи в реальном времени:"
echo "   docker-compose logs -f bot"

echo
echo "9. Отладка"
echo "========="

echo -e "${BLUE}Полезные команды для отладки:${NC}"
echo "• Просмотр логов бота: docker-compose logs bot"
echo "• Просмотр логов с фильтрацией: docker-compose logs bot | grep ERROR"
echo "• Перезапуск бота: docker-compose restart bot"
echo "• Проверка переменных окружения: docker-compose exec bot env | grep TELEGRAM"
echo "• Тестирование API: curl https://api.telegram.org/bot\$TELEGRAM_BOT_TOKEN/getMe"

echo
echo "10. Проверка webhook (если используется)"
echo "======================================"

if [ -n "$DOMAIN" ] && [ "$DOMAIN" != "yourdomain.com" ]; then
    echo -n "Проверка webhook URL... "
    webhook_url="https://$DOMAIN/webhook/telegram"
    
    if curl -s -o /dev/null -w "%{http_code}" "$webhook_url" | grep -q "200\|404"; then
        echo -e "${GREEN}✅ PASS${NC} (webhook доступен)"
    else
        echo -e "${RED}❌ FAIL${NC} (webhook недоступен)"
    fi
else
    echo -e "${YELLOW}⚠️  Пропуск проверки webhook (домен не настроен)${NC}"
fi

echo
echo "=== Тестирование Telegram бота завершено ==="
echo

# Вывод итоговой информации
echo -e "${BLUE}Если тесты провалены, проверьте:${NC}"
echo "• Правильность TELEGRAM_BOT_TOKEN в .env"
echo "• Доступность интернета для бота"
echo "• Запуск всех контейнеров: docker-compose ps"
echo "• Логи бота: docker-compose logs bot"
echo "• Подключение к Redis и API сервера"
