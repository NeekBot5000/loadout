import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  parseRepo, resolveRef, downloadArchive, parseRefAdvertisement, findSkills, installFromGitHub, installSkill, readState,
} from '../src/index.js';
import { sandbox, makeTarball, writeTarball, goodEntries, ls } from './helpers.js';

const SHA_MAIN = 'a'.repeat(40);
const SHA_TAG = 'b'.repeat(40);
const SHA_TAG_PEELED = 'c'.repeat(40);
const code = (c) => (e) => e.code === c;

const pkt = (s) => (s.length + 4).toString(16).padStart(4, '0') + s;
const ADVERT = pkt('# service=git-upload-pack\n') + '0000'
  + pkt(`${SHA_MAIN} HEAD\0multi_ack symref=HEAD:refs/heads/main agent=git/github\n`)
  + pkt(`${SHA_MAIN} refs/heads/main\n`)
  + pkt(`${SHA_TAG} refs/tags/v1\n`)
  + pkt(`${SHA_TAG_PEELED} refs/tags/v1^{}\n`)
  + '0000';

/** A fake fetch that serves a ref listing and archives, and records every URL it was asked for. */
function fakeGitHub({ archive = makeTarball(goodEntries('skills-aaaa')), routes = {} } = {}) {
  const calls = [];
  const impl = async (url, opts) => {
    calls.push(url);
    assert.equal(opts.redirect, 'manual');
    if (routes[url]) return routes[url]();
    if (url.endsWith('/info/refs?service=git-upload-pack')) return new Response(ADVERT);
    if (url.startsWith('https://codeload.github.com/')) {
      return new Response(archive, { headers: { 'content-length': String(archive.length) } });
    }
    return new Response('nope', { status: 404 });
  };
  return { impl, calls };
}

test('parseRepo accepts owner/name and GitHub links, rejects everything else', () => {
  assert.deepEqual(parseRepo('anthropics/skills'), { owner: 'anthropics', repo: 'skills' });
  assert.deepEqual(parseRepo('https://github.com/anthropics/skills/tree/main/skills'), { owner: 'anthropics', repo: 'skills' });
  assert.deepEqual(parseRepo('https://github.com/a-b/c.d.git'), { owner: 'a-b', repo: 'c.d' });
  for (const bad of ['', 'skills', 'a/b/c', '../x', 'a/..', 'http://github.com/a/b', 'https://evil.com/a/b', 'a b/c', '-a/b']) {
    assert.throws(() => parseRepo(bad), code('bad-repo'), bad);
  }
});

test('parseRefAdvertisement reads refs and the default branch', () => {
  const { head, refs } = parseRefAdvertisement(ADVERT);
  assert.equal(head, 'refs/heads/main');
  assert.equal(refs.get('refs/heads/main'), SHA_MAIN);
  assert.equal(refs.get('refs/tags/v1^{}'), SHA_TAG_PEELED);
});

test('resolveRef: default branch, branch, peeled tag, full SHA without a request, missing ref', async () => {
  const gh = fakeGitHub();
  assert.equal((await resolveRef({ repo: 'o/r', fetchImpl: gh.impl })).sha, SHA_MAIN);
  assert.equal((await resolveRef({ repo: 'o/r', ref: 'main', fetchImpl: gh.impl })).sha, SHA_MAIN);
  assert.equal((await resolveRef({ repo: 'o/r', ref: 'v1', fetchImpl: gh.impl })).sha, SHA_TAG_PEELED);
  const n = gh.calls.length;
  assert.equal((await resolveRef({ repo: 'o/r', ref: SHA_TAG, fetchImpl: gh.impl })).sha, SHA_TAG);
  assert.equal(gh.calls.length, n);
  await assert.rejects(resolveRef({ repo: 'o/r', ref: 'nope', fetchImpl: gh.impl }), code('not-found'));
  await assert.rejects(resolveRef({ repo: 'o/r', ref: '../x', fetchImpl: gh.impl }), code('bad-ref'));
  assert.ok(gh.calls.every((u) => u === 'https://github.com/o/r.git/info/refs?service=git-upload-pack'));
});

test('a redirect to a host outside GitHub is refused before it is fetched', async () => {
  const sb = await sandbox();
  const url = `https://codeload.github.com/o/r/tar.gz/${SHA_MAIN}`;
  const gh = fakeGitHub({ routes: { [url]: () => new Response(null, { status: 302, headers: { location: 'https://evil.example/x.tgz' } }) } });
  await assert.rejects(downloadArchive({ repo: 'o/r', sha: SHA_MAIN, cacheDir: sb.root, fetchImpl: gh.impl }), code('blocked-host'));
  assert.deepEqual(gh.calls, [url]);
  assert.deepEqual((await ls(sb.root)).filter((f) => f.endsWith('.part')), []);
});

