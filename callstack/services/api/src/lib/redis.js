// services/api/src/services/redis.js
import Redis from 'ioredis';

const { REDIS_URL = 'redis://redis:6379' } = process.env;
export const redis = new Redis(REDIS_URL);
