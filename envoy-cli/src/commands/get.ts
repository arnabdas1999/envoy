import { Command } from 'commander';
import { api, ApiError } from '../lib/api.js';
import { loadConfig } from '../config.js';
import { loadMasterKey } from '../keystore.js';
import { decryptSecret } from '../crypto.js';
import { fatal, spinner } from '../lib/output.js';

interface EnvironmentOut { id: string; name: string; }
interface WorkspaceOut { workspace_salt: string; }
interface SecretOut { key_name: string; ciphertext: string; iv: string; auth_tag: string; }

export function getCommand(): Command {
  return new Command('get')
    .description('Decrypt and print a single secret value')
    .argument('<KEY>', 'Secret name')
    .option('--env <name>', 'Source environment (overrides default)')
    .action(async (key: string, opts: { env?: string }) => {
      const config = loadConfig();
      const envName = opts.env ?? config.defaultEnvironment;

      const spin = spinner(`Getting ${key}…`);
      try {
        const [envs, workspace] = await Promise.all([
          api.get<EnvironmentOut[]>(`/v1/projects/${config.projectId}/environments`),
          api.get<WorkspaceOut>(`/v1/workspaces/${config.workspaceId}`),
        ]);

        const env = envs.find(e => e.name === envName);
        if (!env) fatal(`Environment "${envName}" not found.`);

        const secret = await api.get<SecretOut>(`/v1/environments/${env!.id}/secrets/${key}`);
        const masterKey = await loadMasterKey(config.workspaceId);
        const workspaceSalt = Buffer.from(workspace.workspace_salt, 'base64');

        const value = decryptSecret(
          masterKey, workspaceSalt, config.workspaceId, env!.id,
          key, secret.ciphertext, secret.iv, secret.auth_tag,
        );

        spin.stop();
        process.stdout.write(value + '\n');
      } catch (err) {
        spin.fail('Failed');
        if (err instanceof ApiError) fatal(err.message);
        throw err;
      }
    });
}
