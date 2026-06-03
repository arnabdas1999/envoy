import sql from './db';

type AuditAction =
  | 'secret_push' | 'secret_pull' | 'secret_delete'
  | 'member_invited' | 'member_removed' | 'role_changed'
  | 'key_rotated' | 'project_created' | 'env_created';

export async function writeAudit(
  workspaceId: string,
  userId: string | null,
  action: AuditAction,
  detail?: Record<string, unknown>,
  ip?: string | null,
  userAgent?: string | null,
) {
  // Fire-and-forget; don't block the response on audit failures
  sql`
    INSERT INTO audit_log (workspace_id, user_id, action, detail, ip_address, user_agent)
    VALUES (
      ${workspaceId},
      ${userId},
      ${action},
      ${detail ? JSON.stringify(detail) : null},
      ${ip ?? null},
      ${userAgent ?? null}
    )
  `.catch(err => console.error('[audit] write failed', err));
}
