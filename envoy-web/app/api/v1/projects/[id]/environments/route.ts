import { NextRequest } from 'next/server';
import { getRequestUser } from '@/lib/auth-server';
import { ok, created, unauthorized, forbidden, notFound, unprocessable, serverError } from '@/lib/errors';
import { requireWorkspaceMember, getWorkspaceForProject } from '@/lib/access';
import { writeAudit } from '@/lib/audit';
import sql from '@/lib/db';

type Ctx = { params: Promise<{ id: string }> };

// GET /api/v1/projects/:id/environments
export async function GET(req: NextRequest, { params }: Ctx) {
  const { id: projectId } = await params;
  const user = await getRequestUser(req);
  if (!user) return unauthorized();

  const project = await getWorkspaceForProject(projectId);
  if (!project) return notFound('Project not found.');

  const membership = await requireWorkspaceMember(user.id, project.workspace_id);
  if (!membership) return notFound('Project not found.');

  const rows = await sql`
    SELECT id, project_id, name, last_modified_at, created_at
    FROM   environments
    WHERE  project_id = ${projectId}
    ORDER  BY created_at ASC
  `;

  return ok(rows);
}

// POST /api/v1/projects/:id/environments
export async function POST(req: NextRequest, { params }: Ctx) {
  const { id: projectId } = await params;
  const user = await getRequestUser(req);
  if (!user) return unauthorized();

  const project = await getWorkspaceForProject(projectId);
  if (!project) return notFound('Project not found.');

  const membership = await requireWorkspaceMember(user.id, project.workspace_id, 'admin');
  if (!membership) return forbidden('Admin or owner required to create environments.');

  const body = await req.json().catch(() => null);
  const name = body?.name?.trim();
  if (!name) return unprocessable('name is required.');

  try {
    const [env] = await sql`
      INSERT INTO environments (project_id, name)
      VALUES (${projectId}, ${name})
      RETURNING id, project_id, name, last_modified_at, created_at
    `;

    writeAudit(project.workspace_id, user.id, 'env_created', { project_id: projectId, name });

    return created(env);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '';
    if (msg.includes('unique') || msg.includes('duplicate')) {
      return unprocessable(`An environment named "${name}" already exists in this project.`);
    }
    console.error('[environments POST]', e);
    return serverError();
  }
}
