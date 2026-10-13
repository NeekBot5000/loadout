// Crash-safe log for the main process: ~/.loadout/logs/main.log. Every line is written with a
// synchronous append, so the last thing that happened before a crash is on disk. Rotates at 1 MB,
// keeping three old files.
import fs from 'node:fs';
import path from 'node:path';

const MAX = 1024 * 1024;
const KEEP = 3;
let file: string | null = null;

export function initLog(stateDir: string): string {
  const dir = path.join(stateDir, 'logs');
  fs.mkdirSync(dir, { recursive: true });
  file = path.join(dir, 'main.log');
  return dir;
}

function rotate(f: string) {
  try {
    if (fs.statSync(f).size < MAX) return;
  } catch {
    return;
  }
  for (let i = KEEP - 1; i >= 1; i--) {
    try { fs.renameSync(`${f}.${i}`, `${f}.${i + 1}`); } catch { /* not there yet */ }
  }
  try { fs.renameSync(f, `${f}.1`); } catch { /* another process has it; keep appending */ }
}

export function log(level: 'info' | 'warn' | 'error', message: string, err?: unknown) {
  const detail = err instanceof Error ? ` ${err.stack ?? err.message}` : err ? ` ${String(err)}` : '';
  const line = `${new Date().toISOString()} ${level.toUpperCase()} ${message}${detail}\n`;
  if (level === 'error') process.stderr.write(line);
  if (!file) return;
  try {
    rotate(file);
    fs.appendFileSync(file, line);
  } catch { /* the log must never take the app down */ }
}
