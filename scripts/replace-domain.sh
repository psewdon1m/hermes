#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
ENV_FILE="${ROOT_DIR}/.env"

DEFAULT_CURRENT_DOMAIN="${1:-example.com}"
NEW_FROM_ENV=""

if [[ -f "${ENV_FILE}" ]]; then
  NEW_FROM_ENV="$(grep -E '^SERVER_NAME=' "${ENV_FILE}" | tail -n1 | cut -d'=' -f2- | tr -d '\"' || true)"
fi

DEFAULT_NEW_DOMAIN="${NEW_FROM_ENV:-example.com}"

read -r -p "Текущий домен [${DEFAULT_CURRENT_DOMAIN}]: " CURRENT_DOMAIN
CURRENT_DOMAIN="${CURRENT_DOMAIN:-$DEFAULT_CURRENT_DOMAIN}"

read -r -p "Новый домен [${DEFAULT_NEW_DOMAIN}]: " NEW_DOMAIN
NEW_DOMAIN="${NEW_DOMAIN:-$DEFAULT_NEW_DOMAIN}"

echo "Ищем '${CURRENT_DOMAIN}' в ${ROOT_DIR}..."

if command -v rg >/dev/null 2>&1; then
  MATCHED_FILES="$(rg --files-with-matches --fixed-strings "${CURRENT_DOMAIN}" \
    --hidden --glob '!.git/*' --glob '!node_modules/*' --glob '!*.log' "${ROOT_DIR}" || true)"
else
  echo "Предупреждение: ripgrep (rg) не найден, используется grep." >&2
  MATCHED_FILES="$(grep -rl --binary-files=without-match --fixed-strings \
    --exclude-dir='.git' --exclude-dir='node_modules' --exclude='*.log' \
    "${CURRENT_DOMAIN}" "${ROOT_DIR}" || true)"
fi

if [[ -z "${MATCHED_FILES}" ]]; then
  echo "Совпадений не найдено."
  exit 0
fi

echo "Найдены файлы:"
echo "${MATCHED_FILES}"

read -r -p "Заменить ${CURRENT_DOMAIN} -> ${NEW_DOMAIN}? [y/N]: " CONFIRM
if [[ ! "${CONFIRM}" =~ ^[Yy]$ ]]; then
  echo "Отменено."
  exit 0
fi

while IFS= read -r FILE; do
  [[ -z "${FILE}" ]] && continue
  perl -0pi -e "s/\Q${CURRENT_DOMAIN}\E/${NEW_DOMAIN}/g" "${FILE}"
done <<< "${MATCHED_FILES}"

echo "Готово."
