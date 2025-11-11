#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
ENV_FILE="${ROOT_DIR}/.env"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo ".env file not found at ${ENV_FILE}" >&2
  exit 1
fi

# shellcheck source=/dev/null
set -a
source "${ENV_FILE}"
set +a

if [[ -z "${SERVER_NAME:-}" || -z "${SSL_CERT_HOST_PATH:-}" || -z "${SSL_KEY_HOST_PATH:-}" ]]; then
  echo "SERVER_NAME, SSL_CERT_HOST_PATH, SSL_KEY_HOST_PATH must be set in .env" >&2
  exit 1
fi

EMAIL="${LETSENCRYPT_EMAIL:-}"
if [[ -z "${EMAIL}" ]]; then
  read -r -p "Enter email for Let's Encrypt notifications (leave blank to skip): " EMAIL
fi

if ! command -v certbot >/dev/null 2>&1; then
  echo "certbot is required but not installed." >&2
  exit 1
fi

CERTBOT_ARGS=(certbot certonly --standalone --non-interactive --agree-tos -d "${SERVER_NAME}")
if [[ -n "${EMAIL}" ]]; then
  CERTBOT_ARGS+=(--email "${EMAIL}")
else
  CERTBOT_ARGS+=(--register-unsafely-without-email)
fi

LIVE_DIR="/etc/letsencrypt/live/${SERVER_NAME}"

echo "Requesting certificate for ${SERVER_NAME}..."
"${CERTBOT_ARGS[@]}"

if [[ ! -f "${LIVE_DIR}/fullchain.pem" || ! -f "${LIVE_DIR}/privkey.pem" ]]; then
  echo "Certificate files not found in ${LIVE_DIR}" >&2
  exit 1
fi

echo "Copying certificates to target paths..."
sudo install -D -m 0644 "${LIVE_DIR}/fullchain.pem" "${SSL_CERT_HOST_PATH}"
sudo install -D -m 0600 "${LIVE_DIR}/privkey.pem" "${SSL_KEY_HOST_PATH}"

echo "Certificates installed:"
ls -l "${SSL_CERT_HOST_PATH}" "${SSL_KEY_HOST_PATH}"
