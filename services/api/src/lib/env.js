export const DOMAIN = process.env.DOMAIN;
export const API_ORIGIN = process.env.API_ORIGIN || (DOMAIN ? `https://${DOMAIN}` : undefined);
export const WS_PUBLIC = process.env.WS_PUBLIC || (DOMAIN ? `wss://${DOMAIN}/ws` : undefined);
export const REDIS_URL = process.env.REDIS_URL || 'redis://redis:6379';
export const JWT_SECRET = process.env.JWT_SECRET;
export const TURN_DOMAIN = process.env.TURN_DOMAIN || DOMAIN;
export const TURN_SECRET = process.env.TURN_SECRET;
export const TURN_TTL_SECONDS = parseInt(process.env.TURN_TTL_SECONDS || '600', 10);
export const JOIN_TOKEN_TTL_SECONDS = parseInt(process.env.JOIN_TOKEN_TTL_SECONDS || '86400', 10);
export const CALL_TTL_PENDING = parseInt(process.env.CALL_TTL_PENDING || '3600', 10);
export const CALL_TTL_ACTIVE = parseInt(process.env.CALL_TTL_ACTIVE || '21600', 10);
export const CALL_TTL_ENDED = parseInt(process.env.CALL_TTL_ENDED || '300', 10);

export const ALLOW_ORIGIN = API_ORIGIN ? [API_ORIGIN] : ['http://localhost:3000'];

if (!JWT_SECRET) throw new Error('JWT_SECRET is required');
if (!TURN_SECRET) throw new Error('TURN_SECRET is required');
if (!DOMAIN) throw new Error('DOMAIN is required');
if (!WS_PUBLIC) throw new Error('WS_PUBLIC is required');