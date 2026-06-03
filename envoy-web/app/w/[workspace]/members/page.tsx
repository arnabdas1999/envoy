import { redirect, notFound } from 'next/navigation';
import { getAuthToken } from '@/lib/auth';
import { authFetch } from '@/lib/api';
import Nav from '@/components/Nav';
import Link from 'next/link';

interface WorkspaceOut { id: string; name: string; slug: string; }
interface MemberOut {
  membership_id: string;
  user_id: string;
  email: string;
  role: string;
  joined_at: string;
}

const ROLE_BADGE: Record<string, string> = {
  owner: 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30',
  admin: 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30',
  member: 'bg-gray-700/50 text-gray-400 border border-gray-700',
};

export default async function MembersPage({ params }: { params: { workspace: string } }) {
  const token = await getAuthToken();
  if (!token) redirect('/auth/login');

  const workspaces = await authFetch<WorkspaceOut[]>('/v1/workspaces', token).catch(() => [] as WorkspaceOut[]);
  const workspace = workspaces.find(w => w.slug === params.workspace);
  if (!workspace) notFound();

  const members = await authFetch<MemberOut[]>(
    `/v1/workspaces/${workspace.id}/members`, token
  ).catch(() => [] as MemberOut[]);

  return (
    <div className="min-h-screen">
      <Nav workspaceSlug={workspace.slug} workspaceName={workspace.name} />
      <main className="max-w-4xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-8">
          <div>
            <Link href={`/w/${workspace.slug}`} className="text-gray-500 hover:text-white text-sm mb-1 block">
              ← Back to projects
            </Link>
            <h1 className="text-2xl font-bold">Team Members</h1>
          </div>
          <div className="text-sm text-gray-400">
            To invite: <code className="mono text-emerald-400">envoy invite email@example.com</code>
          </div>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-gray-500 text-xs uppercase tracking-wider">
                <th className="text-left px-5 py-3 font-medium">Email</th>
                <th className="text-left px-5 py-3 font-medium">Role</th>
                <th className="text-left px-5 py-3 font-medium">Joined</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m, i) => (
                <tr
                  key={m.membership_id}
                  className={`${i > 0 ? 'border-t border-gray-800/50' : ''} hover:bg-gray-800/30`}
                >
                  <td className="px-5 py-3 font-medium">{m.email}</td>
                  <td className="px-5 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ROLE_BADGE[m.role] ?? ROLE_BADGE.member}`}>
                      {m.role}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-gray-500">
                    {new Date(m.joined_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
