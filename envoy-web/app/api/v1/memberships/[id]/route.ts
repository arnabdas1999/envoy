import { NextRequest } from 'next/server';
import { getRequestUser } from '@/lib/auth-server';
import { ok, noContent, unauthorized, forbidden, notFound, unprocessable, serverError } from '@/lib/errors';
import { requireWorkspaceMember } from '@/lib/access';
import { writeAudit } from '@/lib/audit';
import sql from '@/lib/db';

type Ctx = { params: Promise<{ id: string }> };

const VALID_ROLES = ['owner', 'admin', 'member'] as const;
type Role = (typeof VALID_ROLES)[number];

async function getMembership(membershipId: string) {
  const rows = await sql`
    SELECT m.id, m.workspace_id, m.user_id, m.role, u.email
    FROM   memberships m
    JOIN   users u ON u.id = m.user_id
    WHERE  m.id = ${membershipId}
    LIMIT  1
  `;
  return rows[0] ?? null;
}

// PATCH /api/v1/memberships/:id — change a member's role (admin+ only)
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id: membershipId } = await params;
  const user = await getRequestUser(req);
  if (!user) return unauthorized();

  const target = await getMembership(membershipId);
  if (!target) return notFound('Membership not found.');

  const caller = await requireWorkspaceMember(user.id, target.workspace_id, 'admin');
  if (!caller) return forbidden('Admin or owner required to change roles.');

  const body = await req.json().catch(() => null);
  const role = body?.role;
  if (!role || !VALID_ROLES.includes(role as Role)) {
    return unprocessable(`role must be one of: ${VALID_ROLES.join(', ')}.`);
  }

  // Only owner can assign/unassign owner role
  if ((role === 'owner' || target.role === 'owner') && caller.role !== 'owner') {
    return forbidden('Only an owner can assign or remove the owner role.');
  }

  try {
    await sql`UPDATE memberships SET role = ${role} WHERE id = ${membershipId}`;
    writeAudit(target.workspace_id, user.id, 'role_changed', {
      email: target.email, old_role: target.role, new_role: role,
    });
    return ok({ id: membershipId, role });
  } catch (e) {
    console.error('[membership PATCH]', e);
    return serverError();
  }
}

// DELETE /api/v1/memberships/:id — remove a member (admin+ only)
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const { id: membershipId } = await params;
  const user = await getRequestUser(req);
  if (!user) return unauthorized();

  const target = await getMembership(membershipId);
  if (!target) return notFound('Membership not found.');

  const caller = await requireWorkspaceMember(user.id, target.workspace_id, 'admin');
  if (!caller) return forbidden('Admin or owner required to remove members.');

  // Cannot remove an owner (they must transfer ownership first)
  if (target.role === 'owner') {
    return forbidden('Cannot remove the workspace owner. Transfer ownership first.');
  }

  // Cannot remove yourself if you are the only admin/owner
  if (target.user_id === user.id) {
    return forbidden('You cannot remove yourself. Ask another admin or owner to do this.');
  }

  try {
    await sql`DELETE FROM memberships WHERE id = ${membershipId}`;
    writeAudit(target.workspace_id, user.id, 'member_removed', { email: target.email });
    return noContent();
  } catch (e) {
    console.error('[membership DELETE]', e);
    return serverError();
  }
}
