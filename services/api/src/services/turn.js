import crypto from "node:crypto";
import { TURN_DOMAIN, TURN_SECRET, TURN_TTL_SECONDS } from "../lib/env.js";

const TURN_UDP_PORT = 3478;
const TURN_TLS_PORT = 5349;
const DEFAULT_USER = "user";

export function makeTurnCredentials(user = DEFAULT_USER) {
  const expires = Math.floor(Date.now() / 1000) + TURN_TTL_SECONDS;
  const username = `${expires}:${user}`;
  const credential = crypto.createHmac("sha1", TURN_SECRET).update(username).digest("base64");
  return { username, credential, expiresAt: expires };
}

export function buildIceServers(user = DEFAULT_USER) {
  const { username, credential } = makeTurnCredentials(user);

  return [
    { urls: [`stun:${TURN_DOMAIN}:${TURN_UDP_PORT}`] },
    { urls: [`turn:${TURN_DOMAIN}:${TURN_UDP_PORT}?transport=udp`], username, credential },
    { urls: [`turn:${TURN_DOMAIN}:${TURN_UDP_PORT}?transport=tcp`], username, credential },
    { urls: [`turns:${TURN_DOMAIN}:${TURN_TLS_PORT}?transport=tcp`], username, credential },
  ];
}
