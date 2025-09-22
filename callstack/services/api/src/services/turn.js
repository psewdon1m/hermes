GNU nano 6.2                                           turn.js                                                     
import crypto from 'crypto';
import { TURN_DOMAIN, TURN_SECRET, TURN_TTL_SECONDS } from '../lib/env.js';

export function makeTurnCredentials() {
  const expiry = Math.floor(Date.now() / 1000) + TURN_TTL_SECONDS; // unix ts
  const username = String(expiry);
  const credential = crypto.createHmac('sha1', TURN_SECRET).update(username).digest('base64');
  return { username, credential };
}

export function buildIceServers() {
  const { username, credential } = makeTurnCredentials();
  return [
    { urls: [`stun:${TURN_DOMAIN}:3478`] },
    { urls: [`turn:${TURN_DOMAIN}:3478?transport=udp`], username, credential },
    { urls: [`turn:${TURN_DOMAIN}:3478?transport=tcp`], username, credential }
  ];
}