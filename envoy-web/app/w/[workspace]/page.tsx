import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { getAuthToken } from '@/lib/auth';
import { authFetch } from '@/lib/api';
import Nav from '@/components/Nav';

interface WorkspaceOut { id: string; name: string; slug: string; }
interface ProjectOut { id: string; name: string; slug: string; workspace_id: string; }
interface EnvironmentOut { id: string; name: string; last_modified_at: string; }

export default async function WorkspacePage({ params }: { params: { workspace: string } }) {
  const token = await getAuthToken();
  if (!token) redirect('/auth/login');

  let workspaces: WorkspaceOut[] = [];
  try {
    workspaces = await authFetch<WorkspaceOut[]>('/v1/workspaces', token);
  } catch {
    redirect('/auth/login');
  }

  const workspace = workspaces.find(w => w.slug === params.workspace || w.id === params.workspace);
  if (!workspace) notFound();

  let projects: ProjectOut[] = [];
  try {
    projects = await authFetch<ProjectOut[]>(`/v1/workspaces/${workspace.id}/projects`, token);
  } catch {}

  return (
    <div className="min-h-screen">
      <Nav workspaceSlug={workspace.slug} workspaceName={workspace.name} />
      <main className="max-w-4xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold">{workspace.name}</h1>
          <div className="flex gap-4 text-sm">
            <Link href={`/w/${workspace.slug}/members`} className="text-gray-400 hover:text-white">
              Members
            </Link>
            <Link href={`/w/${workspace.slug}/audit`} className="text-gray-400 hover:text-white">
              Audit log
            </Link>
          </div>
        </div>

        <h2 className="text-gray-400 text-sm font-medium uppercase tracking-wider mb-4">Projects</h2>

        {projects.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <p className="mb-4">No projects yet.</p>
            <code className="block bg-gray-900 px-4 py-2 rounded mono text-emerald-400 text-sm">
              envoy init
            </code>
          </div>
        ) : (
          <div className="grid gap-3">
            {projects.map(project => (
              <ProjectCard
                key={project.id}
                project={project}
                workspaceSlug={workspace.slug}
                token={token}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

async function ProjectCard({
  project, workspaceSlug, token,
}: {
  project: ProjectOut;
  workspaceSlug: string;
  token: string;
}) {
  let envs: EnvironmentOut[] = [];
  try {
    envs = await authFetch<EnvironmentOut[]>(`/v1/projects/${project.id}/environments`, token);
  } catch {}

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <h3 className="font-semibold mb-3">{project.name}</h3>
      <div className="flex flex-wrap gap-2">
        {envs.map(env => (
          <Link
            key={env.id}
            href={`/w/${workspaceSlug}/p/${project.id}/${env.name}`}
            className="bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg px-3 py-1.5 text-sm transition-colors"
          >
            {env.name}
          </Link>
        ))}
        {envs.length === 0 && (
          <span className="text-gray-600 text-sm">No environments</span>
        )}
      </div>
    </div>
  );
}
