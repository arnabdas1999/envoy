import { Command } from 'commander';
import { spawn } from 'child_process';
import { api, ApiError } from '../lib/api.js';
import { loadConfig } from '../config.js';
import { loadMasterKey } from '../keystore.js';
import { decryptSecret } from '../crypto.js';
import { fatal, spinner } from '../lib/output.js';

interface EnvironmentOut { id: string; name: string; }
interface WorkspaceOut { workspace_salt: string; }
interface SecretOut { key_name: string; ciphertext: string; iv: string; auth_tag: string; }

export function injectCommand(): Command {
  return new Command('inject')
    .description('Decrypt secrets into env vars and run a command')
    .option('--env <name>', 'Source environment (overrides default)')
    .argument('<command...>', 'Command to run (after --)')
    .allowUnknownOption()
    .action(async (commandArgs: string[], opts: { env?: string }) => {
      const config = loadConfig();
      const envName = opts.env ?? config.defaultEnvironment;

      const spin = spinner('Fetching secrets…');
      try {
        const [envs, workspace] = await Promise.all([
          api.get<EnvironmentOut[]>(`/v1/projects/${config.projectId}/environments`),
          api.get<WorkspaceOut>(`/v1/workspaces/${config.workspaceId}`),
        ]);

        const env = envs.find(e => e.name === envName);
        if (!env) fatal(`Environment "${envName}" not found.`);

        const secrets = await api.get<SecretOut[]>(`/v1/environments/${env!.id}/secrets`);
        const masterKey = await loadMasterKey(config.workspaceId);
        const workspaceSalt = Buffer.from(workspace.workspace_salt, 'base64');

        const envVars: Record<string, string> = {};
        for (const s of secrets) {
          envVars[s.key_name] = decryptSecret(
            masterKey, workspaceSalt, config.workspaceId, env!.id,
            s.key_name, s.ciphertext, s.iv, s.auth_tag,
          );
        }

        spin.stop();

        if (commandArgs.length === 0) fatal('No command specified. Usage: envoy inject -- <command>');

        const [cmd, ...args] = commandArgs;
        const child = spawn(cmd!, args, {
          stdio: 'inherit',
          env: { ...process.env, ...envVars },
          shell: false,
        });

        // Forward signals to child so CI SIGTERM reaches the subprocess
        const forwardSignal = (signal: NodeJS.Signals) => {
          if (child.pid) {
            try { process.kill(child.pid, signal); } catch {}
          }
        };

        process.on('SIGTERM', () => forwardSignal('SIGTERM'));
        process.on('SIGINT', () => forwardSignal('SIGINT'));
        process.on('SIGHUP', () => forwardSignal('SIGHUP'));

        child.on('exit', (code, signal) => {
          if (signal) {
            process.kill(process.pid, signal);
          } else {
            process.exit(code ?? 0);
          }
        });
      } catch (err) {
        spin.fail('Failed to fetch secrets');
        if (err instanceof ApiError) fatal(err.message);
        throw err;
      }
    });
}
