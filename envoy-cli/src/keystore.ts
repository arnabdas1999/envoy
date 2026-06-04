import { readFileSync, writeFileSync, mkdirSync, chmodSync } from 'fs';
import { homedir } from 'os';
import path from 'path';

const SERVICE = 'envoy-cli';
const FALLBACK_DIR = path.join(homedir(), '.envoy');
const FALLBACK_PATH = path.join(FALLBACK_DIR, 'credentials.json');

async function getKeytar() {
  try {
    const mod = await import('keytar');
    return mod.default ?? mod;
  } catch {
    return null;
  }
}

export async function storeMasterKey(workspaceId: string, key: Buffer): Promise<void> {
  const encoded = key.toString('base64');
  const keytar = await getKeytar();
  if (keytar) {
    try {
      await keytar.setPassword(SERVICE, `master:${workspaceId}`, encoded);
      return;
    } catch {
      // Fall through to file fallback
    }
  }
  writeFallback(`master:${workspaceId}`, encoded);
}

export async function loadMasterKey(workspaceId: string): Promise<Buffer> {
  const keytar = await getKeytar();
  if (keytar) {
    try {
      const encoded = await keytar.getPassword(SERVICE, `master:${workspaceId}`);
      if (encoded) return Buffer.from(encoded, 'base64');
    } catch {
      // Fall through
    }
  }

  const fallback = readFallback();
  const encoded = fallback[`master:${workspaceId}`];
  if (!encoded) {
    throw new Error(`Master key not found for workspace ${workspaceId}.\nRun: envoy workspace use <name>`);
  }
  return Buffer.from(encoded, 'base64');
}

export async function storeCliToken(token: string): Promise<void> {
  // Always write to file — reliable across all platforms and Node versions.
  // Also attempt keytar for OS-level encryption where available.
  writeFallback('cli-token', token);
  const keytar = await getKeytar();
  if (keytar) {
    try { await keytar.setPassword(SERVICE, 'cli-token', token); } catch {}
  }
}

export async function loadCliToken(): Promise<string | null> {
  // File is the primary source (always written). Keytar is supplementary.
  const fallback = readFallback();
  if (fallback['cli-token']) return fallback['cli-token'];
  const keytar = await getKeytar();
  if (keytar) {
    try {
      const token = await keytar.getPassword(SERVICE, 'cli-token');
      if (token) return token;
    } catch {}
  }
  return null;
}

export async function clearCliToken(): Promise<void> {
  const keytar = await getKeytar();
  if (keytar) {
    try {
      await keytar.deletePassword(SERVICE, 'cli-token');
    } catch {
      // Continue
    }
  }
  const fallback = readFallback();
  delete fallback['cli-token'];
  saveFallback(fallback);
}

function readFallback(): Record<string, string> {
  try {
    return JSON.parse(readFileSync(FALLBACK_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function writeFallback(key: string, value: string): void {
  mkdirSync(FALLBACK_DIR, { recursive: true });
  try { chmodSync(FALLBACK_DIR, 0o700); } catch {}
  const data = readFallback();
  data[key] = value;
  saveFallback(data);
}

function saveFallback(data: Record<string, string>): void {
  writeFileSync(FALLBACK_PATH, JSON.stringify(data, null, 2), { mode: 0o600 });
}
