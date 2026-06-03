import { NextRequest } from 'next/server';
import { getRequestUser } from '@/lib/auth-server';
import { ok, unauthorized, forbidden } from '@/lib/errors';
import { requireWorkspaceMember } from '@/lib/access';
import sql from '@/lib/db';

type Ctx = { params: Promise<{ id: string }> };

// GET /api/v1/workspaces/:id/members
export async function GET(req: NextRequest, { params }: Ctx) {
  const { id: workspaceId } = await params;
  const user = await getRequestUser(req);
  if (!user) return unauthorized();

  const membership = await requireWorkspaceMember(user.id, workspaceId);
  if (!membership) return forbidden();

  const rows = await sql`
    SELECT m.id AS membership_id, m.role, m.created_at AS joined_at,
           u.id AS user_id, u.email, u.is_service_account
    FROM   memberships m
    JOIN   users u ON u.id = m.user_id
    WHERE  m.workspace_id = ${workspaceId}
    ORDER  BY m.created_at ASC
  `;

  return ok(rows);
}
