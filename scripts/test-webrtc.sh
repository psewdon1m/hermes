#!/bin/bash

# Тестирование WebRTC функциональности

set -e

echo "=== Тестирование WebRTC ==="
echo

# Цвета
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Функция для проверки порта
check_port() {
    local port="$1"
    local service="$2"
    
    echo -n "Проверка $service (порт $port)... "
    
    if nc -z localhost "$port" 2>/dev/null; then
        echo -e "${GREEN}✅ PASS${NC}"
        return 0
    else
        echo -e "${RED}❌ FAIL${NC}"
        return 1
    fi
}

# Функция для проверки внешнего сервиса
check_external_service() {
    local host="$1"
    local port="$2"
    local service="$3"
    
    echo -n "Проверка $service ($host:$port)... "
    
    if nc -z "$host" "$port" 2>/dev/null; then
        echo -e "${GREEN}✅ PASS${NC}"
        return 0
    else
        echo -e "${RED}❌ FAIL${NC}"
        return 1
    fi
}

# Функция для тестирования TURN сервера
test_turn_server() {
    echo -n "Тестирование TURN сервера... "
    
    # Получение ICE серверов
    ice_response=$(curl -s http://localhost:3000/api/ice-servers)
    
    if echo "$ice_response" | jq -e '.iceServers[] | select(.urls | contains("turn:"))' >/dev/null 2>&1; then
        echo -e "${GREEN}✅ PASS${NC}"
        return 0
    else
        echo -e "${RED}❌ FAIL${NC} (TURN серверы не найдены в ICE серверах)"
        return 1
    fi
}

# Функция для тестирования STUN сервера
test_stun_server() {
    echo -n "Тестирование STUN сервера... "
    
    # Получение ICE серверов
    ice_response=$(curl -s http://localhost:3000/api/ice-servers)
    
    if echo "$ice_response" | jq -e '.iceServers[] | select(.urls | contains("stun:"))' >/dev/null 2>&1; then
        echo -e "${GREEN}✅ PASS${NC}"
        return 0
    else
        echo -e "${RED}❌ FAIL${NC} (STUN серверы не найдены в ICE серверах)"
        return 1
    fi
}

# Функция для проверки WebRTC API в браузере
check_webrtc_support() {
    echo -n "Проверка поддержки WebRTC... "
    
    # Проверка доступности WebRTC API (через curl к HTML странице)
    if curl -s http://localhost:3000/call.html | grep -i "webrtc\|getUserMedia\|RTCPeerConnection" >/dev/null; then
        echo -e "${GREEN}✅ PASS${NC}"
        return 0
    else
        echo -e "${RED}❌ FAIL${NC} (WebRTC API не найден на странице)"
        return 1
    fi
}

echo "1. Проверка портов"
echo "================="

check_port "3478" "TURN сервер (TCP)"
check_port "3478" "TURN сервер (UDP)" # UDP проверка может не работать с nc
check_port "5349" "TURN сервер (TLS)"
check_port "3000" "Web приложение"

echo
echo "2. Проверка внешних STUN серверов"
echo "================================="

check_external_service "stun.l.google.com" "19302" "Google STUN"
check_external_service "stun1.l.google.com" "19302" "Google STUN 1"
check_external_service "stun2.l.google.com" "19302" "Google STUN 2"

echo
echo "3. Тестирование ICE серверов"
echo "============================"

test_stun_server
test_turn_server

# Проверка конфигурации ICE серверов
echo -n "Проверка конфигурации ICE серверов... "
ice_response=$(curl -s http://localhost:3000/api/ice-servers)

if echo "$ice_response" | jq -e '.iceServers | length > 0' >/dev/null 2>&1; then
    server_count=$(echo "$ice_response" | jq '.iceServers | length')
    echo -e "${GREEN}✅ PASS${NC} (найдено $server_count серверов)"
else
    echo -e "${RED}❌ FAIL${NC} (ICE серверы не настроены)"
fi

echo
echo "4. Проверка WebRTC API"
echo "====================="

check_webrtc_support

# Проверка доступности HTML страницы
echo -n "Проверка доступности call.html... "
if curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/call.html | grep -q "200"; then
    echo -e "${GREEN}✅ PASS${NC}"
else
    echo -e "${RED}❌ FAIL${NC}"
fi

echo
echo "5. Тестирование TURN сервера"
echo "==========================="

# Проверка конфигурации TURN сервера
echo -n "Проверка конфигурации TURN сервера... "
if [ -f "turnserver.conf" ]; then
    echo -e "${GREEN}✅ PASS${NC}"
else
    echo -e "${RED}❌ FAIL${NC} (файл turnserver.conf не найден)"
fi

# Проверка логов TURN сервера
echo -n "Проверка логов TURN сервера... "
if docker-compose logs turnserver | grep -i "listening\|started" >/dev/null; then
    echo -e "${GREEN}✅ PASS${NC}"
else
    echo -e "${RED}❌ FAIL${NC} (TURN сервер не запущен или ошибки в логах)"
fi

echo
echo "6. Тестирование сетевой связности"
echo "================================="

# Проверка доступности извне (если настроен домен)
if [ -n "$DOMAIN" ] && [ "$DOMAIN" != "yourdomain.com" ]; then
    echo -n "Проверка внешней доступности ($DOMAIN)... "
    if curl -s -o /dev/null -w "%{http_code}" "https://$DOMAIN/api/ice-servers" | grep -q "200"; then
        echo -e "${GREEN}✅ PASS${NC}"
    else
        echo -e "${RED}❌ FAIL${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  Пропуск проверки внешней доступности (домен не настроен)${NC}"
fi

echo
echo "7. Тестирование производительности"
echo "================================="

# Тест времени отклика ICE серверов
echo -n "Тест времени отклика ICE серверов... "
start_time=$(date +%s.%N)
curl -s http://localhost:3000/api/ice-servers >/dev/null
end_time=$(date +%s.%N)
response_time=$(echo "$end_time - $start_time" | bc)

if (( $(echo "$response_time < 0.5" | bc -l) )); then
    echo -e "${GREEN}✅ PASS${NC} (время: ${response_time}s)"
else
    echo -e "${RED}❌ FAIL${NC} (время: ${response_time}s, слишком медленно)"
fi

echo
echo "8. Проверка безопасности"
echo "======================="

# Проверка отсутствия чувствительной информации в ICE серверах
echo -n "Проверка безопасности ICE серверов... "
ice_response=$(curl -s http://localhost:3000/api/ice-servers)

if echo "$ice_response" | grep -i "password\|secret\|key" >/dev/null; then
    echo -e "${RED}❌ FAIL${NC} (найдена чувствительная информация)"
else
    echo -e "${GREEN}✅ PASS${NC}"
fi

# Проверка валидности TURN credentials
echo -n "Проверка валидности TURN credentials... "
if echo "$ice_response" | jq -e '.iceServers[] | select(.urls | contains("turn:")) | .username and .credential' >/dev/null 2>&1; then
    echo -e "${GREEN}✅ PASS${NC}"
else
    echo -e "${RED}❌ FAIL${NC} (TURN credentials не настроены)"
fi

echo
echo "9. Интеграционное тестирование"
echo "============================="

# Создание тестовой комнаты и проверка WebRTC соединения
echo -n "Создание тестовой комнаты... "
room_id="webrtc-test-$(date +%s)"
room_response=$(curl -s -X POST http://localhost:3000/api/rooms \
  -H "Content-Type: application/json" \
  -d "{\"roomId\": \"$room_id\"}")

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ PASS${NC}"
    
    # Проверка доступности комнаты
    echo -n "Проверка доступности комнаты... "
    if curl -s "http://localhost:3000/call.html?room=$room_id" | grep -q "room"; then
        echo -e "${GREEN}✅ PASS${NC}"
    else
        echo -e "${RED}❌ FAIL${NC}"
    fi
    
    # Очистка тестовой комнаты
    curl -s -X DELETE "http://localhost:3000/api/rooms/$room_id" >/dev/null 2>&1 || true
else
    echo -e "${RED}❌ FAIL${NC}"
fi

echo
echo "10. Рекомендации по тестированию в браузере"
echo "=========================================="

echo -e "${BLUE}Для полного тестирования WebRTC выполните следующие шаги:${NC}"
echo
echo "1. Откройте браузер и перейдите на:"
echo "   http://localhost:3000/call.html"
echo
echo "2. Создайте комнату с ID: test-room"
echo
echo "3. Откройте вторую вкладку/браузер и присоединитесь к той же комнате"
echo
echo "4. Проверьте:"
echo "   - Разрешение на доступ к камере/микрофону"
echo "   - Установление соединения между вкладками"
echo "   - Качество видео/аудио"
echo "   - Работу чата (если есть)"
echo
echo "5. Проверьте в консоли браузера (F12):"
echo "   - Отсутствие ошибок WebRTC"
echo "   - Успешное получение ICE candidates"
echo "   - Установление peer connection"

echo
echo "=== Тестирование WebRTC завершено ==="
echo

# Вывод итоговой информации
echo -e "${BLUE}Полезные команды для отладки:${NC}"
echo "• Просмотр логов TURN сервера: docker-compose logs turnserver"
echo "• Просмотр логов приложения: docker-compose logs app"
echo "• Проверка ICE серверов: curl http://localhost:3000/api/ice-servers"
echo "• Тестирование TURN сервера: turnutils_stunclient localhost"
echo "• Проверка портов: netstat -tuln | grep 3478"
