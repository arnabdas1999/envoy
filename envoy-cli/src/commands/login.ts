import { Command } from 'commander';
import { api, ApiError } from '../lib/api.js';
import { storeCliToken } from '../keystore.js';
import { success, info, error, fatal, spinner } from '../lib/output.js';
import * as readline from 'readline';

export function loginCommand(): Command {
  return new Command('login')
    .description('Authenticate with Envoy (magic link)')
    .action(async () => {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      const email: string = await new Promise(resolve => {
        rl.question('Email address: ', resolve);
      });
      rl.close();

      if (!email || !email.includes('@')) {
        fatal('Please enter a valid email address.');
      }

      const spin = spinner('Sending magic link…');
      try {
        await api.post('/v1/auth/login', { email });
        spin.succeed(`Magic link sent to ${email}`);
      } catch (err) {
        spin.fail('Failed to send magic link');
        if (err instanceof ApiError) fatal(err.message);
        throw err;
      }

      info('Check your email and paste the verification token below.');
      const rl2 = readline.createInterface({ input: process.stdin, output: process.stdout });
      const token: string = await new Promise(resolve => {
        rl2.question('Verification token: ', resolve);
      });
      rl2.close();

      const spin2 = spinner('Verifying…');
      try {
        const result = await api.post<{ jwt: string; user: { email: string } }>('/v1/auth/verify', { token });
        await storeCliToken(result.jwt);

        // Exchange JWT for long-lived CLI token
        const cliToken = await api.post<{ cli_token: string; expires_at: string }>('/v1/auth/cli-token');
        await storeCliToken(cliToken.cli_token);

        spin2.succeed(`Logged in as ${result.user.email}`);
        info(`CLI token stored securely. Expires: ${new Date(cliToken.expires_at).toLocaleDateString()}`);
      } catch (err) {
        spin2.fail('Authentication failed');
        if (err instanceof ApiError) fatal(err.message);
        throw err;
      }
    });
}
