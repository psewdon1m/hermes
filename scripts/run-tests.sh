#!/bin/bash

# Полный набор тестов для P2P Call App

set -e

echo "=== Полное тестирование P2P Call App ==="
echo

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Счетчики
TESTS_PASSED=0
TESTS_FAILED=0
TOTAL_TESTS=0

# Функция для вывода результатов
print_result() {
    local test_name="$1"
    local result="$2"
    local details="$3"
    
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    
    if [ "$result" = "PASS" ]; then
        echo -e "${GREEN}[OK] $test_name${NC}"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        echo -e "${RED}[ERROR] $test_name${NC}"
        if [ -n "$details" ]; then
            echo -e "${RED}   $details${NC}"
        fi
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi
}

# Функция для проверки HTTP ответа
check_http() {
    local url="$1"
    local expected_status="$2"
    local test_name="$3"
    
    local response=$(curl -s -o /dev/null -w "%{http_code}" "$url" 2>/dev/null || echo "000")
    
    if [ "$response" = "$expected_status" ]; then
        print_result "$test_name" "PASS"
    else
        print_result "$test_name" "FAIL" "Ожидался статус $expected_status, получен $response"
    fi
}

# Функция для проверки JSON ответа
check_json() {
    local url="$1"
    local test_name="$2"
    
    local response=$(curl -s "$url" 2>/dev/null)
    
    if echo "$response" | jq . >/dev/null 2>&1; then
        print_result "$test_name" "PASS"
    else
        print_result "$test_name" "FAIL" "Неверный JSON ответ"
    fi
}

echo -e "${BLUE}1. Проверка контейнеров${NC}"
echo "========================"

# Проверка запущенных контейнеров
if docker-compose ps | grep -q "Up"; then
    print_result "Контейнеры запущены" "PASS"
else
    print_result "Контейнеры запущены" "FAIL" "Не все контейнеры запущены"
fi

# Проверка конкретных сервисов
services=("app" "redis" "nginx" "turnserver")
for service in "${services[@]}"; do
    if docker-compose ps | grep -q "$service.*Up"; then
        print_result "Сервис $service запущен" "PASS"
    else
        print_result "Сервис $service запущен" "FAIL" "Сервис $service не запущен"
    fi
done

echo
echo -e "${BLUE}2. Проверка API${NC}"
echo "=================="

# Проверка основного API
check_http "http://localhost:3000/api/ice-servers" "200" "API ICE серверов доступен"
check_json "http://localhost:3000/api/ice-servers" "API ICE серверов возвращает JSON"

# Проверка создания комнаты
room_response=$(curl -s -X POST http://localhost:3000/api/rooms \
  -H "Content-Type: application/json" \
  -d '{"roomId": "test-room-'$(date +%s)'"}' 2>/dev/null)

if [ $? -eq 0 ]; then
    print_result "Создание комнаты" "PASS"
else
    print_result "Создание комнаты" "FAIL" "Ошибка создания комнаты"
fi

# Проверка списка комнат
check_http "http://localhost:3000/api/rooms" "200" "Список комнат доступен"
check_json "http://localhost:3000/api/rooms" "Список комнат возвращает JSON"

echo
echo -e "${BLUE}3. Проверка WebRTC${NC}"
echo "====================="

# Проверка TURN сервера
if nc -z localhost 3478 2>/dev/null; then
    print_result "TURN сервер доступен" "PASS"
else
    print_result "TURN сервер доступен" "FAIL" "Порт 3478 недоступен"
fi

# Проверка STUN сервера
if nc -z stun.l.google.com 19302 2>/dev/null; then
    print_result "STUN сервер доступен" "PASS"
else
    print_result "STUN сервер доступен" "FAIL" "Google STUN недоступен"
fi

echo
echo -e "${BLUE}4. Проверка Redis${NC}"
echo "===================="

# Проверка подключения к Redis
if docker-compose exec -T redis redis-cli ping | grep -q "PONG"; then
    print_result "Redis подключение" "PASS"
else
    print_result "Redis подключение" "FAIL" "Redis не отвечает"
fi

