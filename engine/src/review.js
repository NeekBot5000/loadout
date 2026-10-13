// Read a repo archive as data and review every skill in it: file list with hashes, a top-level
// tree, and static safety findings. Shared by the catalog audit tool and the app's "Add repo" flow.
// Nothing is extracted or run.
import path from 'node:path';
import { createHash } from 'node:crypto';
import * as tar from 'tar';
import { findSkills } from './archive.js';
import { readFrontmatter } from './scan.js';
import { RULES, HIDDEN_UNICODE, BINARY_EXT, isTextLike } from './rules.js';

const MAX_TEXT = 1024 * 1024;
const SCRIPT_RE = /\.(py|sh|js|ts|mjs|cjs|ps1|bat|cmd)$/i;

async function topOf(tarball) {
  let top = null;
  await tar.t({ file: tarball, onReadEntry: (e) => { if (top === null && e.path.includes('/')) top = e.path.split('/')[0]; e.resume?.(); } });
  return top;
}

/** Every file under the given skill folders, in one pass: { skill, rel, size, type, sha256, text|null, binary }. */
async function readSkillFiles(tarball, top, skillPaths) {
  const dirs = skillPaths.map((p) => (p === '.' ? `${top}/` : `${top}/${p}/`));
  const files = [];
  await tar.t({
    file: tarball,
    onReadEntry: (entry) => {
      const p = entry.path;
      const owner = dirs.filter((d) => p.startsWith(d)).sort((a, b) => b.length - a.length)[0];
      if (!owner || entry.type === 'Directory') { entry.resume?.(); return; }
      const rec = { skill: owner === `${top}/` ? '.' : owner.slice(top.length + 1, -1), rel: p.slice(owner.length), size: entry.size, type: entry.type, sha256: null, text: null, binary: false };
      files.push(rec);
      if (entry.type !== 'File') { entry.resume?.(); return; }
      const hash = createHash('sha256');
      const chunks = [];
      entry.on('data', (c) => { hash.update(c); if (entry.size <= MAX_TEXT) chunks.push(c); });
      entry.on('end', () => {
        rec.sha256 = hash.digest('hex');
        if (entry.size > MAX_TEXT) { rec.binary = true; return; }
        const buf = Buffer.concat(chunks);
        rec.binary = !isTextLike(rec.rel, buf);
        if (!rec.binary) rec.text = buf.toString('utf8');
      });
    },
  });
  return files;
}

/** Static findings for one file. A finding is something for a person to read, not a verdict. */
export function scanFile(f) {
  const out = [];
  const ext = path.extname(f.rel).toLowerCase();
  const kind = ['.md', '.markdown', '.txt', ''].includes(ext) && !(f.text ?? '').startsWith('#!') ? 'doc' : 'code';
  if (f.type !== 'File') out.push({ rule: 'link-or-special', sev: 'high', file: f.rel, snippet: f.type });
  if (BINARY_EXT.has(ext)) out.push({ rule: 'executable-binary', sev: 'high', file: f.rel, snippet: `${f.size} bytes` });
  else if (f.binary && !/\.(png|jpe?g|gif|webp|svg|ico|ttf|otf|woff2?|pdf|docx|xlsx|pptx|zip|mp3|wav|mp4|db|sqlite|pyc|parquet|npy|pt|bin)$/i.test(f.rel)) {
    out.push({ rule: 'unknown-binary', sev: 'medium', file: f.rel, snippet: `${f.size} bytes` });
  }
  if (f.text == null) return out;
  // Relative paths that climb out of the skill folder. Installed alone, the target will not exist.
  // "code" escapes are run or loaded (the skill breaks); "doc" escapes are links (a dead link at worst).
  for (const [i, line] of f.text.split(/\r?\n/).entries()) {
    for (const m of line.matchAll(/(?:\.\.\/)+[\w.@{}$-][^\s)`"'\]]*/g)) {
      const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(f.rel), m[0]));
      if (!resolved.startsWith('../')) continue;
      const runs = kind === 'code' || /CLAUDE_SKILL_DIR|^\s*!`|allowed-tools|\bbash\b|\bpython3?\b|\bnode\b/.test(line);
      out.push({ rule: runs ? 'escapes-folder-code' : 'escapes-folder-doc', sev: 'info', file: f.rel, line: i + 1, snippet: `${m[0]} -> ${resolved}`.slice(0, 220) });
    }
  }
  const hidden = f.text.replace(/^﻿/, '').match(HIDDEN_UNICODE);
  if (hidden) out.push({ rule: 'hidden-unicode', sev: kind === 'doc' ? 'high' : 'medium', file: f.rel, snippet: `${hidden.length} chars, e.g. U+${hidden[0].codePointAt(0).toString(16).toUpperCase()}` });
  const lines = f.text.split(/\r?\n/);
  for (const r of RULES) {
    if (r.only && r.only !== kind) continue;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.length > 4000 && r.id !== 'long-base64') continue;
      if (r.re.test(line) && !(r.unless && r.unless.test(line))) {
        out.push({ rule: r.id, sev: typeof r.sev === 'function' ? r.sev(kind) : r.sev, file: f.rel, line: i + 1, snippet: line.trim().slice(0, 220) });
        if (out.filter((o) => o.rule === r.id && o.file === f.rel).length >= 3) break;
      }
    }
  }
  return out;
}

