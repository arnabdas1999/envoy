import { Command } from 'commander';
import { api } from '../lib/api.js';
import { clearCliToken } from '../keystore.js';
import { success, warn } from '../lib/output.js';

export function logoutCommand(): Command {
  return new Command('logout')
    .description('Revoke CLI token and clear local credentials')
    .action(async () => {
      try {
        await api.post('/v1/auth/tokens/revoke', {});
      } catch {
        // Token may already be expired — still clear locally
      }
      await clearCliToken();
      success('Logged out and CLI token revoked.');
    });
}
