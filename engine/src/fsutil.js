import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export async function exists(p) {
  try { await fs.lstat(p); return true; } catch (e) { if (e.code === 'ENOENT') return false; throw e; }
}

/** Write a file by writing a sibling temp file, then renaming over the target. */
export async function writeFileAtomic(file, data) {
  const tmp = path.join(path.dirname(file), `.${path.basename(file)}.${randomUUID()}.tmp`);
  try {
    await fs.writeFile(tmp, data);
    await fs.rename(tmp, file);
  } catch (e) {
    await fs.rm(tmp, { force: true });
    throw e;
  }
}

/** Rename, falling back to copy + remove when source and target are on different volumes. */
export async function moveDir(from, to) {
  try {
    await fs.rename(from, to);
  } catch (e) {
    if (e.code !== 'EXDEV') throw e;
    await fs.cp(from, to, { recursive: true, errorOnExist: true, force: false });
    await fs.rm(from, { recursive: true, force: true });
  }
}
