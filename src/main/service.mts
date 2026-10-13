// Everything that touches disk or network. The renderer reaches it only through IPC (ipc.mts).
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  installFromGitHub, removeSkill, applyModes, readOverrides, modeOf, readState, inspectDir, readFrontmatter, EngineError,
  planProfile, listProfiles, saveProfile, deleteProfile, setActive, setBudget, appendActivity, readActivity,
  reviewArchive, diffFiles, parseRepo, resolveRef, downloadArchive, validateId, writeState,
} from 'loadout-engine';
import type { ReviewFinding, ReviewedSkill, EngineProgress } from 'loadout-engine';
import type {
  ActivityLine, ApplyResult, CatalogNote, Finding, Mode, Progress, ProfilesState, RepoPreview, Skill, TreeItem, UpdateInfo, UpdatePreview,
} from '../shared/api.js';

interface CatalogEntry {
  id: string; repo: string; path: string; ref: string; tier: 'anthropic' | 'community' | 'added'; kind: string;
  blurb: string; name: string | null; description: string; tok: number; files: number; bytes: number;
  scripts: number; tree: TreeItem[]; warnings: string[]; requires: string[]; conflictsWith?: string;
}

/** A repo the user added, pinned to the commit they reviewed. Kept in ~/.loadout/state.json. */
interface AddedRepo { sha: string; addedAt: string; skills: CatalogEntry[] }

/** Findings worth showing a person: anything high or medium, plus notes that the skill may break alone. */
const shown = (f: ReviewFinding) => f.sev === 'high' || f.sev === 'medium' || f.rule === 'needs-plugin' || f.rule === 'escapes-folder-code';
const firstSentence = (d: string) => {
  const s = (d || '').replace(/\s+/g, ' ').trim().split(/(?<=[.!?])\s/)[0] ?? '';
  return s.length > 110 ? s.slice(0, 107).replace(/\s\S*$/, '') + '...' : s;
};

export interface Paths { home: string; skillsDir: string; settingsFile: string; stateDir: string }

/** LOADOUT_HOME points everything at a test folder instead of the real home directory. */
export function defaultPaths(): Paths {
  const home = process.env.LOADOUT_HOME || os.homedir();
  return {
    home,
    skillsDir: path.join(home, '.claude', 'skills'),
    settingsFile: path.join(home, '.claude', 'settings.json'),
    stateDir: path.join(home, '.loadout'),
  };
}

