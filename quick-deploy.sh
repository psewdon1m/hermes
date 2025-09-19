#!/bin/bash

# Быстрое развертывание P2P Call App

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

# Функция для проверки зависимостей
check_dependencies() {
    print_header "Проверка зависимостей"
    
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
    
    if [ ${#missing_deps[@]} -gt 0 ]; then
        print_status "ERROR" "Отсутствуют зависимости: ${missing_deps[*]}"
        echo "Установите их перед продолжением:"
        echo "curl -fsSL https://get.docker.com -o get-docker.sh && sudo sh get-docker.sh"
        exit 1
    fi
    
    print_status "OK" "Все зависимости установлены"
}

# Функция для настройки .env файла
setup_env() {
    print_header "Настройка переменных окружения"
    
    if [ ! -f .env ]; then
        print_status "WARNING" "Файл .env не найден, создаю из шаблона"
        cp env.example .env
    fi
    
    # Проверка обязательных переменных
    local needs_config=false
    
    if grep -q "TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here" .env; then
        print_status "WARNING" "TELEGRAM_BOT_TOKEN не настроен"
        needs_config=true
    fi
    
    if grep -q "DOMAIN=yourdomain.com" .env; then
        print_status "WARNING" "DOMAIN не настроен"
        needs_config=true
    fi
    
    if grep -q "TURN_SECRET=your-secret-key" .env; then
        print_status "WARNING" "TURN_SECRET не настроен"
        needs_config=true
    fi
    
    if [ "$needs_config" = true ]; then
        echo
        echo -e "${YELLOW}Необходимо настроить переменные в .env файле:${NC}"
        echo "1. TELEGRAM_BOT_TOKEN - токен вашего Telegram бота"
        echo "2. DOMAIN - ваш домен (например, example.com)"
        echo "3. TURN_SECRET - секретный ключ для TURN сервера"
        echo
        read -p "Открыть .env файл для редактирования? (y/N): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            nano .env
        else
            print_status "ERROR" "Настройте .env файл перед продолжением"
            exit 1
        fi
    fi
    
    print_status "OK" "Переменные окружения настроены"
}

# Функция для проверки конфликтов
check_conflicts() {
    print_header "Проверка конфликтов"
    
    # Проверка Caddy
    if pgrep -f caddy > /dev/null; then
        print_status "WARNING" "Caddy обнаружен и запущен"
        echo "Рекомендуется остановить Caddy перед развертыванием"
        echo "Команды:"
        echo "sudo systemctl stop caddy"
        echo "sudo systemctl disable caddy"
        echo "rm ~/callstack/infra/Caddyfile"
        echo
        read -p "Продолжить развертывание? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            print_status "ERROR" "Развертывание отменено"
            exit 1
        fi
    fi
    
    # Проверка портов
    local port_conflicts=()
    
    if netstat -tuln | grep -q ":80 "; then
        port_conflicts+=("80")
    fi
    
    if netstat -tuln | grep -q ":443 "; then
        port_conflicts+=("443")
    fi
    
    if netstat -tuln | grep -q ":3000 "; then
        port_conflicts+=("3000")
    fi
    
    if [ ${#port_conflicts[@]} -gt 0 ]; then
        print_status "WARNING" "Заняты порты: ${port_conflicts[*]}"
        echo "Возможны конфликты при развертывании"
    fi
    
    print_status "OK" "Проверка конфликтов завершена"
}

# Функция для развертывания
deploy() {
    print_header "Развертывание системы"
    
    # Остановка существующих контейнеров
    print_status "OK" "Остановка существующих контейнеров"
    docker-compose down 2>/dev/null || true
    
    # Сборка и запуск
    print_status "OK" "Сборка и запуск контейнеров"
    docker-compose up -d --build
    
    # Ожидание запуска
    print_status "OK" "Ожидание запуска сервисов"
    sleep 15
    
    # Проверка статуса
    print_status "OK" "Проверка статуса сервисов"
    if docker-compose ps | grep -q "Up"; then
        print_status "OK" "Сервисы запущены успешно"
    else
        print_status "ERROR" "Ошибка запуска сервисов"
        echo "Логи:"
        docker-compose logs
        exit 1
    fi
}

# Функция для тестирования
test_deployment() {
    print_header "Тестирование развертывания"
    
    # Тест API
    print_status "OK" "Тестирование API"
    if curl -f -s "http://localhost:3000/api/ice-servers" > /dev/null; then
        print_status "OK" "API отвечает корректно"
    else
        print_status "WARNING" "API не отвечает, но развертывание завершено"
    fi
    
    # Тест Redis
    print_status "OK" "Тестирование Redis"
    if docker-compose exec -T redis redis-cli ping | grep -q "PONG"; then
        print_status "OK" "Redis работает корректно"
    else
        print_status "WARNING" "Redis не отвечает"
    fi
    
    # Тест TURN сервера
    print_status "OK" "Тестирование TURN сервера"
    if nc -z localhost 3478 2>/dev/null; then
        print_status "OK" "TURN сервер доступен"
    else
        print_status "WARNING" "TURN сервер недоступен"
    fi
}

# Функция для вывода информации
show_info() {
    print_header "Информация о развертывании"
    
    # Загрузка переменных
    source .env 2>/dev/null || true
    
    echo -e "${CYAN}Домен:${NC} ${DOMAIN:-не настроен}"
    echo -e "${CYAN}API:${NC} http://localhost:3000/api/ice-servers"
    echo -e "${CYAN}Web интерфейс:${NC} http://localhost:3000/call.html"
    
    if [ -n "$DOMAIN" ] && [ "$DOMAIN" != "yourdomain.com" ]; then
        echo -e "${CYAN}Внешний доступ:${NC} https://$DOMAIN"
    fi
    
    echo
    echo -e "${BLUE}Полезные команды:${NC}"
    echo "• Просмотр логов: docker-compose logs -f"
    echo "• Проверка статуса: docker-compose ps"
    echo "• Остановка: docker-compose down"
    echo "• Перезапуск: docker-compose restart"
    echo "• Мониторинг: ./scripts/monitor-system.sh"
    echo "• Проверка здоровья: ./scripts/health-check.sh"
    echo "• Тестирование: ./scripts/run-tests.sh"
    
    echo
    echo -e "${BLUE}Тестирование в браузере:${NC}"
    echo "1. Откройте http://localhost:3000/call.html"
    echo "2. Создайте комнату с ID: test-room"
    echo "3. Откройте вторую вкладку и присоединитесь к той же комнате"
    echo "4. Проверьте видео/аудио соединение"
    
    echo
    echo -e "${BLUE}Тестирование Telegram бота:${NC}"
    if [ -n "$TELEGRAM_BOT_TOKEN" ] && [ "$TELEGRAM_BOT_TOKEN" != "your_telegram_bot_token_here" ]; then
        bot_info=$(curl -s "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getMe" 2>/dev/null)
        if echo "$bot_info" | jq -e '.ok' >/dev/null 2>&1; then
            bot_username=$(echo "$bot_info" | jq -r '.result.username')
            echo "1. Найдите бота: @$bot_username"
            echo "2. Отправьте /start"
            echo "3. Отправьте /call"
            echo "4. Проверьте создание ссылки"
        else
            echo "Ошибка получения информации о боте"
        fi
    else
        echo "Telegram бот не настроен"
    fi
}

# Функция для быстрого тестирования
quick_test() {
    print_header "Быстрое тестирование"
    
    echo "Запуск основных тестов..."
    
    # Тест API
    if curl -f -s "http://localhost:3000/api/ice-servers" > /dev/null; then
        print_status "OK" "API тест пройден"
    else
        print_status "ERROR" "API тест провален"
        return 1
    fi
    
    # Тест Redis
    if docker-compose exec -T redis redis-cli ping | grep -q "PONG"; then
        print_status "OK" "Redis тест пройден"
    else
        print_status "ERROR" "Redis тест провален"
        return 1
    fi
    
    # Тест TURN сервера
    if nc -z localhost 3478 2>/dev/null; then
        print_status "OK" "TURN сервер тест пройден"
    else
        print_status "ERROR" "TURN сервер тест провален"
        return 1
    fi
    
    print_status "OK" "Все основные тесты пройдены"
    return 0
}

# Главное меню
show_menu() {
    echo -e "${BLUE}=== P2P Call App - Быстрое развертывание ===${NC}"
    echo
    echo "Выберите действие:"
    echo "1) Полное развертывание (рекомендуется)"
    echo "2) Только развертывание (без тестов)"
    echo "3) Только тестирование (система уже развернута)"
    echo "4) Проверка здоровья системы"
    echo "5) Мониторинг системы"
    echo "6) Выход"
    echo
    read -p "Введите номер (1-6): " choice
    
    case $choice in
        1) full_deployment ;;
        2) deploy_only ;;
        3) test_only ;;
        4) health_check ;;
        5) monitoring ;;
        6) echo "Выход..."; exit 0 ;;
        *) echo "Неверный выбор"; show_menu ;;
    esac
}

