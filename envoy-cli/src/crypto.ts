import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm' as const;
const DERIVED_KEY_LENGTH = 32;

export interface EncryptResult {
  ciphertext: string; // base64
  iv: string;         // base64
  authTag: string;    // base64
}

/**
 * Derives a per-secret key using HKDF-SHA256.
 *
 * Security properties:
 * - workspaceSalt (32 random bytes per workspace) provides domain separation between workspaces
 * - info binds the derived key to workspace + environment + variable name
 * - A different workspace, environment, or key name produces a completely different derived key
 */
function deriveKey(
  masterKey: Buffer,
  workspaceSalt: Buffer,
  workspaceId: string,
  environmentId: string,
  keyName: string,
): Buffer {
  const info = Buffer.from(`${workspaceId}:${environmentId}:${keyName}`, 'utf8');
  const raw = crypto.hkdfSync('sha256', masterKey, workspaceSalt, info, DERIVED_KEY_LENGTH);
  return Buffer.from(raw);
}

/**
 * Encrypts a plaintext secret value.
 *
 * The AAD (Additional Authenticated Data) binds this ciphertext to its specific
 * environment + key name. Decryption will fail with an authentication error if
 * the ciphertext is moved to a different environment or key name context.
 */
export function encryptSecret(
  masterKey: Buffer,
  workspaceSalt: Buffer,
  workspaceId: string,
  environmentId: string,
  keyName: string,
  plaintext: string,
): EncryptResult {
  const key = deriveKey(masterKey, workspaceSalt, workspaceId, environmentId, keyName);
  const iv = crypto.randomBytes(12); // 96-bit IV — correct for AES-GCM

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  // Context binding: decryption in a different env/key will fail authentication
  const aad = Buffer.from(`${environmentId}:${keyName}`, 'utf8');
  cipher.setAAD(aad);

  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Zero out derived key from memory immediately
  key.fill(0);

  return {
    ciphertext: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
  };
}

/**
 * Decrypts a secret value. Throws if the AAD context doesn't match
 * (wrong environment or key name) or if ciphertext is tampered.
 */
export function decryptSecret(
  masterKey: Buffer,
  workspaceSalt: Buffer,
  workspaceId: string,
  environmentId: string,
  keyName: string,
  ciphertext: string,
  iv: string,
  authTag: string,
): string {
  const key = deriveKey(masterKey, workspaceSalt, workspaceId, environmentId, keyName);

  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(iv, 'base64'),
  );

  // Must match exactly what was set during encryption
  const aad = Buffer.from(`${environmentId}:${keyName}`, 'utf8');
  decipher.setAAD(aad);
  decipher.setAuthTag(Buffer.from(authTag, 'base64'));

  try {
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(ciphertext, 'base64')),
      decipher.final(),
    ]);
    key.fill(0);
    return decrypted.toString('utf8');
  } catch (err) {
    key.fill(0);
    throw new Error(`Decryption failed: authentication check did not pass. The ciphertext may be corrupted or belong to a different context.`);
  }
}

export function generateMasterKey(): Buffer {
  return crypto.randomBytes(32);
}

export function generateWorkspaceSalt(): Buffer {
  return crypto.randomBytes(32);
}

/**
 * Computes SHA-256(masterKey || workspaceId) for integrity verification.
 * NOT a password hash — the input already has 256 bits of entropy.
 */
export function computeMasterKeyHash(masterKey: Buffer, workspaceId: string): string {
  return crypto
    .createHash('sha256')
    .update(masterKey)
    .update(workspaceId)
    .digest('hex');
}
