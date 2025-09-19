// Основные зависимости для WebRTC сервера
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const redis = require('redis');

// Инициализация Express приложения и HTTP сервера
const app = express();
const server = http.createServer(app);
// Настройка Socket.IO для WebRTC сигналинга
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Redis клиент для управления комнатами и сессиями
const redisClient = redis.createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});

redisClient.on('error', (err) => console.log('Redis Client Error', err));
redisClient.connect();

// Middleware для обработки запросов
app.use(cors()); // Разрешить CORS для всех доменов
app.use(express.json()); // Парсинг JSON в запросах
// Статические файлы (кроме call.html - он доступен только через динамические комнаты)
app.use(express.static(path.join(__dirname, '../public'), {
  index: false, // Отключаем автоматический index.html
  setHeaders: (res, path) => {
    // Блокируем прямой доступ к call.html
    if (path.endsWith('call.html')) {
      res.status(404).end();
    }
  }
}));

// Управление комнатами для видеозвонков
const rooms = new Map(); // Хранилище активных комнат
const ROOM_TTL = 60 * 60 * 1000; // Время жизни комнаты: 60 минут
const MAX_PARTICIPANTS = 2; // Максимальное количество участников в одной комнате

// Автоматическая очистка истекших комнат
setInterval(() => {
  const now = Date.now();
  for (const [roomId, room] of rooms.entries()) {
    if (now - room.lastActivity > ROOM_TTL) {
      console.log(`Room ${roomId} expired, removing...`);
      rooms.delete(roomId);
      redisClient.del(`room:${roomId}`);
    }
  }
}, 5 * 60 * 1000); // Проверка каждые 5 минут

// API endpoint для создания новой комнаты видеозвонка
app.post('/api/rooms', async (req, res) => {
  try {
    const roomId = uuidv4();
    const room = {
      id: roomId,
      participants: new Set(),
      createdAt: Date.now(),
      lastActivity: Date.now()
    };
    
    rooms.set(roomId, room);
    await redisClient.setEx(`room:${roomId}`, 3600, JSON.stringify({
      id: roomId,
      createdAt: room.createdAt,
      lastActivity: room.lastActivity
    }));
    
    // Генерируем правильный URL с учетом протокола
    const domain = process.env.DOMAIN || 'localhost:3000';
    const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
    const baseUrl = domain.startsWith('http') ? domain : `${protocol}://${domain}`;
    
    res.json({ 
      roomId, 
      url: `${baseUrl}/call/${roomId}`,
      expiresAt: Date.now() + ROOM_TTL
    });
  } catch (error) {
    console.error('Error creating room:', error);
    res.status(500).json({ error: 'Failed to create room' });
  }
});

// API endpoint для получения информации о комнате
app.get('/api/rooms/:roomId', async (req, res) => {
  try {
    const { roomId } = req.params;
    const room = rooms.get(roomId);
    
    if (!room) {
      return res.status(404).json({ error: 'Room not found or expired' });
    }
    
    const timeLeft = ROOM_TTL - (Date.now() - room.lastActivity);
    const expiresAt = room.lastActivity + ROOM_TTL;
    
    res.json({
      id: room.id,
      participantCount: room.participants.size,
      maxParticipants: MAX_PARTICIPANTS,
      createdAt: room.createdAt,
      lastActivity: room.lastActivity,
      expiresAt: expiresAt,
      timeLeft: Math.max(0, timeLeft),
      isActive: timeLeft > 0
    });
  } catch (error) {
    console.error('Error getting room info:', error);
    res.status(500).json({ error: 'Failed to get room info' });
  }
});

// API endpoint для получения конфигурации ICE серверов (STUN/TURN)
app.get('/api/ice-servers', (req, res) => {
  const domain = process.env.DOMAIN || req.get('host');
  const turnUsername = process.env.TURN_USERNAME || 'turnuser';
  const turnPassword = process.env.TURN_PASSWORD || 'turnpass';
  
  const iceServers = [
    // STUN servers first (for direct P2P connection attempts)
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    // TURN servers last (as fallback when P2P fails)
    {
      urls: `turn:${domain}:3478`,
      username: turnUsername,
      credential: turnPassword
    },
    {
      urls: `turns:${domain}:5349`,
      username: turnUsername,
      credential: turnPassword
    }
  ];
  
  res.json({ iceServers });
});

// API endpoint для получения информации о боте
app.get('/api/bot-info', async (req, res) => {
  try {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      return res.json({ botUsername: null });
    }
    
    // Получаем информацию о боте через Telegram API
    const response = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
    const data = await response.json();
    
    if (data.ok) {
      res.json({ 
        botUsername: data.result.username,
        botName: data.result.first_name
      });
    } else {
      res.json({ botUsername: null });
    }
  } catch (error) {
    console.error('Error fetching bot info:', error);
    res.json({ botUsername: null });
  }
});

// Главная страница с инструкциями
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Блокируем доступ к /call без ID комнаты
app.get('/call', (req, res) => {
  res.redirect('/');
});

