import { Command } from 'commander';
import { api, ApiError } from '../lib/api.js';
import { loadConfig } from '../config.js';
import { success, fatal, warn, spinner } from '../lib/output.js';

export function inviteCommand(): Command {
  return new Command('invite')
    .description('Invite a teammate to the workspace')
    .argument('<email>', 'Email address to invite')
    .action(async (email: string) => {
      const config = loadConfig();
      const spin = spinner(`Inviting ${email}…`);
      try {
        await api.post(`/v1/workspaces/${config.workspaceId}/invites`, { email });
        spin.succeed(`${email} invited to ${config.workspace}`);
        warn('Remember to share the master key with them securely (e.g., via password manager).');
      } catch (err) {
        spin.fail('Failed');
        if (err instanceof ApiError) {
          if (err.code === 'ALREADY_MEMBER') {
            spin.warn(`${email} is already a member.`);
            return;
          }
          fatal(err.message);
        }
        throw err;
      }
    });
}
