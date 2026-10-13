// Turn audit results into catalog/catalog.json and docs/catalog-audit.md.
//
//   node tools/catalog-audit/build-catalog.mjs <results.json>... [--repos 50]
//
// Rules, in order: a repo is out if it is in EXCLUDE_REPO, its license is unknown to GitHub, or
// it has a high finding that is not cleared by hand. A skill is out if it is excluded by hand,
// contains a link or special file, needs its plugin, runs files outside its folder (other than a
// sibling skill), duplicates a Claude Code copy for another agent, or has a name Loadout cannot use.
import fs from 'node:fs/promises';
import path from 'node:path';
import { validateId } from '../../engine/src/index.js';
import { AUDIT_DATE, EXCLUDE_REPO, EXCLUDE_SKILL, CLEARED_HIGH, WARN_REPO, OTHER_AGENT_DIR, OFFICIAL_KIND, OFFICIAL_BLURB, NOT_SHORTLISTED, FIXTURE_DIR } from './decisions.mjs';

const args = process.argv.slice(2);
const repoLimit = args.includes('--repos') ? Number(args[args.indexOf('--repos') + 1]) : 50;
const files = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--repos');
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '../..');

const byRepo = new Map();
for (const f of files) for (const r of JSON.parse(await fs.readFile(f, 'utf8'))) if (r.ok && r.skills) byRepo.set(r.repo, r);

const OFFICIAL = 'anthropics/skills';
const KINDS = [
  ['documents', /\b(docx|pdf|pptx|xlsx|word|spreadsheet|slides?|deck|powerpoint|presentation|document|ppt)\b/i],
  ['design', /\b(design|ui|ux|css|figma|diagram|visual|typograph|color|brand|art|animation|svg|3d|image|video|gsap)\b/i],
  ['writing', /\b(writ\w*|prose|copy\w*|humaniz\w*|essay|blog|article|paper|tone|voice|grammar)\b/i],
  ['selling', /\b(marketing|seo|ads?|sales|pricing|growth|launch|crm|campaign|conversion|product manag\w*|pm)\b/i],
  ['research', /\b(research|literature|academic|science|scientific|data analysis|study|citation)\b/i],
  ['games', /\b(game|unity|godot|minecraft)\b/i],
];
const kindOf = (text) => (KINDS.find(([, re]) => re.test(text)) ?? ['building'])[0];
const firstSentence = (d) => {
  const s = (d || '').replace(/\s+/g, ' ').trim().split(/(?<=[.!?])\s/)[0] ?? '';
  return s.length > 110 ? s.slice(0, 107).replace(/\s\S*$/, '') + '...' : s;
};
const tokens = (name, desc) => Math.ceil((name.length + Math.min(desc.length, 1536)) / 4);

const repos = [];
const report = { included: [], excludedRepos: [], excludedSkills: [] };

