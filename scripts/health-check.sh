#!/bin/bash

# Скрипт проверки здоровья системы P2P Call App

set -e

# Цвета
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Счетчики
CHECKS_PASSED=0
CHECKS_FAILED=0
CHECKS_WARNING=0
TOTAL_CHECKS=0

# Функция для вывода результата
print_result() {
    local status="$1"
    local message="$2"
    local details="$3"
    
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
    
    case $status in
        "PASS")
            echo -e "${GREEN}[OK] $message${NC}"
            CHECKS_PASSED=$((CHECKS_PASSED + 1))
            ;;
        "FAIL")
            echo -e "${RED}[ERROR] $message${NC}"
            if [ -n "$details" ]; then
                echo -e "${RED}   $details${NC}"
            fi
            CHECKS_FAILED=$((CHECKS_FAILED + 1))
            ;;
        "WARNING")
            echo -e "${YELLOW}[WARNING] $message${NC}"
            if [ -n "$details" ]; then
                echo -e "${YELLOW}   $details${NC}"
            fi
            CHECKS_WARNING=$((CHECKS_WARNING + 1))
            ;;
    esac
}

# Функция для проверки HTTP endpoint
check_http_endpoint() {
    local url="$1"
    local expected_status="$2"
    local service_name="$3"
    
    local response_code=$(curl -s -o /dev/null -w "%{http_code}" "$url" 2>/dev/null || echo "000")
    
    if [ "$response_code" = "$expected_status" ]; then
        print_result "PASS" "$service_name доступен (HTTP $response_code)"
    else
        print_result "FAIL" "$service_name недоступен" "Ожидался HTTP $expected_status, получен $response_code"
    fi
}

# Функция для проверки порта
check_port() {
    local port="$1"
    local service_name="$2"
    
    if nc -z localhost "$port" 2>/dev/null; then
        print_result "PASS" "$service_name доступен (порт $port)"
    else
        print_result "FAIL" "$service_name недоступен" "Порт $port не отвечает"
    fi
}

# Функция для проверки Docker контейнера
check_docker_container() {
    local container_name="$1"
    local service_name="$2"
    
    if docker-compose ps | grep -q "$container_name.*Up"; then
        print_result "PASS" "$service_name запущен"
    else
        print_result "FAIL" "$service_name не запущен" "Контейнер $container_name не работает"
    fi
}

# Функция для проверки Redis
check_redis() {
    if docker-compose exec -T redis redis-cli ping 2>/dev/null | grep -q "PONG"; then
        print_result "PASS" "Redis доступен"
        
        # Проверка использования памяти Redis
        local memory_usage=$(docker-compose exec -T redis redis-cli info memory 2>/dev/null | grep used_memory_human | cut -d: -f2 | tr -d '\r')
        if [ -n "$memory_usage" ]; then
            echo -e "${CYAN}   Использование памяти: $memory_usage${NC}"
        fi
        
        # Проверка подключений Redis
        local connected_clients=$(docker-compose exec -T redis redis-cli info clients 2>/dev/null | grep connected_clients | cut -d: -f2 | tr -d '\r')
        if [ -n "$connected_clients" ]; then
            echo -e "${CYAN}   Подключения: $connected_clients${NC}"
        fi
    else
        print_result "FAIL" "Redis недоступен" "Не удается подключиться к Redis"
    fi
}

# Функция для проверки TURN сервера
check_turn_server() {
    if nc -z localhost 3478 2>/dev/null; then
        print_result "PASS" "TURN сервер доступен"
        
        # Проверка логов TURN сервера
        if docker-compose logs turnserver | grep -i "listening\|started" >/dev/null; then
            echo -e "${CYAN}   TURN сервер запущен корректно${NC}"
        else
            print_result "WARNING" "TURN сервер" "Возможны проблемы в логах"
        fi
    else
        print_result "FAIL" "TURN сервер недоступен" "Порт 3478 не отвечает"
    fi
}

# Функция для проверки Telegram бота
check_telegram_bot() {
    if docker-compose ps | grep -q "bot.*Up"; then
        print_result "PASS" "Telegram бот запущен"
        
        # Проверка логов бота
        if docker-compose logs bot | grep -i "error\|exception\|failed" | grep -v "deprecated" | wc -l | grep -q "^0$"; then
            echo -e "${CYAN}   Ошибок в логах не найдено${NC}"
        else
            local error_count=$(docker-compose logs bot | grep -i "error\|exception\|failed" | grep -v "deprecated" | wc -l)
            print_result "WARNING" "Telegram бот" "Найдено $error_count ошибок в логах"
        fi
    else
        print_result "FAIL" "Telegram бот не запущен" "Контейнер bot не работает"
    fi
}

