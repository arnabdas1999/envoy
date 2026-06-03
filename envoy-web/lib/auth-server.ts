import { cookies } from 'next/headers';
import { NextRequest } from 'next/server';
import { verifyJwt, type TokenPayload } from './jwt';
import sql from './db';

const TOKEN_COOKIE = 'envoy_token';

// ─── Cookie helpers ───────────────────────────────────────────────────────────

export async function setAuthCookie(token: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(TOKEN_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 60 * 60 * 24 * 7,
    path: '/',
  });
}

export async function getAuthToken(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(TOKEN_COOKIE)?.value ?? null;
}

export async function clearAuthCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(TOKEN_COOKIE);
}

// ─── Request auth extraction ──────────────────────────────────────────────────

function extractBearer(req: NextRequest): string | null {
  const header = req.headers.get('authorization');
  if (header?.startsWith('Bearer ')) return header.slice(7);
  return null;
}

export interface AuthUser {
  id: string;
  email: string;
}

/**
 * Resolves the current user from a request.
 * Accepts both Bearer JWT tokens (CLI) and httpOnly cookies (web UI).
 * Returns null if unauthenticated or token is invalid/revoked.
 */
export async function getRequestUser(req: NextRequest): Promise<AuthUser | null> {
  // 1. Try Bearer token (CLI)
  const bearer = extractBearer(req);
  if (bearer) {
    return resolveToken(bearer);
  }

  // 2. Try cookie (web UI)
  const cookieToken = req.cookies.get(TOKEN_COOKIE)?.value;
  if (cookieToken) {
    return resolveToken(cookieToken);
  }

  return null;
}

async function resolveToken(raw: string): Promise<AuthUser | null> {
  const payload = await verifyJwt(raw);
  if (!payload?.sub) return null;

  // For CLI tokens we also verify against the DB (enables revocation)
  if (payload.type === 'cli') {
    const hash = await sha256(raw);
    const rows = await sql`
      SELECT t.user_id, u.email
      FROM   auth_tokens t
      JOIN   users u ON u.id = t.user_id
      WHERE  t.token_hash = ${hash}
        AND  t.type = 'cli'
        AND  t.revoked_at IS NULL
        AND  t.expires_at > now()
      LIMIT  1
    `;
    if (rows.length === 0) return null;
    return { id: rows[0].user_id, email: rows[0].email };
  }

  // Web JWTs are self-contained — just verify signature + expiry
  return { id: payload.sub, email: payload.email };
}

export async function sha256(value: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// ─── Membership checks ────────────────────────────────────────────────────────

export type WorkspaceRole = 'owner' | 'admin' | 'member';

export async function getWorkspaceMembership(
  userId: string,
  workspaceId: string,
): Promise<{ id: string; role: WorkspaceRole } | null> {
  const rows = await sql`
    SELECT id, role
    FROM   memberships
    WHERE  workspace_id = ${workspaceId}
      AND  user_id = ${userId}
    LIMIT  1
  `;
  if (rows.length === 0) return null;
  return { id: rows[0].id, role: rows[0].role as WorkspaceRole };
}
