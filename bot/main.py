import asyncio
import logging
import sys
from aiogram import Bot, Dispatcher
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
from config import TG_BOT_TOKEN
from handlers import router

# Настройка логирования
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler('bot.log')
    ]
)

logger = logging.getLogger(__name__)

async def main():
    """Основная функция запуска бота"""
    try:
        # Создаем бота
        bot = Bot(
            token=TG_BOT_TOKEN,
            default=DefaultBotProperties(parse_mode=ParseMode.HTML)
        )
        
        # Создаем диспетчер
        dp = Dispatcher()
        
        # Регистрируем роутеры
        dp.include_router(router)
        
        logger.info("Starting Telegram bot...")
        
        # Запускаем бота
        await dp.start_polling(bot)
        
    except Exception as e:
        logger.error(f"Error starting bot: {e}")
        sys.exit(1)
    finally:
        # Закрываем соединения
        if 'bot' in locals():
            await bot.session.close()

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Bot stopped by user")
    except Exception as e:
        logger.error(f"Unexpected error: {e}")
        sys.exit(1)
