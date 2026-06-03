import { Command } from 'commander';
import * as readline from 'readline';
import { api, ApiError } from '../lib/api.js';
import { saveConfig } from '../config.js';
import { success, info, fatal, spinner } from '../lib/output.js';

interface WorkspaceOut { id: string; name: string; slug: string; }
interface ProjectOut { id: string; name: string; slug: string; workspace_id: string; }
interface EnvironmentOut { id: string; name: string; project_id: string; }

async function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

export function initCommand(): Command {
  return new Command('init')
    .description('Link this directory to an Envoy project')
    .option('--workspace <name>', 'Workspace name (non-interactive)')
    .option('--project <name>', 'Project name (non-interactive)')
    .option('--env <name>', 'Default environment (non-interactive)', 'development')
    .action(async (opts: { workspace?: string; project?: string; env?: string }) => {
      const nonInteractive = !!(opts.workspace && opts.project);

      let workspaceName = opts.workspace;
      let projectName = opts.project;
      let envName = opts.env ?? 'development';

      const spin = spinner('Loading workspaces…');
      let workspaces: WorkspaceOut[];
      try {
        workspaces = await api.get<WorkspaceOut[]>('/v1/workspaces');
        spin.stop();
      } catch (err) {
        spin.fail('Failed to load workspaces');
        if (err instanceof ApiError) fatal(err.message);
        throw err;
      }

      if (workspaces.length === 0) {
        fatal('No workspaces found. Create one first with: envoy workspace create <name>');
      }

      if (!nonInteractive) {
        console.log('\nAvailable workspaces:');
        workspaces.forEach((w, i) => console.log(`  ${i + 1}. ${w.name}`));
        const wsAnswer = await prompt('\nWorkspace name or number: ');
        const idx = parseInt(wsAnswer) - 1;
        workspaceName = !isNaN(idx) && idx >= 0 && idx < workspaces.length
          ? workspaces[idx].name
          : wsAnswer;
      }

      const workspace = workspaces.find(w => w.name === workspaceName || w.slug === workspaceName);
      if (!workspace) fatal(`Workspace "${workspaceName}" not found.`);

      // Load or create project
      const spin2 = spinner('Loading projects…');
      let projects: ProjectOut[];
      try {
        projects = await api.get<ProjectOut[]>(`/v1/workspaces/${workspace!.id}/projects`);
        spin2.stop();
      } catch (err) {
        spin2.fail('Failed to load projects');
        if (err instanceof ApiError) fatal(err.message);
        throw err;
      }

      if (!nonInteractive) {
        if (projects.length > 0) {
          console.log('\nAvailable projects (or type a new name):');
          projects.forEach((p, i) => console.log(`  ${i + 1}. ${p.name}`));
        }
        const projAnswer = await prompt('\nProject name or number (new name to create): ');
        const idx = parseInt(projAnswer) - 1;
        projectName = !isNaN(idx) && idx >= 0 && idx < projects.length
          ? projects[idx].name
          : projAnswer;
      }

      let project = projects.find(p => p.name === projectName || p.slug === projectName);
      if (!project) {
        const spin3 = spinner(`Creating project "${projectName}"…`);
        try {
          project = await api.post<ProjectOut>(`/v1/workspaces/${workspace!.id}/projects`, { name: projectName });
          spin3.succeed(`Project "${projectName}" created`);
        } catch (err) {
          spin3.fail('Failed to create project');
          if (err instanceof ApiError) fatal(err.message);
          throw err;
        }
      }

      // Load or create environment
      const spin4 = spinner('Loading environments…');
      let environments: EnvironmentOut[];
      try {
        environments = await api.get<EnvironmentOut[]>(`/v1/projects/${project!.id}/environments`);
        spin4.stop();
      } catch (err) {
        spin4.fail('Failed');
        if (err instanceof ApiError) fatal(err.message);
        throw err;
      }

      if (!nonInteractive) {
        if (environments.length > 0) {
          console.log('\nAvailable environments:');
          environments.forEach((e, i) => console.log(`  ${i + 1}. ${e.name}`));
        }
        envName = await prompt('\nDefault environment: ');
      }

      let env = environments.find(e => e.name === envName);
      if (!env) {
        const spin5 = spinner(`Creating environment "${envName}"…`);
        try {
          env = await api.post<EnvironmentOut>(`/v1/projects/${project!.id}/environments`, { name: envName });
          spin5.succeed(`Environment "${envName}" created`);
        } catch (err) {
          spin5.fail('Failed');
          if (err instanceof ApiError) fatal(err.message);
          throw err;
        }
      }

      saveConfig({
        workspace: workspace!.name,
        workspaceId: workspace!.id,
        project: project!.name,
        projectId: project!.id,
        defaultEnvironment: env!.name,
      });

      success(`Linked to ${workspace!.name} / ${project!.name} / ${env!.name}`);
      info('.envoy.json created — safe to commit to git.');
    });
}
