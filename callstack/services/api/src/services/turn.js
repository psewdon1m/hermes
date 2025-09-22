import crypto from 'node:crypto';
import { TURN_DOMAIN, TURN_SECRET, TURN_TTL_SECONDS } from '../lib/env.js';

const ttlSeconds = Number(TURN_TTL_SECONDS ?? 600);

if (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0) {
  throw new Error('Invalid TURN_TTL_SECONDS value');
}

export function makeTurnCredentials() {
  const expiry = Math.floor(Date.now() / 1000) + ttlSeconds;
  const username = String(expiry);
  const credential = crypto.createHmac('sha1', TURN_SECRET).update(username).digest('base64');
  return { username, credential, expiry };
}

export function buildIceServers() {
  const { username, credential } = makeTurnCredentials();
  return [
    { urls: [`stun:${TURN_DOMAIN}:3478`] },
    { urls: [`turn:${TURN_DOMAIN}:3478?transport=udp`], username, credential },
    { urls: [`turn:${TURN_DOMAIN}:3478?transport=tcp`], username, credential },
    { urls: [`turns:${TURN_DOMAIN}:5349?transport=tcp`], username, credential },
  ];
}
