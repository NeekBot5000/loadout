import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { installSkill, removeSkill, validateId, applyModes, readOverrides, modeOf, readState, inspectDir } from '../src/index.js';
import { sandbox, writeTarball, goodEntries, ls, SKILL_MD } from './helpers.js';

const SRC = { repo: 'example/skills', sha: 'abc123' };
const base = (sb, tarball, extra = {}) => ({ tarball, subpath: 'skills/docx', id: 'docx', skillsDir: sb.skillsDir, stateDir: sb.stateDir, source: SRC, ...extra });
const code = (c) => (e) => e.code === c;

test('installs one skill, strips the prefix, and flags scripts', async () => {
  const sb = await sandbox();
  const tb = await writeTarball(sb.root, goodEntries());
  const r = await installSkill(base(sb, tb));
  assert.equal(r.files, 4);
  assert.deepEqual(r.scripts.sort(), ['scripts/run.py', 'scripts/tool']); // .py by extension, "tool" by shebang
  assert.deepEqual(await ls(path.join(sb.skillsDir, 'docx')), ['SKILL.md', 'reference.md', 'scripts']);
  assert.deepEqual(await ls(sb.skillsDir), ['docx']); // pdf and README were not extracted
  const st = await readState(sb.stateDir);
  assert.equal(st.receipts.docx.source.sha, 'abc123');
  assert.equal(st.receipts.docx.files.length, 4);
  assert.match(st.receipts.docx.files[0].sha256, /^[0-9a-f]{64}$/);
  assert.deepEqual(await ls(path.join(sb.stateDir, 'tmp')), []); // temp space cleaned
});

test('rejects ".." paths and installs nothing', async () => {
  const sb = await sandbox();
  const tb = await writeTarball(sb.root, [...goodEntries(), { path: 'repo-abc123/skills/docx/../../evil.txt', content: 'x' }]);
  await assert.rejects(installSkill(base(sb, tb)), code('unsafe-path'));
  assert.deepEqual(await ls(sb.skillsDir), []);
  assert.deepEqual(await ls(sb.root), ['home', 'repo.tar.gz']); // nothing written next to the sandbox either
});

test('rejects backslash paths', async () => {
  const sb = await sandbox();
  const tb = await writeTarball(sb.root, [...goodEntries(), { path: 'repo-abc123/skills/docx/..\\evil.txt', content: 'x' }]);
  await assert.rejects(installSkill(base(sb, tb)), code('unsafe-path'));
  assert.deepEqual(await ls(sb.skillsDir), []);
});

test('ignores hostile entries outside the skill folder (never extracted)', async () => {
  const sb = await sandbox();
  const tb = await writeTarball(sb.root, [...goodEntries(), { path: '/etc/evil', content: 'x' }, { path: 'repo-abc123/other/link', type: '2', linkpath: '/etc/passwd' }]);
  await installSkill(base(sb, tb));
  assert.deepEqual(await ls(sb.skillsDir), ['docx']);
});

test('rejects a symlink inside the skill', async () => {
  const sb = await sandbox();
  const tb = await writeTarball(sb.root, [...goodEntries(), { path: 'repo-abc123/skills/docx/link', type: '2', linkpath: '/etc/passwd' }]);
  await assert.rejects(installSkill(base(sb, tb)), code('unsafe-entry'));
  assert.deepEqual(await ls(sb.skillsDir), []);
});

test('rejects a hard link inside the skill', async () => {
  const sb = await sandbox();
  const tb = await writeTarball(sb.root, [...goodEntries(), { path: 'repo-abc123/skills/docx/hard', type: '1', linkpath: 'repo-abc123/README.md' }]);
  await assert.rejects(installSkill(base(sb, tb)), code('unsafe-entry'));
  assert.deepEqual(await ls(sb.skillsDir), []);
});

test('rejects a skill over the size limit', async () => {
  const sb = await sandbox();
  const tb = await writeTarball(sb.root, goodEntries());
  await assert.rejects(installSkill(base(sb, tb, { limits: { maxTotalBytes: 50 } })), code('too-large'));
  await assert.rejects(installSkill(base(sb, tb, { limits: { maxFileBytes: 10 } })), code('too-large'));
  await assert.rejects(installSkill(base(sb, tb, { limits: { maxFiles: 2 } })), code('too-large'));
  assert.deepEqual(await ls(sb.skillsDir), []);
});

test('rejects a folder with no SKILL.md, or a path that is not in the archive', async () => {
  const sb = await sandbox();
  const entries = goodEntries().filter((e) => !e.path.endsWith('docx/SKILL.md'));
  const tb = await writeTarball(sb.root, entries);
  await assert.rejects(installSkill(base(sb, tb)), code('no-skill-md'));
  await assert.rejects(installSkill(base(sb, tb, { subpath: 'skills/nope', id: 'nope' })), code('not-found'));
  assert.deepEqual(await ls(sb.skillsDir), []);
});

