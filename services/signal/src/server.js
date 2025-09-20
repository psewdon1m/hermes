import http from 'http';
import { WebSocketServer } from 'ws';
import Redis from 'ioredis';
import jwt from 'jsonwebtoken';
import { nanoid } from 'nanoid';

const {
  REDIS_URL = 'redis://localhost:6379',
  JWT_SECRET = 'default-secret',
  PORT = '3002',
  MAX_PEERS_PER_CALL = '2',
  INACTIVE_TTL_SECONDS = '3600'
} = process.env;

const redis = new Redis(REDIS_URL);
const server = http.createServer();
const wss = new WebSocketServer({ server });

// Верификация JWT токена
function verifyJWT(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
}

// Отправка сообщения через WebSocket
function send(ws, obj) {
  if (ws.readyState === 1) {
    ws.send(JSON.stringify(obj));
  }
}

// Проверка существования звонка
async function callExists(callId) {
  return (await redis.exists(`call:${callId}`)) === 1;
}

// Получение списка участников
async function listPeers(callId) {
  return await redis.smembers(`call:${callId}:peers`);
}

// Добавление участника
async function addPeer(callId, peerId) {
  await redis.sadd(`call:${callId}:peers`, peerId);
  await redis.hset(`call:${callId}`, { 
    status: 'active', 
    updatedAt: new Date().toISOString() 
  });
  await redis.persist(`call:${callId}`); // убираем TTL для активного звонка
}

// Удаление участника
async function removePeer(callId, peerId) {
  await redis.srem(`call:${callId}:peers`, peerId);
  const size = await redis.scard(`call:${callId}:peers`);
  
  if (size === 0) {
    // Никого не осталось - ставим статус pending и TTL
    await redis.hset(`call:${callId}`, { 
      status: 'pending', 
      updatedAt: new Date().toISOString() 
    });
    await redis.expire(`call:${callId}`, Number(INACTIVE_TTL_SECONDS));
  } else {
    await redis.hset(`call:${callId}`, { 
      updatedAt: new Date().toISOString() 
    });
  }
  
  return size;
}

const sockets = new Map(); // ws -> {callId, peerId}

wss.on('connection', async (ws, req) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const callId = url.searchParams.get('callId');
    const peerId = url.searchParams.get('peerId') || nanoid(8);
    const token = url.searchParams.get('token');

    if (!callId) {
      send(ws, { type: 'error', error: 'missing_call_id' });
      ws.close();
      return;
    }

    // Проверяем JWT токен
    if (token) {
      const jwt = verifyJWT(token);
      if (!jwt || jwt.callId !== callId) {
        send(ws, { type: 'unauthorized' });
        ws.close();
        return;
      }
    }

    // Проверяем, существует ли звонок
    if (!(await callExists(callId))) {
      send(ws, { type: 'room_expired' });
      ws.close();
      return;
    }

    // Проверяем лимит участников
    const peersBefore = await listPeers(callId);
    if (peersBefore.length >= Number(MAX_PEERS_PER_CALL)) {
      send(ws, { type: 'room_full' });
      ws.close();
      return;
    }

    // Добавляем участника
    sockets.set(ws, { callId, peerId });
    await addPeer(callId, peerId);

    // Отправляем список существующих участников
    const peersNow = await listPeers(callId);
    send(ws, { 
      type: 'peers', 
      peers: peersNow.filter(p => p !== peerId) 
    });

    // Уведомляем других участников о новом подключении
    for (const [otherWs, meta] of sockets) {
      if (otherWs !== ws && meta.callId === callId) {
        send(otherWs, { type: 'peer_joined', peerId });
      }
    }

    // Обработка входящих сообщений
    ws.on('message', async (data) => {
      try {
        const msg = JSON.parse(data);
        const { target, type, payload } = msg;

        if (!target || !type) return;

        // Пересылаем сообщение целевому участнику
        for (const [otherWs, meta] of sockets) {
          if (meta.callId === callId && meta.peerId === target && otherWs.readyState === 1) {
            send(otherWs, { type, from: peerId, payload });
          }
        }
      } catch (error) {
        console.error('Message parsing error:', error);
      }
    });

    // Обработка отключения
    ws.on('close', async () => {
      const meta = sockets.get(ws);
      if (!meta) return;

      sockets.delete(ws);
      const leftSize = await removePeer(meta.callId, meta.peerId);

      // Уведомляем остальных участников
      for (const [otherWs, otherMeta] of sockets) {
        if (otherMeta.callId === meta.callId) {
          send(otherWs, { 
            type: 'peer_left', 
            peerId: meta.peerId, 
            left: leftSize 
          });
        }
      }
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
    });

  } catch (error) {
    console.error('Connection error:', error);
    try {
      send(ws, { type: 'error', error: 'internal_error' });
    } catch {}
    ws.close();
  }
});

server.listen(Number(PORT), () => {
  console.log(`Signal server running on port ${PORT}`);
});
