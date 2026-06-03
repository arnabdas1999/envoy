import { NextRequest } from 'next/server';
import { ok, unauthorized } from '@/lib/errors';
import { getRequestUser } from '@/lib/auth-server';
import sql from '@/lib/db';

export async function GET(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user) return unauthorized();

  const [row] = await sql`
    SELECT id, email, is_service_account, created_at FROM users WHERE id = ${user.id}
  `;
  return ok(row);
}
