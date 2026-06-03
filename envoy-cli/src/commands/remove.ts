import { Command } from 'commander';
import * as readline from 'readline';
import { api, ApiError } from '../lib/api.js';
import { loadConfig } from '../config.js';
import { success, fatal, spinner } from '../lib/output.js';

interface EnvironmentOut { id: string; name: string; }

export function removeCommand(): Command {
  return new Command('remove')
    .description('Soft-delete a secret (requires confirmation)')
    .argument('<KEY>', 'Secret name')
    .option('--env <name>', 'Target environment (overrides default)')
    .option('--yes', 'Skip confirmation prompt')
    .action(async (key: string, opts: { env?: string; yes?: boolean }) => {
      const config = loadConfig();
      const envName = opts.env ?? config.defaultEnvironment;

      if (!opts.yes) {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        const confirm: string = await new Promise(resolve => {
          rl.question(`Delete ${key} from ${envName}? (yes/no): `, resolve);
        });
        rl.close();
        if (confirm.toLowerCase() !== 'yes') {
          console.log('Cancelled.');
          return;
        }
      }

      const spin = spinner('Deleting…');
      try {
        const envs = await api.get<EnvironmentOut[]>(`/v1/projects/${config.projectId}/environments`);
        const env = envs.find(e => e.name === envName);
        if (!env) fatal(`Environment "${envName}" not found.`);

        await api.delete(`/v1/environments/${env!.id}/secrets/${key}`);
        spin.succeed(`${key} deleted from ${envName}.`);
      } catch (err) {
        spin.fail('Failed');
        if (err instanceof ApiError) {
          if (err.status === 404) fatal(`Secret "${key}" not found in ${envName}.`);
          fatal(err.message);
        }
        throw err;
      }
    });
}
