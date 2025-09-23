import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../lib/env.js';

export function signToken(payload, ttlSec = 900) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: ttlSec }); // 15 минут по умолчанию
}

export function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}
