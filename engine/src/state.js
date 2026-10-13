import fs from 'node:fs/promises';
import path from 'node:path';
import { EngineError } from './errors.js';
import { writeFileAtomic } from './fsutil.js';

const EMPTY = () => ({ version: 1, receipts: {}, profiles: {}, active: null, budget: 1500 });

export async function readState(stateDir) {
  const file = path.join(stateDir, 'state.json');
  let raw;
  try { raw = await fs.readFile(file, 'utf8'); } catch (e) { if (e.code === 'ENOENT') return EMPTY(); throw e; }
  try { return { ...EMPTY(), ...JSON.parse(raw) }; }
  catch { throw new EngineError('state-invalid', `${file} is damaged. Move it aside and Loadout will start fresh.`); }
}

export async function writeState(stateDir, state) {
  await fs.mkdir(stateDir, { recursive: true });
  await writeFileAtomic(path.join(stateDir, 'state.json'), JSON.stringify(state, null, 2) + '\n');
}