# Полное развертывание
full_deployment() {
    check_dependencies
    setup_env
    check_conflicts
    deploy
    test_deployment
    show_info
    echo
    print_status "OK" "Развертывание завершено успешно!"
}

# Только развертывание
deploy_only() {
    check_dependencies
    setup_env
    check_conflicts
    deploy
    show_info
    echo
    print_status "OK" "Развертывание завершено!"
}

# Только тестирование
test_only() {
    if ! docker-compose ps | grep -q "Up"; then
        print_status "ERROR" "Система не развернута"
        echo "Запустите развертывание сначала"
        exit 1
    fi
    
    if quick_test; then
        print_status "OK" "Тестирование завершено успешно!"
    else
        print_status "ERROR" "Тестирование провалено"
        exit 1
    fi
}

# Проверка здоровья
health_check() {
    if [ -f "scripts/health-check.sh" ]; then
        chmod +x scripts/health-check.sh
        ./scripts/health-check.sh
    else
        print_status "ERROR" "Скрипт проверки здоровья не найден"
    fi
}

# Мониторинг
monitoring() {
    if [ -f "scripts/monitor-system.sh" ]; then
        chmod +x scripts/monitor-system.sh
        ./scripts/monitor-system.sh
    else
        print_status "ERROR" "Скрипт мониторинга не найден"
    fi
}

# Проверка наличия docker-compose.yml
if [ ! -f "docker-compose.yml" ]; then
    print_status "ERROR" "Файл docker-compose.yml не найден"
    echo "Запустите скрипт из директории проекта"
    exit 1
fi

# Запуск
show_menu
