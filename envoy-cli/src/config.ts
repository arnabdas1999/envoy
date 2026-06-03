import { readFileSync, writeFileSync, existsSync } from 'fs';
import path from 'path';

export interface EnvoyConfig {
  workspace: string;
  workspaceId: string;
  project: string;
  projectId: string;
  defaultEnvironment: string;
}

const CONFIG_FILE = '.envoy.json';

export function findConfigFile(): string | null {
  let dir = process.cwd();
  while (true) {
    const candidate = path.join(dir, CONFIG_FILE);
    if (existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export function loadConfig(): EnvoyConfig {
  const configPath = findConfigFile();
  if (!configPath) {
    throw new Error(
      `No ${CONFIG_FILE} found. Run 'envoy init' to link this directory to a project.`,
    );
  }
  try {
    return JSON.parse(readFileSync(configPath, 'utf8')) as EnvoyConfig;
  } catch {
    throw new Error(`Failed to parse ${configPath}. The file may be corrupted.`);
  }
}

export function saveConfig(config: EnvoyConfig, dir: string = process.cwd()): void {
  const configPath = path.join(dir, CONFIG_FILE);
  writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
}

export function configExists(): boolean {
  return findConfigFile() !== null;
}
