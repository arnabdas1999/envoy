import { Command } from 'commander';
import { api, ApiError } from '../lib/api.js';
import { loadConfig } from '../config.js';
import { loadMasterKey } from '../keystore.js';
import { encryptSecret } from '../crypto.js';
import { success, fatal, spinner } from '../lib/output.js';

interface EnvironmentOut { id: string; name: string; }
interface WorkspaceOut { workspace_salt: string; }

export function setCommand(): Command {
  return new Command('set')
    .description('Encrypt and upload a single secret')
    .argument('<KEY>', 'Secret name')
    .argument('<VALUE>', 'Secret value')
    .option('--env <name>', 'Target environment (overrides default)')
    .action(async (key: string, value: string, opts: { env?: string }) => {
      const config = loadConfig();
      const envName = opts.env ?? config.defaultEnvironment;

      const spin = spinner(`Setting ${key}…`);
      try {
        const [envs, workspace] = await Promise.all([
          api.get<EnvironmentOut[]>(`/v1/projects/${config.projectId}/environments`),
          api.get<WorkspaceOut>(`/v1/workspaces/${config.workspaceId}`),
        ]);

        const env = envs.find(e => e.name === envName);
        if (!env) fatal(`Environment "${envName}" not found.`);

        const masterKey = await loadMasterKey(config.workspaceId);
        const workspaceSalt = Buffer.from(workspace.workspace_salt, 'base64');

        const { ciphertext, iv, authTag } = encryptSecret(
          masterKey, workspaceSalt, config.workspaceId, env!.id, key, value,
        );

        await api.put(`/v1/environments/${env!.id}/secrets/${key}`, {
          key_name: key,
          ciphertext,
          iv,
          auth_tag: authTag,
        });

        spin.succeed(`${key} set in ${envName}`);
      } catch (err) {
        spin.fail('Failed');
        if (err instanceof ApiError) fatal(err.message);
        throw err;
      }
    });
}
