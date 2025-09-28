import os
from dotenv import load_dotenv

# Загружаем переменные окружения из .env файла
load_dotenv()

# Telegram Bot Token
TG_BOT_TOKEN = os.getenv('TG_BOT_TOKEN')

# Проверяем обязательные переменные
if not TG_BOT_TOKEN:
    raise ValueError("TG_BOT_TOKEN is required in environment variables")
