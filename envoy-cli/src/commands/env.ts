import { Command } from 'commander';
import * as readline from 'readline';
import { api, ApiError } from '../lib/api.js';
import { loadConfig } from '../config.js';
import { success, fatal, spinner, table } from '../lib/output.js';
import chalk from 'chalk';

interface EnvironmentOut { id: string; name: string; project_id: string; last_modified_at: string; }

export function envCommand(): Command {
  const cmd = new Command('env').description('Manage environments');

  cmd.command('create <name>')
    .description('Create a new environment in the current project')
    .action(async (name: string) => {
      const config = loadConfig();
      const spin = spinner(`Creating environment "${name}"…`);
      try {
        const env = await api.post<EnvironmentOut>(`/v1/projects/${config.projectId}/environments`, { name });
        spin.succeed(`Environment "${env.name}" created (id: ${env.id})`);
      } catch (err) {
        spin.fail('Failed');
        if (err instanceof ApiError) fatal(err.message);
        throw err;
      }
    });

  cmd.command('list')
    .description('List environments for the current project')
    .action(async () => {
      const config = loadConfig();
      const spin = spinner('Loading environments…');
      try {
        const envs = await api.get<EnvironmentOut[]>(`/v1/projects/${config.projectId}/environments`);
        spin.stop();
        if (envs.length === 0) {
          console.log('No environments found.');
          return;
        }
        table([
          [chalk.bold('Name'), chalk.bold('Last Modified'), chalk.bold('ID')],
          ...envs.map(e => [
            e.name === config.defaultEnvironment ? chalk.green(e.name + ' (default)') : e.name,
            new Date(e.last_modified_at).toLocaleString(),
            e.id,
          ]),
        ]);
      } catch (err) {
        spin.fail('Failed');
        if (err instanceof ApiError) fatal(err.message);
        throw err;
      }
    });

  cmd.command('delete <name>')
    .description('Delete an environment (requires confirmation)')
    .action(async (name: string) => {
      const config = loadConfig();

      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      const confirm: string = await new Promise(resolve => {
        rl.question(`Type "${name}" to confirm deletion: `, resolve);
      });
      rl.close();

      if (confirm !== name) {
        console.log('Cancelled.');
        return;
      }

      const envs = await api.get<EnvironmentOut[]>(`/v1/projects/${config.projectId}/environments`);
      const env = envs.find(e => e.name === name);
      if (!env) fatal(`Environment "${name}" not found.`);

      const spin = spinner('Deleting…');
      try {
        await api.delete(`/v1/environments/${env!.id}`);
        spin.succeed(`Environment "${name}" deleted.`);
      } catch (err) {
        spin.fail('Failed');
        if (err instanceof ApiError) fatal(err.message);
        throw err;
      }
    });

  return cmd;
}
