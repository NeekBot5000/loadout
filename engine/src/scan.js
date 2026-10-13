import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { EngineError } from './errors.js';

export const SCRIPT_EXT = new Set(['.py', '.sh', '.js', '.ts', '.mjs', '.cjs', '.ps1', '.bat', '.cmd']);

async function hasShebang(file) {
  const fh = await fs.open(file, 'r');
  try {
    const buf = Buffer.alloc(2);
    const { bytesRead } = await fh.read(buf, 0, 2, 0);
    return bytesRead === 2 && buf[0] === 0x23 && buf[1] === 0x21; // "#!"
  } finally { await fh.close(); }
}

/**
 * Walk an extracted skill folder. Refuses symlinks or anything that is not a plain file or folder.
 * Returns every file with its size, SHA-256 and whether it can run code.
 */
export async function inspectDir(root) {
  const files = [];
  async function walk(dir) {
    for (const e of await fs.readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isSymbolicLink()) throw new EngineError('unsafe-entry', `Found a link at ${path.relative(root, full)}. Links are not allowed in skills.`);
      if (e.isDirectory()) { await walk(full); continue; }
      if (!e.isFile()) throw new EngineError('unsafe-entry', `Found a non-file entry at ${path.relative(root, full)}.`);
      const data = await fs.readFile(full);
      const rel = path.relative(root, full).split(path.sep).join('/');
      const isScript = SCRIPT_EXT.has(path.extname(e.name).toLowerCase()) || (data.length >= 2 && data[0] === 0x23 && data[1] === 0x21);
      files.push({ path: rel, bytes: data.length, sha256: createHash('sha256').update(data).digest('hex'), isScript });
    }
  }
  await walk(root);
  files.sort((a, b) => a.path.localeCompare(b.path));
  return {
    files,
    bytes: files.reduce((n, f) => n + f.bytes, 0),
    scripts: files.filter((f) => f.isScript).map((f) => f.path),
  };
}

/** Minimal frontmatter reader. Returns { name?, description? } or null when there is no frontmatter block. */
export function readFrontmatter(text) {
  const m = text.replace(/^﻿/, '').match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;
  const out = {};
  const lines = m[1].split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const kv = lines[i].match(/^([A-Za-z_-]+):\s*(.*)$/);
    if (!kv) continue;
    let val = kv[2];
    if (/^[|>][-+]?$/.test(val)) { // block scalar: take the indented lines that follow
      const parts = [];
      while (i + 1 < lines.length && /^\s+\S/.test(lines[i + 1])) parts.push(lines[++i].trim());
      val = parts.join(' ');
    }
    out[kv[1]] = val.replace(/^["']|["']$/g, '').trim();
  }
  return out;
}
