import http from 'http';
import dotenv from 'dotenv';
import { WebSocketServer } from 'ws';
import Redis from 'ioredis';
import jwt from 'jsonwebtoken';
import { nanoid } from 'nanoid';

dotenv.config();

const {
  REDIS_URL = 'redis://localhost:6379',
  JWT_SECRET = 'default-secret',
  PORT = '3002',
  MAX_PEERS_PER_CALL = '2',
  INACTIVE_TTL_SECONDS = '3600'
} = process.env;

const redis = new Redis(REDIS_URL);

redis.on('error', (error) => {
  console.error('Redis error:', error);
});

const server = http.createServer();
const wss = new WebSocketServer({ server, path: process.env.SIGNAL_PATH || '/ws' });

function verifyJWT(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
}

function send(ws, obj) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(obj));
  }
}

async function callExists(callId) {
  return (await redis.exists(call:)) === 1;
}

async function listPeers(callId) {
  return redis.smembers(call::peers);
}

async function addPeer(callId, peerId) {
  await redis.sadd(call::peers, peerId);
  await redis.hset(call:, {
    status: 'active',
    updatedAt: new Date().toISOString()
  });
  await redis.persist(call:);
}

async function removePeer(callId, peerId) {
  await redis.srem(call::peers, peerId);
  const size = await redis.scard(call::peers);

  if (size === 0) {
    await redis.hset(call:, {
      status: 'pending',
      updatedAt: new Date().toISOString()
    });
    await redis.expire(call:, Number(INACTIVE_TTL_SECONDS));
  } else {
    await redis.hset(call:, {
      updatedAt: new Date().toISOString()
    });
  }

  return size;
}

const sockets = new Map();

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

    if (token) {
      const decoded = verifyJWT(token);
      if (!decoded || decoded.callId !== callId) {
        send(ws, { type: 'unauthorized' });
        ws.close();
        return;
      }
    }

    if (!(await callExists(callId))) {
      send(ws, { type: 'room_expired' });
      ws.close();
      return;
    }

    const peersBefore = await listPeers(callId);
    if (peersBefore.length >= Number(MAX_PEERS_PER_CALL)) {
      send(ws, { type: 'room_full' });
      ws.close();
      return;
    }

    sockets.set(ws, { callId, peerId });
    await addPeer(callId, peerId);

    const peersNow = await listPeers(callId);
    send(ws, {
      type: 'peers',
      peers: peersNow.filter((p) => p !== peerId)
    });

    for (const [otherWs, meta] of sockets) {
      if (otherWs !== ws && meta.callId === callId) {
        send(otherWs, { type: 'peer_joined', peerId });
      }
    }

    ws.on('message', async (raw) => {
      try {
        const message = JSON.parse(raw);
        const { target, type, payload } = message;

        if (!target || !type) {
          return;
        }

        for (const [otherWs, meta] of sockets) {
          if (meta.callId === callId && meta.peerId === target && otherWs.readyState === ws.OPEN) {
            send(otherWs, { type, from: peerId, payload });
          }
        }
      } catch (error) {
        console.error('Signal message parsing error:', error);
      }
    });

    ws.on('close', async () => {
      const meta = sockets.get(ws);
      if (!meta) {
        return;
      }

      sockets.delete(ws);
      const remaining = await removePeer(meta.callId, meta.peerId);

      for (const [otherWs, otherMeta] of sockets) {
        if (otherMeta.callId === meta.callId) {
          send(otherWs, {
            type: 'peer_left',
            peerId: meta.peerId,
            left: remaining
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
  console.log(Signal server running on port );
});
