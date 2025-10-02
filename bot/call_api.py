import httpx
import logging
from config import CALL_API_BASE

logger = logging.getLogger(__name__)

async def create_call(initiator_id: str) -> dict:
    """
    Создает новый звонок через API
    
    Args:
        initiator_id: Telegram ID инициатора звонка
        
    Returns:
        dict: Данные созданного звонка
        
    Raises:
        httpx.TimeoutException: При таймауте запроса
        httpx.HTTPStatusError: При ошибке HTTP
        Exception: При других ошибках
    """
    payload = {"initiator_telegram_id": initiator_id}
    
    try:
        async with httpx.AsyncClient(base_url=CALL_API_BASE, timeout=5) as client:
            resp = await client.post("/api/call/create", json=payload)
            resp.raise_for_status()
            return resp.json()
    except httpx.TimeoutException as e:
        logger.error(f"Timeout creating call for user {initiator_id}: {e}")
        raise
    except httpx.HTTPStatusError as e:
        logger.error(f"HTTP error creating call for user {initiator_id}: {e.response.status_code} - {e.response.text}")
        raise
    except Exception as e:
        logger.error(f"Unexpected error creating call for user {initiator_id}: {e}")
        raise
