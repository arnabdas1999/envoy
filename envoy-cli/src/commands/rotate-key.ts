import { Command } from 'commander';
import * as readline from 'readline';
import { api, ApiError } from '../lib/api.js';
import { loadConfig } from '../config.js';
import { loadMasterKey, storeMasterKey } from '../keystore.js';
import { decryptSecret, encryptSecret, generateMasterKey, generateWorkspaceSalt, computeMasterKeyHash } from '../crypto.js';
import { success, fatal, info, warn, spinner } from '../lib/output.js';
import chalk from 'chalk';

interface EnvironmentOut { id: string; name: string; }
interface ProjectOut { id: string; }
interface SecretOut { key_name: string; ciphertext: string; iv: string; auth_tag: string; version: number; }
interface WorkspaceOut { id: string; workspace_salt: string; }

export function rotateKeyCommand(): Command {
  return new Command('rotate-key')
    .description('Generate a new master key and re-encrypt all secrets')
    .action(async () => {
      const config = loadConfig();

      warn('This will re-encrypt ALL secrets in ALL environments with a new master key.');
      warn('You will need to distribute the new key to all teammates.');

      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      const confirm: string = await new Promise(resolve => {
        rl.question('\nType "rotate" to confirm: ', resolve);
      });
      rl.close();

      if (confirm !== 'rotate') {
        console.log('Cancelled.');
        return;
      }

      const spin = spinner('Loading workspace and environments…');
      try {
        const workspace = await api.get<WorkspaceOut>(`/v1/workspaces/${config.workspaceId}`);
        const oldMasterKey = await loadMasterKey(config.workspaceId);
        const oldSalt = Buffer.from(workspace.workspace_salt, 'base64');

        const newMasterKey = generateMasterKey();
        const newSalt = generateWorkspaceSalt();

        // Collect all projects and environments
        const projects = await api.get<ProjectOut[]>(`/v1/workspaces/${config.workspaceId}/projects`);
        let totalSecrets = 0;

        for (const project of projects) {
          const envs = await api.get<EnvironmentOut[]>(`/v1/projects/${project.id}/environments`);
          for (const env of envs) {
            spin.text = `Re-encrypting ${env.name}…`;
            const secrets = await api.get<SecretOut[]>(`/v1/environments/${env.id}/secrets`);

            if (secrets.length === 0) continue;

            const reEncrypted = secrets.map(s => {
              const plaintext = decryptSecret(
                oldMasterKey, oldSalt, config.workspaceId, env.id,
                s.key_name, s.ciphertext, s.iv, s.auth_tag,
              );
              const { ciphertext, iv, authTag } = encryptSecret(
                newMasterKey, newSalt, config.workspaceId, env.id, s.key_name, plaintext,
              );
              return { key_name: s.key_name, ciphertext, iv, auth_tag: authTag };
            });

            await api.put(`/v1/environments/${env.id}/secrets`, { secrets: reEncrypted });
            totalSecrets += reEncrypted.length;
          }
        }

        // Store new master key
        await storeMasterKey(config.workspaceId, newMasterKey);

        spin.succeed(`Rotated master key. Re-encrypted ${totalSecrets} secret(s).`);
        console.log('\n' + chalk.bold.red('⚠  NEW MASTER KEY — SAVE THIS NOW AND DISTRIBUTE TO TEAMMATES.'));
        console.log('─'.repeat(60));
        console.log(chalk.yellow(newMasterKey.toString('base64')));
        console.log('─'.repeat(60));
        info('Old key is now invalid. Update ENVOY_MASTER_KEY in all CI environments.');
      } catch (err) {
        spin.fail('Key rotation failed');
        if (err instanceof ApiError) fatal(err.message);
        throw err;
      }
    });
}
