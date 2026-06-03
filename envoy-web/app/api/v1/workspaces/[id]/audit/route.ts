import { NextRequest } from 'next/server';
import { getRequestUser } from '@/lib/auth-server';
import { ok, unauthorized, forbidden } from '@/lib/errors';
import { requireWorkspaceMember } from '@/lib/access';
import sql from '@/lib/db';

type Ctx = { params: Promise<{ id: string }> };

// GET /api/v1/workspaces/:id/audit?cursor=<id>&limit=50&action=<action>
export async function GET(req: NextRequest, { params }: Ctx) {
  const { id: workspaceId } = await params;
  const user = await getRequestUser(req);
  if (!user) return unauthorized();

  const membership = await requireWorkspaceMember(user.id, workspaceId);
  if (!membership) return forbidden();

  const sp = req.nextUrl.searchParams;
  const cursor = sp.get('cursor');
  const action = sp.get('action');
  const limit = Math.min(Number(sp.get('limit') ?? 50), 100);

  const rows = await sql`
    SELECT a.id, a.action, a.detail, a.ip_address, a.user_agent,
           a.created_at, u.email AS user_email
    FROM   audit_log a
    LEFT   JOIN users u ON u.id = a.user_id
    WHERE  a.workspace_id = ${workspaceId}
      AND  (${action} IS NULL OR a.action = ${action})
      AND  (${cursor} IS NULL OR a.id < ${cursor})
    ORDER  BY a.created_at DESC
    LIMIT  ${limit + 1}
  `;

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? items[items.length - 1].id : null;

  return ok({ items, next_cursor: nextCursor });
}
