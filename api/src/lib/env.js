export const {
  DOMAIN = 'example.com',
  API_ORIGIN = 'https://example.com',
  WS_PUBLIC = 'wss://example.com/ws',
  REDIS_URL = 'redis://redis:6379',
  JWT_SECRET,
  TURN_DOMAIN = 'example.com',
  TURN_SECRET,
  TURN_TTL_SECONDS = '600'
} = process.env;

if (!JWT_SECRET) throw new Error('JWT_SECRET is required');
if (!TURN_SECRET) throw new Error('TURN_SECRET is required');

