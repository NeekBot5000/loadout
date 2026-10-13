import fs from 'node:fs/promises';
import path from 'node:path';

const FILE = 'activity.log';
const KEEP = 500;

/** Append one line to ~/.loadout/activity.log (JSON per line). Trims to the last 500 now and then. */
export async function appendActivity(stateDir, message, when = new Date()) {
  await fs.mkdir(stateDir, { recursive: true });
  const file = path.join(stateDir, FILE);
  await fs.appendFile(file, JSON.stringify({ t: when.toISOString(), m: String(message).slice(0, 500) }) + '\n');
  const { size } = await fs.stat(file);
  if (size > 200_000) {
    const lines = (await fs.readFile(file, 'utf8')).trimEnd().split('\n').slice(-KEEP);
    await fs.writeFile(file, lines.join('\n') + '\n');
  }
}

/** The most recent lines, newest first. Damaged lines are skipped. */
export async function readActivity(stateDir, limit = 80) {
  let raw = '';
  try { raw = await fs.readFile(path.join(stateDir, FILE), 'utf8'); } catch (e) { if (e.code === 'ENOENT') return []; throw e; }
  const out = [];
  for (const line of raw.trimEnd().split('\n').reverse()) {
    if (out.length >= limit) break;
    try { const x = JSON.parse(line); if (typeof x.t === 'string' && typeof x.m === 'string') out.push(x); } catch { /* skip */ }
  }
  return out;
}