test('rejects SKILL.md without frontmatter and leaves skills folder unchanged', async () => {
  const sb = await sandbox();
  const entries = goodEntries().map((e) => (e.path.endsWith('docx/SKILL.md') ? { ...e, content: '# no frontmatter' } : e));
  const tb = await writeTarball(sb.root, entries);
  await assert.rejects(installSkill(base(sb, tb)), code('bad-frontmatter'));
  assert.deepEqual(await ls(sb.skillsDir), []);
  assert.deepEqual(await ls(path.join(sb.stateDir, 'tmp')), []);
});

test('leaves an existing folder Loadout did not create untouched', async () => {
  const sb = await sandbox();
  await fs.mkdir(path.join(sb.skillsDir, 'docx'), { recursive: true });
  await fs.writeFile(path.join(sb.skillsDir, 'docx', 'mine.txt'), 'my own work');
  const tb = await writeTarball(sb.root, goodEntries());
  await assert.rejects(installSkill(base(sb, tb)), code('exists'));
  await assert.rejects(installSkill(base(sb, tb, { replace: true })), code('exists')); // replace only works on Loadout's own installs
  assert.equal(await fs.readFile(path.join(sb.skillsDir, 'docx', 'mine.txt'), 'utf8'), 'my own work');
});

test('updating a Loadout install keeps the old copy in .trash', async () => {
  const sb = await sandbox();
  const tb = await writeTarball(sb.root, goodEntries());
  await installSkill(base(sb, tb));
  const v2 = goodEntries().map((e) => (e.path.endsWith('reference.md') ? { ...e, content: 'reference v2' } : e));
  const tb2 = await writeTarball(sb.root, v2, 'v2.tar.gz');
  await installSkill(base(sb, tb2, { replace: true, source: { repo: 'example/skills', sha: 'def456' } }));
  assert.equal(await fs.readFile(path.join(sb.skillsDir, 'docx', 'reference.md'), 'utf8'), 'reference v2');
  const trash = await ls(path.join(sb.skillsDir, '.trash'));
  assert.equal(trash.length, 1);
  assert.equal(await fs.readFile(path.join(sb.skillsDir, '.trash', trash[0], 'reference.md'), 'utf8'), 'reference');
  assert.equal((await readState(sb.stateDir)).receipts.docx.source.sha, 'def456');
});

