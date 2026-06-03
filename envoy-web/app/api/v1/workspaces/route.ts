import { NextRequest } from 'next/server';
import { getRequestUser } from '@/lib/auth-server';
import { ok, created, unauthorized, unprocessable, serverError } from '@/lib/errors';
import { WRITE_LIMIT, READ_LIMIT } from '@/lib/rate-limit';
import { toSlug } from '@/lib/slug';
import sql from '@/lib/db';

// GET /api/v1/workspaces — list workspaces the caller belongs to
export async function GET(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') ?? 'unknown';
  if (!READ_LIMIT(ip)) return unprocessable('Rate limit exceeded.');

  const user = await getRequestUser(req);
  if (!user) return unauthorized();

  const rows = await sql`
    SELECT w.id, w.name, w.slug, w.workspace_salt, w.master_key_hash,
           w.created_at, w.updated_at, m.role
    FROM   workspaces w
    JOIN   memberships m ON m.workspace_id = w.id
    WHERE  m.user_id = ${user.id}
    ORDER  BY w.created_at ASC
  `;

  return ok(rows);
}

// POST /api/v1/workspaces — create workspace, auto-add caller as owner
export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') ?? 'unknown';
  if (!WRITE_LIMIT(ip)) return unprocessable('Rate limit exceeded.');

  const user = await getRequestUser(req);
  if (!user) return unauthorized();

  const body = await req.json().catch(() => null);
  const name = body?.name?.trim();
  const masterKeyHash = body?.master_key_hash;
  const workspaceSalt = body?.workspace_salt;

  if (!name) return unprocessable('name is required.');
  if (!masterKeyHash) return unprocessable('master_key_hash is required.');
  if (!workspaceSalt) return unprocessable('workspace_salt is required.');

  const slug = toSlug(name);
  if (!slug) return unprocessable('name produces an empty slug.');

  try {
    const [ws] = await sql`
      INSERT INTO workspaces (name, slug, master_key_hash, workspace_salt)
      VALUES (${name}, ${slug}, ${masterKeyHash}, ${workspaceSalt})
      RETURNING id, name, slug, workspace_salt, master_key_hash, created_at
    `;

    await sql`
      INSERT INTO memberships (workspace_id, user_id, role)
      VALUES (${ws.id}, ${user.id}, 'owner')
    `;

    return created(ws);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '';
    if (msg.includes('unique') || msg.includes('duplicate')) {
      return unprocessable(`A workspace with slug "${slug}" already exists.`);
    }
    console.error('[workspaces POST]', e);
    return serverError();
  }
}
