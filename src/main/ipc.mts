// IPC between the renderer and Service. Every input from the renderer is checked here.
import { ipcMain } from 'electron';
import type { Mode } from '../shared/api.js';
import type { Service } from './service.mjs';
import { log } from './log.mjs';

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

const isKey = (k: unknown): k is string => typeof k === 'string' && k.length > 0 && k.length < 400;
const MODES = new Set(['on', 'name', 'off']);

async function wrap<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, value: await fn() };
  } catch (e) {
    log('warn', 'A request from the window failed', e);
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export function registerIpc(service: Service) {
  ipcMain.handle('loadout:catalog', () => wrap(() => service.catalog()));
  ipcMain.handle('loadout:installed', () => wrap(() => service.installed()));
  ipcMain.handle('loadout:install', (event, key: unknown, reqId: unknown) => wrap(async () => {
    if (!isKey(key) || typeof reqId !== 'string') throw new Error('Bad install request.');
    await service.install(key, (p) => { if (!event.sender.isDestroyed()) event.sender.send('loadout:progress', reqId, p); });
  }));
  ipcMain.handle('loadout:remove', (_e, key: unknown) => wrap(async () => {
    if (!isKey(key)) throw new Error('Bad remove request.');
    await service.remove(key);
  }));
  ipcMain.handle('loadout:setModes', (_e, changes: unknown) => wrap(async () => {
    if (!changes || typeof changes !== 'object' || Array.isArray(changes)) throw new Error('Bad mode change.');
    const clean: Record<string, Mode> = {};
    for (const [k, m] of Object.entries(changes)) {
      if (!isKey(k) || !MODES.has(m as string)) throw new Error('Bad mode change.');
      clean[k] = m as Mode;
    }
    await service.setModes(clean);
  }));
  ipcMain.handle('loadout:profiles', () => wrap(() => service.profiles()));
  ipcMain.handle('loadout:saveProfile', (_e, id: unknown, name: unknown, set: unknown) => wrap(() => {
    if (!(id === null || isKey(id)) || typeof name !== 'string') throw new Error('Bad profile.');
    return service.saveProfile(id, name, set as Record<string, Mode>); // the engine checks the set
  }));
  ipcMain.handle('loadout:deleteProfile', (_e, id: unknown) => wrap(async () => {
    if (!isKey(id)) throw new Error('Bad profile.');
    await service.deleteProfile(id);
  }));
  ipcMain.handle('loadout:applyProfile', (event, id: unknown, reqId: unknown) => wrap(async () => {
    if (!isKey(id) || typeof reqId !== 'string') throw new Error('Bad profile.');
    const send = (p: unknown) => { if (!event.sender.isDestroyed()) event.sender.send('loadout:progress', reqId, p); };
    try {
      return await service.applyProfile(id, send);
    } finally {
      send({ key: '', step: 'Done', pct: 100, message: null }); // end marker: every event before it has been sent
    }
  }));
  ipcMain.handle('loadout:setBudget', (_e, n: unknown) => wrap(() => service.setBudget(Number(n))));
  ipcMain.handle('loadout:activity', () => wrap(() => service.activity()));
  ipcMain.handle('loadout:previewRepo', (event, input: unknown, reqId: unknown) => wrap(() => {
    if (typeof input !== 'string' || input.length > 300 || typeof reqId !== 'string') throw new Error('Bad repo.');
    return service.previewRepo(input, (p) => { if (!event.sender.isDestroyed()) event.sender.send('loadout:progress', reqId, p); });
  }));
  ipcMain.handle('loadout:addRepo', (_e, repo: unknown, sha: unknown, paths: unknown) => wrap(async () => {
    if (!isKey(repo) || typeof sha !== 'string' || !/^[0-9a-f]{40}$/.test(sha) || !Array.isArray(paths) || !paths.every((p) => typeof p === 'string' && p.length < 300)) throw new Error('Bad repo.');
    await service.addRepo(repo, sha, paths as string[]);
  }));
  ipcMain.handle('loadout:removeRepo', (_e, repo: unknown) => wrap(async () => {
    if (!isKey(repo)) throw new Error('Bad repo.');
    await service.removeRepo(repo);
  }));
  ipcMain.handle('loadout:updates', () => wrap(() => service.updates()));
  ipcMain.handle('loadout:previewUpdate', (_e, key: unknown) => wrap(() => {
    if (!isKey(key)) throw new Error('Bad update request.');
    return service.previewUpdate(key);
  }));
  ipcMain.handle('loadout:update', (event, key: unknown, reqId: unknown) => wrap(async () => {
    if (!isKey(key) || typeof reqId !== 'string') throw new Error('Bad update request.');
    await service.update(key, (p) => { if (!event.sender.isDestroyed()) event.sender.send('loadout:progress', reqId, p); });
  }));
  ipcMain.handle('loadout:note', (_e, m: unknown) => wrap(async () => {
    if (typeof m !== 'string') throw new Error('Bad note.');
    await service.note(m);
  }));
}