# Функция для проверки SSL сертификатов
check_ssl_certificates() {
    if [ -f "ssl/cert.pem" ] && [ -f "ssl/key.pem" ]; then
        print_result "PASS" "SSL сертификаты существуют"
        
        # Проверка срока действия сертификата
        local cert_expiry=$(openssl x509 -in ssl/cert.pem -noout -enddate 2>/dev/null | cut -d= -f2)
        if [ -n "$cert_expiry" ]; then
            local expiry_timestamp=$(date -d "$cert_expiry" +%s 2>/dev/null || echo "0")
            local current_timestamp=$(date +%s)
            local days_until_expiry=$(( (expiry_timestamp - current_timestamp) / 86400 ))
            
            if [ "$days_until_expiry" -gt 30 ]; then
                echo -e "${CYAN}   Сертификат действителен еще $days_until_expiry дней${NC}"
            elif [ "$days_until_expiry" -gt 0 ]; then
                print_result "WARNING" "SSL сертификат" "Истекает через $days_until_expiry дней"
            else
                print_result "FAIL" "SSL сертификат" "Истек $((days_until_expiry * -1)) дней назад"
            fi
        fi
    else
        print_result "FAIL" "SSL сертификаты не найдены" "Файлы ssl/cert.pem или ssl/key.pem отсутствуют"
    fi
}

# Функция для проверки дискового пространства
check_disk_space() {
    local disk_usage=$(df / | tail -1 | awk '{print $5}' | sed 's/%//')
    
    if [ "$disk_usage" -lt 80 ]; then
        print_result "PASS" "Дисковое пространство в норме" "Использовано: $disk_usage%"
    elif [ "$disk_usage" -lt 90 ]; then
        print_result "WARNING" "Дисковое пространство" "Использовано: $disk_usage% (рекомендуется очистка)"
    else
        print_result "FAIL" "Критически мало дискового пространства" "Использовано: $disk_usage%"
    fi
}

# Функция для проверки памяти
check_memory() {
    local memory_usage=$(free | grep Mem | awk '{printf "%.0f", $3/$2 * 100.0}')
    
    if [ "$memory_usage" -lt 80 ]; then
        print_result "PASS" "Память в норме" "Использовано: $memory_usage%"
    elif [ "$memory_usage" -lt 90 ]; then
        print_result "WARNING" "Высокое использование памяти" "Использовано: $memory_usage%"
    else
        print_result "FAIL" "Критически высокое использование памяти" "Использовано: $memory_usage%"
    fi
}

# Функция для проверки нагрузки системы
check_system_load() {
    local load_avg=$(uptime | awk -F'load average:' '{print $2}' | awk '{print $1}' | sed 's/,//')
    local cpu_cores=$(nproc)
    local load_threshold=$(echo "$cpu_cores * 0.8" | bc)
    
    if (( $(echo "$load_avg < $load_threshold" | bc -l) )); then
        print_result "PASS" "Нагрузка системы в норме" "Load average: $load_avg (ядер: $cpu_cores)"
    elif (( $(echo "$load_avg < $cpu_cores" | bc -l) )); then
        print_result "WARNING" "Высокая нагрузка системы" "Load average: $load_avg (ядер: $cpu_cores)"
    else
        print_result "FAIL" "Критически высокая нагрузка системы" "Load average: $load_avg (ядер: $cpu_cores)"
    fi
}

# Функция для проверки сетевых подключений
check_network_connections() {
    local active_connections=$(netstat -tuln | grep -E ":80|:443|:3000|:3478" | wc -l)
    
    if [ "$active_connections" -gt 0 ]; then
        print_result "PASS" "Сетевые подключения активны" "Активных подключений: $active_connections"
    else
        print_result "FAIL" "Нет активных сетевых подключений" "Проверьте настройки firewall"
    fi
}

# Функция для проверки времени отклика API
check_api_response_time() {
    local start_time=$(date +%s.%N)
    if curl -s http://localhost:3000/api/ice-servers >/dev/null 2>&1; then
        local end_time=$(date +%s.%N)
        local response_time=$(echo "$end_time - $start_time" | bc)
        
        if (( $(echo "$response_time < 1.0" | bc -l) )); then
            print_result "PASS" "API отклик в норме" "Время отклика: ${response_time}s"
        elif (( $(echo "$response_time < 2.0" | bc -l) )); then
            print_result "WARNING" "API отклик медленный" "Время отклика: ${response_time}s"
        else
            print_result "FAIL" "API отклик слишком медленный" "Время отклика: ${response_time}s"
        fi
    else
        print_result "FAIL" "API недоступен" "Не удается получить ответ от API"
    fi
}

# Функция для проверки логов на ошибки
check_logs_for_errors() {
    local error_count=$(docker-compose logs --tail=100 2>&1 | grep -i "error\|exception\|failed" | grep -v "deprecated" | wc -l)
    
    if [ "$error_count" -eq 0 ]; then
        print_result "PASS" "Ошибок в логах не найдено"
    elif [ "$error_count" -lt 5 ]; then
        print_result "WARNING" "Найдено ошибок в логах" "Количество: $error_count"
    else
        print_result "FAIL" "Много ошибок в логах" "Количество: $error_count"
    fi
}

