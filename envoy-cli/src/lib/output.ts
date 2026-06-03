import chalk from 'chalk';
import ora, { type Ora } from 'ora';

export function success(msg: string): void {
  console.log(chalk.green('✓') + ' ' + msg);
}

export function info(msg: string): void {
  console.log(chalk.cyan('→') + ' ' + msg);
}

export function warn(msg: string): void {
  console.log(chalk.yellow('⚠') + ' ' + msg);
}

export function error(msg: string): void {
  console.error(chalk.red('✗') + ' ' + msg);
}

export function fatal(msg: string, code = 1): never {
  error(msg);
  process.exit(code);
}

export function spinner(text: string): Ora {
  return ora({ text, color: 'cyan' }).start();
}

export function table(rows: string[][]): void {
  if (rows.length === 0) return;
  const widths = rows[0].map((_, i) => Math.max(...rows.map(r => (r[i] ?? '').length)));
  for (const row of rows) {
    console.log(row.map((cell, i) => cell.padEnd(widths[i])).join('  '));
  }
}