test('two installs of the same skill at once: one wins, one is told it is busy, nothing corrupt', async () => {
  const sb = await sandbox();
  const tb = await writeTarball(sb.root, goodEntries());
  const results = await Promise.allSettled([installSkill(base(sb, tb)), installSkill(base(sb, tb))]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  const bad = results.find((r) => r.status === 'rejected');
  assert.equal(bad.reason.code, 'busy');
  const info = await inspectDir(path.join(sb.skillsDir, 'docx'));
  assert.equal(info.files.length, 4);
});

test('validateId blocks traversal and reserved names', () => {
  for (const bad of ['', '../x', 'a/b', '.trash', 'synced', 'UPPER', 'a..b', 'x'.repeat(65), null]) {
    assert.throws(() => validateId(bad), code('bad-id'), String(bad));
  }
  assert.doesNotThrow(() => validateId('skill-creator'));
});

test('remove moves to .trash, drops receipt and override, and a second remove is a no-op', async () => {
  const sb = await sandbox();
  const tb = await writeTarball(sb.root, goodEntries());
  await installSkill(base(sb, tb));
  await applyModes(sb.settingsFile, { docx: 'off' });
  const r = await removeSkill({ id: 'docx', skillsDir: sb.skillsDir, stateDir: sb.stateDir, settingsFile: sb.settingsFile });
  assert.equal(r.status, 'removed');
  assert.equal(await fs.readFile(path.join(r.trash, 'SKILL.md'), 'utf8'), SKILL_MD);
  assert.deepEqual(await ls(sb.skillsDir), ['.trash']);
  assert.deepEqual((await readState(sb.stateDir)).receipts, {});
  assert.deepEqual(await readOverrides(sb.settingsFile), {});
  const again = await removeSkill({ id: 'docx', skillsDir: sb.skillsDir, stateDir: sb.stateDir, settingsFile: sb.settingsFile });
  assert.equal(again.status, 'absent');
});

test('remove refuses folders Loadout did not install', async () => {
  const sb = await sandbox();
  await fs.mkdir(path.join(sb.skillsDir, 'handmade'), { recursive: true });
  await fs.writeFile(path.join(sb.skillsDir, 'handmade', 'SKILL.md'), '---\nname: handmade\n---\n');
  await assert.rejects(removeSkill({ id: 'handmade', skillsDir: sb.skillsDir, stateDir: sb.stateDir }), code('not-managed'));
  assert.deepEqual(await ls(sb.skillsDir), ['handmade']);
});

test('settings: keeps unrelated keys, order and indent; maps modes; one backup; no temp leftovers', async () => {
  const sb = await sandbox();
  await fs.mkdir(path.dirname(sb.settingsFile), { recursive: true });
  const original = '{\n    "theme": "dark",\n    "permissions": { "allow": ["Bash(ls)"] },\n    "skillOverrides": { "keep-me": "user-invocable-only" },\n    "model": "x"\n}\n';
  await fs.writeFile(sb.settingsFile, original);
  const r = await applyModes(sb.settingsFile, { docx: 'name', pdf: 'off', xlsx: 'on' });
  assert.equal(r.changed, true);
  const text = await fs.readFile(sb.settingsFile, 'utf8');
  const obj = JSON.parse(text);
  assert.deepEqual(Object.keys(obj), ['theme', 'permissions', 'skillOverrides', 'model']); // order kept
  assert.deepEqual(obj.skillOverrides, { 'keep-me': 'user-invocable-only', docx: 'name-only', pdf: 'off' });
  assert.match(text, /^ {4}"theme"/m); // 4-space indent kept
  assert.ok(text.endsWith('\n'));
  assert.equal(await fs.readFile(`${sb.settingsFile}.loadout-backup`, 'utf8'), original);
  assert.deepEqual((await ls(path.dirname(sb.settingsFile))).filter((f) => f.endsWith('.tmp')), []);
  const ov = await readOverrides(sb.settingsFile);
  assert.equal(modeOf(ov, 'docx'), 'name');
  assert.equal(modeOf(ov, 'pdf'), 'off');
  assert.equal(modeOf(ov, 'xlsx'), 'on');
  assert.equal(modeOf(ov, 'keep-me'), 'other');
});

test('settings: a change that changes nothing does not rewrite the file', async () => {
  const sb = await sandbox();
  await applyModes(sb.settingsFile, { docx: 'off' });
  const before = await fs.stat(sb.settingsFile);
  await new Promise((r) => setTimeout(r, 20));
  const r = await applyModes(sb.settingsFile, { docx: 'off', pdf: 'on' });
  assert.equal(r.changed, false);
  assert.equal((await fs.stat(sb.settingsFile)).mtimeMs, before.mtimeMs);
});

test('settings: creates the file and folder when missing; turning everything on removes the key', async () => {
  const sb = await sandbox();
  await applyModes(sb.settingsFile, { docx: 'off' });
  assert.deepEqual(JSON.parse(await fs.readFile(sb.settingsFile, 'utf8')), { skillOverrides: { docx: 'off' } });
  await applyModes(sb.settingsFile, { docx: 'on' });
  assert.deepEqual(JSON.parse(await fs.readFile(sb.settingsFile, 'utf8')), {});
});

test('settings: refuses invalid JSON and wrong shapes, and leaves the file as it was', async () => {
  const sb = await sandbox();
  await fs.mkdir(path.dirname(sb.settingsFile), { recursive: true });
  for (const bad of ['{ "a": ', '[1,2]', '{ "skillOverrides": [] }', '{ "skillOverrides": null }']) {
    await fs.writeFile(sb.settingsFile, bad);
    await assert.rejects(applyModes(sb.settingsFile, { docx: 'off' }), code('settings-invalid'), bad);
    assert.equal(await fs.readFile(sb.settingsFile, 'utf8'), bad);
  }
  await assert.rejects(applyModes(sb.settingsFile, { docx: 'maybe' }), code('bad-mode'));
});

// Real data: build a codeload-shaped archive from the actual anthropics/skills clone and install from it.
const REAL = process.env.LOADOUT_REAL_REPO || '/home/claude/anthropics/skills';
const haveReal = await fs.stat(path.join(REAL, '.git')).then(() => true, () => false);
test('real anthropics/skills archive: docx and canvas-design install with the file counts the catalog shows', { skip: !haveReal && 'clone not present' }, async () => {
  const sb = await sandbox();
  const sha = execFileSync('git', ['-C', REAL, 'rev-parse', '--short', 'HEAD']).toString().trim();
  const tb = path.join(sb.root, 'skills.tar.gz');
  execFileSync('git', ['-C', REAL, 'archive', '--format=tar.gz', `--prefix=skills-${sha}/`, '-o', tb, 'HEAD']);
  const docx = await installSkill({ tarball: tb, subpath: 'skills/docx', id: 'docx', skillsDir: sb.skillsDir, stateDir: sb.stateDir, source: { repo: 'anthropics/skills', sha } });
  assert.equal(docx.files, 61);
  assert.equal(docx.scripts.length, 15);
  const canvas = await installSkill({ tarball: tb, subpath: 'skills/canvas-design', id: 'canvas-design', skillsDir: sb.skillsDir, stateDir: sb.stateDir, source: { repo: 'anthropics/skills', sha } });
  assert.equal(canvas.files, 83);
  assert.equal(canvas.scripts.length, 0);
  const st = await readState(sb.stateDir);
  assert.match(st.receipts.docx.frontmatter.description, /Word/);
  assert.deepEqual(await ls(sb.skillsDir), ['canvas-design', 'docx']);
});
