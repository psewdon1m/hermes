#!/bin/sh
set -e

: "${SERVER_NAME:=localhost}"
: "${API_UPSTREAM:=api:8080}"
: "${SIGNAL_UPSTREAM:=signal:8081}"
: "${SSL_CERT_PATH:=/etc/nginx/certs/fullchain.pem}"
: "${SSL_KEY_PATH:=/etc/nginx/certs/privkey.pem}"

export SERVER_NAME API_UPSTREAM SIGNAL_UPSTREAM SSL_CERT_PATH SSL_KEY_PATH

envsubst '$SERVER_NAME $API_UPSTREAM $SIGNAL_UPSTREAM $SSL_CERT_PATH $SSL_KEY_PATH' < /etc/nginx/templates/nginx.conf.template > /etc/nginx/nginx.conf

exec nginx -g 'daemon off;'