test('a redirect between GitHub hosts is followed', async () => {
  const sb = await sandbox();
  const first = `https://codeload.github.com/o/r/tar.gz/${SHA_MAIN}`;
  const gh = fakeGitHub({ routes: { [first]: () => new Response(null, { status: 301, headers: { location: `https://codeload.github.com/o/r2/tar.gz/${SHA_MAIN}` } }) } });
  const r = await downloadArchive({ repo: 'o/r', sha: SHA_MAIN, cacheDir: sb.root, fetchImpl: gh.impl });
  assert.equal(r.cached, false);
  assert.equal(gh.calls.length, 2);
});

test('downloads are pinned to a full SHA, cached, and shared when requested at the same time', async () => {
  const sb = await sandbox();
  const gh = fakeGitHub();
  assert.throws(() => downloadArchive({ repo: 'o/r', sha: 'main', cacheDir: sb.root, fetchImpl: gh.impl }), code('bad-ref'));
  const [a, b] = await Promise.all([
    downloadArchive({ repo: 'o/r', sha: SHA_MAIN, cacheDir: sb.root, fetchImpl: gh.impl }),
    downloadArchive({ repo: 'o/r', sha: SHA_MAIN, cacheDir: sb.root, fetchImpl: gh.impl }),
  ]);
  assert.equal(a.file, b.file);
  assert.equal(gh.calls.length, 1);
  const again = await downloadArchive({ repo: 'o/r', sha: SHA_MAIN, cacheDir: sb.root, fetchImpl: gh.impl });
  assert.equal(again.cached, true);
  assert.equal(gh.calls.length, 1);
});

test('a download that is too large or not a gzip leaves nothing in the cache', async () => {
  const sb = await sandbox();
  const big = fakeGitHub({ archive: Buffer.alloc(5000, 0x1f) });
  await assert.rejects(downloadArchive({ repo: 'o/r', sha: SHA_MAIN, cacheDir: sb.root, fetchImpl: big.impl, maxBytes: 1000 }), code('too-large'));
  const html = fakeGitHub({ archive: Buffer.from('<html>login</html>') });
  await assert.rejects(downloadArchive({ repo: 'o/r', sha: SHA_MAIN, cacheDir: sb.root, fetchImpl: html.impl }), code('network'));
  assert.deepEqual(await ls(sb.root), ['home']);
});

test('GitHub errors become plain messages', async () => {
  const sb = await sandbox();
  const url = `https://codeload.github.com/o/r/tar.gz/${SHA_MAIN}`;
  const gh = fakeGitHub({ routes: { [url]: () => new Response('slow down', { status: 429 }) } });
  await assert.rejects(downloadArchive({ repo: 'o/r', sha: SHA_MAIN, cacheDir: sb.root, fetchImpl: gh.impl }), code('rate-limited'));
});

test('findSkills lists every skill folder with its SKILL.md, file count and scripts', async () => {
  const sb = await sandbox();
  const tb = await writeTarball(sb.root, [
    ...goodEntries('r-1'),
    { path: 'r-1/skills/docx/nested/SKILL.md', content: '---\nname: inner\n---\n' },
  ]);
  const skills = await findSkills({ tarball: tb });
  assert.deepEqual(skills.map((s) => s.path), ['skills/docx', 'skills/pdf']);
  const docx = skills[0];
  assert.equal(docx.files, 5);
  assert.match(docx.skillMd, /^---\nname: docx/);
  assert.deepEqual(docx.scripts, ['scripts/run.py']);
  assert.equal(docx.unsafe, false);
});

test('findSkills marks a skill that contains a link as unsafe', async () => {
  const sb = await sandbox();
  const tb = await writeTarball(sb.root, [...goodEntries('r-1'), { path: 'r-1/skills/pdf/evil', type: '2', linkpath: '/etc/passwd' }]);
  const pdf = (await findSkills({ tarball: tb })).find((s) => s.path === 'skills/pdf');
  assert.equal(pdf.unsafe, true);
});

