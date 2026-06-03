import { Command } from 'commander';
import chalk from 'chalk';
import { api, ApiError } from '../lib/api.js';
import { loadConfig } from '../config.js';
import { fatal, spinner, table } from '../lib/output.js';

interface EnvironmentOut { id: string; name: string; }
interface SecretOut { key_name: string; version: number; updated_at: string; updated_by_email?: string; }

export function listCommand(): Command {
  return new Command('list')
    .description('List secret names in the active environment (values masked)')
    .option('--env <name>', 'Environment (overrides default)')
    .action(async (opts: { env?: string }) => {
      const config = loadConfig();
      const envName = opts.env ?? config.defaultEnvironment;

      const spin = spinner('Loading secrets…');
      try {
        const envs = await api.get<EnvironmentOut[]>(`/v1/projects/${config.projectId}/environments`);
        const env = envs.find(e => e.name === envName);
        if (!env) fatal(`Environment "${envName}" not found.`);

        const secrets = await api.get<SecretOut[]>(`/v1/environments/${env!.id}/secrets`);
        spin.stop();

        if (secrets.length === 0) {
          console.log(`No secrets in ${envName}. Push some with: envoy push`);
          return;
        }

        console.log(chalk.bold(`\n${envName} — ${secrets.length} secret(s):\n`));
        table([
          [chalk.bold('Key'), chalk.bold('Version'), chalk.bold('Updated'), chalk.bold('By')],
          ...secrets.map(s => [
            s.key_name,
            `v${s.version}`,
            new Date(s.updated_at).toLocaleString(),
            s.updated_by_email ?? '—',
          ]),
        ]);
      } catch (err) {
        spin.fail('Failed');
        if (err instanceof ApiError) fatal(err.message);
        throw err;
      }
    });
}
