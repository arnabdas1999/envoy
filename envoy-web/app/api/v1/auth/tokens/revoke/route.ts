import { NextRequest } from 'next/server';
import { noContent, unauthorized, notFound } from '@/lib/errors';
import { getRequestUser } from '@/lib/auth-server';
import sql from '@/lib/db';

export async function POST(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user) return unauthorized();

  const body = await req.json().catch(() => null);
  const tokenId = body?.token_id;
  if (!tokenId) return notFound('Token not found.');

  const rows = await sql`
    UPDATE auth_tokens
    SET    revoked_at = now()
    WHERE  id = ${tokenId} AND user_id = ${user.id} AND revoked_at IS NULL
    RETURNING id
  `;

  if (rows.length === 0) return notFound('Token not found.');
  return noContent();
}