for (const r of [...byRepo.values()].sort((a, b) => b.stars - a.stars)) {
  const official = r.repo === OFFICIAL;
  const highs = r.skills.filter((s) => !EXCLUDE_SKILL[`${r.repo}:${s.path}`]).flatMap((s) => s.findings.filter((f) => f.sev === 'high').map((f) => ({ ...f, skill: s.path })));
  let why = EXCLUDE_REPO[r.repo];
  if (!why && !official && (!r.license || r.license === 'NOASSERTION')) why = 'No license GitHub recognizes, so there is no clear permission to use it.';
  if (!why && !official && highs.length && !CLEARED_HIGH[r.repo]) why = `Unreviewed high-risk findings: ${[...new Set(highs.map((h) => h.rule))].join(', ')}.`;
  if (why) { report.excludedRepos.push({ repo: r.repo, stars: r.stars, why }); continue; }

  const skillPaths = new Set(r.skills.map((s) => s.path));
  const names = new Map();
  for (const s of r.skills) {
    const n = (s.path === '.' ? r.repo.split('/')[1] : s.path.split('/').pop()).toLowerCase();
    if (!OTHER_AGENT_DIR.test(s.path)) names.set(n, s.path);
  }
  const entries = [];
  for (const s of r.skills) {
    const folder = s.path === '.' ? r.repo.split('/')[1] : s.path.split('/').pop();
    const id = folder.toLowerCase();
    const key = `${r.repo}:${s.path}`;
    const out = (reason) => report.excludedSkills.push({ repo: r.repo, path: s.path, why: reason });
    if (EXCLUDE_SKILL[key]) { out(EXCLUDE_SKILL[key]); continue; }
    if (s.unsafe || s.findings.some((f) => f.rule === 'link-or-special')) { out('Contains a link or special file. Loadout refuses to install it.'); continue; }
    if (s.findings.some((f) => f.rule === 'needs-plugin')) { out('Part of a plugin and needs files the plugin provides. Install it with /plugin instead.'); continue; }
    if (FIXTURE_DIR.test(s.path)) { out('A test fixture or example inside the repo, not a skill to install.'); continue; }
    if (OTHER_AGENT_DIR.test(s.path)) { out(names.has(id) && names.get(id) !== s.path ? 'A copy written for another agent; the Claude Code copy is listed.' : 'Written for another agent (Codex, Cursor or similar).'); continue; }
    try { validateId(id); } catch { out(`Folder name "${folder}" is not a name Loadout can install to.`); continue; }
    const requires = new Set();
    let broken = null;
    for (const f of s.findings.filter((x) => x.rule === 'escapes-folder-code')) {
      if (/(^|\/)(demo|demos|examples?|tests?|__tests__)\//.test(f.file)) continue;
      const target = f.snippet.split(' -> ')[1] ?? '';
      // Resolved relative to the file; climb back to the skill root to see where it lands.
      const fromRoot = path.posix.normalize(path.posix.join(s.path === '.' ? '' : s.path, path.posix.dirname(f.file), f.snippet.split(' -> ')[0]));
      const sibling = [...skillPaths].find((p) => p !== s.path && p !== '.' && (fromRoot === p || fromRoot.startsWith(p + '/')));
      if (sibling) requires.add(sibling.split('/').pop().toLowerCase());
      else { broken = `${f.file} uses ${target}, which is outside the skill folder.`; break; }
    }
    if (broken) { out(`Needs files outside its folder: ${broken}`); continue; }
    const net = s.findings.some((f) => f.rule === 'upload-to-host' || f.rule === 'network-call');
    const warnings = [];
    if (WARN_REPO[r.repo]) warnings.push(WARN_REPO[r.repo]);
    if (net) warnings.push('Some files contact the internet when run.');
    if (s.findings.some((f) => f.rule === 'installs-packages')) warnings.push('Its instructions install packages (pip, npm or similar) when used.');
    const desc = s.description || '';
    entries.push({
      id, repo: r.repo, path: s.path, ref: r.sha,
      tier: official ? 'anthropic' : 'community',
      kind: (official && OFFICIAL_KIND[id]) || kindOf(`${id} ${desc}`),
      blurb: (official && OFFICIAL_BLURB[id]) || firstSentence(desc),
      name: s.name, description: desc,
      tok: tokens(s.name || id, desc),
      files: s.files, bytes: s.bytes, scripts: s.tree.reduce((n, t) => n + t.x, 0), tree: s.tree,
      warnings, requires: [...requires],
      license: r.license ?? null,
    });
  }
  // The same skill twice in one repo (a copy for another layout): keep the one under skills/, else the shortest path.
  const best = new Map();
  const rank = (e) => [e.path.startsWith('skills/') ? 0 : e.path.startsWith('.') ? 2 : 1, e.path.length];
  for (const e of entries) {
    const cur = best.get(e.id);
    const [a, b] = [rank(e), cur && rank(cur)];
    if (!cur || a[0] < b[0] || (a[0] === b[0] && a[1] < b[1])) best.set(e.id, e);
  }
  for (const e of entries) if (best.get(e.id) !== e) report.excludedSkills.push({ repo: r.repo, path: e.path, why: `A second copy of ${e.id} in the same repo; ${best.get(e.id).path} is listed.` });
  entries.splice(0, entries.length, ...entries.filter((e) => best.get(e.id) === e));
  if (!entries.length) { report.excludedRepos.push({ repo: r.repo, stars: r.stars, why: 'No skill left after the per-skill checks.' }); continue; }
  repos.push({ repo: r.repo, stars: r.stars, sha: r.sha, license: r.license, official, entries, cleared: CLEARED_HIGH[r.repo] ?? null });
}

const officialRepo = repos.find((r) => r.official);
const picked = [officialRepo, ...repos.filter((r) => !r.official).slice(0, repoLimit)].filter(Boolean);
const dropped = repos.filter((r) => !r.official).slice(repoLimit);

// One folder per name in ~/.claude/skills. Official wins, then more stars; the rest are alternatives.
const owner = new Map();
for (const r of picked) for (const e of r.entries) {
  if (!owner.has(e.id)) owner.set(e.id, e);
  else e.conflictsWith = `${owner.get(e.id).repo}:${owner.get(e.id).path}`;
}

const catalog = {
  version: 1,
  generated: AUDIT_DATE,
  note: 'Community entries are pinned to the commit Loadout audited. A newer commit has not been reviewed.',
  skills: picked.flatMap((r) => r.entries),
};
await fs.mkdir(path.join(root, 'catalog'), { recursive: true });
await fs.writeFile(path.join(root, 'catalog', 'catalog.json'), JSON.stringify(catalog, null, 1) + '\n');

// Report
const md = [];
const n = (x, w) => `${x} ${w}${x === 1 ? '' : 's'}`;
md.push(`# Catalog audit, ${AUDIT_DATE}`, '');
md.push(`Loadout downloaded ${byRepo.size} popular skill repos from GitHub, pinned to a commit, and read every file inside every skill without running anything. Static rules flagged lines for prompt injection, hidden text, reading secrets, sending data out, running code from the internet, obfuscation, persistence, changes to Claude Code settings, and binaries. Every high-risk hit in an included repo was then read by hand.`, '');
md.push(`Result: **${picked.length - 1} community repos** plus \`${OFFICIAL}\`, **${catalog.skills.length} skills** in the catalog.`, '');
md.push('What this does not prove: a skill can still give Claude bad advice, and scripts can have bugs. Static rules miss what they do not look for. The audit covers one commit; updates are not reviewed until the audit is run again (`node tools/catalog-audit/audit.mjs`).', '');
md.push('## Included', '', '| Repo | Stars | License | Skills | Commit | Notes |', '| --- | ---: | --- | ---: | --- | --- |');
for (const r of picked) {
  const notes = [r.official ? 'Official' : '', r.cleared ? `Reviewed: ${r.cleared}` : '', WARN_REPO[r.repo] ?? ''].filter(Boolean).join(' ');
  md.push(`| [${r.repo}](https://github.com/${r.repo}) | ${r.stars.toLocaleString('en-US')} | ${r.license ?? 'per skill'} | ${r.entries.length} | \`${r.sha.slice(0, 7)}\` | ${notes} |`);
}
md.push('', '## Left out', '', '| Repo | Why |', '| --- | --- |');
for (const x of report.excludedRepos) md.push(`| [${x.repo}](https://github.com/${x.repo}) | ${x.why} |`);
md.push('', '## Not shortlisted', '', 'The wider scan covered the 160 most-starred repos tagged for Claude or agent skills. Most of the rest are apps or tools whose skills mainly drive that product, or lists of links. Notable ones left out on purpose:', '');
for (const [repo, why] of Object.entries(NOT_SHORTLISTED)) md.push(`- [${repo}](https://github.com/${repo}): ${why}`);
if (dropped.length) md.push('', `Also passed every check but did not make the top ${repoLimit} by stars: ${dropped.map((r) => r.repo).join(', ')}.`);
const conflicts = catalog.skills.filter((e) => e.conflictsWith);
md.push('', `## Name clashes (${conflicts.length})`, '', 'Two skills with the same name would install to the same folder. Loadout lists both and installs only one at a time.', '');
for (const e of conflicts) md.push(`- \`${e.id}\`: ${e.repo} and ${e.conflictsWith.split(':')[0]}`);
md.push('', `## Skills left out of included repos (${report.excludedSkills.length})`, '');
const bySkillWhy = new Map();
for (const x of report.excludedSkills) { const k = `${x.repo}|${x.why.replace(/:.*/, '')}`; bySkillWhy.set(k, [...(bySkillWhy.get(k) ?? []), x.path]); }
for (const [k, paths] of bySkillWhy) { const [repo, why] = k.split('|'); md.push(`- ${repo}: ${n(paths.length, 'skill')}. ${why.replace(/\.$/, '')}.`); }
await fs.writeFile(path.join(root, 'docs', 'catalog-audit.md'), md.join('\n') + '\n');

console.log(`catalog: ${picked.length} repos (${picked.length - 1} community), ${catalog.skills.length} skills, ${conflicts.length} name clashes`);
console.log(`excluded repos: ${report.excludedRepos.length}, excluded skills: ${report.excludedSkills.length}, passed but beyond top ${repoLimit}: ${dropped.length}`);
