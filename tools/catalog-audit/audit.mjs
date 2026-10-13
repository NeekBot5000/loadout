// Catalog audit: download repos (pinned to a commit), list their skills, and run static safety
// rules over every file inside each skill. Nothing from a repo is extracted or executed.
//
//   node tools/catalog-audit/audit.mjs <candidates.json> <outDir> [concurrency]
//
// candidates.json: [{ repo, stars, ... }]. Writes <outDir>/results.json (one record per repo).
import fs from 'node:fs/promises';
import path from 'node:path';
import { resolveRef, downloadArchive, reviewArchive } from '../../engine/src/index.js';
import { writeFileAtomic } from '../../engine/src/fsutil.js';

const [, , candFile, outDir, conc = '6'] = process.argv;
if (!candFile || !outDir) { console.error('usage: audit.mjs <candidates.json> <outDir> [concurrency]'); process.exit(2); }
const cacheDir = path.join(outDir, 'cache');

async function auditRepo(c) {
  const rec = { ...c, ok: false };
  try {
    const { sha } = await resolveRef({ repo: c.repo, ref: 'HEAD' });
    rec.sha = sha;
    const { file } = await downloadArchive({ repo: c.repo, sha, cacheDir, maxBytes: 400 * 1024 * 1024 });
    const skills = await reviewArchive({ tarball: file });
    rec.skillCount = skills.length;
    rec.skills = skills.map(({ skillMd, hashes, ...rest }) => rest);
    rec.ok = true;
  } catch (e) {
    rec.error = `${e.code ?? ''} ${e.message}`.trim();
  }
  return rec;
}

const cands = JSON.parse(await fs.readFile(candFile, 'utf8'));
await fs.mkdir(outDir, { recursive: true });
const resultsFile = path.join(outDir, 'results.json');
let done = [];
try { done = JSON.parse(await fs.readFile(resultsFile, 'utf8')); } catch {}
const have = new Set(done.filter((r) => r.ok).map((r) => r.repo));
const queue = cands.filter((c) => !have.has(c.repo));
const results = done.filter((r) => r.ok);
let n = 0;
// Workers finish at the same time; chain the saves so two writes never interleave.
let saving = Promise.resolve();
const save = () => (saving = saving.then(() => writeFileAtomic(resultsFile, JSON.stringify(results, null, 1))));
async function worker() {
  while (queue.length) {
    const c = queue.shift();
    const r = await auditRepo(c);
    results.push(r);
    n++;
    const hi = (r.skills ?? []).reduce((k, s) => k + s.findings.filter((f) => f.sev === 'high').length, 0);
    console.log(`[${n}] ${c.repo}: ${r.error ? 'ERROR ' + r.error : `${r.skillCount} skills, ${hi} high`}`);
    await save();
  }
}
await Promise.all(Array.from({ length: Number(conc) }, worker));
console.log('done', results.length);
