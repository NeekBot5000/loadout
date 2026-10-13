import test from 'node:test';
import assert from 'node:assert/strict';
import { planProfile, saveProfile, listProfiles, deleteProfile, setActive, setBudget } from '../src/index.js';
import { sandbox } from './helpers.js';

const code = (c) => (e) => e.code === c;
const known = new Set(['a/r:docx', 'a/r:pdf', 'a/r:xlsx', 'b/r:seo']);

test('plan: installs what is missing, changes modes, turns off what the profile leaves out', () => {
  const installed = { 'a/r:docx': 'on', 'a/r:pdf': 'name', 'local:notes': 'on', 'b/r:seo': 'off' };
  const set = { 'a/r:docx': 'on', 'a/r:pdf': 'on', 'a/r:xlsx': 'name', 'local:notes': 'name' };
  const plan = planProfile({ installed, set, known });
  assert.deepEqual(plan.install, ['a/r:xlsx']);
  assert.deepEqual(plan.modes, { 'a/r:pdf': 'on', 'a/r:xlsx': 'name', 'local:notes': 'name' });
  assert.deepEqual(plan.missing, []);
});

test('plan: a profile with "off" entries installs nothing for them; installed skills not listed turn off', () => {
  const plan = planProfile({ installed: { 'a/r:docx': 'on' }, set: { 'a/r:pdf': 'off' }, known });
  assert.deepEqual(plan, { install: [], modes: { 'a/r:docx': 'off' }, missing: [] });
});

test('plan: skills that cannot be fetched are reported, not invented', () => {
  const plan = planProfile({ installed: {}, set: { 'local:gone': 'on', 'x/y:dropped': 'on' }, known });
  assert.deepEqual(plan.missing, ['local:gone', 'x/y:dropped']);
  assert.deepEqual(plan.install, []);
  assert.throws(() => planProfile({ installed: {}, set: { 'a/r:docx': 'loud' }, known }), code('bad-mode'));
});

test('plan: applying the profile you already have changes nothing', () => {
  const installed = { 'a/r:docx': 'on', 'a/r:pdf': 'name' };
  assert.deepEqual(planProfile({ installed, set: { ...installed }, known }), { install: [], modes: {}, missing: [] });
});

test('profiles: create, overwrite, list, activate, delete; names are unique; "off" entries are dropped', async () => {
  const sb = await sandbox();
  const id = await saveProfile(sb.stateDir, { name: 'Sticker shop', set: { 'a/r:docx': 'on', 'a/r:pdf': 'off' } });
  assert.equal(id, 'sticker-shop');
  await assert.rejects(saveProfile(sb.stateDir, { name: 'sticker SHOP', set: {} }), code('exists'));
  const id2 = await saveProfile(sb.stateDir, { name: 'Sticker shop!', set: {} }); // a different name, same slug
  assert.equal(id2, 'sticker-shop-2');
  await deleteProfile(sb.stateDir, id2);
  await saveProfile(sb.stateDir, { id, name: 'Sticker shop', set: { 'a/r:xlsx': 'name' } });
  let l = await listProfiles(sb.stateDir);
  assert.deepEqual(l.profiles[id], { name: 'Sticker shop', set: { 'a/r:xlsx': 'name' } });
  assert.equal(l.active, id);
  const other = await saveProfile(sb.stateDir, { name: 'Writing', set: {} });
  await setActive(sb.stateDir, id);
  assert.equal((await listProfiles(sb.stateDir)).active, id);
  assert.equal(await deleteProfile(sb.stateDir, id), true);
  l = await listProfiles(sb.stateDir);
  assert.equal(l.active, null);
  assert.deepEqual(Object.keys(l.profiles), [other]);
  assert.equal(await deleteProfile(sb.stateDir, id), false);
  await assert.rejects(saveProfile(sb.stateDir, { id: 'nope', name: 'x', set: {} }), code('not-found'));
  await assert.rejects(saveProfile(sb.stateDir, { name: '   ', set: {} }), code('bad-profile'));
  await assert.rejects(saveProfile(sb.stateDir, { name: 'x', set: { k: 'loud' } }), code('bad-mode'));
});

test('budget: stored, and refused when out of range', async () => {
  const sb = await sandbox();
  assert.equal((await listProfiles(sb.stateDir)).budget, 1500);
  await setBudget(sb.stateDir, 2200);
  assert.equal((await listProfiles(sb.stateDir)).budget, 2200);
  await assert.rejects(setBudget(sb.stateDir, 5), code('bad-budget'));
  await assert.rejects(setBudget(sb.stateDir, 'lots'), code('bad-budget'));
});

test('activity: appends, reads newest first, skips damaged lines, trims when large', async () => {
  const { appendActivity, readActivity } = await import('../src/index.js');
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const sb = await sandbox();
  assert.deepEqual(await readActivity(sb.stateDir), []);
  await appendActivity(sb.stateDir, 'first', new Date('2026-10-12T10:00:00Z'));
  await fs.appendFile(path.join(sb.stateDir, 'activity.log'), '{broken\n');
  await appendActivity(sb.stateDir, 'second', new Date('2026-10-12T10:01:00Z'));
  assert.deepEqual((await readActivity(sb.stateDir)).map((x) => x.m), ['second', 'first']);
  for (let i = 0; i < 1200; i++) await appendActivity(sb.stateDir, 'x'.repeat(200));
  const lines = (await fs.readFile(path.join(sb.stateDir, 'activity.log'), 'utf8')).trimEnd().split('\n');
  assert.ok(lines.length <= 1000, String(lines.length));
});
