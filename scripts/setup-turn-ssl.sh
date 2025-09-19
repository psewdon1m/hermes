#!/bin/bash

# Script to generate SSL certificates for TURN server
# This script creates self-signed certificates for development
# For production, use proper certificates from a CA

set -e

SSL_DIR="./ssl"
DOMAIN=${1:-"localhost"}

echo "Setting up SSL certificates for TURN server..."
echo "Domain: $DOMAIN"

# Create SSL directory if it doesn't exist
mkdir -p "$SSL_DIR"

# Generate private key
echo "Generating private key..."
openssl genrsa -out "$SSL_DIR/turnserver.key" 2048

# Generate certificate signing request
echo "Generating certificate signing request..."
openssl req -new -key "$SSL_DIR/turnserver.key" -out "$SSL_DIR/turnserver.csr" -subj "/C=US/ST=State/L=City/O=Organization/CN=$DOMAIN"

# Generate self-signed certificate
echo "Generating self-signed certificate..."
openssl x509 -req -days 365 -in "$SSL_DIR/turnserver.csr" -signkey "$SSL_DIR/turnserver.key" -out "$SSL_DIR/turnserver.pem"

# Set proper permissions
chmod 600 "$SSL_DIR/turnserver.key"
chmod 644 "$SSL_DIR/turnserver.pem"

# Clean up CSR file
rm "$SSL_DIR/turnserver.csr"

echo "SSL certificates generated successfully!"
echo "Certificate: $SSL_DIR/turnserver.pem"
echo "Private key: $SSL_DIR/turnserver.key"

# Also create certificates for nginx if they don't exist
if [ ! -f "$SSL_DIR/cert.pem" ] || [ ! -f "$SSL_DIR/key.pem" ]; then
    echo "Creating nginx SSL certificates..."
    
    # Generate nginx private key
    openssl genrsa -out "$SSL_DIR/key.pem" 2048
    
    # Generate nginx certificate
    openssl req -new -x509 -key "$SSL_DIR/key.pem" -out "$SSL_DIR/cert.pem" -days 365 -subj "/C=US/ST=State/L=City/O=Organization/CN=$DOMAIN"
    
    chmod 600 "$SSL_DIR/key.pem"
    chmod 644 "$SSL_DIR/cert.pem"
    
    echo "Nginx SSL certificates created!"
fi

echo "SSL setup complete!"

