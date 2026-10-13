"""Record docs/demo.gif from the real app: the meter goes over the target, then Name only brings it back.

Runs the built app on a throwaway home folder, installs a few skills (downloads from GitHub),
then captures frames while switching states. Usage: python -I scripts/demo_gif.py (after npm run build)
"""
import io
import os
import shutil
import socket
import subprocess
import tempfile
import time
from pathlib import Path

from PIL import Image
from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parent.parent
ELECTRON = ROOT / 'node_modules' / 'electron' / 'dist' / ('electron.exe' if os.name == 'nt' else 'electron')
home = Path(tempfile.mkdtemp(prefix='loadout-gif-'))
(home / '.claude' / 'skills').mkdir(parents=True)
SKILLS = ['docx', 'pdf', 'xlsx', 'pptx', 'frontend-design', 'skill-creator', 'mcp-builder', 'webapp-testing']
key = lambda s: f'anthropics/skills:skills/{s}'

s = socket.socket(); s.bind(('127.0.0.1', 0)); port = s.getsockname()[1]; s.close()
proc = subprocess.Popen([str(ELECTRON), str(ROOT), f'--remote-debugging-port={port}'],
                        env={**os.environ, 'LOADOUT_HOME': str(home)}, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
frames: list[tuple[Image.Image, int]] = []
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
        page.emulate_media(color_scheme='light')
        page.wait_for_selector('tr.row', timeout=20000)
        row = lambda k: page.locator(f'tr.row[data-key="{k}"]')
        for sk in SKILLS:
            page.locator('#q').fill(sk)
            row(key(sk)).get_by_role('button', name='Install').click()
            expect(row(key(sk)).locator('[data-m="on"]')).to_have_attribute('aria-checked', 'true', timeout=120000)
        page.locator('#q').fill('')
        page.select_option('#profile', '__new')
        page.locator('[data-fk="p:name"]').fill('Everyday')
        page.locator('.newprof').get_by_role('button', name='Save profile').click()
        page.locator('[data-fk="v:installed"]').click()
        page.locator('#meterbtn').click()  # open the context drawer: the meter is the subject
        page.locator('#budget').fill('800')
        page.mouse.move(1, 1)
        page.wait_for_timeout(500)

        def shot(ms):
            png = page.screenshot(timeout=15000)
            frames.append((Image.open(io.BytesIO(png)).convert('RGB'), ms))

        page.bring_to_front()
        shot(1800)
        for sk in ['xlsx', 'docx', 'pptx', 'pdf']:
            page.locator('#meterbtn').click()  # close drawer to reach the row
            row(key(sk)).locator('[data-m="name"]').hover()
            shot(500)
            row(key(sk)).locator('[data-m="name"]').click()
            page.locator('#meterbtn').click()
            page.mouse.move(1, 1)
            page.wait_for_timeout(250)
            shot(1100)
        frames[-1] = (frames[-1][0], 2600)
        browser.close()
finally:
    proc.terminate()
    try:
        proc.wait(10)
    except subprocess.TimeoutExpired:
        proc.kill()
    shutil.rmtree(home, ignore_errors=True)

w = 1000
imgs = [f.resize((w, round(f.height * w / f.width)), Image.LANCZOS) for f, _ in frames]
pal = imgs[0].quantize(colors=128, method=Image.Quantize.MEDIANCUT)
q = [im.quantize(palette=pal, dither=Image.Dither.NONE) for im in imgs]
out = ROOT / 'docs' / 'demo.gif'
q[0].save(out, save_all=True, append_images=q[1:], duration=[d for _, d in frames], loop=0, optimize=True)
print(f'saved {out} ({len(frames)} frames, {out.stat().st_size // 1024} KB)')
