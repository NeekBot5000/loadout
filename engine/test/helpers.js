import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';

const oct = (n, len) => n.toString(8).padStart(len - 1, '0') + '\0';

function header({ path: p, type = '0', size = 0, linkpath = '', mode = 0o644 }) {
  const b = Buffer.alloc(512);
  b.write(p, 0, 100, 'utf8');
  b.write(oct(mode, 8), 100); b.write(oct(0, 8), 108); b.write(oct(0, 8), 116);
  b.write(oct(size, 12), 124); b.write(oct(0, 12), 136);
  b.fill(0x20, 148, 156);
  b.write(type, 156); b.write(linkpath, 157, 100, 'utf8');
  b.write('ustar\0', 257); b.write('00', 263);
  let sum = 0; for (const x of b) sum += x;
  b.write(sum.toString(8).padStart(6, '0') + '\0 ', 148);
  return b;
}

/** Build a .tar.gz from entries: { path, type?, content?, linkpath? }. Lets tests craft hostile archives. */
export function makeTarball(entries) {
  const parts = [];
  for (const e of entries) {
    const body = Buffer.from(e.content ?? '');
    const isFile = (e.type ?? '0') === '0';
    parts.push(header({ ...e, size: isFile ? body.length : 0 }));
    if (isFile && body.length) {
      parts.push(body, Buffer.alloc((512 - (body.length % 512)) % 512));
    }
  }
  parts.push(Buffer.alloc(1024));
  return zlib.gzipSync(Buffer.concat(parts));
}

export const SKILL_MD = '---\nname: docx\ndescription: Make Word documents. Use when the user wants a .docx file.\n---\n# docx\nSteps go here.\n';

export function goodEntries(top = 'repo-abc123') {
  return [
    { path: `${top}/`, type: '5' },
    { path: `${top}/README.md`, content: 'repo readme' },
    { path: `${top}/skills/`, type: '5' },
    { path: `${top}/skills/docx/`, type: '5' },
    { path: `${top}/skills/docx/SKILL.md`, content: SKILL_MD },
    { path: `${top}/skills/docx/reference.md`, content: 'reference' },
    { path: `${top}/skills/docx/scripts/`, type: '5' },
    { path: `${top}/skills/docx/scripts/run.py`, content: 'print(1)\n' },
    { path: `${top}/skills/docx/scripts/tool`, content: '#!/bin/sh\necho hi\n' },
    { path: `${top}/skills/pdf/`, type: '5' },
    { path: `${top}/skills/pdf/SKILL.md`, content: '---\nname: pdf\ndescription: PDFs.\n---\n' },
  ];
}

export async function sandbox() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'loadout-test-'));
  const dirs = {
    root,
    skillsDir: path.join(root, 'home', '.claude', 'skills'),
    stateDir: path.join(root, 'home', '.loadout'),
    settingsFile: path.join(root, 'home', '.claude', 'settings.json'),
  };
  await fs.mkdir(path.join(root, 'home'), { recursive: true });
  return dirs;
}

export async function writeTarball(dir, entries, name = 'repo.tar.gz') {
  const file = path.join(dir, name);
  await fs.writeFile(file, makeTarball(entries));
  return file;
}

export async function ls(dir) {
  try { return (await fs.readdir(dir)).sort(); } catch (e) { if (e.code === 'ENOENT') return []; throw e; }
}
