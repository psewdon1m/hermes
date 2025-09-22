export const {
  DOMAIN = 'call.tgcall.space',
  API_ORIGIN = 'https://call.tgcall.space',
  WS_PUBLIC = 'wss://call.tgcall.space/ws',
  REDIS_URL = 'redis://redis:6379',
  JWT_SECRET,
  TURN_DOMAIN = 'call.tgcall.space',
  TURN_SECRET,
  TURN_TTL_SECONDS = '600'
} = process.env;

if (!JWT_SECRET) throw new Error('JWT_SECRET is required');
if (!TURN_SECRET) throw new Error('TURN_SECRET is required');
