import { app, BrowserWindow, ipcMain, shell } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Service, defaultPaths } from './service.mjs';
import { initLog, log } from './log.mjs';
import updater from 'electron-updater';
import { registerIpc } from './ipc.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const DEV_URL = process.env.LOADOUT_DEV_URL;
// LOADOUT_SMOKE=1: load hidden, print what rendered, quit. Used by `npm run smoke`.
const SMOKE = process.env.LOADOUT_SMOKE === '1';
const logDir = initLog(defaultPaths().stateDir);

process.on('uncaughtException', (e) => log('error', 'Uncaught exception in the main process', e));
process.on('unhandledRejection', (e) => log('error', 'Unhandled promise rejection in the main process', e));

function isGitHub(url: string) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && u.hostname === 'github.com';
  } catch {
    return false;
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 360,
    minHeight: 480,
    backgroundColor: '#E8EBF0',
    title: 'Loadout',
    autoHideMenuBar: true,
    icon: path.join(app.getAppPath(), 'build', 'icon.png'),
    show: !SMOKE,
    webPreferences: {
      preload: path.join(here, '../preload/preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webviewTag: false,
      spellcheck: false,
    },
  });

  // The UI never navigates. Links to GitHub open in the user's browser; anything else is dropped.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isGitHub(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (DEV_URL && url.startsWith(DEV_URL)) return;
    e.preventDefault();
    if (isGitHub(url)) void shell.openExternal(url);
  });

  // If the page crashes, log it and reload once a minute at most, so a bad render cannot loop.
  let lastReload = 0;
  win.webContents.on('render-process-gone', (_e, d) => {
    log('error', `Window process ended: ${d.reason} (exit code ${d.exitCode})`);
    if (d.reason !== 'clean-exit' && Date.now() - lastReload > 60_000) { lastReload = Date.now(); win.reload(); }
  });
  win.webContents.on('console-message', (e) => { if (e.level === 'error') log('warn', `Page error: ${e.message}`); });

  if (SMOKE) {
    win.webContents.on('console-message', (e) => { if (e.level === 'error') console.log(`renderer error: ${e.message}`); });
    win.webContents.once('did-finish-load', async () => {
      await new Promise((r) => setTimeout(r, 1500));
      const r = await win.webContents.executeJavaScript(
        `({ rows: document.querySelectorAll('tr.row').length, status: !!document.querySelector('#status'), api: !!window.loadout, font: document.fonts.check('16px "Archivo Variable"') })`,
      );
      console.log(`smoke: ${JSON.stringify(r)}`);
      app.exit(r.rows > 0 && r.status ? 0 : 1);
    });
  }

  if (DEV_URL) void win.loadURL(DEV_URL);
  else void win.loadFile(path.join(here, '../renderer/index.html'));
}

// One copy at a time: a second launch focuses the window that is already open.
if (!SMOKE && !process.env.LOADOUT_HOME && !app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => {
  const w = BrowserWindow.getAllWindows()[0];
  if (w) { if (w.isMinimized()) w.restore(); w.focus(); }
});
if (process.platform === 'win32') app.setAppUserModelId('com.loadout.app');

app.whenReady().then(() => {
  log('info', `Loadout ${app.getVersion()} started (Electron ${process.versions.electron})`);
  ipcMain.handle('loadout:openLogs', async () => ({ ok: true, value: await shell.openPath(logDir) }));
  registerIpc(new Service(path.join(app.getAppPath(), 'catalog', 'catalog.json')));
  createWindow();
  checkForAppUpdate();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

/**
 * Updates of Loadout itself, from GitHub Releases. Only in the installed app (not in development,
 * tests or a LOADOUT_HOME sandbox). Downloads in the background; installs when the app quits.
 */
function checkForAppUpdate() {
  if (!app.isPackaged || SMOKE || process.env.LOADOUT_HOME) return;
  const { autoUpdater } = updater;
  autoUpdater.logger = { info: (m: unknown) => log('info', `Updater: ${String(m)}`), warn: (m: unknown) => log('warn', `Updater: ${String(m)}`), error: (m: unknown) => log('error', `Updater: ${String(m)}`), debug: () => {} };
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.checkForUpdatesAndNotify().catch((e) => log('warn', 'Could not check for a new version of Loadout', e));
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
