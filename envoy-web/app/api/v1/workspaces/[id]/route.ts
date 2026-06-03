import { NextRequest } from 'next/server';
import { getRequestUser } from '@/lib/auth-server';
import { ok, noContent, unauthorized, forbidden, notFound, serverError } from '@/lib/errors';
import { requireWorkspaceMember } from '@/lib/access';
import sql from '@/lib/db';

type Ctx = { params: Promise<{ id: string }> };

// GET /api/v1/workspaces/:id
export async function GET(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const user = await getRequestUser(req);
  if (!user) return unauthorized();

  const membership = await requireWorkspaceMember(user.id, id);
  if (!membership) return notFound('Workspace not found.');

  const [ws] = await sql`
    SELECT id, name, slug, workspace_salt, master_key_hash, created_at, updated_at
    FROM workspaces WHERE id = ${id}
  `;
  if (!ws) return notFound('Workspace not found.');

  return ok({ ...ws, role: membership.role });
}

// DELETE /api/v1/workspaces/:id — owner only
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const user = await getRequestUser(req);
  if (!user) return unauthorized();

  const membership = await requireWorkspaceMember(user.id, id, 'owner');
  if (!membership) return forbidden('Only the workspace owner can delete it.');

  try {
    await sql`DELETE FROM workspaces WHERE id = ${id}`;
    return noContent();
  } catch (e) {
    console.error('[workspace DELETE]', e);
    return serverError();
  }
}
