import Redis from 'ioredis';
import { REDIS_URL } from './env.js';

export const redis = new Redis(REDIS_URL);