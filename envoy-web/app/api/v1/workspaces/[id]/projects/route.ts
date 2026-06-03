import { NextRequest } from 'next/server';
import { getRequestUser } from '@/lib/auth-server';
import { ok, created, unauthorized, forbidden, unprocessable, serverError } from '@/lib/errors';
import { requireWorkspaceMember } from '@/lib/access';
import { writeAudit } from '@/lib/audit';
import { toSlug } from '@/lib/slug';
import sql from '@/lib/db';

type Ctx = { params: Promise<{ id: string }> };

// GET /api/v1/workspaces/:id/projects
export async function GET(req: NextRequest, { params }: Ctx) {
  const { id: workspaceId } = await params;
  const user = await getRequestUser(req);
  if (!user) return unauthorized();

  const membership = await requireWorkspaceMember(user.id, workspaceId);
  if (!membership) return forbidden();

  const rows = await sql`
    SELECT id, workspace_id, name, slug, created_at, updated_at
    FROM   projects
    WHERE  workspace_id = ${workspaceId}
    ORDER  BY created_at ASC
  `;

  return ok(rows);
}

// POST /api/v1/workspaces/:id/projects
export async function POST(req: NextRequest, { params }: Ctx) {
  const { id: workspaceId } = await params;
  const user = await getRequestUser(req);
  if (!user) return unauthorized();

  const membership = await requireWorkspaceMember(user.id, workspaceId, 'admin');
  if (!membership) return forbidden('Admin or owner required to create projects.');

  const body = await req.json().catch(() => null);
  const name = body?.name?.trim();
  if (!name) return unprocessable('name is required.');

  const slug = toSlug(name);
  if (!slug) return unprocessable('name produces an empty slug.');

  try {
    const [project] = await sql`
      INSERT INTO projects (workspace_id, name, slug)
      VALUES (${workspaceId}, ${name}, ${slug})
      RETURNING id, workspace_id, name, slug, created_at
    `;

    writeAudit(workspaceId, user.id, 'project_created', { project_id: project.id, name });

    return created(project);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '';
    if (msg.includes('unique') || msg.includes('duplicate')) {
      return unprocessable(`A project with slug "${slug}" already exists in this workspace.`);
    }
    console.error('[projects POST]', e);
    return serverError();
  }
}
