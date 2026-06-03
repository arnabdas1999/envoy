import { parse } from 'dotenv';
import { readFileSync, writeFileSync } from 'fs';

export interface EnvEntry {
  key: string;
  value: string;
}

export function parseEnvFile(filePath: string): EnvEntry[] {
  const content = readFileSync(filePath, 'utf8');
  const parsed = parse(content);
  return Object.entries(parsed).map(([key, value]) => ({ key, value }));
}

export function writeEnvFile(filePath: string, entries: EnvEntry[]): void {
  const lines = entries.map(({ key, value }) => {
    // Quote values that contain spaces, newlines, or special characters
    const needsQuoting = /[\s\n\r#"'`$\\]/.test(value) || value === '';
    const escaped = needsQuoting
      ? `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`
      : value;
    return `${key}=${escaped}`;
  });
  writeFileSync(filePath, lines.join('\n') + '\n');
}
