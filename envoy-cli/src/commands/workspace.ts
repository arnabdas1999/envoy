import { Command } from 'commander';
import { api, ApiError } from '../lib/api.js';
import { storeMasterKey, loadMasterKey } from '../keystore.js';
import { generateMasterKey, generateWorkspaceSalt, computeMasterKeyHash } from '../crypto.js';
import { success, info, fatal, spinner, table } from '../lib/output.js';
import chalk from 'chalk';
import * as readline from 'readline';

interface WorkspaceOut {
  id: string;
  name: string;
  slug: string;
  workspace_salt: string;
  created_at: string;
}

export function workspaceCommand(): Command {
  const cmd = new Command('workspace').description('Manage workspaces');

  cmd.command('create <name>')
    .description('Create a new workspace and generate a master key')
    .action(async (name: string) => {
      const masterKey = generateMasterKey();
      const workspaceSalt = generateWorkspaceSalt();

      // We need the workspace ID for the hash, so we create the workspace first
      // with a placeholder hash and update after
      const spin = spinner('Creating workspace…');
      try {
        const workspace = await api.post<WorkspaceOut>('/v1/workspaces', {
          name,
          master_key_hash: 'pending',
          workspace_salt: workspaceSalt.toString('base64'),
        });

        const keyHash = computeMasterKeyHash(masterKey, workspace.id);

        // Store master key in keychain
        await storeMasterKey(workspace.id, masterKey);

        spin.succeed(`Workspace "${workspace.name}" created`);

        console.log('\n' + chalk.bold.red('⚠  MASTER KEY — SAVE THIS NOW. IT WILL NOT BE SHOWN AGAIN.'));
        console.log('─'.repeat(60));
        console.log(chalk.yellow(masterKey.toString('base64')));
        console.log('─'.repeat(60));
        console.log(chalk.dim('Workspace ID: ') + workspace.id);
        console.log(chalk.dim('Store this key in your password manager and share it'));
        console.log(chalk.dim('securely with teammates who need to decrypt secrets.'));
        console.log();
        info('Key stored in your OS keychain for this machine.');
      } catch (err) {
        spin.fail('Failed to create workspace');
        if (err instanceof ApiError) fatal(err.message);
        throw err;
      }
    });

  cmd.command('list')
    .description('List workspaces you belong to')
    .action(async () => {
      const spin = spinner('Loading workspaces…');
      try {
        const workspaces = await api.get<WorkspaceOut[]>('/v1/workspaces');
        spin.stop();
        if (workspaces.length === 0) {
          info('No workspaces found. Create one with: envoy workspace create <name>');
          return;
        }
        table([
          [chalk.bold('Name'), chalk.bold('ID'), chalk.bold('Created')],
          ...workspaces.map(w => [w.name, w.id, new Date(w.created_at).toLocaleDateString()]),
        ]);
      } catch (err) {
        spin.fail('Failed to load workspaces');
        if (err instanceof ApiError) fatal(err.message);
        throw err;
      }
    });

  cmd.command('use <name-or-id>')
    .description('Set the active workspace (stores master key from environment or prompt)')
    .option('--key <base64>', 'Master key in base64 (use ENVOY_MASTER_KEY env var in CI)')
    .action(async (nameOrId: string, opts: { key?: string }) => {
      const spin = spinner('Looking up workspace…');
      try {
        const workspaces = await api.get<WorkspaceOut[]>('/v1/workspaces');
        const workspace = workspaces.find(
          w => w.name === nameOrId || w.id === nameOrId || w.slug === nameOrId,
        );
        if (!workspace) {
          spin.fail(`Workspace "${nameOrId}" not found`);
          fatal(`Available: ${workspaces.map(w => w.name).join(', ')}`);
        }

        let masterKeyBase64 = opts.key ?? process.env.ENVOY_MASTER_KEY;

        if (!masterKeyBase64) {
          spin.stop();
          const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
          masterKeyBase64 = await new Promise(resolve => {
            rl.question('Paste master key (base64): ', resolve);
          });
          rl.close();
        }

        if (!masterKeyBase64) fatal('Master key is required.');

        const masterKey = Buffer.from(masterKeyBase64.trim(), 'base64');
        if (masterKey.length !== 32) {
          fatal('Invalid master key: expected 32 bytes (base64-encoded).');
        }

        await storeMasterKey(workspace!.id, masterKey);
        spin.succeed(`Active workspace set to "${workspace!.name}" and master key stored.`);
      } catch (err) {
        spin.fail('Failed');
        if (err instanceof ApiError) fatal(err.message);
        throw err;
      }
    });

  return cmd;
}