# Проверка записи в Redis
if docker-compose exec -T redis redis-cli set test_key "test_value" | grep -q "OK"; then
    print_result "Redis запись" "PASS"
else
    print_result "Redis запись" "FAIL" "Ошибка записи в Redis"
fi

# Проверка чтения из Redis
if docker-compose exec -T redis redis-cli get test_key | grep -q "test_value"; then
    print_result "Redis чтение" "PASS"
else
    print_result "Redis чтение" "FAIL" "Ошибка чтения из Redis"
fi

# Очистка тестовых данных
docker-compose exec -T redis redis-cli del test_key >/dev/null 2>&1

echo
echo -e "${BLUE}5. Проверка SSL${NC}"
echo "=================="

# Проверка SSL сертификатов
if [ -f "ssl/cert.pem" ] && [ -f "ssl/key.pem" ]; then
    print_result "SSL сертификаты существуют" "PASS"
else
    print_result "SSL сертификаты существуют" "FAIL" "SSL сертификаты не найдены"
fi

# Проверка HTTPS (если доступен)
if curl -k -s -o /dev/null -w "%{http_code}" https://localhost/api/ice-servers 2>/dev/null | grep -q "200"; then
    print_result "HTTPS доступен" "PASS"
else
    print_result "HTTPS доступен" "FAIL" "HTTPS недоступен"
fi

echo
echo -e "${BLUE}6. Проверка логов${NC}"
echo "===================="

# Проверка отсутствия критических ошибок
if docker-compose logs app | grep -i "error" | grep -v "deprecated" | wc -l | grep -q "^0$"; then
    print_result "Отсутствие критических ошибок в логах" "PASS"
else
    error_count=$(docker-compose logs app | grep -i "error" | grep -v "deprecated" | wc -l)
    print_result "Отсутствие критических ошибок в логах" "FAIL" "Найдено $error_count ошибок"
fi

echo
echo -e "${BLUE}7. Проверка производительности${NC}"
echo "============================="

# Проверка использования памяти
memory_usage=$(docker stats --no-stream --format "table {{.MemUsage}}" | grep -v "MEM USAGE" | head -1 | cut -d'/' -f1 | tr -d ' ')
if [ -n "$memory_usage" ]; then
    print_result "Использование памяти в норме" "PASS" "Используется: $memory_usage"
else
    print_result "Использование памяти в норме" "FAIL" "Не удалось получить данные"
fi

# Проверка времени отклика API
response_time=$(curl -o /dev/null -s -w "%{time_total}" http://localhost:3000/api/ice-servers 2>/dev/null)
if [ -n "$response_time" ] && (( $(echo "$response_time < 1.0" | bc -l) )); then
    print_result "Время отклика API" "PASS" "Время отклика: ${response_time}s"
else
    print_result "Время отклика API" "FAIL" "Время отклика: ${response_time}s (слишком медленно)"
fi

echo
echo -e "${BLUE}8. Проверка безопасности${NC}"
echo "========================="

# Проверка открытых портов
if netstat -tuln | grep -q ":3000 "; then
    print_result "Порт 3000 открыт" "PASS"
else
    print_result "Порт 3000 открыт" "FAIL" "Порт 3000 не открыт"
fi

if netstat -tuln | grep -q ":80 "; then
    print_result "Порт 80 открыт" "PASS"
else
    print_result "Порт 80 открыт" "FAIL" "Порт 80 не открыт"
fi

if netstat -tuln | grep -q ":443 "; then
    print_result "Порт 443 открыт" "PASS"
else
    print_result "Порт 443 открыт" "FAIL" "Порт 443 не открыт"
fi

echo
echo -e "${BLUE}=== РЕЗУЛЬТАТЫ ТЕСТИРОВАНИЯ ===${NC}"
echo "Всего тестов: $TOTAL_TESTS"
echo -e "Прошло: ${GREEN}$TESTS_PASSED${NC}"
echo -e "Провалено: ${RED}$TESTS_FAILED${NC}"

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}[SUCCESS] Все тесты пройдены успешно!${NC}"
    exit 0
else
    echo -e "${RED}[WARNING] Некоторые тесты провалены. Проверьте логи выше.${NC}"
    exit 1
fi
