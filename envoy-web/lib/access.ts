import sql from './db';
import { getWorkspaceMembership, type WorkspaceRole } from './auth-server';

// ─── Context resolution helpers ──────────────────────────────────────────────

export async function getWorkspaceForProject(projectId: string) {
  const rows = await sql`
    SELECT id, workspace_id, name, slug FROM projects WHERE id = ${projectId} LIMIT 1
  `;
  return rows[0] as { id: string; workspace_id: string; name: string; slug: string } | undefined;
}

export async function getWorkspaceForEnvironment(envId: string) {
  const rows = await sql`
    SELECT e.id, e.name, e.project_id, e.last_modified_at,
           p.workspace_id, p.name AS project_name
    FROM   environments e
    JOIN   projects p ON p.id = e.project_id
    WHERE  e.id = ${envId}
    LIMIT  1
  `;
  return rows[0] as {
    id: string; name: string; project_id: string; last_modified_at: string;
    workspace_id: string; project_name: string;
  } | undefined;
}

// ─── Authorization guard ─────────────────────────────────────────────────────

export type MinRole = WorkspaceRole;

const ROLE_RANK: Record<WorkspaceRole, number> = { owner: 3, admin: 2, member: 1 };

export function roleAtLeast(actual: WorkspaceRole, required: MinRole): boolean {
  return ROLE_RANK[actual] >= ROLE_RANK[required];
}

export async function requireWorkspaceMember(
  userId: string,
  workspaceId: string,
  minRole: MinRole = 'member',
): Promise<{ id: string; role: WorkspaceRole } | null> {
  const membership = await getWorkspaceMembership(userId, workspaceId);
  if (!membership) return null;
  if (!roleAtLeast(membership.role, minRole)) return null;
  return membership;
}
