// Runs in the sandboxed renderer before the page. Exposes the typed API and nothing else.
import { contextBridge, ipcRenderer } from 'electron';
import type { LoadoutApi, Progress } from '../shared/api.js';

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

async function call<T>(channel: string, ...args: unknown[]): Promise<T> {
  const r = (await ipcRenderer.invoke(channel, ...args)) as Result<T>;
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

let seq = 0;

/**
 * Run a call that streams progress. Progress events and the invoke reply travel separately, so the
 * reply can arrive before the last few events. Keep listening until the end event shows up:
 * isEnd picks it out, and it is always sent last.
 */
async function withProgress<T>(channel: string, arg: unknown, onProgress: (p: Progress) => void, isEnd: (p: Progress) => boolean, forwardEnd: boolean): Promise<T> {
  const reqId = `${Date.now()}-${++seq}`;
  let sawEnd: () => void = () => {};
  const ended = new Promise<void>((r) => { sawEnd = r; });
  const listener = (_e: unknown, id: string, p: Progress) => {
    if (id !== reqId) return;
    const end = isEnd(p);
    if (!end || forwardEnd) onProgress(p);
    if (end) sawEnd();
  };
  ipcRenderer.on('loadout:progress', listener);
  try {
    const value = await call<T>(channel, arg, reqId);
    await Promise.race([ended, new Promise((r) => setTimeout(r, 3000))]);
    return value;
  } finally {
    ipcRenderer.removeListener('loadout:progress', listener);
  }
}

const api: LoadoutApi = {
  mock: false,
  catalog: () => call('loadout:catalog'),
  installed: () => call('loadout:installed'),
  async install(key, onProgress) {
    await withProgress('loadout:install', key, onProgress, (p) => p.step === 'Done', true);
  },
  remove: (key) => call('loadout:remove', key),
  setModes: (changes) => call('loadout:setModes', changes),
  profiles: () => call('loadout:profiles'),
  saveProfile: (id, name, set) => call('loadout:saveProfile', id, name, set),
  deleteProfile: (id) => call('loadout:deleteProfile', id),
  applyProfile: (id, onProgress) => withProgress('loadout:applyProfile', id, onProgress, (p) => p.key === '', false),
  setBudget: (tokens) => call('loadout:setBudget', tokens),
  activity: () => call('loadout:activity'),
  note: (message) => call('loadout:note', message),
  previewRepo: (input, onProgress) => withProgress('loadout:previewRepo', input, onProgress, (p) => p.step === 'Done', true),
  addRepo: (repo, sha, paths) => call('loadout:addRepo', repo, sha, paths),
  removeRepo: (repo) => call('loadout:removeRepo', repo),
  updates: () => call('loadout:updates'),
  previewUpdate: (key) => call('loadout:previewUpdate', key),
  openLogs: async () => { await call('loadout:openLogs'); },
  async update(key, onProgress) {
    await withProgress('loadout:update', key, onProgress, (p) => p.step === 'Done', true);
  },
};

contextBridge.exposeInMainWorld('loadout', api);
