import { NextRequest } from 'next/server';
import { getRequestUser } from '@/lib/auth-server';
import { ok, unauthorized, notFound } from '@/lib/errors';
import { requireWorkspaceMember, getWorkspaceForEnvironment } from '@/lib/access';
import sql from '@/lib/db';

type Ctx = { params: Promise<{ id: string; key: string }> };

// GET /api/v1/environments/:id/secrets/:key/versions
export async function GET(req: NextRequest, { params }: Ctx) {
  const { id: envId, key: keyName } = await params;
  const user = await getRequestUser(req);
  if (!user) return unauthorized();

  const env = await getWorkspaceForEnvironment(envId);
  if (!env) return notFound('Environment not found.');

  const membership = await requireWorkspaceMember(user.id, env.workspace_id);
  if (!membership) return notFound('Environment not found.');

  // Resolve the secret ID
  const [secret] = await sql`
    SELECT id FROM secrets
    WHERE environment_id = ${envId} AND key_name = ${keyName}
    LIMIT 1
  `;
  if (!secret) return notFound(`No secret named "${keyName}" found.`);

  const versions = await sql`
    SELECT sv.version, sv.ciphertext, sv.iv, sv.auth_tag,
           sv.created_at, u.email AS updated_by_email
    FROM   secret_versions sv
    LEFT   JOIN users u ON u.id = sv.updated_by
    WHERE  sv.secret_id = ${secret.id}
    ORDER  BY sv.version DESC
  `;

  return ok(versions);
}
