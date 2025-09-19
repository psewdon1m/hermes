#!/bin/bash

# Мониторинг системы P2P Call App

set -e

# Цвета
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Функция для вывода заголовка
print_header() {
    echo -e "${BLUE}=== $1 ===${NC}"
}

# Функция для вывода статуса
print_status() {
    local status="$1"
    local message="$2"
    
    if [ "$status" = "OK" ]; then
        echo -e "${GREEN}[OK] $message${NC}"
    elif [ "$status" = "WARNING" ]; then
        echo -e "${YELLOW}[WARNING] $message${NC}"
    else
        echo -e "${RED}[ERROR] $message${NC}"
    fi
}

# Функция для получения метрики
get_metric() {
    local metric="$1"
    local value="$2"
    local unit="$3"
    
    if [ -n "$value" ] && [ "$value" != "null" ]; then
        echo -e "${CYAN}$metric:${NC} $value $unit"
    else
        echo -e "${RED}$metric:${NC} N/A"
    fi
}

# Функция для проверки здоровья сервиса
check_service_health() {
    local service="$1"
    local url="$2"
    local expected_status="$3"
    
    if curl -s -o /dev/null -w "%{http_code}" "$url" 2>/dev/null | grep -q "$expected_status"; then
        print_status "OK" "$service доступен"
        return 0
    else
        print_status "ERROR" "$service недоступен"
        return 1
    fi
}

# Функция для мониторинга в реальном времени
monitor_realtime() {
    echo -e "${BLUE}Мониторинг в реальном времени (Ctrl+C для выхода)${NC}"
    echo
    
    while true; do
        clear
        echo -e "${BLUE}=== P2P Call App - Мониторинг ===${NC}"
        echo "Время: $(date)"
        echo
        
        # Статус контейнеров
        print_header "Статус контейнеров"
        docker-compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"
        echo
        
        # Использование ресурсов
        print_header "Использование ресурсов"
        docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}\t{{.BlockIO}}"
        echo
        
        # Проверка API
        print_header "Проверка API"
        if check_service_health "API" "http://localhost:3000/api/ice-servers" "200"; then
            response_time=$(curl -o /dev/null -s -w "%{time_total}" http://localhost:3000/api/ice-servers 2>/dev/null)
            echo -e "${CYAN}Время отклика:${NC} ${response_time}s"
        fi
        echo
        
        # Проверка Redis
        print_header "Проверка Redis"
        if docker-compose exec -T redis redis-cli ping 2>/dev/null | grep -q "PONG"; then
            print_status "OK" "Redis доступен"
            memory_usage=$(docker-compose exec -T redis redis-cli info memory 2>/dev/null | grep used_memory_human | cut -d: -f2 | tr -d '\r')
            echo -e "${CYAN}Использование памяти:${NC} $memory_usage"
        else
            print_status "ERROR" "Redis недоступен"
        fi
        echo
        
        # Проверка TURN сервера
        print_header "Проверка TURN сервера"
        if nc -z localhost 3478 2>/dev/null; then
            print_status "OK" "TURN сервер доступен"
        else
            print_status "ERROR" "TURN сервер недоступен"
        fi
        echo
        
        # Проверка дискового пространства
        print_header "Дисковое пространство"
        df -h / | tail -1 | awk '{print "Использовано: " $3 " / " $2 " (" $5 ")"}'
        echo
        
        # Проверка памяти системы
        print_header "Память системы"
        free -h | grep Mem | awk '{print "Использовано: " $3 " / " $2 " (" $3/$2*100 "%)"}'
        echo
        
        # Проверка нагрузки
        print_header "Нагрузка системы"
        uptime | awk -F'load average:' '{print "Нагрузка: " $2}'
        echo
        
        # Последние ошибки в логах
        print_header "Последние ошибки (последние 5)"
        docker-compose logs --tail=5 2>&1 | grep -i "error\|exception\|failed" | tail -5 || echo "Ошибок не найдено"
        echo
        
        echo -e "${YELLOW}Обновление через 5 секунд...${NC}"
        sleep 5
    done
}

