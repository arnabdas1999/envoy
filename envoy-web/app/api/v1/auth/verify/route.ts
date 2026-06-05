import { NextRequest } from 'next/server';
import { ok, err } from '@/lib/errors';
import { sha256 } from '@/lib/auth-server';
import { signJwt } from '@/lib/jwt';
import { AUTH_LIMIT } from '@/lib/rate-limit';
import sql from '@/lib/db';
import redis from '@/lib/redis';

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') ?? 'unknown';
  if (!(await AUTH_LIMIT(ip))) {
    return err('RATE_LIMITED', 'Too many requests. Please wait a minute.', 429);
  }

  const body = await req.json().catch(() => null);
  const rawToken = body?.token?.trim();
  if (!rawToken) return err('MISSING_TOKEN', 'Token is required.', 400);

  const tokenHash = await sha256(rawToken);
  const redisKey = `magic:${tokenHash}`;

  // Atomically consume the token from Redis (GETDEL ensures single-use)
  const userId = await redis.getdel(redisKey);
  if (!userId) {
    return err('INVALID_TOKEN', 'Token is invalid, expired, or already used.', 400);
  }

  const [user] = await sql`SELECT id, email FROM users WHERE id = ${userId as string}`;
  if (!user) {
    return err('INVALID_TOKEN', 'Token is invalid, expired, or already used.', 400);
  }

  const jwt = await signJwt(user.id, user.email, 'web');
  return ok({ jwt, user: { id: user.id, email: user.email } });
}
