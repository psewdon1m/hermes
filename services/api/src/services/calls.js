import crypto from "node:crypto";
import { customAlphabet } from "nanoid";
import { redis } from "../lib/redis.js";
import { CALL_TTL_PENDING, CALL_TTL_ACTIVE, CALL_TTL_ENDED } from "../lib/env.js";

const alphabet = "ABCDEFGHJKLMNPRSTUVWXYZ23456789";
const nanoid = customAlphabet(alphabet, 6);

export function genCallId() {
  return "c_" + crypto.randomBytes(8).toString("hex");
}

async function ensureExpireBoth(callId, ttl) {
  await redis
    .multi()
    .expire(`call:${callId}`, ttl)
    .expire(`call:${callId}:peers`, ttl)
    .exec();
}

export async function setStatus(callId, status) {
  const now = Date.now();
  const ttl = status === "active" ? CALL_TTL_ACTIVE : status === "ended" ? CALL_TTL_ENDED : CALL_TTL_PENDING;

  await redis
    .multi()
    .hset(`call:${callId}`, "status", status, "updatedAt", String(now))
    .expire(`call:${callId}`, ttl)
    .expire(`call:${callId}:peers`, ttl)
    .exec();
}

export async function touchActive(callId) {
  await ensureExpireBoth(callId, CALL_TTL_ACTIVE);
  await redis.hset(`call:${callId}`, "updatedAt", String(Date.now()));
}

export async function touchPending(callId) {
  await ensureExpireBoth(callId, CALL_TTL_PENDING);
  await redis.hset(`call:${callId}`, "updatedAt", String(Date.now()));
}

export async function touchEnded(callId) {
  await ensureExpireBoth(callId, CALL_TTL_ENDED);
  await redis.hset(`call:${callId}`, "updatedAt", String(Date.now()));
}

export async function createCall(initiator) {
  const callId = genCallId();
  const code = nanoid();
  const now = Date.now();

  await redis
    .multi()
    .hset(
      `call:${callId}`,
      "status",
      "pending",
      "createdAt",
      String(now),
      "updatedAt",
      String(now),
      "initiator",
      initiator
    )
    .expire(`call:${callId}`, CALL_TTL_PENDING)
    .del(`call:${callId}:peers`)
    .expire(`call:${callId}:peers`, CALL_TTL_PENDING)
    .set(`otc:${code}`, callId, "EX", 900)
    .exec();

  return { callId, code };
}

export async function resolveCodeToCallId(code) {
  const key = `otc:${code}`;
  const callId = await redis.get(key);
  if (callId) {
    await redis.del(key);
  }
  return callId;
}

export async function callExists(callId) {
  return Boolean(await redis.exists(`call:${callId}`));
}

export async function peersCount(callId) {
  return redis.scard(`call:${callId}:peers`);
}

export async function addPeer(callId, peerId) {
  await redis.sadd(`call:${callId}:peers`, peerId);
}

export async function removePeer(callId, peerId) {
  await redis.srem(`call:${callId}:peers`, peerId);
}