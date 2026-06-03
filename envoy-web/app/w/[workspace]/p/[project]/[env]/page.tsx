import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { getAuthToken } from '@/lib/auth';
import { authFetch } from '@/lib/api';
import Nav from '@/components/Nav';

interface WorkspaceOut { id: string; name: string; slug: string; }
interface EnvironmentOut { id: string; name: string; project_id: string; last_modified_at: string; }
interface SecretOut {
  id: string;
  key_name: string;
  version: number;
  updated_at: string;
  updated_by_email?: string;
}

export default async function SecretsPage({
  params,
}: {
  params: { workspace: string; project: string; env: string };
}) {
  const token = await getAuthToken();
  if (!token) redirect('/auth/login');

  // Resolve workspace
  const workspaces = await authFetch<WorkspaceOut[]>('/v1/workspaces', token).catch(() => [] as WorkspaceOut[]);
  const workspace = workspaces.find(w => w.slug === params.workspace);
  if (!workspace) notFound();

  // Get environments for this project
  let envs: EnvironmentOut[] = [];
  let env: EnvironmentOut | undefined;
  try {
    envs = await authFetch<EnvironmentOut[]>(`/v1/projects/${params.project}/environments`, token);
    env = envs.find(e => e.name === params.env);
  } catch {}

  if (!env) notFound();

  let secrets: SecretOut[] = [];
  try {
    secrets = await authFetch<SecretOut[]>(`/v1/environments/${env.id}/secrets`, token);
  } catch {}

  return (
    <div className="min-h-screen">
      <Nav workspaceSlug={workspace.slug} workspaceName={workspace.name} />
      <main className="max-w-4xl mx-auto px-6 py-10">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-6">
          <Link href={`/w/${workspace.slug}`} className="hover:text-white">Projects</Link>
          <span>/</span>
          <span className="text-white font-medium">{params.env}</span>
        </div>

        {/* Environment tabs */}
        <div className="flex gap-2 mb-8">
          {envs.map(e => (
            <Link
              key={e.id}
              href={`/w/${params.workspace}/p/${params.project}/${e.name}`}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                e.name === params.env
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : 'bg-gray-900 text-gray-400 hover:text-white border border-gray-800'
              }`}
            >
              {e.name}
            </Link>
          ))}
        </div>

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold">{secrets.length} secrets</h1>
            <p className="text-gray-500 text-sm mt-1">
              Values are encrypted client-side and cannot be viewed in the web UI.
            </p>
          </div>
        </div>

        {/* Secrets table */}
        {secrets.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <p className="mb-4">No secrets in {params.env} yet.</p>
            <code className="block bg-gray-900 px-4 py-2 rounded mono text-emerald-400 text-sm">
              envoy push --env {params.env}
            </code>
          </div>
        ) : (
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-gray-500 text-xs uppercase tracking-wider">
                  <th className="text-left px-5 py-3 font-medium">Key</th>
                  <th className="text-left px-5 py-3 font-medium">Value</th>
                  <th className="text-left px-5 py-3 font-medium">Version</th>
                  <th className="text-left px-5 py-3 font-medium">Updated</th>
                  <th className="text-left px-5 py-3 font-medium">By</th>
                </tr>
              </thead>
              <tbody>
                {secrets.map((s, i) => (
                  <tr
                    key={s.id}
                    className={`${i > 0 ? 'border-t border-gray-800/50' : ''} hover:bg-gray-800/40 transition-colors`}
                  >
                    <td className="px-5 py-3 mono font-medium text-emerald-300">{s.key_name}</td>
                    <td className="px-5 py-3">
                      <span className="bg-gray-800 px-2 py-0.5 rounded mono text-gray-500 text-xs">
                        ••••••••
                      </span>
                    </td>
                    <td className="px-5 py-3 text-gray-500">v{s.version}</td>
                    <td className="px-5 py-3 text-gray-500">
                      {new Date(s.updated_at).toLocaleDateString()}
                    </td>
                    <td className="px-5 py-3 text-gray-500">{s.updated_by_email ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
