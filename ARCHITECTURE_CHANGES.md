# Архитектурные изменения - Двухфазное рукопожатие

## Обзор
Реализована новая архитектура с четким разделением на две фазы:
1. **Фаза 1: Сигналинг** - WebSocket соединение, идентификация пиров
2. **Фаза 2: Медиа** - WebRTC соединение, обмен медиа-потоками

## Новые файлы

### `web/signaling-session.js`
- **SignalingSession** класс для управления WebSocket (ES-модуль)
- Автоматические ретраи и refresh токенов
- Управление peer идентификацией и politeness
- Логирование с префиксом `[signal]`
- Экспортируется как `export class SignalingSession`

### `web/media-session.js`  
- **MediaSession** класс с состояниями: `idle → preparing → active` (ES-модуль)
- Управление RTCPeerConnection и медиа-треками
- Автоматическое восстановление треков с таймаутами
- Логирование с префиксом `[media]`
- Экспортируется как `export class MediaSession`

## Изменения в `web/client.js`
- Превращен в ES-модуль с импортами классов
- Удалена старая монолитная логика
- Интеграция с новыми классами через конструкторы
- Обновлены обработчики кнопок и UI
- Улучшенное логирование

## Изменения в `web/index.html`
- Убраны отдельные подключения JS файлов
- Остался только ES-модуль `client.js`
- Сохранена обратная совместимость

## Ключевые улучшения

### 1. Стабильность соединения
- Сигналинг переживает смену сети
- Медиа-фаза перезапускается независимо
- Автоматическое восстановление при сбоях

### 2. Улучшенная диагностика
- Четкие префиксы: `[signal]`, `[media]`, `[recover]`
- Состояния машин: `idle`, `preparing`, `active`
- Детальное логирование всех операций

### 3. Автоматизация
- Нет ручных "разрешите доступ"
- Автоматическое восстановление треков
- Умные retry с таймаутами

### 4. UX улучшения
- Пользователь может "присутствовать" без камеры/микрофона
- Медиа подключается автоматически при получении разрешений
- Информативные сообщения в UI

### 5. Защита startNegotiation()
- Проверка готовности RTCPeerConnection перед началом переговоров
- Флаг `pendingNegotiation` для отложенных переговоров
- Автоматическое выполнение отложенных переговоров после создания PC
- Детальное логирование состояний и причин пропуска переговоров

### 6. Двухуровневая защита RTCPeerConnection
- **Первый эшелон**: Создание PC до `prepareLocalMedia()` для готовности к первому offer
- **Второй эшелон**: Проверка `if (!this.pc)` в `handleOffer()` с сохранением в `pendingRemoteOffer`
- Автоматическая обработка отложенных offer после создания PC
- Функция `attachLocalTracksToPC()` для добавления треков к существующему PC

### 7. Управление локальными треками
- **Флаг localTracksReady**: Контроль готовности локальных треков для переговоров
- **Отложенные переговоры**: Не отправляем offer до готовности локальных треков
- **replaceTrack**: Использование `transceiver.sender.replaceTrack()` вместо `addTrack`
- **Автоматические переговоры**: `requestNegotiation()` после добавления/восстановления треков
- **Мониторинг исходящего трафика**: Автоматическое восстановление при остановке отправки

### 8. Система явных статусов
- **Четкая последовательность**: `idle → signal-request → signal-ready → media-request → media-ready → pc-ready → negotiating → connected`
- **Дополнительные статусы**: `media-stalled`, `recovering`, `disconnected`, `failed`
- **Логирование переходов**: `[status] old -> new (reason)` для всех изменений
- **Контроль этапов**: Проверка текущего статуса перед переходом к следующему
- **Диагностика**: Легко определить, на каком этапе остановился процесс

### 9. Улучшенная обработка удаленных потоков
- **Единый remoteStream**: Создается один раз в newPC() и переиспользуется
- **Двойной путь ontrack**: Поддержка ev.streams[0] и fallback на ev.track
- **Защита от дублирования**: Проверка `remoteStream.getTracks().includes(track)` перед добавлением
- **Детальное логирование**: Отслеживание fallback случаев, дублирования и состояний треков
- **Стабильность видео**: Избежание потери кадров при пересоздании потоков
- **Правильный timing localTracksReady**: Флаг устанавливается только после реальной готовности треков

