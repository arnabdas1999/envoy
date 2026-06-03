import { Command } from 'commander';
import chalk from 'chalk';
import * as readline from 'readline';
import { api, ApiError } from '../lib/api.js';
import { loadConfig } from '../config.js';
import { success, fatal, spinner, table } from '../lib/output.js';

interface MemberOut { membership_id: string; user_id: string; email: string; role: string; joined_at: string; }

export function membersCommand(): Command {
  const cmd = new Command('members').description('Manage workspace members');

  // `envoy members` → list
  cmd.action(async () => {
    const config = loadConfig();
    const spin = spinner('Loading members…');
    try {
      const members = await api.get<MemberOut[]>(`/v1/workspaces/${config.workspaceId}/members`);
      spin.stop();
      table([
        [chalk.bold('Email'), chalk.bold('Role'), chalk.bold('Joined')],
        ...members.map(m => [
          m.email,
          m.role === 'owner' ? chalk.cyan(m.role) : m.role === 'admin' ? chalk.yellow(m.role) : m.role,
          new Date(m.joined_at).toLocaleDateString(),
        ]),
      ]);
    } catch (err) {
      spin.fail('Failed');
      if (err instanceof ApiError) fatal(err.message);
      throw err;
    }
  });

  cmd.command('remove <email>')
    .description('Remove a member from the workspace')
    .action(async (email: string) => {
      const config = loadConfig();

      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      const confirm: string = await new Promise(resolve => {
        rl.question(`Remove ${email} from ${config.workspace}? (yes/no): `, resolve);
      });
      rl.close();
      if (confirm.toLowerCase() !== 'yes') { console.log('Cancelled.'); return; }

      const spin = spinner('Removing…');
      try {
        const members = await api.get<MemberOut[]>(`/v1/workspaces/${config.workspaceId}/members`);
        const member = members.find(m => m.email === email);
        if (!member) fatal(`${email} is not a member.`);
        await api.delete(`/v1/memberships/${member!.membership_id}`);
        spin.succeed(`${email} removed from ${config.workspace}.`);
      } catch (err) {
        spin.fail('Failed');
        if (err instanceof ApiError) fatal(err.message);
        throw err;
      }
    });

  cmd.command('role <email> <role>')
    .description('Change a member\'s role (owner, admin, member)')
    .action(async (email: string, role: string) => {
      const config = loadConfig();
      if (!['owner', 'admin', 'member'].includes(role)) {
        fatal('Role must be owner, admin, or member.');
      }

      const spin = spinner('Updating role…');
      try {
        const members = await api.get<MemberOut[]>(`/v1/workspaces/${config.workspaceId}/members`);
        const member = members.find(m => m.email === email);
        if (!member) fatal(`${email} is not a member.`);
        await api.patch(`/v1/memberships/${member!.membership_id}`, { role });
        spin.succeed(`${email}'s role updated to ${role}.`);
      } catch (err) {
        spin.fail('Failed');
        if (err instanceof ApiError) fatal(err.message);
        throw err;
      }
    });

  return cmd;
}
