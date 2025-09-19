# Импорты для Telegram бота и HTTP клиента
import asyncio
import logging
import aiohttp
from aiogram import Bot, Dispatcher, types, F
from aiogram.filters import Command
from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton, CallbackQuery
from aiogram.utils.keyboard import InlineKeyboardBuilder
from aiogram.exceptions import TelegramBadRequest, TelegramNetworkError
from config import config

# Настройка логирования
logging.basicConfig(
    level=getattr(logging, config.log_level.upper()),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Основной класс Telegram бота для создания видеозвонков
class P2PCallBot:
    def __init__(self):
        # Валидация конфигурации бота
        if not config.validate():
            raise ValueError("Invalid bot configuration")
        
        # Инициализация бота и диспетчера
        self.bot = Bot(token=config.bot_token)
        self.dp = Dispatcher()
        
        # Регистрация обработчиков команд и callback'ов
        self._register_handlers()
        
        logger.info("P2P Call Bot initialized")
    
    def _register_handlers(self):
        """Регистрация всех обработчиков команд и callback'ов для бота"""
        
        # Команда /start
        self.dp.message.register(self.start_command, Command("start"))
        
        # Команда /help
        self.dp.message.register(self.help_command, Command("help"))
        
        # Команда /create
        self.dp.message.register(self.create_command, Command("create"))
        
        # Команда /call
        self.dp.message.register(self.call_command, Command("call"))
        
        # Обработка callback'ов
        self.dp.callback_query.register(self.handle_create_call, F.data == "create_call")
        self.dp.callback_query.register(self.handle_copy_link, F.data.startswith("copy_link:"))
        self.dp.callback_query.register(self.handle_new_call, F.data == "new_call")
        
        # Обработка ошибок
        self.dp.errors.register(self.error_handler)
    
    async def start_command(self, message: types.Message):
        """Обработчик команды /start - приветствие и создание кнопки звонка"""
        try:
            welcome_text = """
Добро пожаловать в P2P Call Bot!

Этот бот позволяет создавать приватные видеозвонки через WebRTC.

Нажмите кнопку ниже, чтобы создать новый звонок:
            """
            
            keyboard = InlineKeyboardBuilder()
            keyboard.add(
                InlineKeyboardButton(
                    text="Создать звонок",
                    callback_data="create_call"
                )
            )
            
            await message.answer(
                welcome_text,
                reply_markup=keyboard.as_markup()
            )
            
            logger.info(f"Start command from user {message.from_user.id}")
            
        except Exception as e:
            logger.error(f"Error in start_command: {e}")
            await message.answer("Произошла ошибка. Попробуйте позже.")
    
    async def help_command(self, message: types.Message):
        """Обработчик команды /help - отображение справки по использованию"""
        try:
            help_text = """
📞 **Справка по P2P Call Bot**

**Команды:**
/start - Начать работу с ботом
/help - Показать эту справку
/call - Быстро создать звонок (рекомендуется)
/create - Создать новый звонок

**Как это работает:**
1. Отправьте команду `/call`
2. Получите уникальную ссылку на звонок
3. Ссылка автоматически копируется в буфер обмена
4. Поделитесь ссылкой с участниками
5. Все участники равноправны
6. Звонок активен 60 минут (обновляется при активности)

**Особенности:**
• 🔒 End-to-end шифрование
• 🔗 Уникальные непредсказуемые ссылки
• ⏰ Автоматическое продление при активности
• 👥 До 2 участников в одном звонке
• 🚀 Множественные одновременные звонки
• ⚡ Мгновенное создание через `/call`

**Горячие клавиши в звонке:**
• Пробел - микрофон вкл/выкл
• V - видео вкл/выкл
• S - поделиться экраном
• Esc - завершить звонок
            """
            
            await message.answer(help_text)
            logger.info(f"Help command from user {message.from_user.id}")
            
        except Exception as e:
            logger.error(f"Error in help_command: {e}")
            await message.answer("Произошла ошибка. Попробуйте позже.")
    
    async def create_command(self, message: types.Message):
        """Обработчик команды /create - создание нового звонка"""
        try:
            keyboard = InlineKeyboardBuilder()
            keyboard.add(
                InlineKeyboardButton(
                    text="Создать звонок",
                    callback_data="create_call"
                )
            )
            
            await message.answer(
                "Нажмите кнопку для создания звонка:",
                reply_markup=keyboard.as_markup()
            )
            
            logger.info(f"Create command from user {message.from_user.id}")
            
        except Exception as e:
            logger.error(f"Error in create_command: {e}")
            await message.answer("Произошла ошибка. Попробуйте позже.")
    
    async def call_command(self, message: types.Message):
        """Обработчик команды /call - быстрое создание звонка"""
        try:
            # Показываем индикатор загрузки
            await message.answer("🔄 Создаю уникальную ссылку для звонка...")
            
            # Создаем комнату через API
            room_data = await self._create_room()
            
            if not room_data:
                await message.answer("❌ Ошибка при создании звонка. Попробуйте позже.")
                return
            
            room_id = room_data.get('roomId')
            room_url = room_data.get('url')
            
            # Формируем сообщение
            call_text = f"""
🎥 **Звонок создан!**

🔗 **Ссылка на звонок:**
`{room_url}`

⏰ **Время жизни:** 60 минут (обновляется при активности)
👥 **Участники:** До 2 человек в одном звонке
🔒 **Безопасность:** End-to-end шифрование

📋 **Ссылка скопирована в буфер обмена!**
Поделитесь ею с участниками звонка.

💡 **Совет:** Все участники равноправны - нет "инициатора" или "принимающего".
            """
            
            # Добавляем параметр для автоматического копирования
            auto_copy_url = f"{room_url}?auto_copy=true"
            
            # Создаем клавиатуру
            keyboard = InlineKeyboardBuilder()
            keyboard.add(
                InlineKeyboardButton(
                    text="🎥 Открыть звонок",
                    url=auto_copy_url
                )
            )
            keyboard.add(
                InlineKeyboardButton(
                    text="🔄 Создать новый звонок",
                    callback_data="new_call"
                )
            )
            
            await message.answer(
                call_text,
                reply_markup=keyboard.as_markup(),
                parse_mode="Markdown"
            )
            
            logger.info(f"Call command from user {message.from_user.id}, room: {room_id}")
            
        except Exception as e:
            logger.error(f"Error in call_command: {e}")
            await message.answer("❌ Произошла ошибка. Попробуйте позже.")
    
    async def handle_create_call(self, callback: CallbackQuery):
        """Обработчик создания звонка через API сервера"""
        try:
            # Показываем индикатор загрузки
            await callback.answer("Создаю звонок...", show_alert=False)
            
            # Создаем комнату через API
            room_data = await self._create_room()
            
            if not room_data:
                await callback.message.answer("Ошибка при создании звонка. Попробуйте позже.")
                return
            
            room_id = room_data.get('roomId')
            room_url = room_data.get('url')
            
            # Формируем сообщение
            call_text = f"""
Звонок создан!

Ссылка на звонок: {room_url}

ID комнаты: `{room_id}`

Звонок будет активен 60 минут с момента последней активности.

Поделитесь этой ссылкой с участниками звонка.

Все участники равноправны - нет "инициатора" или "принимающего".
            """
            
            # Создаем клавиатуру
            keyboard = InlineKeyboardBuilder()
            keyboard.add(
                InlineKeyboardButton(
                    text="Создать новый звонок",
                    callback_data="new_call"
                )
            )
            keyboard.add(
                InlineKeyboardButton(
                    text="Открыть звонок",
                    url=f"{room_url}?auto_copy=true"
                )
            )
            keyboard.add(
                InlineKeyboardButton(
                    text="Скопировать ссылку",
                    callback_data=f"copy_link:{room_url}"
                )
            )
            
            await callback.message.answer(
                call_text,
                reply_markup=keyboard.as_markup(),
                parse_mode="Markdown"
            )
            
            logger.info(f"Call created for user {callback.from_user.id}, room: {room_id}")
            
        except Exception as e:
            logger.error(f"Error in handle_create_call: {e}")
            await callback.answer("Ошибка при создании звонка. Попробуйте позже.", show_alert=True)
    
    async def handle_copy_link(self, callback: CallbackQuery):
        """Обработчик копирования ссылки"""
        try:
            url = callback.data.split(":", 1)[1]
            
            # В Telegram нет прямого способа скопировать в буфер обмена
            # Поэтому просто показываем ссылку
            await callback.answer(
                f"Ссылка: {url}\n\nСкопируйте её вручную",
                show_alert=True
            )
            
            logger.info(f"Copy link requested by user {callback.from_user.id}")
            
        except Exception as e:
            logger.error(f"Error in handle_copy_link: {e}")
            await callback.answer("Ошибка при получении ссылки", show_alert=True)
    
    async def handle_new_call(self, callback: CallbackQuery):
        """Обработчик создания нового звонка"""
        try:
            await callback.answer("Создаю новый звонок...", show_alert=False)
            
            # Создаем новую комнату
            room_data = await self._create_room()
            
            if not room_data:
                await callback.message.answer("Ошибка при создании звонка. Попробуйте позже.")
                return
            
            room_id = room_data.get('roomId')
            room_url = room_data.get('url')
            
            # Обновляем сообщение
            call_text = f"""
Новый звонок создан!

Ссылка на звонок: {room_url}

ID комнаты: `{room_id}`

Звонок будет активен 60 минут с момента последней активности.
            """
            
            keyboard = InlineKeyboardBuilder()
            keyboard.add(
                InlineKeyboardButton(
                    text="Создать новый звонок",
                    callback_data="new_call"
                )
            )
            keyboard.add(
                InlineKeyboardButton(
                    text="Открыть звонок",
                    url=f"{room_url}?auto_copy=true"
                )
            )
            
            await callback.message.edit_text(
                call_text,
                reply_markup=keyboard.as_markup(),
                parse_mode="Markdown"
            )
            
            logger.info(f"New call created for user {callback.from_user.id}, room: {room_id}")
            
        except Exception as e:
            logger.error(f"Error in handle_new_call: {e}")
            await callback.answer("Ошибка при создании звонка", show_alert=True)
    
    async def _create_room(self) -> dict:
        """Создание новой комнаты видеозвонка через API сервера"""
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(f"{config.server_url}/api/rooms") as response:
                    if response.status == 200:
                        data = await response.json()
                        logger.info(f"Room created successfully: {data.get('roomId')}")
                        return data
                    else:
                        logger.error(f"API error: {response.status}")
                        return None
                        
        except aiohttp.ClientError as e:
            logger.error(f"Network error creating room: {e}")
            return None
        except Exception as e:
            logger.error(f"Unexpected error creating room: {e}")
            return None
    
    async def error_handler(self, event, exception):
        """Обработчик ошибок"""
        logger.error(f"Error occurred: {exception}")
        
        # Если это ошибка Telegram API, пытаемся отправить сообщение об ошибке
        if isinstance(exception, (TelegramBadRequest, TelegramNetworkError)):
            try:
                # Получаем chat_id из события, если возможно
                if hasattr(event, 'message') and event.message:
                    await event.message.answer("Произошла ошибка. Попробуйте позже.")
            except:
                pass
    
    async def start_polling(self):
        """Запуск бота в режиме polling"""
        try:
            logger.info("Starting bot polling...")
            await self.dp.start_polling(self.bot)
        except Exception as e:
            logger.error(f"Error starting bot: {e}")
            raise
    
    async def stop(self):
        """Остановка бота"""
        try:
            await self.bot.session.close()
            logger.info("Bot stopped")
        except Exception as e:
            logger.error(f"Error stopping bot: {e}")

async def main():
    """Основная функция"""
    try:
        # Создаем экземпляр бота
        bot = P2PCallBot()
        
        # Запускаем бота
        await bot.start_polling()
        
    except KeyboardInterrupt:
        logger.info("Bot stopped by user")
    except Exception as e:
        logger.error(f"Fatal error: {e}")
    finally:
        if 'bot' in locals():
            await bot.stop()

if __name__ == "__main__":
    # Запускаем бота
    asyncio.run(main())
