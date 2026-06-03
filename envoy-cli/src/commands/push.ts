import { Command } from 'commander';
import { existsSync } from 'fs';
import chalk from 'chalk';
import { api, ApiError } from '../lib/api.js';
import { loadConfig } from '../config.js';
import { loadMasterKey } from '../keystore.js';
import { encryptSecret } from '../crypto.js';
import { parseEnvFile } from '../lib/env-parser.js';
import { success, fatal, warn, spinner, info } from '../lib/output.js';

interface EnvironmentOut { id: string; name: string; last_modified_at: string; }
interface WorkspaceOut { id: string; workspace_salt: string; }
interface BulkPushResponse { pushed: number; updated_at: string; }
interface SecretOut { key_name: string; updated_at: string; }

async function resolveEnvId(config: ReturnType<typeof loadConfig>, envName: string): Promise<{ envId: string; etag: string }> {
  const envs = await api.get<EnvironmentOut[]>(`/v1/projects/${config.projectId}/environments`);
  const env = envs.find(e => e.name === envName);
  if (!env) fatal(`Environment "${envName}" not found. Create it with: envoy env create ${envName}`);
  return { envId: env!.id, etag: String(Math.floor(new Date(env!.last_modified_at).getTime())) };
}

export function pushCommand(): Command {
  return new Command('push')
    .description('Encrypt local .env and upload to Envoy')
    .option('--env <name>', 'Target environment (overrides default)')
    .option('--file <path>', 'Source .env file', '.env')
    .option('--dry-run', 'Show what would change without writing')
    .action(async (opts: { env?: string; file: string; dryRun?: boolean }) => {
      const config = loadConfig();
      const envName = opts.env ?? config.defaultEnvironment;
      const filePath = opts.file;

      if (!existsSync(filePath)) {
        fatal(`File not found: ${filePath}`);
      }

      const entries = parseEnvFile(filePath);
      if (entries.length === 0) {
        warn(`${filePath} is empty — nothing to push.`);
        return;
      }

      const spin = spinner('Preparing…');
      const { envId, etag } = await resolveEnvId(config, envName);

      // Load workspace details for salt
      const workspace = await api.get<WorkspaceOut>(`/v1/workspaces/${config.workspaceId}`);
      const masterKey = await loadMasterKey(config.workspaceId);
      const workspaceSalt = Buffer.from(workspace.workspace_salt, 'base64');

      if (opts.dryRun) {
        spin.stop();
        console.log(chalk.bold(`\nDry run — would push ${entries.length} secret(s) to ${envName}:`));

        // Show current remote state
        let remote: SecretOut[] = [];
        try {
          remote = await api.get<SecretOut[]>(`/v1/environments/${envId}/secrets`);
        } catch {}

        const remoteKeys = new Set(remote.map(s => s.key_name));
        const localKeys = new Set(entries.map(e => e.key));

        for (const e of entries) {
          const status = remoteKeys.has(e.key) ? chalk.yellow('~ update') : chalk.green('+ add');
          console.log(`  ${status}  ${e.key}`);
        }
        for (const rk of remoteKeys) {
          if (!localKeys.has(rk)) {
            console.log(`  ${chalk.red('- remove')}  ${rk}`);
          }
        }
        return;
      }

      spin.text = `Encrypting ${entries.length} secret(s)…`;
      const secrets = entries.map(({ key, value }) => {
        const { ciphertext, iv, authTag } = encryptSecret(
          masterKey, workspaceSalt, config.workspaceId, envId, key, value,
        );
        return { key_name: key, ciphertext, iv, auth_tag: authTag };
      });

      spin.text = `Pushing to ${envName}…`;
      try {
        const result = await api.put<BulkPushResponse>(
          `/v1/environments/${envId}/secrets`,
          { secrets },
          { 'If-Match': etag },
        );
        spin.succeed(`Pushed ${result.pushed} secret(s) to ${envName}`);
      } catch (err) {
        spin.fail('Push failed');
        if (err instanceof ApiError) {
          if (err.code === 'ETAG_MISMATCH') {
            fatal('Remote has been modified since your last pull. Run: envoy pull');
          }
          fatal(err.message);
        }
        throw err;
      }
    });
}
