import { NextRequest } from 'next/server';
import { ok, unauthorized } from '@/lib/errors';
import { getRequestUser, sha256 } from '@/lib/auth-server';
import { signJwt } from '@/lib/jwt';
import sql from '@/lib/db';

const CLI_TOKEN_DAYS = 90;

export async function POST(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user) return unauthorized();

  const rawToken = crypto.randomUUID() + crypto.randomUUID();
  const tokenHash = await sha256(rawToken);
  const expiresAt = new Date(Date.now() + CLI_TOKEN_DAYS * 86_400_000).toISOString();

  const [record] = await sql`
    INSERT INTO auth_tokens (user_id, token_hash, type, expires_at)
    VALUES (${user.id}, ${tokenHash}, 'cli', ${expiresAt})
    RETURNING id, expires_at
  `;

  return ok({
    cli_token: rawToken,
    expires_at: record.expires_at,
    token_id: record.id,
  });
}
