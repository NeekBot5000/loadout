import { EngineError } from './errors.js';
import { readState, writeState } from './state.js';

const MODES = new Set(['on', 'name', 'off']);

/**
 * What applying a profile does, before anything is touched.
 * A profile lists the skills it wants and their modes; every other installed skill turns off.
 *
 * installed: { key: mode } for skills on disk. set: { key: mode } from the profile.
 * known: keys Loadout can install or already sees.
 * Returns { install: [keys], modes: { key: mode }, missing: [keys] }. `modes` is the single
 * settings write that follows the installs (new installs land "on", so only non-on targets appear).
 */
export function planProfile({ installed, set, known }) {
  const install = [];
  const modes = {};
  const missing = [];
  for (const [key, want] of Object.entries(set)) {
    if (!MODES.has(want)) throw new EngineError('bad-mode', `Unknown mode "${want}" for ${key}.`);
    if (key in installed) {
      if (installed[key] !== want) modes[key] = want;
    } else if (want !== 'off') {
      // A skill of the user's own that is gone cannot be fetched; a catalog key Loadout no longer lists neither.
      if (key.startsWith('local:') || !known.has(key)) { missing.push(key); continue; }
      install.push(key);
      if (want !== 'on') modes[key] = want;
    }
  }
  for (const [key, cur] of Object.entries(installed)) {
    if (!(key in set) && cur !== 'off') modes[key] = 'off';
  }
  return { install, modes, missing };
}

const slug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'profile';

function cleanSet(set) {
  if (!set || typeof set !== 'object' || Array.isArray(set)) throw new EngineError('bad-profile', 'A profile needs a list of skills.');
  const out = {};
  for (const [k, m] of Object.entries(set)) {
    if (typeof k !== 'string' || !k || k.length > 400) throw new EngineError('bad-profile', 'A profile has a bad skill name.');
    if (!MODES.has(m)) throw new EngineError('bad-mode', `Unknown mode "${m}" for ${k}.`);
    if (m !== 'off') out[k] = m; // "off" is the default for anything not listed
  }
  return out;
}

export async function listProfiles(stateDir) {
  const st = await readState(stateDir);
  return { active: st.active ?? null, budget: st.budget, profiles: st.profiles };
}

/** Create (id null) or overwrite a profile. Returns its id. */
export async function saveProfile(stateDir, { id = null, name, set }) {
  const nm = String(name ?? '').trim();
  if (!nm || nm.length > 60) throw new EngineError('bad-profile', 'Give the profile a name of 1 to 60 characters.');
  const st = await readState(stateDir);
  let pid = id;
  if (pid === null) {
    if (Object.values(st.profiles).some((p) => p.name.toLowerCase() === nm.toLowerCase())) {
      throw new EngineError('exists', `There is already a profile called “${nm}”.`);
    }
    const base = slug(nm);
    pid = base;
    for (let i = 2; pid in st.profiles; i++) pid = `${base}-${i}`;
  } else if (!(pid in st.profiles)) {
    throw new EngineError('not-found', 'That profile no longer exists.');
  }
  st.profiles[pid] = { name: nm, set: cleanSet(set) };
  st.active = pid;
  await writeState(stateDir, st);
  return pid;
}

export async function deleteProfile(stateDir, id) {
  const st = await readState(stateDir);
  if (!(id in st.profiles)) return false;
  delete st.profiles[id];
  if (st.active === id) st.active = null;
  await writeState(stateDir, st);
  return true;
}

export async function setActive(stateDir, id) {
  const st = await readState(stateDir);
  if (id !== null && !(id in st.profiles)) throw new EngineError('not-found', 'That profile no longer exists.');
  st.active = id;
  await writeState(stateDir, st);
}

export async function setBudget(stateDir, budget) {
  const n = Math.round(Number(budget));
  if (!Number.isFinite(n) || n < 100 || n > 100000) throw new EngineError('bad-budget', 'The target must be between 100 and 100,000 tokens.');
  const st = await readState(stateDir);
  st.budget = n;
  await writeState(stateDir, st);
}
