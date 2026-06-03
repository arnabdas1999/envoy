import { Command } from 'commander';
import { loginCommand } from './commands/login.js';
import { logoutCommand } from './commands/logout.js';
import { statusCommand } from './commands/status.js';
import { workspaceCommand } from './commands/workspace.js';
import { initCommand } from './commands/init.js';
import { envCommand } from './commands/env.js';
import { pushCommand } from './commands/push.js';
import { pullCommand } from './commands/pull.js';
import { setCommand } from './commands/set.js';
import { getCommand } from './commands/get.js';
import { removeCommand } from './commands/remove.js';
import { listCommand } from './commands/list.js';
import { diffCommand } from './commands/diff.js';
import { rotateKeyCommand } from './commands/rotate-key.js';
import { injectCommand } from './commands/inject.js';
import { inviteCommand } from './commands/invite.js';
import { membersCommand } from './commands/members.js';
import { auditCommand } from './commands/audit.js';

const program = new Command();

program
  .name('envoy')
  .description('End-to-end encrypted environment variable manager')
  .version('0.1.0');

program.addCommand(loginCommand());
program.addCommand(logoutCommand());
program.addCommand(statusCommand());
program.addCommand(workspaceCommand());
program.addCommand(initCommand());
program.addCommand(envCommand());
program.addCommand(pushCommand());
program.addCommand(pullCommand());
program.addCommand(setCommand());
program.addCommand(getCommand());
program.addCommand(removeCommand());
program.addCommand(listCommand());
program.addCommand(diffCommand());
program.addCommand(rotateKeyCommand());
program.addCommand(injectCommand());
program.addCommand(inviteCommand());
program.addCommand(membersCommand());
program.addCommand(auditCommand());

program.parseAsync(process.argv).catch(err => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
