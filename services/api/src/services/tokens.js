import jwt from "jsonwebtoken";
import { JWT_SECRET, JOIN_TOKEN_TTL_SECONDS } from "../lib/env.js";

export function signToken(payload, ttlSec = JOIN_TOKEN_TTL_SECONDS) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: ttlSec });
}

export function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}