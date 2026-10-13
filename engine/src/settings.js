import fs from 'node:fs/promises';
import path from 'node:path';
import { EngineError } from './errors.js';
import { exists, writeFileAtomic } from './fsutil.js';

/** UI mode -> value stored in skillOverrides. "on" means the key is absent. */
const MODE_TO_VALUE = { on: null, name: 'name-only', off: 'off' };
const VALUE_TO_MODE = { 'name-only': 'name', off: 'off' };

export function modeOf(overrides, id) {
  const v = overrides?.[id];
  if (v === undefined) return 'on';
  return VALUE_TO_MODE[v] ?? 'other'; // e.g. "user-invocable-only": shown, never rewritten by accident
}

function detectIndent(raw) {
  const m = raw.match(/^([ \t]+)"/m);
  return m ? m[1] : 2;
}

async function readSettings(file) {
  if (!(await exists(file))) return { raw: null, obj: {} };
  const raw = await fs.readFile(file, 'utf8');
  if (raw.trim() === '') return { raw, obj: {} };
  let obj;
  try {
    obj = JSON.parse(raw);
  } catch {
    throw new EngineError('settings-invalid', `${file} is not valid JSON. Fix it by hand, then try again. Nothing was changed.`);
  }
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
    throw new EngineError('settings-invalid', `${file} must contain a JSON object. Nothing was changed.`);
  }
  return { raw, obj };
}

export async function readOverrides(file) {
  const { obj } = await readSettings(file);
  const o = obj.skillOverrides;
  return o && typeof o === 'object' && !Array.isArray(o) ? o : {};
}

/**
 * Apply { skillId: 'on' | 'name' | 'off' } in a single write.
 * Reads the file fresh, touches only `skillOverrides`, keeps every other key and its order,
 * keeps one backup copy, and writes atomically.
 */
export async function applyModes(file, changes) {
  for (const [id, mode] of Object.entries(changes)) {
    if (!(mode in MODE_TO_VALUE)) throw new EngineError('bad-mode', `Unknown mode "${mode}" for ${id}.`);
  }
  const { raw, obj } = await readSettings(file);
  if ('skillOverrides' in obj && (obj.skillOverrides === null || typeof obj.skillOverrides !== 'object' || Array.isArray(obj.skillOverrides))) {
    throw new EngineError('settings-invalid', `skillOverrides in ${file} is not an object. Nothing was changed.`);
  }
  const before = JSON.stringify(obj.skillOverrides ?? {});
  const next = { ...(obj.skillOverrides ?? {}) };
  for (const [id, mode] of Object.entries(changes)) {
    if (MODE_TO_VALUE[mode] === null) delete next[id];
    else next[id] = MODE_TO_VALUE[mode];
  }
  if (JSON.stringify(next) === before) return { changed: false };

  if (Object.keys(next).length === 0) delete obj.skillOverrides;
  else obj.skillOverrides = next; // keeps its position if the key already existed

  const indent = raw ? detectIndent(raw) : 2;
  const text = JSON.stringify(obj, null, indent) + (raw === null || raw.endsWith('\n') ? '\n' : '');
  await fs.mkdir(path.dirname(file), { recursive: true });
  if (raw !== null) await fs.writeFile(`${file}.loadout-backup`, raw);
  await writeFileAtomic(file, text);
  return { changed: true };
}
