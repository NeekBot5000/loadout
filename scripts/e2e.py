"""End-to-end test of the built Electron app against a throwaway home folder.

Installs real skills from GitHub, changes modes, checks ~/.claude/settings.json and the skills
folder on disk, then removes. Never touches the real home folder (LOADOUT_HOME is set).
Usage: python -I scripts/e2e.py   (after `npm run build`)
       LOADOUT_EXE=dist/win-unpacked/Loadout.exe python -I scripts/e2e.py   (the packaged app)
"""
import json
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import time
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parent.parent
ELECTRON = ROOT / 'node_modules' / 'electron' / 'dist' / ('electron.exe' if os.name == 'nt' else 'electron')
home = Path(tempfile.mkdtemp(prefix='loadout-e2e-'))
skills = home / '.claude' / 'skills'
settings = home / '.claude' / 'settings.json'
fails = []

# A skill of the user's own, and a settings file with keys Loadout must keep.
(skills / 'my-notes').mkdir(parents=True)
(skills / 'my-notes' / 'SKILL.md').write_text('---\nname: my-notes\ndescription: Keeps my notes tidy. Use when I ask about notes.\n---\nBody\n', encoding='utf8')
settings.write_text('{\n  "theme": "dark",\n  "hooks": {"Stop": []},\n  "model": "opus"\n}\n', encoding='utf8')


def check(name, fn):
    try:
        fn()
        print('ok  ', name)
    except Exception as e:  # noqa: BLE001
        fails.append(name)
        print('FAIL', name, '-', (str(e) or repr(e)).splitlines()[0][:300])


def free_port():
    s = socket.socket()
    s.bind(('127.0.0.1', 0))
    p = s.getsockname()[1]
    s.close()
    return p


env = {**os.environ, 'LOADOUT_HOME': str(home)}
procs = []


