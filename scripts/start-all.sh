#!/bin/bash

# Script to start all WebRTC services and verify they're working
# This script sets up SSL certificates, starts services, and runs health checks

set -e

echo "=== WebRTC Services Startup Script ==="
echo "Timestamp: $(date)"
echo

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    local status=$1
    local message=$2
    case $status in
        "info")
            echo -e "${BLUE}ℹ${NC} $message"
            ;;
        "success")
            echo -e "${GREEN}✓${NC} $message"
            ;;
        "warning")
            echo -e "${YELLOW}⚠${NC} $message"
            ;;
        "error")
            echo -e "${RED}✗${NC} $message"
            ;;
    esac
}

# Check if .env file exists
if [ ! -f ".env" ]; then
    print_status "warning" ".env file not found, creating from example..."
    cp env.example .env
    print_status "info" "Please edit .env file with your configuration before continuing"
    print_status "info" "Required variables: TELEGRAM_BOT_TOKEN, DOMAIN, TURN_USERNAME, TURN_PASSWORD, TURN_SECRET"
    exit 1
fi

# Load environment variables
source .env

# Check required variables
if [ -z "$DOMAIN" ]; then
    print_status "error" "DOMAIN not set in .env file"
    exit 1
fi

print_status "info" "Domain: $DOMAIN"
print_status "info" "Starting WebRTC services..."

# Create SSL directory if it doesn't exist
mkdir -p ssl

# Generate SSL certificates if they don't exist
if [ ! -f "ssl/turnserver.pem" ] || [ ! -f "ssl/turnserver.key" ]; then
    print_status "info" "Generating SSL certificates for TURN server..."
    if [ -f "scripts/setup-turn-ssl.sh" ]; then
        chmod +x scripts/setup-turn-ssl.sh
        ./scripts/setup-turn-ssl.sh "$DOMAIN"
        print_status "success" "SSL certificates generated"
    else
        print_status "warning" "SSL setup script not found, creating basic certificates..."
        # Create basic self-signed certificates
        openssl req -x509 -newkey rsa:2048 -keyout ssl/turnserver.key -out ssl/turnserver.pem -days 365 -nodes -subj "/CN=$DOMAIN"
        chmod 600 ssl/turnserver.key
        chmod 644 ssl/turnserver.pem
        print_status "success" "Basic SSL certificates created"
    fi
else
    print_status "success" "SSL certificates already exist"
fi

# Stop any existing containers
print_status "info" "Stopping existing containers..."
docker-compose down 2>/dev/null || true

# Build and start services
print_status "info" "Building and starting services..."
docker-compose up -d --build

# Wait for services to start
print_status "info" "Waiting for services to start..."
sleep 10

# Check if services are running
print_status "info" "Checking service status..."

# Check main app
if docker-compose ps app | grep -q "Up"; then
    print_status "success" "Main application is running"
else
    print_status "error" "Main application failed to start"
    docker-compose logs app
    exit 1
fi

# Check Redis
if docker-compose ps redis | grep -q "Up"; then
    print_status "success" "Redis is running"
else
    print_status "error" "Redis failed to start"
    docker-compose logs redis
    exit 1
fi

# Check TURN server
if docker-compose ps turnserver | grep -q "Up"; then
    print_status "success" "TURN server is running"
else
    print_status "error" "TURN server failed to start"
    docker-compose logs turnserver
    exit 1
fi

# Check Nginx (if running)
if docker-compose ps nginx | grep -q "Up"; then
    print_status "success" "Nginx is running"
else
    print_status "warning" "Nginx is not running (this is normal for development)"
fi

# Run health checks
print_status "info" "Running health checks..."

# Check main app health
if curl -s -f "http://localhost:3000/health" > /dev/null 2>&1; then
    print_status "success" "Main application health check passed"
else
    print_status "warning" "Main application health check failed"
fi

# Check ICE servers API
if curl -s -f "http://localhost:3000/api/ice-servers" > /dev/null 2>&1; then
    print_status "success" "ICE servers API is responding"
else
    print_status "warning" "ICE servers API is not responding"
fi

# Check TURN server port
if timeout 3 bash -c "</dev/tcp/localhost/3478" 2>/dev/null; then
    print_status "success" "TURN server port 3478 is accessible"
else
    print_status "warning" "TURN server port 3478 is not accessible"
fi

# Display service URLs
echo
print_status "info" "Service URLs:"
echo "  Main App: http://localhost:3000"
echo "  ICE Servers API: http://localhost:3000/api/ice-servers"
echo "  TURN Server: turn://$DOMAIN:3478"
echo "  TURNS Server: turns://$DOMAIN:5349"

# Display container status
echo
print_status "info" "Container Status:"
docker-compose ps

# Display logs command
echo
print_status "info" "To view logs:"
echo "  All services: docker-compose logs -f"
echo "  Main app: docker-compose logs -f app"
echo "  TURN server: docker-compose logs -f turnserver"
echo "  Redis: docker-compose logs -f redis"

# Display health check command
echo
print_status "info" "To run health checks:"
echo "  ./scripts/check-services.sh"

echo
print_status "success" "WebRTC services startup completed!"
print_status "info" "Your WebRTC application is ready to use."

# Check if Telegram bot token is set
if [ -z "$TELEGRAM_BOT_TOKEN" ] || [ "$TELEGRAM_BOT_TOKEN" = "your_telegram_bot_token_here" ]; then
    print_status "warning" "Telegram bot token not configured. Please set TELEGRAM_BOT_TOKEN in .env file"
fi

echo
print_status "info" "Next steps:"
echo "  1. Configure your Telegram bot token in .env file"
echo "  2. Test the application by visiting http://localhost:3000"
echo "  3. Create a room and test WebRTC functionality"
echo "  4. Check logs if you encounter any issues"

