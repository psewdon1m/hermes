import os
from dotenv import load_dotenv

# Р—Р°РіСЂСѓР¶Р°РµРј РїРµСЂРµРјРµРЅРЅС‹Рµ РѕРєСЂСѓР¶РµРЅРёСЏ РёР· .env С„Р°Р№Р»Р°
load_dotenv()

# Telegram Bot Token
TG_BOT_TOKEN = os.getenv('TG_BOT_TOKEN')

# API Р±Р°Р·РѕРІС‹Р№ URL РґР»СЏ СЃРёСЃС‚РµРјС‹ Р·РІРѕРЅРєРѕРІ
CALL_API_BASE = os.getenv('CALL_API_BASE', 'https://example.com')

# РџСЂРѕРІРµСЂСЏРµРј РѕР±СЏР·Р°С‚РµР»СЊРЅС‹Рµ РїРµСЂРµРјРµРЅРЅС‹Рµ
if not TG_BOT_TOKEN:
    raise ValueError("TG_BOT_TOKEN is required in environment variables")