test('installFromGitHub: resolve, download once, install two skills, report real steps', async () => {
  const sb = await sandbox();
  const gh = fakeGitHub();
  const steps = [];
  const onProgress = (p) => steps.push(p.step);
  const docx = await installFromGitHub({ entry: { id: 'docx', repo: 'o/r', path: 'skills/docx', ref: 'main' }, skillsDir: sb.skillsDir, stateDir: sb.stateDir, fetchImpl: gh.impl, onProgress });
  await installFromGitHub({ entry: { id: 'pdf', repo: 'o/r', path: 'skills/pdf', ref: 'main' }, skillsDir: sb.skillsDir, stateDir: sb.stateDir, fetchImpl: gh.impl, onProgress });
  assert.equal(docx.sha, SHA_MAIN);
  assert.equal(gh.calls.filter((u) => u.includes('codeload')).length, 1);
  assert.deepEqual(await ls(sb.skillsDir), ['docx', 'pdf']);
  assert.ok(steps.includes('downloading') && steps.includes('cached') && steps.at(-1) === 'done');
  const st = await readState(sb.stateDir);
  assert.equal(st.receipts.docx.source.sha, SHA_MAIN);
  assert.equal(st.receipts.docx.source.repo, 'o/r');
});

const NET = process.env.LOADOUT_NET === '1';
test('live: anthropics/skills resolves, downloads and installs docx', { skip: !NET && 'set LOADOUT_NET=1 to run' }, async () => {
  const sb = await sandbox();
  const { sha } = await resolveRef({ repo: 'anthropics/skills', ref: 'main' });
  assert.match(sha, /^[0-9a-f]{40}$/);
  const { file } = await downloadArchive({ repo: 'anthropics/skills', sha, cacheDir: path.join(sb.stateDir, 'cache') });
  const skills = await findSkills({ tarball: file });
  assert.ok(skills.length >= 17, `found ${skills.length} skills`);
  assert.ok(skills.every((s) => !s.unsafe));
  const r = await installFromGitHub({ entry: { id: 'docx', repo: 'anthropics/skills', path: 'skills/docx', ref: 'main' }, skillsDir: sb.skillsDir, stateDir: sb.stateDir });
  assert.ok(r.files > 10);
  assert.ok((await fs.readFile(path.join(sb.skillsDir, 'docx', 'SKILL.md'), 'utf8')).startsWith('---'));
});

test('a repo with SKILL.md at its root is one skill and installs whole', async () => {
  const sb = await sandbox();
  const tb = await writeTarball(sb.root, [
    { path: 'humanizer-1/', type: '5' },
    { path: 'humanizer-1/SKILL.md', content: '---\nname: humanizer\ndescription: Remove AI tells.\n---\n' },
    { path: 'humanizer-1/README.md', content: 'readme' },
    { path: 'humanizer-1/examples/SKILL.md', content: '---\nname: example\n---\n' },
  ]);
  const skills = await findSkills({ tarball: tb });
  assert.deepEqual(skills.map((s) => [s.path, s.files]), [['.', 3]]); // examples/ is part of the root skill
  const both = await writeTarball(sb.root, [
    { path: 'ctx-1/SKILL.md', content: '---\nname: ctx\n---\n' },
    { path: 'ctx-1/skills/memory/SKILL.md', content: '---\nname: memory\n---\n' },
    { path: 'ctx-1/examples/demo/SKILL.md', content: '---\nname: demo\n---\n' },
  ], 'both.tar.gz');
  assert.deepEqual((await findSkills({ tarball: both })).map((s) => s.path), ['.', 'skills/memory']);
  for (const subpath of ['.', '']) {
    const id = subpath ? 'humanizer' : 'humanizer2';
    const r = await installSkill({ tarball: tb, subpath, id, skillsDir: sb.skillsDir, stateDir: sb.stateDir, source: { repo: 'o/humanizer', sha: 'x' } });
    assert.equal(r.files, 3);
    assert.deepEqual(await ls(path.join(sb.skillsDir, id)), ['README.md', 'SKILL.md', 'examples']);
  }
});

test('a root install still refuses a repo whose root has no SKILL.md or has a link', async () => {
  const sb = await sandbox();
  const none = await writeTarball(sb.root, goodEntries('r-1'), 'a.tar.gz');
  await assert.rejects(installSkill({ tarball: none, subpath: '.', id: 'x', skillsDir: sb.skillsDir, stateDir: sb.stateDir, source: {} }), code('no-skill-md'));
  const linked = await writeTarball(sb.root, [
    { path: 'r-1/', type: '5' }, { path: 'r-1/SKILL.md', content: '---\nname: x\n---\n' },
    { path: 'r-1/key', type: '2', linkpath: '/home/u/.ssh/id_rsa' },
  ], 'b.tar.gz');
  await assert.rejects(installSkill({ tarball: linked, subpath: '.', id: 'x', skillsDir: sb.skillsDir, stateDir: sb.stateDir, source: {} }), code('unsafe-entry'));
  assert.deepEqual(await ls(sb.skillsDir), []);
});
