// A simulated LoadoutApi with the prototype's timings. Used when the page runs without Electron.
import type { ApplyResult, LoadoutApi, Mode, ProfileInfo, Progress } from '../../shared/api';
import { MOCK_NOTE, MOCK_PROFILES, MOCK_SKILLS } from './catalog';

const fmtB = (b: number) => (b < 1024 ? b + ' B' : b < 1048576 ? (b / 1024).toFixed(b < 10240 ? 1 : 0) + ' KB' : (b / 1048576).toFixed(1) + ' MB');
const plural = (n: number, w: string) => n + ' ' + (n === 1 ? w : w + 's');
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function createMockApi(): LoadoutApi {
  const installed: Record<string, Mode> = { ...MOCK_PROFILES.everyday.set };
  const profiles: Record<string, ProfileInfo> = JSON.parse(JSON.stringify(MOCK_PROFILES));
  let active: string | null = 'everyday';
  let budget = 1500;
  let queue: Promise<unknown> = Promise.resolve();

  async function install(key: string, onProgress: (p: Progress) => void) {
    const s = MOCK_SKILLS.find((x) => x.key === key);
    if (!s) throw new Error(`Unknown skill ${key}`);
    const where = s.tier === 'anthropic' ? `${s.repo}/skills/${s.id}` : `sample ${s.id}`;
    const p = (step: Progress['step'], pct: number, message: string | null) => onProgress({ key, step, pct, message });
    p('Fetching', 10, `Fetching file list for ${where}`);
    await wait(450);
    p('Downloading', 45, `Downloading ${plural(s.nfiles, 'file')} (${fmtB(s.bytes)})`);
    await wait(600);
    p('Writing', 85, `Writing to ~/.claude/skills/${s.id}`);
    await wait(400);
    installed[key] = 'on';
    p('Done', 100, null);
  }

  return {
    mock: true,
    async catalog() {
      return { skills: MOCK_SKILLS, note: MOCK_NOTE };
    },
    async installed() {
      return { ...installed };
    },
    install,
    async remove(key) {
      delete installed[key];
    },
    async setModes(changes) {
      for (const [k, m] of Object.entries(changes)) if (k in installed) installed[k] = m;
    },
    async profiles() {
      return { active, budget, profiles: JSON.parse(JSON.stringify(profiles)) };
    },
    async saveProfile(id, name, set) {
      const clean = Object.fromEntries(Object.entries(set).filter(([, m]) => m !== 'off'));
      const pid = id ?? (name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'profile');
      profiles[pid] = { name, set: clean };
      active = pid;
      return pid;
    },
    async deleteProfile(id) {
      delete profiles[id];
      if (active === id) active = null;
    },
    applyProfile(id, onProgress) {
      const run = queue.then(async (): Promise<ApplyResult> => {
        const p = profiles[id];
        if (!p) throw new Error('That profile no longer exists.');
        const before = { ...installed };
        const modes: Record<string, Mode> = {};
        const toInstall: string[] = [];
        for (const [k, want] of Object.entries(p.set)) {
          if (k in installed) { if (installed[k] !== want) modes[k] = want; } else if (want !== 'off') { toInstall.push(k); if (want !== 'on') modes[k] = want; }
        }
        for (const [k, cur] of Object.entries(installed)) if (!(k in p.set) && cur !== 'off') modes[k] = 'off';
        for (const k of toInstall) await install(k, onProgress);
        Object.assign(installed, modes);
        active = id;
        return { changed: Object.keys(modes).filter((k) => k in before).length, installed: toInstall, failed: [], missing: [] };
      });
      queue = run.catch(() => undefined);
      return run;
    },
    async setBudget(n) {
      budget = n;
    },
    async activity() {
      return [];
    },
    async note() {},
    async previewRepo() {
      throw new Error('Adding a repo needs the desktop app. The prototype cannot download.');
    },
    async addRepo() {},
    async removeRepo() {},
    async updates() {
      return [];
    },
    async previewUpdate() {
      throw new Error('There is no newer version of this skill.');
    },
    async update() {},
    async openLogs() {},
  };
}