const nameTok = (id: string) => Math.ceil(id.length / 4) + 1;
const fmtMB = (b: number) => (b < 1048576 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1048576).toFixed(1)} MB`);
/** Folders in ~/.claude/skills that belong to Claude Code, never to Loadout. */
const RESERVED = new Set(['synced']);

export class Service {
  private entries = new Map<string, CatalogEntry>();
  private catalogNote: CatalogNote = { repo: 'anthropics/skills', sha: '', date: '' };
  private settingsQueue: Promise<unknown> = Promise.resolve();
  private profileQueue: Promise<unknown> = Promise.resolve();

  constructor(private catalogFile: string, private paths: Paths = defaultPaths()) {}

  private async loadEntries() {
    if (this.entries.size) return;
    const cat = JSON.parse(await fs.readFile(this.catalogFile, 'utf8')) as { generated: string; skills: CatalogEntry[] };
    for (const e of cat.skills) this.entries.set(`${e.repo}:${e.path}`, e);
    const official = cat.skills.find((e) => e.tier === 'anthropic');
    this.catalogNote = { repo: 'anthropics/skills', sha: official?.ref.slice(0, 7) ?? '', date: cat.generated };
  }

  /** Folders in the skills folder, with the catalog key Loadout installed them from (if any). */
  private async folders(): Promise<{ id: string; key: string; managed: boolean }[]> {
    let names: string[] = [];
    try {
      names = (await fs.readdir(this.paths.skillsDir, { withFileTypes: true }))
        .filter((d) => d.isDirectory() && !d.name.startsWith('.') && !RESERVED.has(d.name))
        .map((d) => d.name);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    }
    const { receipts } = await readState(this.paths.stateDir);
    return names.map((id) => {
      const r = receipts[id];
      return r ? { id, key: `${r.source.repo}:${r.source.path}`, managed: true } : { id, key: `local:${id}`, managed: false };
    });
  }

  private async localSkill(id: string): Promise<Skill | null> {
    const dir = path.join(this.paths.skillsDir, id);
    let text: string;
    try { text = await fs.readFile(path.join(dir, 'SKILL.md'), 'utf8'); } catch { return null; }
    const fm = readFrontmatter(text) ?? {};
    const desc = (fm.description ?? '').slice(0, 1536);
    let info: Awaited<ReturnType<typeof inspectDir>> = { files: [], bytes: 0, scripts: [] };
    try { info = await inspectDir(dir); } catch { /* a link or odd file: show the skill, without a file list */ }
    const top = new Map<string, TreeItem>();
    for (const f of info.files) {
      const i = f.path.indexOf('/');
      const p = i < 0 ? f.path : f.path.slice(0, i + 1);
      const t = top.get(p) ?? { p, k: i < 0 ? 'file' : 'dir', b: 0, x: 0, n: 0 };
      t.b += f.bytes; t.n += 1; if (f.isScript) t.x += 1;
      top.set(p, t);
    }
    const order = (t: TreeItem) => (t.p === 'SKILL.md' ? 0 : t.k === 'file' ? 1 : 2);
    return {
      key: `local:${id}`, id, tier: 'yours', kind: 'yours', blurb: (desc.split(/(?<=[.!?])\s/)[0] ?? '').slice(0, 110), desc,
      tok: Math.ceil(((fm.name ?? id).length + desc.length) / 4), nameTok: nameTok(id),
      nfiles: info.files.length, runs: info.scripts.length, bytes: info.bytes,
      tree: [...top.values()].sort((a, b) => order(a) - order(b) || a.p.localeCompare(b.p)),
      repo: '', url: '', path: `~/.claude/skills/${id}`,
    };
  }

  private async addedRepos(): Promise<Record<string, AddedRepo>> {
    const st = (await readState(this.paths.stateDir)) as unknown as { addedRepos?: Record<string, AddedRepo> };
    return st.addedRepos ?? {};
  }

  private async saveAddedRepos(repos: Record<string, AddedRepo>) {
    const st = await readState(this.paths.stateDir);
    await writeState(this.paths.stateDir, { ...st, addedRepos: repos } as typeof st);
  }

  /** A catalog entry or an entry from a repo the user added. */
  private async lookup(key: string): Promise<CatalogEntry> {
    await this.loadEntries();
    const e = this.entries.get(key);
    if (e) return e;
    for (const r of Object.values(await this.addedRepos())) {
      const a = r.skills.find((s) => `${s.repo}:${s.path}` === key);
      if (a) return a;
    }
    throw new EngineError('not-found', `${key} is not in the list.`);
  }

  /** The folder in ~/.claude/skills a key lives in (or would). */
  private async folderOf(key: string): Promise<string> {
    if (key.startsWith('local:')) return key.slice(6);
    const { receipts } = await readState(this.paths.stateDir);
    const r = Object.values(receipts).find((x) => `${x.source.repo}:${x.source.path}` === key);
    return r ? r.id : (await this.lookup(key)).id;
  }

  private toSkill(key: string, e: CatalogEntry): Skill {
    return {
      key, id: e.id, tier: e.tier, kind: e.kind, blurb: e.blurb, desc: e.description.slice(0, 1536),
      tok: e.tok, nameTok: nameTok(e.id), nfiles: e.files, runs: e.scripts, bytes: e.bytes, tree: e.tree,
      repo: e.repo, url: `https://github.com/${e.repo}/tree/${e.ref}${e.path === '.' ? '' : '/' + e.path}`,
      path: e.path === '.' ? '(repo root)' : e.path, warnings: e.warnings, requires: e.requires,
    };
  }

  async catalog(): Promise<{ skills: Skill[]; note: CatalogNote }> {
    await this.loadEntries();
    const skills: Skill[] = [];
    const listed = new Set<string>();
    for (const [key, e] of this.entries) { skills.push(this.toSkill(key, e)); listed.add(key); }
    for (const r of Object.values(await this.addedRepos())) {
      for (const e of r.skills) {
        const key = `${e.repo}:${e.path}`;
        if (listed.has(key)) continue;
        skills.push(this.toSkill(key, e));
        listed.add(key);
      }
    }
    for (const f of await this.folders()) {
      if (f.managed && listed.has(f.key)) continue;
      const s = await this.localSkill(f.id);
      if (!s) continue;
      if (f.managed) {
        // Installed by Loadout from a repo that is no longer listed: still shown, still removable.
        const repo = f.key.slice(0, f.key.lastIndexOf(':'));
        skills.push({ ...s, key: f.key, tier: 'added', kind: '', repo, url: `https://github.com/${repo}`, path: f.key.slice(repo.length + 1) });
      } else skills.push(s);
    }
    skills.sort((a, b) => a.id.localeCompare(b.id) || a.key.localeCompare(b.key));
    return { skills, note: this.catalogNote };
  }

  async installed(): Promise<Record<string, Mode>> {
    const overrides = await readOverrides(this.paths.settingsFile).catch(() => ({}));
    const out: Record<string, Mode> = {};
    for (const f of await this.folders()) {
      const m = modeOf(overrides, f.id);
      out[f.key] = m === 'other' ? 'on' : m; // e.g. "user-invocable-only": shown as on, left as is until changed
    }
    return out;
  }

  /** Turn engine progress into the steps and log lines the UI shows. */
  private progress(key: string, label: string, repo: string, files: number, id: string, onProgress: (p: Progress) => void) {
    let last = -1;
    return (p: EngineProgress) => {
      switch (p.step) {
        case 'resolving': onProgress({ key, step: 'Fetching', pct: 10, message: `Fetching ${label}` }); break;
        case 'cached': onProgress({ key, step: 'Downloading', pct: 70, message: `Using the copy of ${repo} already downloaded` }); break;
        case 'fetching': onProgress({ key, step: 'Downloading', pct: 15, message: `Downloading ${repo}` }); break;
        case 'downloading': {
          const pct = p.total ? 15 + Math.round((p.bytes / p.total) * 65) : Math.min(78, 15 + Math.round(p.bytes / 200000));
          if (pct !== last) { last = pct; onProgress({ key, step: 'Downloading', pct, message: null }); }
          break;
        }
        case 'downloaded': onProgress({ key, step: 'Downloading', pct: 80, message: `Downloaded ${fmtMB(p.bytes)}` }); break;
        case 'writing': onProgress({ key, step: 'Writing', pct: 85, message: `Checking and writing ${files} files to ~/.claude/skills/${id}` }); break;
        case 'done': onProgress({ key, step: 'Done', pct: 100, message: null }); break;
      }
    };
  }

  async install(key: string, onProgress: (p: Progress) => void, opts: { ref?: string; replace?: boolean } = {}): Promise<void> {
    const e = await this.lookup(key);
    const ref = opts.ref ?? e.ref;
    const where = e.path === '.' ? e.repo : `${e.repo}/${e.path}`;
    await installFromGitHub({
      entry: { id: e.id, repo: e.repo, path: e.path, ref },
      skillsDir: this.paths.skillsDir,
      stateDir: this.paths.stateDir,
      replace: opts.replace,
      onProgress: this.progress(key, `${where} at ${ref.slice(0, 7)}`, e.repo, e.files, e.id, onProgress),
    });
  }

  async remove(key: string): Promise<void> {
    if (key.startsWith('local:')) throw new EngineError('not-managed', 'Loadout did not install this skill, so it will not remove it.');
    const id = await this.folderOf(key);
    await this.serialSettings(() => removeSkill({ id, skillsDir: this.paths.skillsDir, stateDir: this.paths.stateDir, settingsFile: this.paths.settingsFile }));
  }

  async setModes(changes: Record<string, Mode>): Promise<void> {
    const byFolder: Record<string, Mode> = {};
    for (const [key, m] of Object.entries(changes)) {
      if (m !== 'on' && m !== 'name' && m !== 'off') throw new EngineError('bad-mode', `Unknown mode "${m}".`);
      byFolder[await this.folderOf(key)] = m;
    }
    await this.serialSettings(() => applyModes(this.paths.settingsFile, byFolder));
  }

  /* ---------- M4: repos the user adds, and updates ---------- */

  private reviews = new Map<string, ReviewedSkill[]>();

  private async review(repo: string, sha: string, onProgress?: (p: EngineProgress) => void): Promise<ReviewedSkill[]> {
    const k = `${repo}@${sha}`;
    if (!this.reviews.has(k)) {
      const { file } = await downloadArchive({ repo, sha, cacheDir: path.join(this.paths.stateDir, 'cache'), onProgress });
      this.reviews.set(k, await reviewArchive({ tarball: file }));
    }
    return this.reviews.get(k)!;
  }

  async previewRepo(input: string, onProgress: (p: Progress) => void): Promise<RepoPreview> {
    const { owner, repo: name } = parseRepo(input);
    const repo = `${owner}/${name}`;
    const key = `repo:${repo}`;
    onProgress({ key, step: 'Fetching', pct: 10, message: `Looking up ${repo} on GitHub` });
    const { sha } = await resolveRef({ repo, ref: 'HEAD' });
    const reviewed = await this.review(repo, sha, this.progress(key, repo, repo, 0, '', onProgress));
    onProgress({ key, step: 'Done', pct: 100, message: `Checked ${reviewed.length} ${reviewed.length === 1 ? 'skill' : 'skills'} in ${repo} at ${sha.slice(0, 7)}` });
    return {
      repo, sha,
      skills: reviewed.map((s) => {
        const id = (s.path === '.' ? name : s.path.split('/').pop()!).toLowerCase();
        let problem: string | null = null;
        if (s.unsafe || s.findings.some((f) => f.rule === 'link-or-special')) problem = 'It contains a link or special file. Loadout will not install it.';
        else { try { validateId(id); } catch { problem = `The folder name "${id}" is not one Loadout can install to.`; } }
        return {
          path: s.path, id, desc: s.description, skillMd: s.skillMd.slice(0, 60000),
          nfiles: s.files, bytes: s.bytes, runs: s.tree.reduce((n, t) => n + t.x, 0), tree: s.tree,
          findings: s.findings.filter(shown).slice(0, 40) as Finding[], problem,
        };
      }),
    };
  }

  async addRepo(repo: string, sha: string, paths: string[]): Promise<void> {
    const { owner, repo: name } = parseRepo(repo);
    const full = `${owner}/${name}`;
    const reviewed = (await this.review(full, sha)).filter((s) => paths.includes(s.path));
    const skills: CatalogEntry[] = [];
    for (const s of reviewed) {
      const id = (s.path === '.' ? name : s.path.split('/').pop()!).toLowerCase();
      try { validateId(id); } catch { continue; }
      if (s.unsafe) continue;
      const flagged = s.findings.filter((f) => f.sev === 'high' || f.sev === 'medium').length;
      const warnings = ['Added by you. Loadout has not reviewed this repo; read the files before you install.'];
      if (flagged) warnings.push(`The safety check flagged ${flagged} ${flagged === 1 ? 'line' : 'lines'} when you added it.`);
      if (s.findings.some((f) => f.rule === 'needs-plugin' || f.rule === 'escapes-folder-code')) warnings.push('It uses files outside its folder, so it may not work on its own.');
      skills.push({
        id, repo: full, path: s.path, ref: sha, tier: 'added', kind: '', blurb: firstSentence(s.description),
        name: s.name, description: s.description, tok: Math.ceil(((s.name ?? id).length + Math.min(s.description.length, 1536)) / 4),
        files: s.files, bytes: s.bytes, scripts: s.tree.reduce((n, t) => n + t.x, 0), tree: s.tree, warnings, requires: [],
      });
    }
    if (!skills.length) throw new EngineError('nothing', 'None of the chosen skills can be added.');
    const repos = await this.addedRepos();
    repos[full] = { sha, addedAt: new Date().toISOString(), skills };
    await this.saveAddedRepos(repos);
  }

  async removeRepo(repo: string): Promise<void> {
    const repos = await this.addedRepos();
    delete repos[repo];
    await this.saveAddedRepos(repos);
  }

  /** Where an installed skill could move to: the catalog's commit, or the newest commit of a repo the user added. */
  private async target(key: string, heads?: Map<string, string>): Promise<{ from: string; to: string } | null> {
    const { receipts } = await readState(this.paths.stateDir);
    const r = Object.values(receipts).find((x) => `${x.source.repo}:${x.source.path}` === key);
    if (!r) return null;
    await this.loadEntries();
    const cat = this.entries.get(key);
    let to: string | undefined;
    if (cat) to = cat.ref; // community skills only move to a commit the audit reviewed
    else {
      const repos = await this.addedRepos();
      if (!repos[r.source.repo]) return null;
      to = heads?.get(r.source.repo);
      if (!to) {
        to = (await resolveRef({ repo: r.source.repo, ref: 'HEAD' })).sha;
        heads?.set(r.source.repo, to);
      }
    }
    return to && to !== r.source.sha ? { from: r.source.sha, to } : null;
  }

  async updates(): Promise<UpdateInfo[]> {
    const out: UpdateInfo[] = [];
    const heads = new Map<string, string>();
    for (const f of await this.folders()) {
      if (!f.managed) continue;
      try {
        const t = await this.target(f.key, heads);
        if (t) out.push({ key: f.key, ...t });
      } catch { /* offline or GitHub busy: no update shown for that repo */ }
    }
    return out;
  }

  async previewUpdate(key: string): Promise<UpdatePreview> {
    const t = await this.target(key);
    if (!t) throw new EngineError('none', 'There is no newer version of this skill.');
    const repo = key.slice(0, key.lastIndexOf(':'));
    const p = key.slice(repo.length + 1);
    const next = (await this.review(repo, t.to)).find((s) => s.path === p);
    if (!next) throw new EngineError('gone', 'The newer version of the repo no longer has this skill.');
    const { receipts } = await readState(this.paths.stateDir);
    const r = Object.values(receipts).find((x) => `${x.source.repo}:${x.source.path}` === key)!;
    return { key, ...t, ...diffFiles(r.files, next.hashes), findings: next.findings.filter(shown).slice(0, 40) as Finding[], desc: next.description };
  }

  async update(key: string, onProgress: (p: Progress) => void): Promise<void> {
    const t = await this.target(key);
    if (!t) throw new EngineError('none', 'There is no newer version of this skill.');
    // Update from the receipt: it always knows the repo, folder and path, even when the skill is no longer listed.
    const { receipts } = await readState(this.paths.stateDir);
    const r = Object.values(receipts).find((x) => `${x.source.repo}:${x.source.path}` === key)!;
    const where = r.source.path === '.' ? r.source.repo : `${r.source.repo}/${r.source.path}`;
    await installFromGitHub({
      entry: { id: r.id, repo: r.source.repo, path: r.source.path, ref: t.to },
      skillsDir: this.paths.skillsDir,
      stateDir: this.paths.stateDir,
      replace: true,
      onProgress: this.progress(key, `${where} at ${t.to.slice(0, 7)}`, r.source.repo, r.files.length, r.id, onProgress),
    });
    // For a repo the user added, the listed entry follows the installed version.
    const repo = key.slice(0, key.lastIndexOf(':'));
    const repos = await this.addedRepos();
    const entry = repos[repo]?.skills.find((s) => `${s.repo}:${s.path}` === key);
    const next = (await this.review(repo, t.to)).find((s) => `${repo}:${s.path}` === key);
    if (entry && next) {
      Object.assign(entry, { ref: t.to, description: next.description, blurb: firstSentence(next.description), files: next.files, bytes: next.bytes, tree: next.tree, scripts: next.tree.reduce((n, x) => n + x.x, 0) });
      await this.saveAddedRepos(repos);
    }
  }

  async profiles(): Promise<ProfilesState> {
    const p = await listProfiles(this.paths.stateDir);
    if (Object.keys(p.profiles).length === 0) {
      // First run: the current setup becomes the first profile, so the picker is never empty.
      await saveProfile(this.paths.stateDir, { name: 'Current setup', set: await this.installed() });
      return listProfiles(this.paths.stateDir);
    }
    return p;
  }

  saveProfile(id: string | null, name: string, set: Record<string, Mode>): Promise<string> {
    return saveProfile(this.paths.stateDir, { id, name, set });
  }

  async deleteProfile(id: string): Promise<void> {
    await deleteProfile(this.paths.stateDir, id);
  }

  setBudget(tokens: number): Promise<void> {
    return setBudget(this.paths.stateDir, tokens);
  }

  activity(): Promise<ActivityLine[]> {
    return readActivity(this.paths.stateDir);
  }

  note(message: string): Promise<void> {
    return appendActivity(this.paths.stateDir, message);
  }

  /**
   * Install what the profile needs (one at a time), then write every mode change at once.
   * Applies queue up: a second apply waits for the first, so the last one chosen wins.
   */
  applyProfile(id: string, onProgress: (p: Progress) => void): Promise<ApplyResult> {
    const run = this.profileQueue.then(async () => {
      await this.loadEntries();
      const { profiles } = await listProfiles(this.paths.stateDir);
      const p = profiles[id];
      if (!p) throw new EngineError('not-found', 'That profile no longer exists.');
      const installed = await this.installed();
      const added = Object.values(await this.addedRepos()).flatMap((r) => r.skills.map((s) => `${s.repo}:${s.path}`));
      const plan = planProfile({ installed, set: p.set, known: new Set([...this.entries.keys(), ...added, ...Object.keys(installed)]) });
      const done: string[] = [];
      const failed: string[] = [];
      for (const key of plan.install) {
        try {
          await this.install(key, onProgress);
          done.push(key);
        } catch (e) {
          failed.push(`${key}: ${(e as Error).message}`);
          delete plan.modes[key];
          onProgress({ key, step: 'Done', pct: 100, message: null });
        }
      }
      if (Object.keys(plan.modes).length) await this.setModes(plan.modes);
      await setActive(this.paths.stateDir, id);
      return { changed: Object.keys(plan.modes).filter((k) => k in installed).length, installed: done, failed, missing: plan.missing };
    });
    this.profileQueue = run.catch(() => undefined);
    return run;
  }

  /** One settings write at a time, so two quick clicks cannot interleave read-modify-write. */
  private serialSettings<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.settingsQueue.then(fn, fn);
    this.settingsQueue = run.catch(() => undefined);
    return run;
  }
}

