import logging
from aiogram import Router, F
from aiogram.types import Message, InlineKeyboardMarkup, InlineKeyboardButton
from aiogram.filters import Command

logger = logging.getLogger(__name__)
router = Router()

@router.message(Command("start"))
async def cmd_start(message: Message):
    """Обработчик команды /start"""
    welcome_text = (
        "🎥 Добро пожаловать в бот для видеозвонков!\n\n"
        "Используйте команду /createCall для создания нового звонка.\n"
        "После создания вы получите ссылку для присоединения к звонку."
    )
    
    # Создаем клавиатуру с кнопкой создания звонка
    keyboard = InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text="📞 Создать звонок", callback_data="create_call")]
        ]
    )
    
    await message.answer(welcome_text, reply_markup=keyboard)
    logger.info(f"User {message.from_user.id} started the bot")

@router.message(Command("createCall"))
async def cmd_create_call(message: Message):
    """Обработчик команды /createCall"""
    await create_call_handler(message)

@router.callback_query(F.data == "create_call")
async def callback_create_call(callback_query):
    """Обработчик нажатия кнопки создания звонка"""
    await callback_query.answer()
    await create_call_handler(callback_query.message, callback_query.from_user.id)

async def create_call_handler(message: Message, user_id: int = None):
    """Общий обработчик создания звонка"""
    if user_id is None:
        user_id = message.from_user.id
    
    # Простейший ответ для первого этапа
    simple_text = (
        "🎥 Функция создания звонка будет доступна в следующей версии!\n\n"
        "Пока что бот работает в тестовом режиме."
    )
    
    # Простая клавиатура
    keyboard = InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text="🔄 Попробовать снова", callback_data="create_call")]
        ]
    )
    
    await message.answer(simple_text, reply_markup=keyboard)
    logger.info(f"User {user_id} tried to create call (test mode)")

@router.message()
async def handle_other_messages(message: Message):
    """Обработчик всех остальных сообщений"""
    help_text = (
        "🤖 Я бот для создания видеозвонков!\n\n"
        "Доступные команды:\n"
        "• /start - начать работу с ботом\n"
        "• /createCall - создать новый звонок\n\n"
        "Или используйте кнопки в меню."
    )
    
    keyboard = InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text="📞 Создать звонок", callback_data="create_call")]
        ]
    )
    
    await message.answer(help_text, reply_markup=keyboard)
