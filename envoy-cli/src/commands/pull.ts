import { Command } from 'commander';
import { api, ApiError } from '../lib/api.js';
import { loadConfig } from '../config.js';
import { loadMasterKey } from '../keystore.js';
import { decryptSecret } from '../crypto.js';
import { writeEnvFile } from '../lib/env-parser.js';
import { success, fatal, warn, spinner } from '../lib/output.js';

interface EnvironmentOut { id: string; name: string; }
interface WorkspaceOut { id: string; workspace_salt: string; }
interface SecretOut {
  key_name: string;
  ciphertext: string;
  iv: string;
  auth_tag: string;
  version: number;
  updated_at: string;
}

async function resolveEnvId(config: ReturnType<typeof loadConfig>, envName: string): Promise<string> {
  const envs = await api.get<EnvironmentOut[]>(`/v1/projects/${config.projectId}/environments`);
  const env = envs.find(e => e.name === envName);
  if (!env) fatal(`Environment "${envName}" not found.`);
  return env!.id;
}

export function pullCommand(): Command {
  return new Command('pull')
    .description('Download and decrypt secrets into .env')
    .option('--env <name>', 'Source environment (overrides default)')
    .option('--file <path>', 'Destination file', '.env')
    .action(async (opts: { env?: string; file: string }) => {
      const config = loadConfig();
      const envName = opts.env ?? config.defaultEnvironment;

      const spin = spinner('Fetching secrets…');
      try {
        const envId = await resolveEnvId(config, envName);
        const [secrets, workspace] = await Promise.all([
          api.get<SecretOut[]>(`/v1/environments/${envId}/secrets`),
          api.get<WorkspaceOut>(`/v1/workspaces/${config.workspaceId}`),
        ]);

        if (secrets.length === 0) {
          spin.warn(`No secrets in ${envName}. Wrote empty ${opts.file}.`);
        }

        const masterKey = await loadMasterKey(config.workspaceId);
        const workspaceSalt = Buffer.from(workspace.workspace_salt, 'base64');

        const entries = secrets.map(s => ({
          key: s.key_name,
          value: decryptSecret(
            masterKey, workspaceSalt,
            config.workspaceId, envId,
            s.key_name, s.ciphertext, s.iv, s.auth_tag,
          ),
        }));

        writeEnvFile(opts.file, entries);
        spin.succeed(`Pulled ${entries.length} secret(s) from ${envName} → ${opts.file}`);
      } catch (err) {
        spin.fail('Pull failed');
        if (err instanceof ApiError) fatal(err.message);
        throw err;
      }
    });
}
