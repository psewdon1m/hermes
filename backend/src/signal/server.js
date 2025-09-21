import { WebSocketServer } from 'ws';
import jwt from 'jsonwebtoken';
import { nanoid } from 'nanoid';
import redis from '../lib/redis.js';

const sockets = new Map(); // ws -> { callId, peerId }

const MAX_PEERS_PER_CALL = Number(process.env.MAX_PEERS_PER_CALL ?? 2);
const INACTIVE_TTL_SECONDS = Number(process.env.INACTIVE_TTL_SECONDS ?? 3600);
const JWT_SECRET = process.env.JWT_SECRET || 'default-secret';

function verifyToken(token, expectedCallId) {
  if (!token) {
    return true;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    return decoded.callId === expectedCallId;
  } catch {
    return false;
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
    await redis.expire(call:, INACTIVE_TTL_SECONDS);
  } else {
    await redis.hset(call:, {
      updatedAt: new Date().toISOString()
    });
  }

  return size;
}

function send(ws, payload) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

export function createSignalServer(httpServer, { path = '/ws' } = {}) {
  const wss = new WebSocketServer({ server: httpServer, path });

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

      if (!verifyToken(token, callId)) {
        send(ws, { type: 'unauthorized' });
        ws.close();
        return;
      }

      if (!(await callExists(callId))) {
        send(ws, { type: 'room_expired' });
        ws.close();
        return;
      }

      const peersBefore = await listPeers(callId);
      if (peersBefore.length >= MAX_PEERS_PER_CALL) {
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
      console.error('Signal connection error:', error);
      try {
        send(ws, { type: 'error', error: 'internal_error' });
      } catch {}
      ws.close();
    }
  });

  return wss;
}
