import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Envoy — Encrypted Env Sync',
  description: 'End-to-end encrypted environment variable manager for dev teams',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-950 text-gray-100 antialiased">
        {children}
      </body>
    </html>
  );
}
