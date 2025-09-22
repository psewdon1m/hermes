export const DOMAIN = process.env.DOMAIN;
export const API_ORIGIN = process.env.API_ORIGIN;
export const WS_PUBLIC = process.env.WS_PUBLIC;
export const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
export const JWT_SECRET = process.env.JWT_SECRET;
export const TURN_DOMAIN = process.env.TURN_DOMAIN;
export const TURN_SECRET = process.env.TURN_SECRET;
export const TURN_TTL_SECONDS = parseInt(process.env.TURN_TTL_SECONDS || '600', 10);

if (!JWT_SECRET) throw new Error('JWT_SECRET is required');
if (!TURN_SECRET) throw new Error('TURN_SECRET is required');
if (!DOMAIN) throw new Error('DOMAIN is required');
if (!WS_PUBLIC) throw new Error('WS_PUBLIC is required');
