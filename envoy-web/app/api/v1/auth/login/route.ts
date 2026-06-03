import { NextRequest } from 'next/server';
import { ok, err } from '@/lib/errors';
import { sha256 } from '@/lib/auth-server';
import sql from '@/lib/db';
import { Resend } from 'resend';

const MAGIC_LINK_TTL_SECONDS = 300; // 5 minutes

async function sendMagicLinkEmail(email: string, token: string) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const url = `${baseUrl}/auth/verify?token=${encodeURIComponent(token)}`;

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey.startsWith('re_test')) {
    // Development: log instead of send
    console.log(`[dev] Magic link for ${email}: ${url}`);
    return;
  }

  const resend = new Resend(apiKey);
  await resend.emails.send({
    from: process.env.RESEND_FROM ?? 'auth@useenvoy.dev',
    to: email,
    subject: 'Your Envoy login link',
    html: `
      <p>Click the link below to sign in to Envoy. It expires in 5 minutes.</p>
      <p><a href="${url}" style="background:#10b981;color:#000;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600">Sign in to Envoy</a></p>
      <p style="color:#666;font-size:12px">If you didn't request this, you can safely ignore this email.</p>
    `,
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const email = body?.email?.trim()?.toLowerCase();
  if (!email || !email.includes('@')) {
    return err('INVALID_EMAIL', 'A valid email address is required.', 400);
  }

  // Generate a random 48-char token and store its hash in the DB
  const rawToken = crypto.randomUUID() + crypto.randomUUID(); // 72 hex chars, plenty of entropy
  const tokenHash = await sha256(rawToken);
  const expiresAt = new Date(Date.now() + MAGIC_LINK_TTL_SECONDS * 1000).toISOString();

  // Upsert user (create if first time)
  await sql`
    INSERT INTO users (email) VALUES (${email})
    ON CONFLICT (email) DO NOTHING
  `;

  const [user] = await sql`SELECT id FROM users WHERE email = ${email}`;

  await sql`
    INSERT INTO auth_tokens (user_id, token_hash, type, expires_at)
    VALUES (${user.id}, ${tokenHash}, 'magic_link', ${expiresAt})
  `;

  try {
    await sendMagicLinkEmail(email, rawToken);
  } catch (e) {
    console.error('[login] email send failed', e);
    // Return 202 even if email fails — don't block or reveal whether the address exists
  }

  return ok({ message: 'Magic link sent. Check your email.' });
}
