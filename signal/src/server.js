import http from "http";
import { WebSocketServer } from "ws";
import Redis from "ioredis";
import crypto from "node:crypto";
import url from "node:url";

const {
  REDIS_URL = "redis://redis:6379",
  JWT_SECRET,
  PORT = "8081",
  MAX_PEERS_PER_CALL = "2",
  INACTIVE_TTL_SECONDS = "3600"
} = process.env;

if (!JWT_SECRET) throw new Error("JWT_SECRET is required");

const redis = new Redis(REDIS_URL);
const server = http.createServer();
const wss = new WebSocketServer({ server });

function verifyJWT(token) {
  try {
    const [h, p, s] = (token || "").split('.');
    if (!h || !p || !s) return null;
    const sig = crypto.createHmac('sha256', JWT_SECRET).update(`${h}.${p}`).digest('base64url');
    if (sig !== s) return null;
    const body = JSON.parse(Buffer.from(p, 'base64url').toString('utf8'));
    if (typeof body.exp === 'number' && Math.floor(Date.now() / 1000) > body.exp) return null;
    return body;
  } catch {
    return null;
  }
}

function send(ws, obj) {
  if (ws.readyState === 1) ws.send(JSON.stringify(obj));
}

const sockets = new Map(); // ws -> { callId, peerId, role, observer }

const callKey = (callId) => `call:${callId}`;
const peerSetKey = (callId) => `call:${callId}:peers`;
const logChannel = (callId) => `logs:${callId}`;

async function callExists(callId) {
  return (await redis.exists(callKey(callId))) === 1;
}

async function listPeers(callId) {
  return redis.smembers(peerSetKey(callId));
}

async function addPeer(callId, peerId) {
  const now = Date.now();
  await redis.sadd(peerSetKey(callId), peerId);
  await redis.hset(callKey(callId), { status: 'active', updatedAt: String(now) });
  await redis.persist(callKey(callId));
}

async function removePeer(callId, peerId) {
  await redis.srem(peerSetKey(callId), peerId);
  const remaining = await redis.scard(peerSetKey(callId));
  if (remaining === 0) {
    const now = Date.now();
    await redis.hset(callKey(callId), { status: 'pending', updatedAt: String(now) });
    await redis.expire(callKey(callId), Number(INACTIVE_TTL_SECONDS));
  } else {
    await redis.hset(callKey(callId), { updatedAt: String(Date.now()) });
  }
  return remaining;
}

function truncate(text, max = 1024) {
  if (typeof text !== 'string') return text;
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function sanitizeDetail(detail) {
  if (!Array.isArray(detail) || detail.length === 0) return undefined;
  return detail.slice(0, 10).map((item) => truncate(String(item)));
}

async function publishLog(callId, entry) {
  await redis.publish(logChannel(callId), JSON.stringify(entry));
}

wss.on('connection', async (ws, req) => {
  try {
    const { searchParams } = new url.URL(req.url, 'http://x');
    const callId = searchParams.get('callId');
    const peerId = searchParams.get('peerId');
    const sig = searchParams.get('sig');

    if (!callId || !peerId || !sig) {
      send(ws, { type: 'error', error: 'bad_params' });
      try { ws.close(4400, 'bad-params'); } catch { ws.close(); }
      return;
    }

    const jwt = verifyJWT(sig);
    if (!jwt || jwt.callId !== callId) {
      send(ws, { type: 'unauthorized' });
      try { ws.close(4401, 'unauthorized'); } catch { ws.close(); }
      return;
    }

    const role = typeof jwt.role === 'string' ? jwt.role : 'participant';
    const observer = role === 'observer';

    if (!(await callExists(callId))) {
      send(ws, { type: 'room-expired' });
      try { ws.close(4404, 'room-expired'); } catch { ws.close(); }
      return;
    }

    if (!observer) {
      const peersBefore = await listPeers(callId);
      if (peersBefore.length >= Number(MAX_PEERS_PER_CALL)) {
        const entry = { ts: Date.now(), callId, peerId, role, message: 'room-full reject' };
        try { await publishLog(callId, entry); } catch {}
        send(ws, { type: 'room-full' });
        try { ws.close(4403, 'room-full'); } catch { ws.close(); }
        return;
      }
      await addPeer(callId, peerId);
    }

    sockets.set(ws, { callId, peerId, role, observer });

    const peersNow = await listPeers(callId);
    send(ws, { type: 'peers', peers: peersNow.filter((p) => p !== peerId) });

    if (!observer) {
      for (const [otherWs, meta] of sockets) {
        if (otherWs !== ws && meta.callId === callId && !meta.observer) {
          send(otherWs, { type: 'peer-joined', peerId });
        }
      }
    }

    ws.on('message', async (data) => {
      let msg;
      try {
        msg = JSON.parse(data);
      } catch {
        return;
      }

      const { type, target, payload } = msg || {};
      if (!type) return;

      if (type === 'log') {
        const meta = sockets.get(ws);
        if (!meta) return;
        const message = truncate(typeof payload?.message === 'string' ? payload.message : String(payload?.message ?? ''));
        const entry = {
          ts: typeof payload?.ts === 'number' ? payload.ts : Date.now(),
          callId,
          peerId: meta.peerId,
          role: meta.role,
          message
        };
        const detail = sanitizeDetail(payload?.detail);
        if (detail) entry.detail = detail;
        try {
          await publishLog(callId, entry);
        } catch (err) {
          console.error('log publish failed', err);
        }
        for (const [otherWs, otherMeta] of sockets) {
          if (otherMeta.callId === callId && otherMeta.observer) {
            send(otherWs, { type: 'log', payload: entry });
          }
        }
        return;
      }

      if (!target) return;

      for (const [otherWs, meta] of sockets) {
        if (meta.callId === callId && meta.peerId === target && otherWs.readyState === 1) {
          send(otherWs, { type, from: peerId, payload });
        }
      }
    });

    ws.on('close', async () => {
      const meta = sockets.get(ws);
      if (!meta) return;
      sockets.delete(ws);
      if (!meta.observer) {
        const remaining = await removePeer(meta.callId, meta.peerId);
        for (const [otherWs, otherMeta] of sockets) {
          if (otherMeta.callId === meta.callId && !otherMeta.observer) {
            send(otherWs, { type: 'peer-left', peerId: meta.peerId, left: remaining });
          }
        }
      }
    });

    ws.on('error', () => {});
  } catch (err) {
    try { send(ws, { type: 'error', error: 'internal' }); } catch {}
    ws.close();
  }
});

server.listen(Number(PORT), () => {
  console.log(`Signal WS on :${PORT}`);
});
