import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, unlinkSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { parseEnvFile, writeEnvFile } from '../src/lib/env-parser.js';

const TMP_FILE = path.join(tmpdir(), `envoy-test-${process.pid}.env`);

afterEach(() => {
  if (existsSync(TMP_FILE)) unlinkSync(TMP_FILE);
});

describe('env-parser', () => {
  it('parses a simple .env file', () => {
    writeFileSync(TMP_FILE, 'FOO=bar\nBAZ=qux\n');
    const entries = parseEnvFile(TMP_FILE);

    expect(entries).toHaveLength(2);
    expect(entries[0]).toEqual({ key: 'FOO', value: 'bar' });
    expect(entries[1]).toEqual({ key: 'BAZ', value: 'qux' });
  });

  it('ignores comments and blank lines', () => {
    writeFileSync(TMP_FILE, '# comment\nFOO=bar\n\nBAZ=qux\n');
    const entries = parseEnvFile(TMP_FILE);

    expect(entries).toHaveLength(2);
  });

  it('parses quoted values', () => {
    writeFileSync(TMP_FILE, 'KEY="hello world"\n');
    const entries = parseEnvFile(TMP_FILE);

    expect(entries[0]!.value).toBe('hello world');
  });

  it('round-trips through write → parse', () => {
    const original = [
      { key: 'DB_URL', value: 'postgres://localhost/db' },
      { key: 'API_KEY', value: 'sk-test-12345' },
      { key: 'MULTI', value: 'a b c' },
    ];

    writeEnvFile(TMP_FILE, original);
    const parsed = parseEnvFile(TMP_FILE);

    expect(parsed).toHaveLength(3);
    for (const orig of original) {
      const found = parsed.find(p => p.key === orig.key);
      expect(found?.value).toBe(orig.value);
    }
  });
});
