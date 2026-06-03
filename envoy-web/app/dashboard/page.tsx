import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getAuthToken } from '@/lib/auth';
import { authFetch } from '@/lib/api';
import Nav from '@/components/Nav';

interface WorkspaceOut {
  id: string;
  name: string;
  slug: string;
  created_at: string;
}

export default async function DashboardPage() {
  const token = await getAuthToken();
  if (!token) redirect('/auth/login');

  let workspaces: WorkspaceOut[] = [];
  let userEmail = '';

  try {
    [workspaces, { email: userEmail }] = await Promise.all([
      authFetch<WorkspaceOut[]>('/v1/workspaces', token),
      authFetch<{ email: string }>('/v1/auth/me', token),
    ]);
  } catch {
    redirect('/auth/login');
  }

  return (
    <div className="min-h-screen">
      <Nav />
      <main className="max-w-4xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold">Workspaces</h1>
            <p className="text-gray-400 mt-1">Signed in as {userEmail}</p>
          </div>
        </div>

        {workspaces.length === 0 ? (
          <div className="text-center py-20 text-gray-500">
            <p className="text-lg mb-4">No workspaces yet.</p>
            <p className="text-sm">Create one with:</p>
            <code className="block mt-2 bg-gray-900 px-4 py-2 rounded mono text-emerald-400">
              envoy workspace create my-team
            </code>
          </div>
        ) : (
          <div className="grid gap-4">
            {workspaces.map(ws => (
              <Link
                key={ws.id}
                href={`/w/${ws.slug}`}
                className="bg-gray-900 border border-gray-800 hover:border-gray-600 rounded-xl p-6 flex items-center justify-between group transition-colors"
              >
                <div>
                  <h2 className="font-semibold text-lg group-hover:text-emerald-400 transition-colors">
                    {ws.name}
                  </h2>
                  <p className="text-gray-500 text-sm mono">{ws.slug}</p>
                </div>
                <span className="text-gray-600 group-hover:text-gray-400 text-xl">→</span>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
