import hashlib
import logging
from urllib.parse import urlparse

from aiogram import Router, F
from aiogram.filters import Command
from aiogram.types import (
    CallbackQuery,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    InlineQuery,
    InlineQueryResultArticle,
    InputTextMessageContent,
    Message,
)
from call_api import create_call

logger = logging.getLogger(__name__)
router = Router()


def _is_join_link(candidate: str) -> bool:
    """Validate that inline query payload looks like a join link we issued."""
    if not candidate:
        return False
    try:
        parsed = urlparse(candidate)
    except ValueError:
        return False
    if parsed.scheme not in {"https", "http"}:
        return False
    return bool(parsed.netloc)

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


@router.callback_query(F.data.startswith("copy_link:"))
async def callback_copy_link(callback_query: CallbackQuery):
    """Show the join link in an alert so the user can copy it."""
    join_url = callback_query.data[len("copy_link:"):]

    if not join_url:
        await callback_query.answer("Не удалось получить ссылку", show_alert=True)
        return

    await callback_query.answer(f"Скопируйте ссылку:\n{join_url}", show_alert=True)

async def create_call_handler(message: Message, user_id: int = None):
    """Общий обработчик создания звонка"""
    if user_id is None:
        user_id = message.from_user.id
    
    # Отправляем сообщение о начале создания звонка
    status_message = await message.answer("🔄 Создаю звонок...")
    
    try:
        # Определяем initiator ID
        initiator = str(user_id)
        
        # Вызываем API для создания звонка
        data = await create_call(initiator)
        
        # Формируем ответ пользователю
        success_text = (
            f"✅ Звонок создан успешно!\n\n"
            f"🔗 Ссылка для присоединения:\n"
            f"{data['joinUrl']}\n\n"
            f"Поделитесь этой ссылкой с участником звонка."
        )
        
        # Создаем клавиатуру с кнопкой открытия ссылки
        keyboard = InlineKeyboardMarkup(
            inline_keyboard=[
                [
                    InlineKeyboardButton(text="📤 Переслать ссылку", switch_inline_query=data["joinUrl"]),
                    InlineKeyboardButton(text="📋 Скопировать ссылку", callback_data=f"copy_link:{data['joinUrl']}")
                ],
                [InlineKeyboardButton(text="🔄 Создать новый звонок", callback_data="create_call")]
            ]
        )
        
        await status_message.edit_text(success_text, reply_markup=keyboard)
        logger.info(f"Call created successfully for user {user_id}: {data.get('callId')}")
        
    except Exception as e:
        logger.error(f"Error creating call for user {user_id}: {e}")
        
        # Дружелюбное сообщение об ошибке
        error_text = (
            "❌ Произошла ошибка при создании звонка.\n\n"
            "Попробуйте еще раз через несколько секунд."
        )
        
        keyboard = InlineKeyboardMarkup(
            inline_keyboard=[
                [InlineKeyboardButton(text="🔄 Попробовать снова", callback_data="create_call")]
            ]
        )
        
        await status_message.edit_text(error_text, reply_markup=keyboard)

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


@router.inline_query()
async def handle_inline_share(inline_query: InlineQuery):
    """Allow users to forward join links via inline mode."""
    query = inline_query.query.strip()

    if not query:
        await inline_query.answer(
            [],
            is_personal=True,
            cache_time=0,
            switch_pm_text="Создать ссылку",
            switch_pm_parameter="create_call",
        )
        return

    if not _is_join_link(query):
        await inline_query.answer(
            [],
            is_personal=True,
            cache_time=0,
            switch_pm_text="Получить ссылку",
            switch_pm_parameter="create_call",
        )
        return

    result = InlineQueryResultArticle(
        id=hashlib.sha256(query.encode("utf-8")).hexdigest(),
        title="Отправить ссылку на звонок",
        description="Собеседник получит ссылку для подключения",
        input_message_content=InputTextMessageContent(
            message_text=f"Приглашаю тебя на звонок: {query}",
            disable_web_page_preview=True,
        ),
        reply_markup=InlineKeyboardMarkup(
            inline_keyboard=[
                [InlineKeyboardButton(text="Присоединиться к звонку", url=query)]
            ]
        ),
    )

    await inline_query.answer([result], is_personal=True, cache_time=0)
