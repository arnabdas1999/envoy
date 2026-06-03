import Link from 'next/link';

export default function LandingPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 py-20">
      <div className="max-w-2xl w-full text-center">
        {/* Logo / Name */}
        <div className="mb-8">
          <span className="inline-block bg-emerald-500 text-black font-bold text-sm px-3 py-1 rounded-full mb-4">
            Zero-knowledge
          </span>
          <h1 className="text-5xl font-bold tracking-tight mb-4">
            Envoy
          </h1>
          <p className="text-xl text-gray-400">
            End-to-end encrypted environment variables for dev teams.
            <br />
            <span className="text-white">Secrets never touch the server in plaintext.</span>
          </p>
        </div>

        {/* 3-command demo */}
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 mb-10 text-left font-mono text-sm">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-3 h-3 rounded-full bg-red-500" />
            <div className="w-3 h-3 rounded-full bg-yellow-500" />
            <div className="w-3 h-3 rounded-full bg-green-500" />
            <span className="text-gray-500 ml-2 text-xs">Terminal</span>
          </div>
          <div className="space-y-2">
            <p><span className="text-emerald-400">$</span> <span className="text-white">npx envoy init</span>
              <span className="text-gray-500">  # link project, 30 seconds</span></p>
            <p><span className="text-emerald-400">$</span> <span className="text-white">envoy push</span>
              <span className="text-gray-500">      # encrypt + upload .env</span></p>
            <p className="text-gray-500"># teammate runs:</p>
            <p><span className="text-emerald-400">$</span> <span className="text-white">envoy pull</span>
              <span className="text-gray-500">      # decrypt locally, write .env</span></p>
          </div>
        </div>

        {/* CTA */}
        <div className="flex gap-4 justify-center">
          <Link
            href="/auth/login"
            className="bg-emerald-500 hover:bg-emerald-400 text-black font-semibold px-6 py-3 rounded-lg transition-colors"
          >
            Get started free
          </Link>
          <a
            href="https://github.com/your-org/envoy"
            className="border border-gray-700 hover:border-gray-500 px-6 py-3 rounded-lg transition-colors text-gray-300"
          >
            View source
          </a>
        </div>

        {/* Security callout */}
        <div className="mt-16 grid grid-cols-3 gap-6 text-left">
          {[
            { title: 'AES-256-GCM', body: 'Client-side encryption. Server never sees plaintext.' },
            { title: 'HKDF key derivation', body: 'Per-secret derived keys with workspace + env binding.' },
            { title: 'Audit trail', body: 'Every push, pull, and invite is logged with actor and timestamp.' },
          ].map(f => (
            <div key={f.title} className="bg-gray-900/50 border border-gray-800 rounded-lg p-4">
              <h3 className="font-semibold text-emerald-400 mb-2 mono text-sm">{f.title}</h3>
              <p className="text-gray-400 text-sm">{f.body}</p>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
