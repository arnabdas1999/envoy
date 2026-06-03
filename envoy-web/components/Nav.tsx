import Link from 'next/link';

interface NavProps {
  workspaceSlug?: string;
  workspaceName?: string;
}

export default function Nav({ workspaceSlug, workspaceName }: NavProps) {
  return (
    <header className="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
      <div className="flex items-center gap-4">
        <Link href="/dashboard" className="font-bold text-lg text-emerald-400">
          Envoy
        </Link>
        {workspaceName && workspaceSlug && (
          <>
            <span className="text-gray-600">/</span>
            <Link
              href={`/w/${workspaceSlug}`}
              className="text-gray-300 hover:text-white transition-colors"
            >
              {workspaceName}
            </Link>
          </>
        )}
      </div>
      <form action="/api/auth/logout" method="POST">
        <button
          type="submit"
          className="text-gray-400 hover:text-white text-sm transition-colors"
        >
          Sign out
        </button>
      </form>
    </header>
  );
}
