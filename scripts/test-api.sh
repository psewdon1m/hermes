#!/bin/bash

# Тестирование API endpoints

set -e

echo "=== Тестирование API ==="
echo

BASE_URL="http://localhost:3000"
API_URL="$BASE_URL/api"

# Цвета
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Функция для тестирования endpoint
test_endpoint() {
    local method="$1"
    local endpoint="$2"
    local data="$3"
    local expected_status="$4"
    local test_name="$5"
    
    echo -n "Тестирование $test_name... "
    
    if [ "$method" = "GET" ]; then
        response=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL$endpoint" 2>/dev/null || echo "000")
    elif [ "$method" = "POST" ]; then
        response=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
            -H "Content-Type: application/json" \
            -d "$data" \
            "$API_URL$endpoint" 2>/dev/null || echo "000")
    fi
    
    if [ "$response" = "$expected_status" ]; then
        echo -e "${GREEN}✅ PASS${NC}"
        return 0
    else
        echo -e "${RED}❌ FAIL${NC} (статус: $response, ожидался: $expected_status)"
        return 1
    fi
}

# Функция для тестирования JSON ответа
test_json_response() {
    local endpoint="$1"
    local test_name="$2"
    
    echo -n "Тестирование $test_name... "
    
    response=$(curl -s "$API_URL$endpoint" 2>/dev/null)
    
    if echo "$response" | jq . >/dev/null 2>&1; then
        echo -e "${GREEN}✅ PASS${NC}"
        return 0
    else
        echo -e "${RED}❌ FAIL${NC} (неверный JSON)"
        return 1
    fi
}

# Функция для тестирования содержимого ответа
test_response_content() {
    local endpoint="$1"
    local expected_field="$2"
    local test_name="$3"
    
    echo -n "Тестирование $test_name... "
    
    response=$(curl -s "$API_URL$endpoint" 2>/dev/null)
    
    if echo "$response" | jq -e ".$expected_field" >/dev/null 2>&1; then
        echo -e "${GREEN}✅ PASS${NC}"
        return 0
    else
        echo -e "${RED}❌ FAIL${NC} (поле '$expected_field' не найдено)"
        return 1
    fi
}

echo "1. Тестирование ICE серверов"
echo "============================"

test_endpoint "GET" "/ice-servers" "" "200" "GET /api/ice-servers"
test_json_response "/ice-servers" "JSON ответ ICE серверов"
test_response_content "/ice-servers" "iceServers" "Наличие iceServers в ответе"

# Проверка содержимого ICE серверов
echo -n "Проверка содержимого ICE серверов... "
ice_response=$(curl -s "$API_URL/ice-servers")
if echo "$ice_response" | jq -e '.iceServers[] | select(.urls | contains("stun:"))' >/dev/null 2>&1; then
    echo -e "${GREEN}✅ PASS${NC}"
else
    echo -e "${RED}❌ FAIL${NC} (STUN серверы не найдены)"
fi

if echo "$ice_response" | jq -e '.iceServers[] | select(.urls | contains("turn:"))' >/dev/null 2>&1; then
    echo -e "${GREEN}✅ PASS${NC}"
else
    echo -e "${RED}❌ FAIL${NC} (TURN серверы не найдены)"
fi

echo
echo "2. Тестирование комнат"
echo "====================="

# Создание тестовой комнаты
room_id="test-room-$(date +%s)"
room_data="{\"roomId\": \"$room_id\"}"

test_endpoint "POST" "/rooms" "$room_data" "200" "POST /api/rooms (создание комнаты)"
test_endpoint "GET" "/rooms" "" "200" "GET /api/rooms (список комнат)"
test_json_response "/rooms" "JSON ответ списка комнат"

# Проверка наличия созданной комнаты
echo -n "Проверка наличия созданной комнаты... "
rooms_response=$(curl -s "$API_URL/rooms")
if echo "$rooms_response" | jq -e ".rooms[] | select(.roomId == \"$room_id\")" >/dev/null 2>&1; then
    echo -e "${GREEN}✅ PASS${NC}"
else
    echo -e "${RED}❌ FAIL${NC} (созданная комната не найдена)"
fi

echo
echo "3. Тестирование ошибок"
echo "====================="

# Тестирование несуществующего endpoint
test_endpoint "GET" "/nonexistent" "" "404" "GET /api/nonexistent (404 ошибка)"

# Тестирование неверного метода
echo -n "Тестирование неверного метода... "
response=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "$API_URL/ice-servers" 2>/dev/null || echo "000")
if [ "$response" = "405" ] || [ "$response" = "404" ]; then
    echo -e "${GREEN}✅ PASS${NC}"
else
    echo -e "${RED}❌ FAIL${NC} (статус: $response)"
fi

echo
echo "4. Тестирование производительности"
echo "================================="

# Тест времени отклика
echo -n "Тест времени отклика ICE серверов... "
start_time=$(date +%s.%N)
curl -s "$API_URL/ice-servers" >/dev/null
end_time=$(date +%s.%N)
response_time=$(echo "$end_time - $start_time" | bc)

if (( $(echo "$response_time < 1.0" | bc -l) )); then
    echo -e "${GREEN}✅ PASS${NC} (время: ${response_time}s)"
else
    echo -e "${RED}❌ FAIL${NC} (время: ${response_time}s, слишком медленно)"
fi

# Тест множественных запросов
echo -n "Тест множественных запросов... "
success_count=0
for i in {1..10}; do
    if curl -s -o /dev/null -w "%{http_code}" "$API_URL/ice-servers" | grep -q "200"; then
        success_count=$((success_count + 1))
    fi
done

if [ $success_count -eq 10 ]; then
    echo -e "${GREEN}✅ PASS${NC} (10/10 запросов успешны)"
else
    echo -e "${RED}❌ FAIL${NC} ($success_count/10 запросов успешны)"
fi

echo
echo "5. Тестирование CORS"
echo "==================="

echo -n "Тестирование CORS заголовков... "
cors_response=$(curl -s -I "$API_URL/ice-servers" 2>/dev/null)
if echo "$cors_response" | grep -i "access-control-allow-origin" >/dev/null; then
    echo -e "${GREEN}✅ PASS${NC}"
else
    echo -e "${RED}❌ FAIL${NC} (CORS заголовки не найдены)"
fi

echo
echo "6. Тестирование безопасности"
echo "==========================="

# Проверка отсутствия чувствительной информации в ответах
echo -n "Проверка отсутствия чувствительной информации... "
ice_response=$(curl -s "$API_URL/ice-servers")
if echo "$ice_response" | grep -i "password\|secret\|key\|token" >/dev/null; then
    echo -e "${RED}❌ FAIL${NC} (найдена чувствительная информация)"
else
    echo -e "${GREEN}✅ PASS${NC}"
fi

echo
echo "=== Тестирование API завершено ==="
echo

# Очистка тестовых данных
echo "Очистка тестовых данных..."
curl -s -X DELETE "$API_URL/rooms/$room_id" >/dev/null 2>&1 || true

echo "Готово!"