// Отдача HTML страницы для видеозвонка (только для существующих комнат)
app.get('/call/:roomId', async (req, res) => {
  const { roomId } = req.params;
  const room = rooms.get(roomId);
  
  if (!room) {
    return res.status(404).send(`
      <!DOCTYPE html>
      <html lang="ru">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Комната не найдена - P2P Call</title>
        <style>
          body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0;
            color: white;
          }
          .error-container {
            text-align: center;
            background: rgba(255, 255, 255, 0.1);
            padding: 40px;
            border-radius: 20px;
            backdrop-filter: blur(10px);
            max-width: 500px;
          }
          .error-icon { font-size: 4rem; margin-bottom: 20px; }
          .error-title { font-size: 2rem; margin-bottom: 15px; }
          .error-message { font-size: 1.1rem; margin-bottom: 30px; opacity: 0.9; }
          .home-link {
            display: inline-block;
            background: rgba(255, 255, 255, 0.2);
            color: white;
            padding: 15px 30px;
            border-radius: 25px;
            text-decoration: none;
            font-weight: bold;
            transition: background 0.3s ease;
          }
          .home-link:hover { background: rgba(255, 255, 255, 0.3); }
        </style>
      </head>
      <body>
        <div class="error-container">
          <div class="error-icon">❌</div>
          <h1 class="error-title">Комната не найдена</h1>
          <p class="error-message">
            Эта комната не существует или время её жизни истекло.<br>
            Создайте новую комнату через Telegram бота.
          </p>
          <a href="/" class="home-link">🏠 На главную</a>
        </div>
      </body>
      </html>
    `);
  }
  
  // Обновляем время последней активности при доступе к странице
  room.lastActivity = Date.now();
  await redisClient.setEx(`room:${roomId}`, 3600, JSON.stringify({
    id: roomId,
    createdAt: room.createdAt,
    lastActivity: room.lastActivity,
    participantCount: room.participants.size
  }));
  
  res.sendFile(path.join(__dirname, '../public/call.html'));
});

// Обработка WebSocket соединений для WebRTC сигналинга
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  
  socket.on('join-room', async (roomId) => {
    try {
      const room = rooms.get(roomId);
      
      if (!room) {
        socket.emit('error', 'Room not found or expired');
        return;
      }
      
      // Check if room is full
      if (room.participants.size >= MAX_PARTICIPANTS) {
        socket.emit('error', 'Комната заполнена. Максимум 2 участника в одном звонке. Создайте новую комнату через бота.');
        return;
      }
      
      // Update room activity
      room.lastActivity = Date.now();
      await redisClient.setEx(`room:${roomId}`, 3600, JSON.stringify({
        id: roomId,
        createdAt: room.createdAt,
        lastActivity: room.lastActivity,
        participantCount: room.participants.size
      }));
      
      socket.join(roomId);
      room.participants.add(socket.id);
      
      console.log(`User ${socket.id} joined room ${roomId} (${room.participants.size}/${MAX_PARTICIPANTS})`);
      
      // Notify other participants
      socket.to(roomId).emit('user-joined', socket.id);
      
      // Send current participants to the new user
      const otherParticipants = Array.from(room.participants).filter(id => id !== socket.id);
      socket.emit('current-participants', otherParticipants);
      
      // Send room status update to all participants
      io.to(roomId).emit('room-status', {
        participantCount: room.participants.size,
        maxParticipants: MAX_PARTICIPANTS,
        isFull: room.participants.size >= MAX_PARTICIPANTS
      });
      
    } catch (error) {
      console.error('Error joining room:', error);
      socket.emit('error', 'Failed to join room');
    }
  });
  
  socket.on('offer', (data) => {
    socket.to(data.roomId).emit('offer', {
      offer: data.offer,
      from: socket.id
    });
  });
  
  socket.on('answer', (data) => {
    socket.to(data.roomId).emit('answer', {
      answer: data.answer,
      from: socket.id
    });
  });
  
  socket.on('ice-candidate', (data) => {
    socket.to(data.roomId).emit('ice-candidate', {
      candidate: data.candidate,
      from: socket.id
    });
  });
  
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    
    // Remove from all rooms
    for (const [roomId, room] of rooms.entries()) {
      if (room.participants.has(socket.id)) {
        room.participants.delete(socket.id);
        room.lastActivity = Date.now();
        
        console.log(`User ${socket.id} left room ${roomId} (${room.participants.size}/${MAX_PARTICIPANTS})`);
        
        // Notify other participants
        socket.to(roomId).emit('user-left', socket.id);
        
        // Send room status update to remaining participants
        io.to(roomId).emit('room-status', {
          participantCount: room.participants.size,
          maxParticipants: MAX_PARTICIPANTS,
          isFull: room.participants.size >= MAX_PARTICIPANTS
        });
        
        // If room is empty, mark for cleanup
        if (room.participants.size === 0) {
          console.log(`Room ${roomId} is empty, will be cleaned up`);
        }
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`WebRTC server running on port ${PORT}`);
});

