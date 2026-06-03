import { Command } from 'commander';
import chalk from 'chalk';
import { api, ApiError } from '../lib/api.js';
import { loadCliToken } from '../keystore.js';
import { findConfigFile, loadConfig } from '../config.js';
import { info, warn } from '../lib/output.js';

export function statusCommand(): Command {
  return new Command('status')
    .description('Show current workspace, project, environment, and auth state')
    .action(async () => {
      const token = await loadCliToken();
      const isLoggedIn = token !== null;

      console.log(chalk.bold('Envoy Status'));
      console.log('─'.repeat(40));

      // Auth state
      if (isLoggedIn) {
        try {
          const user = await api.get<{ email: string }>('/v1/auth/me');
          console.log(`${chalk.cyan('Auth:')}     ${chalk.green('✓')} Logged in as ${user.email}`);
        } catch {
          console.log(`${chalk.cyan('Auth:')}     ${chalk.yellow('⚠')} Token may be expired (run envoy login)`);
        }
      } else {
        console.log(`${chalk.cyan('Auth:')}     ${chalk.red('✗')} Not logged in`);
      }

      // Project config
      const configPath = findConfigFile();
      if (configPath) {
        try {
          const config = loadConfig();
          console.log(`${chalk.cyan('Workspace:')} ${config.workspace} (${config.workspaceId})`);
          console.log(`${chalk.cyan('Project:')}  ${config.project} (${config.projectId})`);
          console.log(`${chalk.cyan('Env:')}      ${config.defaultEnvironment}`);
          console.log(`${chalk.cyan('Config:')}   ${configPath}`);
        } catch {
          console.log(`${chalk.cyan('Config:')}   ${chalk.yellow('⚠')} Found at ${configPath} but failed to parse`);
        }
      } else {
        console.log(`${chalk.cyan('Config:')}   ${chalk.yellow('⚠')} No .envoy.json found (run envoy init)`);
      }

      // API reachability
      try {
        await api.get('/health');
        console.log(`${chalk.cyan('API:')}      ${chalk.green('✓')} Reachable`);
      } catch {
        console.log(`${chalk.cyan('API:')}      ${chalk.red('✗')} Unreachable`);
      }
    });
}
