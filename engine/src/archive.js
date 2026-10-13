import * as tar from 'tar';
import { EngineError } from './errors.js';

export const DEFAULT_LIMITS = {
  maxTotalBytes: 25 * 1024 * 1024,
  maxFileBytes: 10 * 1024 * 1024,
  maxFiles: 2000,
  maxPathLength: 240,
  maxDepth: 12,
};

const ALLOWED_TYPES = new Set(['File', 'Directory', 'OldFile', 'ContiguousFile']);

function unsafePath(p) {
  if (p.includes('\0') || p.includes('\\')) return true;
  if (p.startsWith('/') || /^[A-Za-z]:/.test(p)) return true;
  return p.split('/').some((seg) => seg === '..');
}

/**
 * Read the archive's table of contents (nothing is written) and check everything under
 * `<top>/<subpath>/`. Returns the prefix to extract. Entries outside the prefix are ignored.
 */
export async function scanArchive({ tarball, subpath, limits = {} }) {
  const lim = { ...DEFAULT_LIMITS, ...limits };
  // "" or "." means the skill is the whole repo (SKILL.md at the repo root).
  const sub = String(subpath ?? '').replace(/^\/+|\/+$/g, '').replace(/^\.$/, '');
  if (sub && unsafePath(sub)) throw new EngineError('unsafe-path', `The skill path "${subpath}" is not allowed.`);
  const depth = sub ? sub.split('/').length : 0;
  const label = sub || 'the repo root';

  let top = null;
  let total = 0;
  let count = 0;
  let sawSkillMd = false;
  let problem = null;
  const fail = (code, msg) => { if (!problem) problem = new EngineError(code, msg); };

  await tar.t({
    file: tarball,
    onReadEntry: (entry) => {
      const p = entry.path;
      const first = p.split('/')[0];
      if (top === null && p.includes('/')) top = first;
      const base = sub ? `${top ?? first}/${sub}` : (top ?? first);
      const inside = p === base || p === `${base}/` || p.startsWith(`${base}/`);
      if (!inside) { entry.resume?.(); return; }

      if (unsafePath(p)) fail('unsafe-path', `The archive has an unsafe path: ${JSON.stringify(p)}. Nothing was installed.`);
      if (!ALLOWED_TYPES.has(entry.type)) fail('unsafe-entry', `The archive has a ${entry.type} entry (${p}). Links and special files are not allowed. Nothing was installed.`);
      if (p.length > lim.maxPathLength) fail('too-large', `A path is too long: ${p.slice(0, 60)}...`);
      if (p.split('/').length - 1 > lim.maxDepth + depth) fail('too-large', `A folder is nested too deeply: ${p}`);
      if (entry.type !== 'Directory') {
        count++; total += entry.size;
        if (entry.size > lim.maxFileBytes) fail('too-large', `${p} is larger than ${lim.maxFileBytes} bytes.`);
        if (p === `${base}/SKILL.md`) sawSkillMd = true;
      }
      entry.resume?.();
    },
  });

  if (problem) throw problem;
  if (top === null || count === 0) throw new EngineError('not-found', `Nothing was found at ${label} in the archive.`);
  if (count > lim.maxFiles) throw new EngineError('too-large', `The skill has ${count} files. The limit is ${lim.maxFiles}.`);
  if (total > lim.maxTotalBytes) throw new EngineError('too-large', `The skill is ${total} bytes. The limit is ${lim.maxTotalBytes}.`);
  if (!sawSkillMd) throw new EngineError('no-skill-md', `There is no SKILL.md at ${label}.`);
  return { top, prefix: sub ? `${top}/${sub}` : top, strip: 1 + depth, files: count, bytes: total };
}

/** Extract only the entries under the scanned prefix into `dest`, with the prefix stripped. */
export async function extractSkill({ tarball, scan, dest }) {
  await tar.x({
    file: tarball,
    cwd: dest,
    strip: scan.strip,
    strict: true,
    preservePaths: false,
    filter: (p) => p === scan.prefix || p.startsWith(`${scan.prefix}/`),
  });
}

const SCRIPT_RE = /\.(py|sh|js|ts|mjs|cjs|ps1|bat|cmd)$/i;
const MAX_SKILL_MD = 256 * 1024;

/**
 * List every skill in a repo archive without extracting it: each folder with a SKILL.md.
 * Returns { path, skillMd, files, bytes, scripts, unsafe } per skill. Script flags here use
 * the file extension only; the install step also checks for shebang lines.
 */
export async function findSkills({ tarball }) {
  const entries = [];
  const bodies = new Map();
  let top = null;
  await tar.t({
    file: tarball,
    onReadEntry: (entry) => {
      const p = entry.path;
      if (top === null && p.includes('/')) top = p.split('/')[0];
      entries.push({ path: p, type: entry.type, size: entry.size });
      if (entry.type !== 'Directory' && /(^|\/)SKILL\.md$/.test(p) && entry.size <= MAX_SKILL_MD) {
        const chunks = [];
        entry.on('data', (c) => chunks.push(c));
        entry.on('end', () => bodies.set(p, Buffer.concat(chunks).toString('utf8')));
      } else entry.resume?.();
    },
  });
  if (top === null) return [];
  const skills = [];
  for (const [p, skillMd] of bodies) {
    const dir = p.slice(0, -'/SKILL.md'.length);
    const rel = p === `${top}/SKILL.md` ? '.' : dir.slice(top.length + 1);
    if (rel !== '.' && (!dir.startsWith(`${top}/`) || unsafePath(rel))) continue;
    const prefix = rel === '.' ? `${top}/` : `${dir}/`;
    const inside = entries.filter((e) => e.path.startsWith(prefix));
    const files = inside.filter((e) => e.type !== 'Directory');
    skills.push({
      path: rel,
      skillMd,
      files: files.length,
      bytes: files.reduce((n, e) => n + e.size, 0),
      scripts: files.filter((e) => SCRIPT_RE.test(e.path)).map((e) => e.path.slice(prefix.length)),
      unsafe: inside.some((e) => !ALLOWED_TYPES.has(e.type) || unsafePath(e.path)),
    });
  }
  // A skill folder nested inside another skill is part of the outer one, not its own row.
  // A SKILL.md at the repo root makes the repo itself a skill; it can still keep a conventional
  // top-level skills/ folder of separate skills, so those stay listed. Anything else nested is
  // part of the root skill (examples, generated output).
  const hasRoot = skills.some((s) => s.path === '.');
  return skills
    .filter((s) => s.path === '.' || !hasRoot || s.path.startsWith('skills/'))
    .filter((s) => s.path === '.' || !skills.some((o) => o !== s && o.path !== '.' && s.path.startsWith(`${o.path}/`)))
    .sort((a, b) => a.path.localeCompare(b.path));
}
