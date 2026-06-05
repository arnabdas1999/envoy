import { Ratelimit } from '@upstash/ratelimit';
import redis from './redis';

// Sliding window rate limiters — shared across all Vercel instances via Redis
const authLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, '60 s'),
  prefix: 'envoy:rl:auth',
});

const writeLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(20, '60 s'),
  prefix: 'envoy:rl:write',
});

const readLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(60, '60 s'),
  prefix: 'envoy:rl:read',
});

async function check(limiter: Ratelimit, ip: string): Promise<boolean> {
  const { success } = await limiter.limit(ip);
  return success;
}

export const AUTH_LIMIT  = (ip: string) => check(authLimiter, ip);
export const WRITE_LIMIT = (ip: string) => check(writeLimiter, ip);
export const READ_LIMIT  = (ip: string) => check(readLimiter, ip);