## Логирование

### Сигналинг (`[signal]`)
- `join ok` - успешное подключение
- `ws open/close` - состояние WebSocket
- `peers` - список участников
- `retry` - попытки переподключения

### Медиа (`[media]`)
- `state change` - переходы состояний
- `preparing local media` - подготовка медиа
- `track ended/recovered` - события треков
- `stats` - статистика RTP
- `startNegotiation skipped: pc not ready` - защита от преждевременных переговоров
- `startNegotiation pending` - отложенные переговоры
- `executing pending negotiation` - выполнение отложенных переговоров
- `handleOffer: PC not ready, storing offer for later` - сохранение offer при отсутствии PC
- `executing pending remote offer` - выполнение отложенного offer
- `newPC: no local tracks to attach yet` - PC создан без треков
- `attachLocalTracksToPC senders` - добавление треков к существующему PC
- `startNegotiation skipped: local tracks not ready` - отложенные переговоры до готовности треков
- `requestNegotiation` - запрос переговоров с указанием причины
- `replaceTrack` - замена трека в существующем sender
- `attachLocalTracksToPC: no tracks to attach (recvonly mode)` - переход в recvonly режим
- `WARNING: outbound stalled with local tracks ready` - предупреждение об остановке исходящего трафика

### Статусы (`[status]`)
- `idle → signal-request` - начало запроса параметров подключения
- `signal-request → signal-ready` - получены параметры подключения
- `signal-ready → media-request` - запрос доступа к медиа-устройствам
- `media-request → media-ready` - медиа готовы (треки получены или recvonly)
- `media-ready → pc-ready` - RTCPeerConnection создан и настроен
- `pc-ready → negotiating` - начат обмен SDP
- `negotiating → connected` - установлено соединение
- `connected → media-stalled` - остановлен исходящий трафик
- `connected → recovering` - восстановление треков
- `connected → disconnected` - потеряно соединение
- `recovering → failed` - исчерпаны попытки восстановления

### Удаленные потоки (`[media]`)
- `ontrack stream X tracks` - получен поток с несколькими треками
- `ontrack fallback` - fallback на прямое добавление трека
- `ontrack duplicate` - попытка добавить уже существующий трек
- `remote attach tracks=[...]` - состояние удаленных треков

### Восстановление (`[recover]`)
- `recover start/exit` - начало/конец восстановления
- `replaceTrack attempt/success` - замена треков
- `TIMEOUT` - таймауты getUserMedia

## Тестирование
Рекомендуется протестировать:
1. Подключение с/без камеры/микрофона
2. Отключение/включение устройств во время звонка
3. Смена сети (WiFi ↔ мобильный)
4. Обновление страницы
5. Попытки третьего участника (room-full)

## Решение проблемы области видимости

### Проблема
Изначально классы подключались как обычные скрипты, а `client.js` как ES-модуль. Это приводило к ошибке `TypeError: log is not a function`, так как функция `log` была недоступна в глобальной области видимости.

Дополнительно, DOM элементы `vLocal` и `vRemote` были определены только в `client.js` и недоступны в `MediaSession`, что вызывало `ReferenceError: vLocal is not defined`.

### Решение
1. **Превратили все файлы в ES-модули**:
   - `signaling-session.js` → `export class SignalingSession`
   - `media-session.js` → `export class MediaSession`

2. **Импорт в client.js**:
   ```javascript
   import { SignalingSession } from './signaling-session.js';
   import { MediaSession } from './media-session.js';
   ```

3. **Передача зависимостей через конструкторы**:
   ```javascript
   signalingSession = new SignalingSession(log, api, rid, wsRetryLimit, wsRetryDelayMs);
   mediaSession = new MediaSession(signalingSession, log, logPermissionsInfo, resumePlay, debugSDP, vLocal, vRemote, diagEl);
   ```
   - Все функции (`log`, `api`, `resumePlay`) передаются как параметры
   - DOM ???????? (`vLocal`, `vRemote`, `diagEl`) ?????????? ? ???????????
   - Никаких глобальных зависимостей в модулях

4. **Упростили HTML**:
   ```html
   <script type="module" src="/client.js"></script>
   ```

## Обратная совместимость
- API endpoints остались без изменений
- JWT токены работают как прежде
- Существующие звонки продолжают работать