/** Top level of a skill folder, as the inspector shows it: files, and folders with totals. */
export function treeOf(files) {
  const isScript = (f) => SCRIPT_RE.test(f.rel) || (f.text ?? '').startsWith('#!');
  const top = new Map();
  for (const f of files) {
    const i = f.rel.indexOf('/');
    const p = i < 0 ? f.rel : f.rel.slice(0, i + 1);
    const t = top.get(p) ?? { p, k: i < 0 ? 'file' : 'dir', b: 0, x: 0, n: 0 };
    t.b += f.size; t.n += 1; if (isScript(f)) t.x += 1;
    top.set(p, t);
  }
  const order = (t) => (t.p === 'SKILL.md' ? 0 : t.k === 'file' ? 1 : 2);
  return [...top.values()].sort((a, b) => order(a) - order(b) || a.p.localeCompare(b.p));
}

/**
 * Review every skill in an archive (or only `paths`). Returns per skill: path, name, description,
 * the full SKILL.md, counts, tree, file hashes and findings.
 */
export async function reviewArchive({ tarball, paths = null }) {
  let skills = await findSkills({ tarball });
  if (paths) skills = skills.filter((s) => paths.includes(s.path));
  if (!skills.length) return [];
  const top = await topOf(tarball);
  const files = await readSkillFiles(tarball, top, skills.map((s) => s.path));
  return skills.map((s) => {
    const fm = readFrontmatter(s.skillMd) ?? {};
    const mine = files.filter((f) => f.skill === s.path);
    return {
      path: s.path, name: fm.name ?? null, description: (fm.description ?? '').slice(0, 1600), skillMd: s.skillMd,
      files: s.files, bytes: s.bytes, scripts: s.scripts.length, unsafe: s.unsafe,
      findings: mine.flatMap(scanFile),
      tree: treeOf(mine),
      hashes: Object.fromEntries(mine.filter((f) => f.sha256).map((f) => [f.rel, f.sha256])),
    };
  });
}

/** File-level difference between an installed copy (receipt files) and a new version (hashes by path). */
export function diffFiles(oldFiles, newHashes) {
  const old = new Map(oldFiles.map((f) => [f.path, f.sha256]));
  const added = [], removed = [], changed = [];
  for (const [p, h] of Object.entries(newHashes)) {
    if (!old.has(p)) added.push(p);
    else if (old.get(p) !== h) changed.push(p);
  }
  for (const p of old.keys()) if (!(p in newHashes)) removed.push(p);
  const sort = (a) => a.sort((x, y) => x.localeCompare(y));
  return { added: sort(added), removed: sort(removed), changed: sort(changed), same: old.size - removed.length - changed.length };
}
