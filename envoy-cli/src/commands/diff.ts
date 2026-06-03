import { Command } from 'commander';
import { existsSync } from 'fs';
import chalk from 'chalk';
import { api, ApiError } from '../lib/api.js';
import { loadConfig } from '../config.js';
import { parseEnvFile } from '../lib/env-parser.js';
import { fatal, spinner } from '../lib/output.js';

interface EnvironmentOut { id: string; name: string; }
interface SecretOut { key_name: string; updated_at: string; }

export function diffCommand(): Command {
  return new Command('diff')
    .description('Show diff between local .env and remote (key names only, no values)')
    .option('--env <name>', 'Environment to compare')
    .option('--file <path>', 'Local file to compare', '.env')
    .action(async (opts: { env?: string; file: string }) => {
      const config = loadConfig();
      const envName = opts.env ?? config.defaultEnvironment;

      if (!existsSync(opts.file)) {
        fatal(`File not found: ${opts.file}`);
      }

      const spin = spinner('Fetching remote state…');
      try {
        const envs = await api.get<EnvironmentOut[]>(`/v1/projects/${config.projectId}/environments`);
        const env = envs.find(e => e.name === envName);
        if (!env) fatal(`Environment "${envName}" not found.`);

        const remote = await api.get<SecretOut[]>(`/v1/environments/${env!.id}/secrets`);
        spin.stop();

        const localEntries = parseEnvFile(opts.file);
        const localKeys = new Set(localEntries.map(e => e.key));
        const remoteKeys = new Set(remote.map(s => s.key_name));

        const onlyLocal = [...localKeys].filter(k => !remoteKeys.has(k));
        const onlyRemote = [...remoteKeys].filter(k => !localKeys.has(k));
        const inBoth = [...localKeys].filter(k => remoteKeys.has(k));

        if (onlyLocal.length === 0 && onlyRemote.length === 0) {
          console.log(chalk.green('✓ Local and remote are in sync.'));
          return;
        }

        console.log(chalk.bold(`\nDiff: ${opts.file} ↔ ${envName} (${config.project})\n`));
        for (const k of onlyLocal) {
          console.log(chalk.green(`  + ${k}`) + chalk.dim('  (local only, would be pushed)'));
        }
        for (const k of onlyRemote) {
          console.log(chalk.red(`  - ${k}`) + chalk.dim('  (remote only, would be removed on push)'));
        }
        console.log(chalk.dim(`  ~ ${inBoth.length} key(s) exist in both`));
      } catch (err) {
        spin.fail('Failed');
        if (err instanceof ApiError) fatal(err.message);
        throw err;
      }
    });
}
