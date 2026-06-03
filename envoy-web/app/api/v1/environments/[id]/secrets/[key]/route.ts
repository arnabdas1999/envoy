import { NextRequest } from 'next/server';
import { getRequestUser } from '@/lib/auth-server';
import { ok, noContent, unauthorized, forbidden, notFound, unprocessable, serverError } from '@/lib/errors';
import { requireWorkspaceMember, getWorkspaceForEnvironment } from '@/lib/access';
import { writeAudit } from '@/lib/audit';
import { WRITE_LIMIT } from '@/lib/rate-limit';
import sql from '@/lib/db';

type Ctx = { params: Promise<{ id: string; key: string }> };

async function resolveSecret(envId: string, keyName: string) {
  const rows = await sql`
    SELECT s.id, s.key_name, s.ciphertext, s.iv, s.auth_tag, s.version,
           s.updated_at, u.email AS updated_by_email
    FROM   secrets s
    LEFT   JOIN users u ON u.id = s.updated_by
    WHERE  s.environment_id = ${envId}
      AND  s.key_name = ${keyName}
      AND  s.deleted_at IS NULL
    LIMIT  1
  `;
  return rows[0] ?? null;
}

// GET /api/v1/environments/:id/secrets/:key
export async function GET(req: NextRequest, { params }: Ctx) {
  const { id: envId, key: keyName } = await params;
  const user = await getRequestUser(req);
  if (!user) return unauthorized();

  const env = await getWorkspaceForEnvironment(envId);
  if (!env) return notFound('Environment not found.');

  const membership = await requireWorkspaceMember(user.id, env.workspace_id);
  if (!membership) return notFound('Environment not found.');

  const secret = await resolveSecret(envId, keyName);
  if (!secret) return notFound(`No secret named "${keyName}" in this environment.`);

  return ok(secret);
}

// PUT /api/v1/environments/:id/secrets/:key — set or update a single secret
export async function PUT(req: NextRequest, { params }: Ctx) {
  const { id: envId, key: keyName } = await params;
  const ip = req.headers.get('x-forwarded-for') ?? 'unknown';
  if (!WRITE_LIMIT(ip)) return unprocessable('Rate limit exceeded.');

  const user = await getRequestUser(req);
  if (!user) return unauthorized();

  const env = await getWorkspaceForEnvironment(envId);
  if (!env) return notFound('Environment not found.');

  const membership = await requireWorkspaceMember(user.id, env.workspace_id);
  if (!membership) return forbidden();

  const body = await req.json().catch(() => null);
  if (!body?.ciphertext || !body?.iv || !body?.auth_tag) {
    return unprocessable('ciphertext, iv, and auth_tag are required.');
  }

  try {
    await sql.begin(async tx => {
      // Archive existing value if present
      const [existing] = await tx`
        SELECT id, ciphertext, iv, auth_tag, version, updated_by
        FROM   secrets
        WHERE  environment_id = ${envId} AND key_name = ${keyName} AND deleted_at IS NULL
      `;

      if (existing) {
        await tx`
          INSERT INTO secret_versions
            (secret_id, key_name, ciphertext, iv, auth_tag, version, updated_by)
          VALUES
            (${existing.id}, ${keyName}, ${existing.ciphertext}, ${existing.iv},
             ${existing.auth_tag}, ${existing.version}, ${existing.updated_by})
        `;
      }

      const newVersion = existing ? existing.version + 1 : 1;

      await tx`
        INSERT INTO secrets
          (environment_id, key_name, ciphertext, iv, auth_tag, version, updated_by)
        VALUES
          (${envId}, ${keyName}, ${body.ciphertext}, ${body.iv}, ${body.auth_tag},
           ${newVersion}, ${user.id})
        ON CONFLICT (environment_id, key_name) WHERE deleted_at IS NULL
        DO UPDATE SET
          ciphertext = EXCLUDED.ciphertext,
          iv         = EXCLUDED.iv,
          auth_tag   = EXCLUDED.auth_tag,
          version    = EXCLUDED.version,
          updated_by = EXCLUDED.updated_by,
          updated_at = now()
      `;

      await tx`UPDATE environments SET last_modified_at = now() WHERE id = ${envId}`;
    });

    const secret = await resolveSecret(envId, keyName);
    return ok({ version: secret?.version ?? 1 });
  } catch (e) {
    console.error('[secret PUT]', e);
    return serverError();
  }
}

// DELETE /api/v1/environments/:id/secrets/:key — soft delete
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const { id: envId, key: keyName } = await params;
  const ip = req.headers.get('x-forwarded-for') ?? 'unknown';
  if (!WRITE_LIMIT(ip)) return unprocessable('Rate limit exceeded.');

  const user = await getRequestUser(req);
  if (!user) return unauthorized();

  const env = await getWorkspaceForEnvironment(envId);
  if (!env) return notFound('Environment not found.');

  const membership = await requireWorkspaceMember(user.id, env.workspace_id);
  if (!membership) return forbidden();

  const secret = await resolveSecret(envId, keyName);
  if (!secret) return notFound(`No secret named "${keyName}" in this environment.`);

  try {
    await sql`
      UPDATE secrets
      SET    deleted_at = now(), updated_at = now()
      WHERE  environment_id = ${envId} AND key_name = ${keyName} AND deleted_at IS NULL
    `;
    await sql`UPDATE environments SET last_modified_at = now() WHERE id = ${envId}`;

    writeAudit(env.workspace_id, user.id, 'secret_delete', { env_id: envId, key_name: keyName });

    return noContent();
  } catch (e) {
    console.error('[secret DELETE]', e);
    return serverError();
  }
}
