"""Make the README and website screenshots from the real app, on a throwaway home folder.

Installs a realistic set of skills (downloads from GitHub), sets a few modes, then captures
docs/screenshot-light.png and docs/screenshot-dark.png at 1400x860.
Usage: python -I scripts/screenshots.py   (after `npm run build`)
"""
import os
import shutil
import socket
import subprocess
import tempfile
import time
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parent.parent
ELECTRON = ROOT / 'node_modules' / 'electron' / 'dist' / ('electron.exe' if os.name == 'nt' else 'electron')
home = Path(tempfile.mkdtemp(prefix='loadout-shots-'))
(home / '.claude' / 'skills').mkdir(parents=True)

INSTALL = [
    ('anthropics/skills:skills/docx', 'on'),
    ('anthropics/skills:skills/pdf', 'on'),
    ('anthropics/skills:skills/xlsx', 'on'),
    ('anthropics/skills:skills/frontend-design', 'on'),
    ('anthropics/skills:skills/skill-creator', 'name'),
    ('blader/humanizer:.', 'on'),
    ('obra/superpowers:skills/test-driven-development', 'name'),
    ('kepano/obsidian-skills:skills/obsidian-markdown', 'off'),
]

s = socket.socket(); s.bind(('127.0.0.1', 0)); port = s.getsockname()[1]; s.close()
proc = subprocess.Popen([str(ELECTRON), str(ROOT), f'--remote-debugging-port={port}'],
                        env={**os.environ, 'LOADOUT_HOME': str(home)}, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    with sync_playwright() as p:
        browser = None
        for _ in range(60):
            try:
                browser = p.chromium.connect_over_cdp(f'http://127.0.0.1:{port}'); break
            except Exception:  # noqa: BLE001
                time.sleep(0.5)
        page = None
        while not page:
            pages = [pg for c in browser.contexts for pg in c.pages]
            page = pages[0] if pages else None
            time.sleep(0.25)
        page.set_viewport_size({'width': 1400, 'height': 860})
        page.wait_for_selector('tr.row', timeout=20000)
        row = lambda k: page.locator(f'tr.row[data-key="{k}"]')
        for key, mode in INSTALL:
            page.locator('#q').fill(key.split(':')[1].split('/')[-1] if key.split(':')[1] != '.' else 'humanizer')
            row(key).get_by_role('button', name='Install').click()
            expect(row(key).locator('[data-m="on"]')).to_have_attribute('aria-checked', 'true', timeout=120000)
            if mode != 'on':
                row(key).locator(f'[data-m="{mode}"]').click()
        page.locator('#q').fill('')
        # Save the setup as a profile so the header reads cleanly.
        page.select_option('#profile', '__new')
        page.locator('[data-fk="p:name"]').fill('Everyday')
        page.locator('.newprof').get_by_role('button', name='Save profile').click()
        page.locator('[data-fk="v:installed"]').click()
        row('anthropics/skills:skills/docx').click()
        page.mouse.move(5, 5)
        page.wait_for_timeout(500)
        for scheme in ('light', 'dark'):
            page.emulate_media(color_scheme=scheme)
            page.wait_for_timeout(300)
            page.bring_to_front()
            page.screenshot(path=str(ROOT / 'docs' / f'screenshot-{scheme}.png'), timeout=15000)
        page.emulate_media(color_scheme='light')
        page.locator('[data-fk="v:all"]').click()
        page.locator('#meterbtn').click()
        page.wait_for_timeout(300)
        page.screenshot(path=str(ROOT / 'docs' / 'screenshot-meter.png'), timeout=15000)
        browser.close()
finally:
    proc.terminate()
    try:
        proc.wait(10)
    except subprocess.TimeoutExpired:
        proc.kill()
    shutil.rmtree(home, ignore_errors=True)
print('saved docs/screenshot-light.png, docs/screenshot-dark.png, docs/screenshot-meter.png')
