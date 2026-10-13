// Dev loop: compile main and preload, start Vite for the renderer, then open Electron on it.
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { createServer } from 'vite';

const require = createRequire(import.meta.url);
const tsc = spawnSync(process.execPath, [require.resolve('typescript/bin/tsc'), '-p', 'tsconfig.node.json'], { stdio: 'inherit' });
if (tsc.status !== 0) process.exit(tsc.status ?? 1);

const server = await createServer({ configFile: 'vite.config.ts' });
await server.listen();
const url = server.resolvedUrls.local[0];
console.log(`renderer at ${url}`);

const electron = spawn(require('electron'), ['.'], { stdio: 'inherit', env: { ...process.env, LOADOUT_DEV_URL: url } });
electron.on('exit', async (code) => { await server.close(); process.exit(code ?? 0); });