# Функция для проверки переменных окружения
check_environment_variables() {
    if [ -f .env ]; then
        print_result "PASS" "Файл .env существует"
        
        # Проверка обязательных переменных
        local missing_vars=()
        
        if ! grep -q "TELEGRAM_BOT_TOKEN=" .env || grep -q "TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here" .env; then
            missing_vars+=("TELEGRAM_BOT_TOKEN")
        fi
        
        if ! grep -q "DOMAIN=" .env || grep -q "DOMAIN=yourdomain.com" .env; then
            missing_vars+=("DOMAIN")
        fi
        
        if ! grep -q "TURN_SECRET=" .env || grep -q "TURN_SECRET=your-secret-key" .env; then
            missing_vars+=("TURN_SECRET")
        fi
        
        if [ ${#missing_vars[@]} -eq 0 ]; then
            echo -e "${CYAN}   Все обязательные переменные настроены${NC}"
        else
            print_result "WARNING" "Не настроены переменные" "Отсутствуют: ${missing_vars[*]}"
        fi
    else
        print_result "FAIL" "Файл .env не найден" "Создайте файл .env из env.example"
    fi
}

# Основная функция проверки здоровья
main() {
    echo -e "${BLUE}=== P2P Call App - Проверка здоровья ===${NC}"
    echo "Время: $(date)"
    echo
    
    # Проверка Docker контейнеров
    echo -e "${BLUE}1. Проверка Docker контейнеров${NC}"
    echo "================================"
    check_docker_container "app" "Приложение"
    check_docker_container "redis" "Redis"
    check_docker_container "nginx" "Nginx"
    check_docker_container "turnserver" "TURN сервер"
    check_docker_container "bot" "Telegram бот"
    echo
    
    # Проверка сервисов
    echo -e "${BLUE}2. Проверка сервисов${NC}"
    echo "======================"
    check_http_endpoint "http://localhost:3000/api/ice-servers" "200" "API"
    check_port "80" "HTTP"
    check_port "443" "HTTPS"
    check_port "3478" "TURN сервер"
    echo
    
    # Проверка компонентов
    echo -e "${BLUE}3. Проверка компонентов${NC}"
    echo "=========================="
    check_redis
    check_turn_server
    check_telegram_bot
    check_ssl_certificates
    echo
    
    # Проверка системы
    echo -e "${BLUE}4. Проверка системы${NC}"
    echo "======================"
    check_disk_space
    check_memory
    check_system_load
    check_network_connections
    echo
    
    # Проверка производительности
    echo -e "${BLUE}5. Проверка производительности${NC}"
    echo "================================="
    check_api_response_time
    check_logs_for_errors
    echo
    
    # Проверка конфигурации
    echo -e "${BLUE}6. Проверка конфигурации${NC}"
    echo "============================"
    check_environment_variables
    echo
    
    # Итоговая оценка
    echo -e "${BLUE}=== Итоговая оценка здоровья ===${NC}"
    echo "Всего проверок: $TOTAL_CHECKS"
    echo -e "Прошло: ${GREEN}$CHECKS_PASSED${NC}"
    echo -e "Предупреждения: ${YELLOW}$CHECKS_WARNING${NC}"
    echo -e "Провалено: ${RED}$CHECKS_FAILED${NC}"
    
    local health_percentage=$((CHECKS_PASSED * 100 / TOTAL_CHECKS))
    
    if [ "$health_percentage" -ge 90 ]; then
        echo -e "${GREEN}[SUCCESS] Система в отличном состоянии! ($health_percentage%)${NC}"
        exit 0
    elif [ "$health_percentage" -ge 70 ]; then
        echo -e "${YELLOW}[WARNING] Система в хорошем состоянии ($health_percentage%)${NC}"
        exit 1
    else
        echo -e "${RED}[ERROR] Система требует внимания ($health_percentage%)${NC}"
        exit 2
    fi
}

# Проверка зависимостей
check_dependencies() {
    local missing_deps=()
    
    if ! command -v docker >/dev/null 2>&1; then
        missing_deps+=("docker")
    fi
    
    if ! command -v docker-compose >/dev/null 2>&1; then
        missing_deps+=("docker-compose")
    fi
    
    if ! command -v curl >/dev/null 2>&1; then
        missing_deps+=("curl")
    fi
    
    if ! command -v nc >/dev/null 2>&1; then
        missing_deps+=("netcat")
    fi
    
    if ! command -v bc >/dev/null 2>&1; then
        missing_deps+=("bc")
    fi
    
    if [ ${#missing_deps[@]} -gt 0 ]; then
        echo -e "${RED}❌ Отсутствуют зависимости: ${missing_deps[*]}${NC}"
        echo "Установите их перед использованием скрипта"
        exit 1
    fi
}

# Проверка наличия docker-compose.yml
if [ ! -f "docker-compose.yml" ]; then
    echo -e "${RED}❌ Файл docker-compose.yml не найден${NC}"
    echo "Запустите скрипт из директории проекта"
    exit 1
fi

# Запуск
check_dependencies
main
