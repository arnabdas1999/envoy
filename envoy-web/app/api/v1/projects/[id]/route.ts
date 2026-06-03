import { NextRequest } from 'next/server';
import { getRequestUser } from '@/lib/auth-server';
import { ok, noContent, unauthorized, forbidden, notFound, serverError } from '@/lib/errors';
import { requireWorkspaceMember, getWorkspaceForProject } from '@/lib/access';
import sql from '@/lib/db';

type Ctx = { params: Promise<{ id: string }> };

// GET /api/v1/projects/:id
export async function GET(req: NextRequest, { params }: Ctx) {
  const { id: projectId } = await params;
  const user = await getRequestUser(req);
  if (!user) return unauthorized();

  const project = await getWorkspaceForProject(projectId);
  if (!project) return notFound('Project not found.');

  const membership = await requireWorkspaceMember(user.id, project.workspace_id);
  if (!membership) return notFound('Project not found.');

  return ok(project);
}

// DELETE /api/v1/projects/:id — admin+ only
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const { id: projectId } = await params;
  const user = await getRequestUser(req);
  if (!user) return unauthorized();

  const project = await getWorkspaceForProject(projectId);
  if (!project) return notFound('Project not found.');

  const membership = await requireWorkspaceMember(user.id, project.workspace_id, 'admin');
  if (!membership) return forbidden('Admin or owner required to delete projects.');

  try {
    await sql`DELETE FROM projects WHERE id = ${projectId}`;
    return noContent();
  } catch (e) {
    console.error('[project DELETE]', e);
    return serverError();
  }
}
