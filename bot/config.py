import os
from dotenv import load_dotenv

# Загружаем переменные окружения из .env файла
load_dotenv()

# Telegram Bot Token
TG_BOT_TOKEN = os.getenv('TG_BOT_TOKEN')

# API базовый URL для системы звонков
CALL_API_BASE = os.getenv('CALL_API_BASE', 'https://call.tgcall.us')

# Проверяем обязательные переменные
if not TG_BOT_TOKEN:
    raise ValueError("TG_BOT_TOKEN is required in environment variables")