# Функция для генерации отчета
generate_report() {
    local report_file="monitoring-report-$(date +%Y%m%d_%H%M%S).txt"
    
    echo "Генерация отчета: $report_file"
    echo
    
    {
        echo "=== P2P Call App - Отчет мониторинга ==="
        echo "Дата: $(date)"
        echo "Сервер: $(hostname)"
        echo
        
        print_header "Статус контейнеров"
        docker-compose ps
        echo
        
        print_header "Использование ресурсов"
        docker stats --no-stream
        echo
        
        print_header "Проверка API"
        curl -s http://localhost:3000/api/ice-servers | jq . 2>/dev/null || echo "API недоступен"
        echo
        
        print_header "Проверка Redis"
        docker-compose exec -T redis redis-cli info server 2>/dev/null | head -10 || echo "Redis недоступен"
        echo
        
        print_header "Проверка TURN сервера"
        nc -z localhost 3478 && echo "TURN сервер доступен" || echo "TURN сервер недоступен"
        echo
        
        print_header "Системная информация"
        echo "Uptime: $(uptime)"
        echo "Дисковое пространство:"
        df -h
        echo "Память:"
        free -h
        echo
        
        print_header "Последние логи (последние 20 строк)"
        docker-compose logs --tail=20
        echo
        
        print_header "Сетевые подключения"
        netstat -tuln | grep -E ":80|:443|:3000|:3478"
        echo
        
    } > "$report_file"
    
    echo -e "${GREEN}Отчет сохранен: $report_file${NC}"
}

# Функция для проверки здоровья системы
health_check() {
    echo -e "${BLUE}=== Проверка здоровья системы ===${NC}"
    echo
    
    local health_score=0
    local total_checks=0
    
    # Проверка контейнеров
    print_header "Проверка контейнеров"
    total_checks=$((total_checks + 1))
    if docker-compose ps | grep -q "Up"; then
        print_status "OK" "Контейнеры запущены"
        health_score=$((health_score + 1))
    else
        print_status "ERROR" "Контейнеры не запущены"
    fi
    echo
    
    # Проверка API
    print_header "Проверка API"
    total_checks=$((total_checks + 1))
    if check_service_health "API" "http://localhost:3000/api/ice-servers" "200"; then
        health_score=$((health_score + 1))
    fi
    echo
    
    # Проверка Redis
    print_header "Проверка Redis"
    total_checks=$((total_checks + 1))
    if docker-compose exec -T redis redis-cli ping 2>/dev/null | grep -q "PONG"; then
        print_status "OK" "Redis доступен"
        health_score=$((health_score + 1))
    else
        print_status "ERROR" "Redis недоступен"
    fi
    echo
    
    # Проверка TURN сервера
    print_header "Проверка TURN сервера"
    total_checks=$((total_checks + 1))
    if nc -z localhost 3478 2>/dev/null; then
        print_status "OK" "TURN сервер доступен"
        health_score=$((health_score + 1))
    else
        print_status "ERROR" "TURN сервер недоступен"
    fi
    echo
    
    # Проверка дискового пространства
    print_header "Проверка дискового пространства"
    total_checks=$((total_checks + 1))
    disk_usage=$(df / | tail -1 | awk '{print $5}' | sed 's/%//')
    if [ "$disk_usage" -lt 80 ]; then
        print_status "OK" "Дисковое пространство в норме ($disk_usage%)"
        health_score=$((health_score + 1))
    elif [ "$disk_usage" -lt 90 ]; then
        print_status "WARNING" "Дисковое пространство заканчивается ($disk_usage%)"
    else
        print_status "ERROR" "Критически мало дискового пространства ($disk_usage%)"
    fi
    echo
    
    # Проверка памяти
    print_header "Проверка памяти"
    total_checks=$((total_checks + 1))
    memory_usage=$(free | grep Mem | awk '{printf "%.0f", $3/$2 * 100.0}')
    if [ "$memory_usage" -lt 80 ]; then
        print_status "OK" "Память в норме ($memory_usage%)"
        health_score=$((health_score + 1))
    elif [ "$memory_usage" -lt 90 ]; then
        print_status "WARNING" "Высокое использование памяти ($memory_usage%)"
    else
        print_status "ERROR" "Критически высокое использование памяти ($memory_usage%)"
    fi
    echo
    
    # Итоговая оценка здоровья
    print_header "Итоговая оценка здоровья"
    health_percentage=$((health_score * 100 / total_checks))
    
    if [ "$health_percentage" -ge 90 ]; then
        print_status "OK" "Система в отличном состоянии ($health_percentage%)"
    elif [ "$health_percentage" -ge 70 ]; then
        print_status "WARNING" "Система в хорошем состоянии ($health_percentage%)"
    else
        print_status "ERROR" "Система требует внимания ($health_percentage%)"
    fi
    
    echo
    echo -e "${CYAN}Проверок пройдено:${NC} $health_score/$total_checks"
    echo -e "${CYAN}Оценка здоровья:${NC} $health_percentage%"
}

