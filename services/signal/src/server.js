import http from "http";
import { WebSocketServer } from "ws";
import Redis from "ioredis";
import crypto from "node:crypto";
import url from "node:url";

const {
  REDIS_URL = "redis://redis:6379",
  JWT_SECRET,
  PORT = "3002",
  SIGNAL_PATH = "/ws",
  MAX_PEERS_PER_CALL = "2",
  INACTIVE_TTL_SECONDS = "3600",
} = process.env;

if (!JWT_SECRET) throw new Error("JWT_SECRET is required");

const redis = new Redis(REDIS_URL);
const server = http.createServer();
const wss = new WebSocketServer({ server, path: SIGNAL_PATH });

function verifyJWT(token) {
  try {
    const [h, p, s] = token.split(".");
    if (!h || !p || !s) return null;
    const sig = crypto.createHmac("sha256", JWT_SECRET).update(`${h}.${p}`).digest("base64url");
    if (sig !== s) return null;
    const body = JSON.parse(Buffer.from(p, "base64url").toString());
    if (typeof body.exp === "number" && Math.floor(Date.now() / 1000) > body.exp) return null;
    return body;
  } catch {
    return null;
  }
}

function send(ws, obj) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(obj));
  }
}

async function callExists(callId) {
  return (await redis.exists(`call:${callId}`)) === 1;
}

async function listPeers(callId) {
  return redis.smembers(`call:${callId}:peers`);
}

async function addPeer(callId, peerId) {
  await redis.sadd(`call:${callId}:peers`, peerId);
  await redis.hset(`call:${callId}`, {
    status: "active",
    updatedAt: String(Date.now()),
  });
  await redis.persist(`call:${callId}`);
}

async function removePeer(callId, peerId) {
  await redis.srem(`call:${callId}:peers`, peerId);
  const size = await redis.scard(`call:${callId}:peers`);
  if (size === 0) {
    await redis.hset(`call:${callId}`, {
      status: "pending",
      updatedAt: String(Date.now()),
    });
    await redis.expire(`call:${callId}`, Number(INACTIVE_TTL_SECONDS));
  } else {
    await redis.hset(`call:${callId}`, { updatedAt: String(Date.now()) });
  }
  return size;
}

const sockets = new Map();

wss.on("connection", async (ws, req) => {
  try {
    const searchParams = new url.URL(req.url, "http://x").searchParams;
    const callId = searchParams.get("callId");
    const peerId = searchParams.get("peerId");
    const sig = searchParams.get("sig");

    if (!callId || !peerId || !sig) {
      send(ws, { type: "error", error: "bad_params" });
      ws.close();
      return;
    }

    const jwt = verifyJWT(sig);
    if (!jwt || jwt.callId !== callId) {
      send(ws, { type: "unauthorized" });
      ws.close();
      return;
    }

    if (!(await callExists(callId))) {
      send(ws, { type: "room-expired" });
      ws.close();
      return;
    }

    const peersBefore = await listPeers(callId);
    if (peersBefore.length >= Number(MAX_PEERS_PER_CALL)) {
      send(ws, { type: "room-full" });
      ws.close();
      return;
    }

    sockets.set(ws, { callId, peerId });
    await addPeer(callId, peerId);

    const peersNow = await listPeers(callId);
    send(ws, { type: "peers", peers: peersNow.filter((p) => p !== peerId) });

    for (const [otherWs, meta] of sockets) {
      if (otherWs !== ws && meta.callId === callId) {
        send(otherWs, { type: "peer-joined", peerId });
      }
    }

    ws.on("message", async (data) => {
      let msg;
      try {
        msg = JSON.parse(data);
      } catch {
        return;
      }
      const { target, type, payload } = msg;
      if (!target || !type) return;

      for (const [otherWs, meta] of sockets) {
        if (meta.callId === callId && meta.peerId === target && otherWs.readyState === ws.OPEN) {
          send(otherWs, { type, from: peerId, payload });
        }
      }
    });

    ws.on("close", async () => {
      const meta = sockets.get(ws);
      if (!meta) return;
      sockets.delete(ws);
      const leftSize = await removePeer(meta.callId, meta.peerId);
      for (const [otherWs, o] of sockets) {
        if (o.callId === meta.callId) {
          send(otherWs, { type: "peer-left", peerId: meta.peerId, left: leftSize });
        }
      }
    });

    ws.on("error", () => {});
  } catch (error) {
    console.error("Signal connection error:", error);
    try {
      send(ws, { type: "error", error: "internal" });
    } catch {}
    ws.close();
  }
});

server.listen(Number(PORT), () => {
  console.log(`Signal WS on :${PORT}`);
});
