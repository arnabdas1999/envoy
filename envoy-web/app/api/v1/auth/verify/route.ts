import { NextRequest } from 'next/server';
import { ok, err } from '@/lib/errors';
import { sha256 } from '@/lib/auth-server';
import { signJwt } from '@/lib/jwt';
import sql from '@/lib/db';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const rawToken = body?.token?.trim();
  if (!rawToken) return err('MISSING_TOKEN', 'Token is required.', 400);

  const tokenHash = await sha256(rawToken);
  const now = new Date().toISOString();

  // Consume the magic link token atomically
  const rows = await sql`
    DELETE FROM auth_tokens
    WHERE  token_hash = ${tokenHash}
      AND  type       = 'magic_link'
      AND  revoked_at IS NULL
      AND  expires_at > ${now}
    RETURNING user_id
  `;

  if (rows.length === 0) {
    return err('INVALID_TOKEN', 'Token is invalid, expired, or already used.', 400);
  }

  const userId = rows[0].user_id;
  const [user] = await sql`SELECT id, email FROM users WHERE id = ${userId}`;

  const jwt = await signJwt(user.id, user.email, 'web');

  return ok({ jwt, user: { id: user.id, email: user.email } });
}
