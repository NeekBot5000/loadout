import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { EngineError } from './errors.js';
import { exists, moveDir } from './fsutil.js';
import { scanArchive, extractSkill } from './archive.js';
import { inspectDir, readFrontmatter } from './scan.js';
import { readState, writeState } from './state.js';
import { applyModes } from './settings.js';

const RESERVED = new Set(['synced']);
const busy = new Set();

export function validateId(id) {
  if (typeof id !== 'string' || !/^[a-z0-9][a-z0-9._-]{0,63}$/.test(id) || id.includes('..') || RESERVED.has(id)) {
    throw new EngineError('bad-id', `"${id}" is not a valid skill name. Use lowercase letters, digits, dots, dashes and underscores.`);
  }
}

function stamp(d = new Date()) {
  return d.toISOString().replace(/[-:]/g, '').replace('.', '');
}

/**
 * Install one skill from a repo archive (a .tar.gz shaped like GitHub's codeload output).
 * Nothing reaches skillsDir unless every check passes. The skill appears with one rename.
 */
export async function installSkill({ tarball, subpath, id, skillsDir, stateDir, source, limits, replace = false }) {
  validateId(id);
  if (busy.has(id)) throw new EngineError('busy', `${id} is already being installed.`);
  busy.add(id);
  const work = path.join(stateDir, 'tmp', randomUUID());
  try {
    const scan = await scanArchive({ tarball, subpath, limits });
    const staged = path.join(work, id);
    await fs.mkdir(staged, { recursive: true });
    await extractSkill({ tarball, scan, dest: staged });

    const info = await inspectDir(staged);
    if (info.files.length !== scan.files) {
      throw new EngineError('mismatch', `Expected ${scan.files} files but extracted ${info.files.length}. Nothing was installed.`);
    }
    const fm = readFrontmatter(await fs.readFile(path.join(staged, 'SKILL.md'), 'utf8'));
    if (!fm) throw new EngineError('bad-frontmatter', 'SKILL.md has no frontmatter block. Nothing was installed.');

    const state = await readState(stateDir);
    const target = path.join(skillsDir, id);
    await fs.mkdir(skillsDir, { recursive: true });
    if (await exists(target)) {
      if (!(state.receipts[id] && replace)) {
        throw new EngineError('exists', `${target} already exists and Loadout did not create it. It was left alone.`);
      }
      await moveToTrash({ skillsDir, id });
    }
    await moveDir(staged, target);

    state.receipts[id] = {
      id, source: { ...source, path: subpath }, installedAt: new Date().toISOString(),
      frontmatter: { name: fm.name ?? null, description: fm.description ?? null },
      files: info.files,
    };
    await writeState(stateDir, state);
    return { id, target, files: info.files.length, bytes: info.bytes, scripts: info.scripts };
  } finally {
    busy.delete(id);
    await fs.rm(work, { recursive: true, force: true });
  }
}

async function moveToTrash({ skillsDir, id }) {
  const trash = path.join(skillsDir, '.trash');
  await fs.mkdir(trash, { recursive: true });
  const dest = path.join(trash, `${id}-${stamp()}`);
  await moveDir(path.join(skillsDir, id), dest);
  return dest;
}

/** Move an installed skill to .trash (never deletes), drop its receipt and its override. */
export async function removeSkill({ id, skillsDir, stateDir, settingsFile }) {
  validateId(id);
  const target = path.join(skillsDir, id);
  if (!(await exists(target))) return { status: 'absent' };
  const state = await readState(stateDir);
  if (!state.receipts[id]) throw new EngineError('not-managed', `${id} was not installed by Loadout, so Loadout will not remove it.`);
  const trash = await moveToTrash({ skillsDir, id });
  delete state.receipts[id];
  await writeState(stateDir, state);
  if (settingsFile) await applyModes(settingsFile, { [id]: 'on' });
  return { status: 'removed', trash };
}
