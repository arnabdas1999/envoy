import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { getAuthToken } from '@/lib/auth';
import { authFetch } from '@/lib/api';
import Nav from '@/components/Nav';

interface WorkspaceOut { id: string; name: string; slug: string; }
interface AuditEntry {
  id: string;
  user_email?: string;
  action: string;
  detail?: Record<string, unknown>;
  ip_address?: string;
  created_at: string;
}
interface AuditPage { items: AuditEntry[]; next_cursor: string | null; }

const ACTION_COLORS: Record<string, string> = {
  secret_push: 'text-emerald-400',
  secret_pull: 'text-cyan-400',
  secret_delete: 'text-red-400',
  member_invited: 'text-blue-400',
  member_removed: 'text-red-400',
  role_changed: 'text-yellow-400',
  key_rotated: 'text-purple-400',
  project_created: 'text-emerald-400',
  env_created: 'text-emerald-400',
};

export default async function AuditPage({
  params,
  searchParams,
}: {
  params: { workspace: string };
  searchParams: { action?: string; cursor?: string };
}) {
  const token = await getAuthToken();
  if (!token) redirect('/auth/login');

  const workspaces = await authFetch<WorkspaceOut[]>('/v1/workspaces', token).catch(() => [] as WorkspaceOut[]);
  const workspace = workspaces.find(w => w.slug === params.workspace);
  if (!workspace) notFound();

  let auditPath = `/v1/workspaces/${workspace.id}/audit?limit=50`;
  if (searchParams.action) auditPath += `&action=${searchParams.action}`;
  if (searchParams.cursor) auditPath += `&cursor=${searchParams.cursor}`;

  const page = await authFetch<AuditPage>(auditPath, token).catch(() => ({ items: [], next_cursor: null } as AuditPage));

  const ACTIONS = [
    'secret_push', 'secret_pull', 'secret_delete',
    'member_invited', 'member_removed', 'role_changed',
    'key_rotated', 'project_created', 'env_created',
  ];

  return (
    <div className="min-h-screen">
      <Nav workspaceSlug={workspace.slug} workspaceName={workspace.name} />
      <main className="max-w-4xl mx-auto px-6 py-10">
        <div className="mb-8">
          <Link href={`/w/${workspace.slug}`} className="text-gray-500 hover:text-white text-sm mb-1 block">
            ← Back to projects
          </Link>
          <h1 className="text-2xl font-bold">Audit Log</h1>
        </div>

        {/* Action filter */}
        <div className="flex flex-wrap gap-2 mb-6">
          <Link
            href={`/w/${params.workspace}/audit`}
            className={`px-3 py-1 rounded-full text-xs border transition-colors ${
              !searchParams.action
                ? 'bg-gray-700 border-gray-600 text-white'
                : 'border-gray-800 text-gray-500 hover:text-white'
            }`}
          >
            All
          </Link>
          {ACTIONS.map(action => (
            <Link
              key={action}
              href={`/w/${params.workspace}/audit?action=${action}`}
              className={`px-3 py-1 rounded-full text-xs border transition-colors mono ${
                searchParams.action === action
                  ? 'bg-gray-700 border-gray-600 text-white'
                  : 'border-gray-800 text-gray-500 hover:text-white'
              }`}
            >
              {action}
            </Link>
          ))}
        </div>

        {/* Log entries */}
        {page.items.length === 0 ? (
          <div className="text-center py-16 text-gray-500">No audit entries found.</div>
        ) : (
          <div className="space-y-1">
            {page.items.map(entry => (
              <div
                key={entry.id}
                className="flex items-start gap-4 py-3 px-4 rounded-lg hover:bg-gray-900/50 transition-colors"
              >
                <span className="text-gray-600 text-xs mono whitespace-nowrap pt-0.5">
                  {new Date(entry.created_at).toLocaleString()}
                </span>
                <span className={`mono text-sm font-medium w-40 shrink-0 ${ACTION_COLORS[entry.action] ?? 'text-gray-400'}`}>
                  {entry.action}
                </span>
                <span className="text-gray-300 text-sm">{entry.user_email ?? '—'}</span>
                {entry.detail && (
                  <span className="text-gray-600 text-xs mono truncate">
                    {JSON.stringify(entry.detail)}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        {page.next_cursor && (
          <div className="mt-8 text-center">
            <Link
              href={`/w/${params.workspace}/audit?cursor=${page.next_cursor}${searchParams.action ? `&action=${searchParams.action}` : ''}`}
              className="text-emerald-400 hover:underline text-sm"
            >
              Load more →
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}
