import { NextRequest } from 'next/server';
import { getRequestUser } from '@/lib/auth-server';
import { ok, noContent, unauthorized, forbidden, notFound, serverError } from '@/lib/errors';
import { requireWorkspaceMember, getWorkspaceForEnvironment } from '@/lib/access';
import sql from '@/lib/db';

type Ctx = { params: Promise<{ id: string }> };

// GET /api/v1/environments/:id
export async function GET(req: NextRequest, { params }: Ctx) {
  const { id: envId } = await params;
  const user = await getRequestUser(req);
  if (!user) return unauthorized();

  const env = await getWorkspaceForEnvironment(envId);
  if (!env) return notFound('Environment not found.');

  const membership = await requireWorkspaceMember(user.id, env.workspace_id);
  if (!membership) return notFound('Environment not found.');

  // ETag based on last_modified_at
  const etag = `"${new Date(env.last_modified_at).getTime()}"`;
  return ok(env, 200);
}

// DELETE /api/v1/environments/:id — admin+ only
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const { id: envId } = await params;
  const user = await getRequestUser(req);
  if (!user) return unauthorized();

  const env = await getWorkspaceForEnvironment(envId);
  if (!env) return notFound('Environment not found.');

  const membership = await requireWorkspaceMember(user.id, env.workspace_id, 'admin');
  if (!membership) return forbidden('Admin or owner required to delete environments.');

  try {
    await sql`DELETE FROM environments WHERE id = ${envId}`;
    return noContent();
  } catch (e) {
    console.error('[environment DELETE]', e);
    return serverError();
  }
}
