# Импорты для работы с переменными окружения и типизацией
import os
from typing import Optional

# Класс конфигурации для Telegram бота
class BotConfig:
    """Конфигурация для Telegram бота - загрузка параметров из переменных окружения"""
    
    def __init__(self):
        # Загрузка конфигурации из переменных окружения
        self.bot_token: str = os.getenv('TELEGRAM_BOT_TOKEN', '')
        self.server_url: str = os.getenv('SERVER_URL', 'http://localhost:3000')
        self.domain: str = os.getenv('DOMAIN', 'localhost')
        self.log_level: str = os.getenv('LOG_LEVEL', 'INFO')
        
        # Валидация обязательных параметров при инициализации
        if not self.bot_token:
            raise ValueError("TELEGRAM_BOT_TOKEN environment variable is required")
    
    @property
    def is_production(self) -> bool:
        """Проверка, запущен ли бот в продакшене"""
        return os.getenv('NODE_ENV', 'development') == 'production'
    
    @property
    def webhook_url(self) -> Optional[str]:
        """URL для webhook (если используется)"""
        if self.is_production and self.domain != 'localhost':
            return f"https://{self.domain}/webhook/{self.bot_token}"
        return None
    
    def validate(self) -> bool:
        """Валидация конфигурации"""
        try:
            if not self.bot_token:
                return False
            if not self.server_url:
                return False
            return True
        except Exception:
            return False

# Глобальный экземпляр конфигурации для использования в других модулях
config = BotConfig()

