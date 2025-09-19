#!/bin/bash

# SSL Setup Script for P2P Call App
# This script helps set up SSL certificates using Let's Encrypt

set -e

echo "🔐 SSL Certificate Setup for P2P Call App"
echo "=========================================="

# Check if domain is provided
if [ -z "$1" ]; then
    echo "Usage: $0 <domain>"
    echo "Example: $0 yourdomain.com"
    exit 1
fi

DOMAIN=$1
EMAIL=${2:-"admin@$DOMAIN"}

echo "Domain: $DOMAIN"
echo "Email: $EMAIL"
echo ""

# Check if certbot is installed
if ! command -v certbot &> /dev/null; then
    echo "❌ Certbot is not installed"
    echo "Installing certbot..."
    
    # Detect OS and install certbot
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        if command -v apt &> /dev/null; then
            sudo apt update
            sudo apt install -y certbot
        elif command -v yum &> /dev/null; then
            sudo yum install -y certbot
        elif command -v dnf &> /dev/null; then
            sudo dnf install -y certbot
        else
            echo "❌ Unsupported package manager. Please install certbot manually."
            exit 1
        fi
    else
        echo "❌ Unsupported OS. Please install certbot manually."
        exit 1
    fi
fi

echo "✅ Certbot is installed"

# Create ssl directory
mkdir -p ssl

# Stop any services that might be using port 80
echo "🛑 Stopping services on port 80..."
sudo systemctl stop nginx 2>/dev/null || true
sudo systemctl stop apache2 2>/dev/null || true

# Get certificate
echo "🔍 Obtaining SSL certificate for $DOMAIN..."
sudo certbot certonly --standalone --non-interactive --agree-tos --email $EMAIL -d $DOMAIN

# Copy certificates
echo "📋 Copying certificates..."
sudo cp /etc/letsencrypt/live/$DOMAIN/fullchain.pem ssl/cert.pem
sudo cp /etc/letsencrypt/live/$DOMAIN/privkey.pem ssl/key.pem

# Set proper permissions
sudo chown $USER:$USER ssl/cert.pem ssl/key.pem
chmod 644 ssl/cert.pem
chmod 600 ssl/key.pem

echo "✅ SSL certificates installed successfully!"
echo ""
echo "📋 Certificate details:"
echo "   Certificate: ssl/cert.pem"
echo "   Private Key: ssl/key.pem"
echo "   Expires: $(openssl x509 -in ssl/cert.pem -noout -dates | grep notAfter | cut -d= -f2)"
echo ""
echo "🔄 To set up auto-renewal, add this to your crontab:"
echo "   0 12 * * * /usr/bin/certbot renew --quiet && docker-compose restart nginx"
echo ""
echo "🚀 You can now run ./deploy.sh to deploy your application!"