# Функция для мониторинга логов
monitor_logs() {
    echo -e "${BLUE}Мониторинг логов (Ctrl+C для выхода)${NC}"
    echo
    
    # Выбор сервиса для мониторинга
    echo "Выберите сервис для мониторинга:"
    echo "1) Все сервисы"
    echo "2) Приложение (app)"
    echo "3) Telegram бот (bot)"
    echo "4) Redis"
    echo "5) Nginx"
    echo "6) TURN сервер"
    echo
    read -p "Введите номер (1-6): " choice
    
    case $choice in
        1) docker-compose logs -f ;;
        2) docker-compose logs -f app ;;
        3) docker-compose logs -f bot ;;
        4) docker-compose logs -f redis ;;
        5) docker-compose logs -f nginx ;;
        6) docker-compose logs -f turnserver ;;
        *) echo "Неверный выбор"; exit 1 ;;
    esac
}

# Функция для мониторинга производительности
monitor_performance() {
    echo -e "${BLUE}Мониторинг производительности (Ctrl+C для выхода)${NC}"
    echo
    
    while true; do
        clear
        echo -e "${BLUE}=== Мониторинг производительности ===${NC}"
        echo "Время: $(date)"
        echo
        
        # CPU и память контейнеров
        print_header "Ресурсы контейнеров"
        docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}"
        echo
        
        # Время отклика API
        print_header "Время отклика API"
        start_time=$(date +%s.%N)
        if curl -s http://localhost:3000/api/ice-servers >/dev/null 2>&1; then
            end_time=$(date +%s.%N)
            response_time=$(echo "$end_time - $start_time" | bc)
            echo -e "${CYAN}API отклик:${NC} ${response_time}s"
        else
            echo -e "${RED}API недоступен${NC}"
        fi
        echo
        
        # Использование Redis
        print_header "Использование Redis"
        if docker-compose exec -T redis redis-cli ping >/dev/null 2>&1; then
            memory_usage=$(docker-compose exec -T redis redis-cli info memory 2>/dev/null | grep used_memory_human | cut -d: -f2 | tr -d '\r')
            connected_clients=$(docker-compose exec -T redis redis-cli info clients 2>/dev/null | grep connected_clients | cut -d: -f2 | tr -d '\r')
            echo -e "${CYAN}Память:${NC} $memory_usage"
            echo -e "${CYAN}Подключения:${NC} $connected_clients"
        else
            echo -e "${RED}Redis недоступен${NC}"
        fi
        echo
        
        # Сетевые подключения
        print_header "Сетевые подключения"
        netstat -tuln | grep -E ":80|:443|:3000|:3478" | wc -l | xargs echo "Активные подключения:"
        echo
        
        # Системная нагрузка
        print_header "Системная нагрузка"
        uptime | awk -F'load average:' '{print "Нагрузка: " $2}'
        echo
        
        echo -e "${YELLOW}Обновление через 3 секунды...${NC}"
        sleep 3
    done
}

# Главное меню
show_menu() {
    echo -e "${BLUE}=== P2P Call App - Мониторинг ===${NC}"
    echo
    echo "Выберите действие:"
    echo "1) Мониторинг в реальном времени"
    echo "2) Проверка здоровья системы"
    echo "3) Мониторинг логов"
    echo "4) Мониторинг производительности"
    echo "5) Генерация отчета"
    echo "6) Выход"
    echo
    read -p "Введите номер (1-6): " choice
    
    case $choice in
        1) monitor_realtime ;;
        2) health_check ;;
        3) monitor_logs ;;
        4) monitor_performance ;;
        5) generate_report ;;
        6) echo "Выход..."; exit 0 ;;
        *) echo "Неверный выбор"; show_menu ;;
    esac
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
    
    if ! command -v jq >/dev/null 2>&1; then
        missing_deps+=("jq")
    fi
    
    if ! command -v bc >/dev/null 2>&1; then
        missing_deps+=("bc")
    fi
    
    if [ ${#missing_deps[@]} -gt 0 ]; then
        echo -e "${RED}[ERROR] Отсутствуют зависимости: ${missing_deps[*]}${NC}"
        echo "Установите их перед использованием скрипта"
        exit 1
    fi
}

# Основная функция
main() {
    # Проверка зависимостей
    check_dependencies
    
    # Проверка наличия docker-compose.yml
    if [ ! -f "docker-compose.yml" ]; then
        echo -e "${RED}❌ Файл docker-compose.yml не найден${NC}"
        echo "Запустите скрипт из директории проекта"
        exit 1
    fi
    
    # Проверка запущенных контейнеров
    if ! docker-compose ps | grep -q "Up"; then
        echo -e "${YELLOW}⚠️  Контейнеры не запущены${NC}"
        echo "Запустите систему: docker-compose up -d"
        exit 1
    fi
    
    # Показать меню
    show_menu
}

# Запуск
main "$@"
