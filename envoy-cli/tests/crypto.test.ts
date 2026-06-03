import { describe, it, expect } from 'vitest';
import {
  encryptSecret,
  decryptSecret,
  generateMasterKey,
  generateWorkspaceSalt,
  computeMasterKeyHash,
} from '../src/crypto.js';

const WS_ID = 'ws-test-uuid-001';
const ENV_ID = 'env-test-uuid-001';
const KEY_NAME = 'DATABASE_URL';
const PLAINTEXT = 'postgres://user:pass@host:5432/db';

describe('crypto', () => {
  it('encrypt → decrypt round trip', () => {
    const masterKey = generateMasterKey();
    const salt = generateWorkspaceSalt();

    const { ciphertext, iv, authTag } = encryptSecret(masterKey, salt, WS_ID, ENV_ID, KEY_NAME, PLAINTEXT);
    const decrypted = decryptSecret(masterKey, salt, WS_ID, ENV_ID, KEY_NAME, ciphertext, iv, authTag);

    expect(decrypted).toBe(PLAINTEXT);
  });

  it('produces different ciphertext for same plaintext (random IV)', () => {
    const masterKey = generateMasterKey();
    const salt = generateWorkspaceSalt();

    const r1 = encryptSecret(masterKey, salt, WS_ID, ENV_ID, KEY_NAME, PLAINTEXT);
    const r2 = encryptSecret(masterKey, salt, WS_ID, ENV_ID, KEY_NAME, PLAINTEXT);

    expect(r1.ciphertext).not.toBe(r2.ciphertext);
    expect(r1.iv).not.toBe(r2.iv);
  });

  it('decryption fails if wrong environmentId (AAD mismatch)', () => {
    const masterKey = generateMasterKey();
    const salt = generateWorkspaceSalt();

    const { ciphertext, iv, authTag } = encryptSecret(masterKey, salt, WS_ID, ENV_ID, KEY_NAME, PLAINTEXT);

    expect(() =>
      decryptSecret(masterKey, salt, WS_ID, 'wrong-env-id', KEY_NAME, ciphertext, iv, authTag)
    ).toThrow();
  });

  it('decryption fails if wrong keyName (AAD mismatch)', () => {
    const masterKey = generateMasterKey();
    const salt = generateWorkspaceSalt();

    const { ciphertext, iv, authTag } = encryptSecret(masterKey, salt, WS_ID, ENV_ID, KEY_NAME, PLAINTEXT);

    expect(() =>
      decryptSecret(masterKey, salt, WS_ID, ENV_ID, 'WRONG_KEY', ciphertext, iv, authTag)
    ).toThrow();
  });

  it('decryption fails with wrong master key', () => {
    const masterKey = generateMasterKey();
    const wrongKey = generateMasterKey();
    const salt = generateWorkspaceSalt();

    const { ciphertext, iv, authTag } = encryptSecret(masterKey, salt, WS_ID, ENV_ID, KEY_NAME, PLAINTEXT);

    expect(() =>
      decryptSecret(wrongKey, salt, WS_ID, ENV_ID, KEY_NAME, ciphertext, iv, authTag)
    ).toThrow();
  });

  it('decryption fails with wrong workspace salt', () => {
    const masterKey = generateMasterKey();
    const salt = generateWorkspaceSalt();
    const wrongSalt = generateWorkspaceSalt();

    const { ciphertext, iv, authTag } = encryptSecret(masterKey, salt, WS_ID, ENV_ID, KEY_NAME, PLAINTEXT);

    expect(() =>
      decryptSecret(masterKey, wrongSalt, WS_ID, ENV_ID, KEY_NAME, ciphertext, iv, authTag)
    ).toThrow();
  });

  it('different workspaces produce different derived keys', () => {
    const masterKey = generateMasterKey();
    const salt = generateWorkspaceSalt();

    const r1 = encryptSecret(masterKey, salt, 'workspace-A', ENV_ID, KEY_NAME, PLAINTEXT);
    const r2 = encryptSecret(masterKey, salt, 'workspace-B', ENV_ID, KEY_NAME, PLAINTEXT);

    // Decrypting workspace-B ciphertext with workspace-A context should fail
    expect(() =>
      decryptSecret(masterKey, salt, 'workspace-A', ENV_ID, KEY_NAME, r2.ciphertext, r2.iv, r2.authTag)
    ).toThrow();
  });

  it('handles empty string plaintext', () => {
    const masterKey = generateMasterKey();
    const salt = generateWorkspaceSalt();

    const { ciphertext, iv, authTag } = encryptSecret(masterKey, salt, WS_ID, ENV_ID, KEY_NAME, '');
    const decrypted = decryptSecret(masterKey, salt, WS_ID, ENV_ID, KEY_NAME, ciphertext, iv, authTag);

    expect(decrypted).toBe('');
  });

  it('handles multi-line values', () => {
    const multiline = 'line1\nline2\nline3';
    const masterKey = generateMasterKey();
    const salt = generateWorkspaceSalt();

    const { ciphertext, iv, authTag } = encryptSecret(masterKey, salt, WS_ID, ENV_ID, 'PEM_KEY', multiline);
    const decrypted = decryptSecret(masterKey, salt, WS_ID, ENV_ID, 'PEM_KEY', ciphertext, iv, authTag);

    expect(decrypted).toBe(multiline);
  });

  it('handles unicode values', () => {
    const unicode = '日本語テスト 🔐';
    const masterKey = generateMasterKey();
    const salt = generateWorkspaceSalt();

    const { ciphertext, iv, authTag } = encryptSecret(masterKey, salt, WS_ID, ENV_ID, KEY_NAME, unicode);
    const decrypted = decryptSecret(masterKey, salt, WS_ID, ENV_ID, KEY_NAME, ciphertext, iv, authTag);

    expect(decrypted).toBe(unicode);
  });

  it('computeMasterKeyHash is deterministic', () => {
    const masterKey = generateMasterKey();
    const h1 = computeMasterKeyHash(masterKey, WS_ID);
    const h2 = computeMasterKeyHash(masterKey, WS_ID);

    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64); // SHA-256 hex
  });

  it('computeMasterKeyHash differs per workspace', () => {
    const masterKey = generateMasterKey();
    const h1 = computeMasterKeyHash(masterKey, 'ws-a');
    const h2 = computeMasterKeyHash(masterKey, 'ws-b');

    expect(h1).not.toBe(h2);
  });
});
