import { NextRequest } from 'next/server';
import { getRequestUser } from '@/lib/auth-server';
import { ok, unauthorized, forbidden, unprocessable, conflict, serverError } from '@/lib/errors';
import { requireWorkspaceMember } from '@/lib/access';
import { writeAudit } from '@/lib/audit';
import sql from '@/lib/db';
import { Resend } from 'resend';

type Ctx = { params: Promise<{ id: string }> };

async function sendInviteEmail(to: string, workspaceName: string) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey.startsWith('re_test')) {
    console.log(`[dev] Invite email to ${to} for workspace "${workspaceName}"`);
    return;
  }
  const resend = new Resend(apiKey);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://useenvoy.dev';
  await resend.emails.send({
    from: process.env.RESEND_FROM ?? 'invites@useenvoy.dev',
    to,
    subject: `You've been invited to ${workspaceName} on Envoy`,
    html: `
      <p>You've been invited to join the <strong>${workspaceName}</strong> workspace on Envoy.</p>
      <p>Sign in at <a href="${appUrl}/auth/login">${appUrl}</a> to get started.</p>
      <p>Your teammate will share the workspace master key with you separately.</p>
    `,
  });
}

// POST /api/v1/workspaces/:id/invites
export async function POST(req: NextRequest, { params }: Ctx) {
  const { id: workspaceId } = await params;
  const user = await getRequestUser(req);
  if (!user) return unauthorized();

  const membership = await requireWorkspaceMember(user.id, workspaceId, 'admin');
  if (!membership) return forbidden('Admin or owner required to invite members.');

  const body = await req.json().catch(() => null);
  const email = body?.email?.trim()?.toLowerCase();
  if (!email || !email.includes('@')) return unprocessable('A valid email is required.');

  try {
    // Upsert invitee user
    await sql`INSERT INTO users (email) VALUES (${email}) ON CONFLICT (email) DO NOTHING`;
    const [invitee] = await sql`SELECT id FROM users WHERE email = ${email}`;

    // Check if already a member
    const [existing] = await sql`
      SELECT id FROM memberships
      WHERE workspace_id = ${workspaceId} AND user_id = ${invitee.id}
    `;
    if (existing) return conflict('This user is already a member of the workspace.');

    await sql`
      INSERT INTO memberships (workspace_id, user_id, role)
      VALUES (${workspaceId}, ${invitee.id}, 'member')
    `;

    const [ws] = await sql`SELECT name FROM workspaces WHERE id = ${workspaceId}`;
    writeAudit(workspaceId, user.id, 'member_invited', { email });

    try {
      await sendInviteEmail(email, ws?.name ?? workspaceId);
    } catch (e) {
      console.error('[invite] email failed', e);
    }

    return ok({ message: `${email} has been added to the workspace.` });
  } catch (e) {
    console.error('[invite POST]', e);
    return serverError();
  }
}
