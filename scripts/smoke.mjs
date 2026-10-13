// Launch the built app hidden and check that the UI rendered. Exit code is the result.
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const electron = createRequire(import.meta.url)('electron');
// A throwaway home, so a smoke run never writes to the real ~/.loadout or ~/.claude.
const home = mkdtempSync(path.join(tmpdir(), 'loadout-smoke-'));
const r = spawnSync(electron, ['.'], { env: { ...process.env, LOADOUT_SMOKE: '1', LOADOUT_HOME: home }, encoding: 'utf8', timeout: 60000 });
process.stdout.write(r.stdout ?? '');
process.stderr.write((r.stderr ?? '').split('\n').filter((l) => !/GPU|gpu_|DevTools/.test(l)).join('\n'));
rmSync(home, { recursive: true, force: true });
process.exit(r.status ?? 1);
