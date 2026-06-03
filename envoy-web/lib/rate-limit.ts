// Simple in-memory rate limiter.
// Works per-instance (not distributed). For production use Upstash Redis.

interface Window { count: number; reset: number }

const store = new Map<string, Window>();

export function checkRateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const w = store.get(key);

  if (!w || w.reset < now) {
    store.set(key, { count: 1, reset: now + windowMs });
    return true;
  }

  if (w.count >= limit) return false;
  w.count++;
  return true;
}

// Preset windows for common endpoint types
export const AUTH_LIMIT = (ip: string) => checkRateLimit(`auth:${ip}`, 5, 60_000);
export const WRITE_LIMIT = (ip: string) => checkRateLimit(`write:${ip}`, 20, 60_000);
export const READ_LIMIT = (ip: string) => checkRateLimit(`read:${ip}`, 60, 60_000);