def launch(p):
    """Start the built app on the test home and attach Playwright to its window over CDP."""
    port = free_port()
    # LOADOUT_EXE runs the packaged app (dist/win-unpacked/Loadout.exe) instead of the dev build.
    cmd = [os.environ['LOADOUT_EXE']] if os.environ.get('LOADOUT_EXE') else [str(ELECTRON), str(ROOT)]
    proc = subprocess.Popen(cmd + [f'--remote-debugging-port={port}'], env=env,
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    procs.append(proc)
    browser = None
    for _ in range(60):
        try:
            browser = p.chromium.connect_over_cdp(f'http://127.0.0.1:{port}')
            break
        except Exception:  # noqa: BLE001
            time.sleep(0.5)
    assert browser, 'could not connect to Electron'
    page = None
    for _ in range(40):
        pages = [pg for c in browser.contexts for pg in c.pages]
        if pages:
            page = pages[0]
            break
        time.sleep(0.25)
    page.set_viewport_size({'width': 1400, 'height': 860})
    page.wait_for_selector('tr.row', timeout=20000)
    return proc, browser, page


def stop(proc):
    proc.terminate()
    try:
        proc.wait(10)
    except subprocess.TimeoutExpired:
        proc.kill()


try:
    with sync_playwright() as p:
        proc, browser, page = launch(p)
        row = lambda key: page.locator(f'tr.row[data-key="{key}"]')
        read_settings = lambda: json.loads(settings.read_text(encoding='utf8'))

        def loaded():
            assert page.evaluate('!!window.loadout && window.loadout.mock === false'), 'real API missing'
            n = page.locator('tr.row').count()
            assert n > 1200, n
            expect(page.locator('.notice')).to_have_count(0)
            expect(row('local:my-notes').locator('.srcl')).to_have_text('Yours')
            expect(row('local:my-notes').locator('[data-m="on"]')).to_have_attribute('aria-checked', 'true')
        check('Loads the audited catalog plus the user\'s own skill; no prototype banner', loaded)

        def install_official():
            k = 'anthropics/skills:skills/pdf'
            row(k).click()
            page.locator('#insp').get_by_role('button', name='Install').click()
            expect(row(k).locator('[data-m="on"]')).to_have_attribute('aria-checked', 'true', timeout=90000)
            assert (skills / 'pdf' / 'SKILL.md').exists()
            st = json.loads((home / '.loadout' / 'state.json').read_text(encoding='utf8'))
            assert st['receipts']['pdf']['source']['sha'].startswith('dbd4588'), st['receipts']['pdf']['source']
            page.locator('#logbtn').click()
            expect(page.locator('#loglist')).to_contain_text('Installed pdf')
            log_text = page.locator('#loglist').inner_text()
            assert 'Checking and writing' in log_text, ' | '.join(log_text.splitlines())
            page.keyboard.press('Escape')
        check('Install pdf from GitHub: files on disk, receipt pinned to the audited commit', install_official)

        def mode_writes_settings():
            k = 'anthropics/skills:skills/pdf'
            row(k).locator('[data-m="name"]').click()
            page.wait_for_timeout(400)
            s = read_settings()
            assert s.get('skillOverrides') == {'pdf': 'name-only'}, s
            assert list(s.keys()) == ['theme', 'hooks', 'model', 'skillOverrides'], list(s.keys())
            assert s['hooks'] == {'Stop': []} and s['model'] == 'opus'
            assert (settings.parent / 'settings.json.loadout-backup').exists()
        check('Name only writes skillOverrides and keeps every other setting in order', mode_writes_settings)

        def own_skill_modes():
            row('local:my-notes').locator('[data-m="off"]').click()
            page.wait_for_timeout(400)
            assert read_settings()['skillOverrides'] == {'pdf': 'name-only', 'my-notes': 'off'}
            row('local:my-notes').click()
            expect(page.locator('#insp').get_by_role('button', name='Remove')).to_have_count(0)
            expect(page.locator('#insp')).to_contain_text('Loadout did not install it')
        check('Your own skill can be turned off but has no Remove button', own_skill_modes)

        def root_community():
            k = 'blader/humanizer:.'
            page.locator('#q').fill('humanizer')
            row(k).get_by_role('button', name='Install').click()
            expect(row(k).locator('[data-m="on"]')).to_have_attribute('aria-checked', 'true', timeout=90000)
            assert (skills / 'humanizer' / 'SKILL.md').exists()
            page.locator('#q').fill('')
        check('Install a community skill whose SKILL.md is at the repo root', root_community)

        def name_clash():
            a, b = 'obra/superpowers:skills/test-driven-development', 'addyosmani/agent-skills:skills/test-driven-development'
            page.locator('#q').fill('test-driven-development')
            assert row(a).count() == 1 and row(b).count() == 1, (row(a).count(), row(b).count())
            row(a).get_by_role('button', name='Install').click()
            expect(row(a).locator('[data-m="on"]')).to_have_attribute('aria-checked', 'true', timeout=90000)
            expect(row(b).locator('.taken')).to_have_text('Name taken')
            page.locator('#q').fill('')
        check('Two skills with one name: installing one marks the other "Name taken"', name_clash)

        def remove():
            k = 'anthropics/skills:skills/pdf'
            page.locator('#q').fill('pdf')
            row(k).click()
            page.locator('#insp').get_by_role('button', name='Remove').click()
            expect(row(k).get_by_role('button', name='Install')).to_be_visible()
            assert not (skills / 'pdf').exists()
            trash = list((skills / '.trash').glob('pdf-*'))
            assert len(trash) == 1, trash
            assert 'pdf' not in read_settings().get('skillOverrides', {})
            page.locator('#q').fill('')
        check('Remove moves the folder to .trash and drops its override', remove)

        state = lambda: json.loads((home / '.loadout' / 'state.json').read_text(encoding='utf8'))
        tdd = 'obra/superpowers:skills/test-driven-development'
        hum = 'blader/humanizer:.'

        def first_profile():
            expect(page.locator('#profile option:checked')).to_have_text('Current setup')
            st = state()
            assert st['profiles'][st['active']]['set'] == {'local:my-notes': 'on'}, st['profiles']
        check('First run turns the current setup into a profile', first_profile)

        def new_profile():
            row(hum).locator('[data-m="name"]').click()
            expect(page.locator('#mod b')).to_have_text('Unsaved changes')
            page.select_option('#profile', '__new')
            name = page.locator('[data-fk="p:name"]')
            expect(name).to_be_focused()
            name.fill('Writing')
            page.locator('.newprof').get_by_role('button', name='Save profile').click()
            expect(page.locator('#profile option:checked')).to_have_text('Writing')
            expect(page.locator('#mod b')).to_have_count(0)
            st = state()
            assert st['profiles'][st['active']] == {'name': 'Writing', 'set': {hum: 'name', tdd: 'on'}}, st['profiles']
        check('New profile: inline name field, saved from the current state ("off" left out)', new_profile)

        def apply_is_one_write():
            page.locator('#q').fill('test-driven')
            row(tdd).click()
            page.locator('#insp').get_by_role('button', name='Remove').click()
            expect(row(tdd).get_by_role('button', name='Install')).to_be_visible()
            page.locator('#q').fill('')
            page.select_option('#profile', state()['profiles'] and [k for k, v in state()['profiles'].items() if v['name'] == 'Current setup'][0])
            expect(row('local:my-notes').locator('[data-m="on"]')).to_have_attribute('aria-checked', 'true', timeout=20000)
            page.wait_for_timeout(500)
            before = settings.read_text(encoding='utf8')
            wid = [k for k, v in state()['profiles'].items() if v['name'] == 'Writing'][0]
            page.select_option('#profile', wid)
            page.locator('#q').fill('test-driven')
            expect(row(tdd).locator('[data-m="on"]')).to_have_attribute('aria-checked', 'true', timeout=90000)
            page.locator('#q').fill('')
            expect(page.locator('#statusmsg')).to_contain_text('Applied profile “Writing”', timeout=20000)
            after = read_settings()
            assert after['skillOverrides'] == {'humanizer': 'name-only', 'my-notes': 'off'}, after
            backup = (settings.parent / 'settings.json.loadout-backup').read_text(encoding='utf8')
            assert backup == before, 'more than one settings write during the apply'
            assert (skills / 'test-driven-development' / 'SKILL.md').exists()
        check('Applying a profile installs what it needs and changes modes in one settings write', apply_is_one_write)

        def budget():
            page.locator('#meterbtn').click()
            page.locator('#budget').fill('2200')
            page.wait_for_timeout(900)
            assert state()['budget'] == 2200, state()['budget']
            page.keyboard.press('Escape')
        check('The token target is saved', budget)

        added_repo = 'multica-ai/andrej-karpathy-skills'

        def add_repo():
            page.locator('[data-fk="v:add"]').click()
            page.locator('[data-fk="add:url"]').fill('https://github.com/' + added_repo)
            page.get_by_role('button', name='Check repo').click()
            expect(page.locator('.picks > li')).to_have_count(1, timeout=90000)
            page.locator('.picks details summary').click()
            expect(page.locator('.picks .seen')).to_contain_text('name:')
            page.get_by_role('button', name='Add 1 skill').click()
            added = page.locator(f'tr.row[data-key^="{added_repo}:"]')
            expect(added).to_have_count(1, timeout=20000)
            expect(added.locator('.srcl')).to_have_text('Added by you')
            st = state()
            assert added_repo in st['addedRepos'], st.keys()
            added.get_by_role('button', name='Install').click()
            expect(added.locator('[data-m="on"]')).to_have_attribute('aria-checked', 'true', timeout=90000)
        check('Add repo: review shows SKILL.md and findings; the skill lists as "Added by you" and installs', add_repo)

        def take_off_list():
            row_ = page.locator(f'tr.row[data-key^="{added_repo}:"]')
            row_.click()
            page.locator('#insp').get_by_role('button', name=f'Take {added_repo} off the list').click()
            page.wait_for_timeout(800)
            assert added_repo not in state().get('addedRepos', {})
            expect(row_.locator('[data-m="on"]')).to_have_attribute('aria-checked', 'true')
            expect(page.locator('#insp').get_by_role('button', name='Remove')).to_be_visible()
        check('Taking a repo off the list keeps its installed skill, still removable', take_off_list)

        def axe():
            axe_js = (ROOT / 'node_modules/axe-core/axe.min.js').read_text(encoding='utf8')
            page.evaluate(axe_js)
            res = page.evaluate("axe.run(document, {resultTypes: ['violations']})")
            v = [(x['id'], len(x['nodes']), x['nodes'][0]['target']) for x in res['violations']]
            assert not v, v
        check('axe-core: no violations in the live app', axe)

        page.locator('#q').fill('')
        page.locator('[data-fk="v:all"]').click()
        row(hum).click()
        page.bring_to_front()
        page.screenshot(timeout=10000, path=str(ROOT / 'out' / 'e2e-screenshot.png'))
        browser.close()
        stop(proc)

        # Make the installed copy of the added skill look one version old, so an update shows up.
        stj = json.loads((home / '.loadout' / 'state.json').read_text(encoding='utf8'))
        rid = [k for k, v in stj['receipts'].items() if v['source']['repo'] == added_repo][0]
        rec = stj['receipts'][rid]
        rec['source']['sha'] = 'f' * 40
        rec['files'][0]['sha256'] = '0' * 64
        changed_file = rec['files'][0]['path']
        stj['addedRepos'] = {added_repo: {'sha': 'f' * 40, 'addedAt': '2026-10-12T00:00:00Z', 'skills': []}}
        (home / '.loadout' / 'state.json').write_text(json.dumps(stj), encoding='utf8')

        proc, browser, page = launch(p)

        def persisted():
            expect(page.locator('#profile option:checked')).to_have_text('Writing')
            # The added skill was installed after "Writing" was saved, so the profile now differs.
            expect(page.locator('#mod b')).to_have_text('Unsaved changes')
            expect(page.locator(f'tr.row[data-key="{hum}"] [data-m="name"]')).to_have_attribute('aria-checked', 'true')
            page.locator('#meterbtn').click()
            expect(page.locator('#budgetval')).to_have_text('2,200 tokens')
            page.keyboard.press('Escape')
            page.locator('#logbtn').click()
            expect(page.locator('#loglist')).to_contain_text('Applied profile “Writing”')
        check('After a restart: active profile, modes, target and activity are all back', persisted)

        def update_flow():
            r_ = page.locator(f'tr.row[data-key^="{added_repo}:"]')
            expect(r_.locator('.flag.upd')).to_have_text('Update', timeout=30000)
            expect(page.locator('[data-fk="v:updates"]')).to_be_visible()
            r_.click()
            page.get_by_role('button', name='Review update').click()
            expect(page.locator('.update .verdict').first).to_contain_text('1 file changed', timeout=60000)
            expect(page.locator('.difflist')).to_contain_text(changed_file)
            page.locator('.update').get_by_role('button', name='Update', exact=True).click()
            expect(r_.locator('.flag.upd')).to_have_count(0, timeout=60000)
            st = state()
            assert st['receipts'][rid]['source']['sha'] != 'f' * 40
            assert list((skills / '.trash').glob(rid + '-*')), 'old copy not in .trash'
        check('Update: flagged on launch, file-by-file review, installs and keeps the old copy in .trash', update_flow)
        browser.close()
        stop(proc)
finally:
    for pr in procs:
        if pr.poll() is None:
            stop(pr)
    shutil.rmtree(home, ignore_errors=True)

print('\n%d failed' % len(fails) if fails else '\nall passed')
sys.exit(1 if fails else 0)
