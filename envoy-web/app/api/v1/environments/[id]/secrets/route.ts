import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/auth-server';
import {
  ok, unauthorized, forbidden, notFound, preconditionFailed,
  unprocessable, serverError,
} from '@/lib/errors';
import { requireWorkspaceMember, getWorkspaceForEnvironment } from '@/lib/access';
import { writeAudit } from '@/lib/audit';
import { WRITE_LIMIT } from '@/lib/rate-limit';
import sql from '@/lib/db';

type Ctx = { params: Promise<{ id: string }> };

const MAX_SECRETS = 500;
const MAX_VALUE_BYTES = 1_048_576; // 1 MB
const MAX_PAYLOAD_BYTES = 10_485_760; // 10 MB

interface SecretInput {
  key_name: string;
  ciphertext: string;
  iv: string;
  auth_tag: string;
}

// GET /api/v1/environments/:id/secrets
export async function GET(req: NextRequest, { params }: Ctx) {
  const { id: envId } = await params;
  const user = await getRequestUser(req);
  if (!user) return unauthorized();

  const env = await getWorkspaceForEnvironment(envId);
  if (!env) return notFound('Environment not found.');

  const membership = await requireWorkspaceMember(user.id, env.workspace_id);
  if (!membership) return notFound('Environment not found.');

  const rows = await sql`
    SELECT s.id, s.key_name, s.ciphertext, s.iv, s.auth_tag,
           s.version, s.updated_at, u.email AS updated_by_email
    FROM   secrets s
    LEFT   JOIN users u ON u.id = s.updated_by
    WHERE  s.environment_id = ${envId}
      AND  s.deleted_at IS NULL
    ORDER  BY s.key_name ASC
  `;

  const etag = `"${new Date(env.last_modified_at).getTime()}"`;
  const res = NextResponse.json(rows, { status: 200 });
  res.headers.set('ETag', etag);

  // Write audit (non-blocking)
  writeAudit(env.workspace_id, user.id, 'secret_pull', {
    env_id: envId, count: rows.length,
  });

  return res;
}

// PUT /api/v1/environments/:id/secrets — full replace with ETag concurrency check
export async function PUT(req: NextRequest, { params }: Ctx) {
  const { id: envId } = await params;
  const ip = req.headers.get('x-forwarded-for') ?? 'unknown';
  if (!WRITE_LIMIT(ip)) return unprocessable('Rate limit exceeded.');

  const user = await getRequestUser(req);
  if (!user) return unauthorized();

  const env = await getWorkspaceForEnvironment(envId);
  if (!env) return notFound('Environment not found.');

  const membership = await requireWorkspaceMember(user.id, env.workspace_id);
  if (!membership) return forbidden();

  // ETag / If-Match concurrency check
  const ifMatch = req.headers.get('if-match');
  if (ifMatch) {
    const currentEtag = `"${new Date(env.last_modified_at).getTime()}"`;
    if (ifMatch !== currentEtag) {
      return preconditionFailed(
        'Environment has been modified by another client. Run `envoy pull` first.',
      );
    }
  }

  let body: SecretInput[];
  try {
    const raw = await req.text();
    if (raw.length > MAX_PAYLOAD_BYTES) {
      return unprocessable(`Payload exceeds the ${MAX_PAYLOAD_BYTES / 1_048_576} MB limit.`);
    }
    body = JSON.parse(raw);
  } catch {
    return unprocessable('Request body must be a JSON array.');
  }

  if (!Array.isArray(body)) return unprocessable('Request body must be a JSON array.');
  if (body.length > MAX_SECRETS) {
    return unprocessable(`Cannot push more than ${MAX_SECRETS} secrets per environment.`);
  }

  for (const item of body) {
    if (!item.key_name || typeof item.key_name !== 'string') {
      return unprocessable('Each secret must have a key_name string.');
    }
    if (!item.ciphertext || !item.iv || !item.auth_tag) {
      return unprocessable(`Secret "${item.key_name}" is missing ciphertext, iv, or auth_tag.`);
    }
    if (Buffer.byteLength(item.ciphertext, 'base64') > MAX_VALUE_BYTES) {
      return unprocessable(`Secret "${item.key_name}" exceeds the 1 MB value size limit.`);
    }
  }

  try {
    await sql.begin(async tx => {
      // Archive current values to secret_versions before overwriting
      const keyNames = body.map(s => s.key_name);

      const existing = await tx`
        SELECT id, key_name, ciphertext, iv, auth_tag, version, updated_by
        FROM   secrets
        WHERE  environment_id = ${envId}
          AND  deleted_at IS NULL
      `;

      // Archive rows that will be updated
      const toUpdate = existing.filter(e => keyNames.includes(e.key_name));
      for (const row of toUpdate) {
        await tx`
          INSERT INTO secret_versions
            (secret_id, key_name, ciphertext, iv, auth_tag, version, updated_by)
          VALUES
            (${row.id}, ${row.key_name}, ${row.ciphertext}, ${row.iv},
             ${row.auth_tag}, ${row.version}, ${row.updated_by})
        `;
      }

      // Soft-delete secrets that are no longer in the push
      const existingKeys = existing.map(e => e.key_name);
      const removedKeys = existingKeys.filter(k => !keyNames.includes(k));
      if (removedKeys.length > 0) {
        await tx`
          UPDATE secrets
          SET    deleted_at = now(), updated_at = now()
          WHERE  environment_id = ${envId}
            AND  key_name = ANY(${removedKeys})
            AND  deleted_at IS NULL
        `;
      }

      // Upsert each secret
      for (const s of body) {
        const existingRow = toUpdate.find(e => e.key_name === s.key_name);
        const newVersion = existingRow ? existingRow.version + 1 : 1;

        await tx`
          INSERT INTO secrets
            (environment_id, key_name, ciphertext, iv, auth_tag, version, updated_by)
          VALUES
            (${envId}, ${s.key_name}, ${s.ciphertext}, ${s.iv}, ${s.auth_tag},
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
      }

      // Update environment's last_modified_at (used for ETag)
      await tx`
        UPDATE environments SET last_modified_at = now() WHERE id = ${envId}
      `;
    });

    const [updated] = await sql`
      SELECT last_modified_at FROM environments WHERE id = ${envId}
    `;

    writeAudit(env.workspace_id, user.id, 'secret_push', {
      env_id: envId, count: body.length, key_names: body.map(s => s.key_name),
    });

    return ok({ pushed: body.length, updated_at: updated.last_modified_at });
  } catch (e) {
    console.error('[secrets PUT]', e);
    return serverError();
  }
}
