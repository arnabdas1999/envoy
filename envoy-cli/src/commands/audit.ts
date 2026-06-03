import { Command } from 'commander';
import chalk from 'chalk';
import { api, ApiError } from '../lib/api.js';
import { loadConfig } from '../config.js';
import { fatal, spinner } from '../lib/output.js';

interface AuditEntry {
  id: string;
  user_email?: string;
  action: string;
  detail?: Record<string, unknown>;
  ip_address?: string;
  created_at: string;
}

interface AuditPage { items: AuditEntry[]; next_cursor: string | null; }

const ACTION_COLOR: Record<string, (s: string) => string> = {
  secret_push: chalk.green,
  secret_pull: chalk.cyan,
  secret_delete: chalk.red,
  member_invited: chalk.blue,
  member_removed: chalk.red,
  role_changed: chalk.yellow,
  key_rotated: chalk.magenta,
  project_created: chalk.green,
  env_created: chalk.green,
};

export function auditCommand(): Command {
  return new Command('audit')
    .description('Show the workspace audit log')
    .option('--action <type>', 'Filter by action type')
    .option('--limit <n>', 'Number of entries', '50')
    .action(async (opts: { action?: string; limit: string }) => {
      const config = loadConfig();
      const spin = spinner('Loading audit log…');

      try {
        let path = `/v1/workspaces/${config.workspaceId}/audit?limit=${opts.limit}`;
        if (opts.action) path += `&action=${opts.action}`;

        const page = await api.get<AuditPage>(path);
        spin.stop();

        if (page.items.length === 0) {
          console.log('No audit log entries found.');
          return;
        }

        for (const entry of page.items) {
          const color = ACTION_COLOR[entry.action] ?? chalk.white;
          const time = new Date(entry.created_at).toLocaleString();
          const actor = entry.user_email ?? 'unknown';
          const detail = entry.detail ? JSON.stringify(entry.detail) : '';

          console.log(
            `${chalk.dim(time)}  ${color(entry.action.padEnd(16))}  ${chalk.bold(actor)}  ${chalk.dim(detail)}`
          );
        }

        if (page.next_cursor) {
          console.log(chalk.dim(`\n... more entries available (cursor: ${page.next_cursor})`));
        }
      } catch (err) {
        spin.fail('Failed');
        if (err instanceof ApiError) fatal(err.message);
        throw err;
      }
    });
}
