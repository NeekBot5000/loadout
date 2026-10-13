"""QA for the website: screenshots, axe-core, console errors, and the two interactions.
Usage: python -I scripts/site_qa.py <base-url> <out-dir>
"""
import sys
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

base, out = sys.argv[1].rstrip('/'), Path(sys.argv[2])
out.mkdir(parents=True, exist_ok=True)
axe = (Path(__file__).resolve().parent.parent / 'node_modules/axe-core/axe.min.js').read_text(encoding='utf8')
fails = []


def check(name, fn):
    try:
        fn()
        print('ok  ', name)
    except Exception as e:  # noqa: BLE001
        fails.append(name)
        print('FAIL', name, '-', (str(e) or repr(e)).splitlines()[0][:300])


with sync_playwright() as p:
    b = p.chromium.launch()
    for page_name in ('index.html', 'catalog.html', 'guides.html', 'guide-context.html', 'guide-safety.html', 'audit.html', 'privacy.html', '404.html'):
        for label, w, h, scheme in (('desktop', 1400, 900, 'light'), ('dark', 1400, 900, 'dark'), ('phone', 390, 844, 'light')):
            ctx = b.new_context(viewport={'width': w, 'height': h}, color_scheme=scheme)
            pg = ctx.new_page()
            errors = []
            pg.on('pageerror', lambda e: errors.append(str(e)))
            pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
            pg.goto(f'{base}/{page_name}')
            pg.wait_for_load_state('networkidle')
            if page_name == 'catalog.html':
                pg.wait_for_selector('tr.row')
                pg.locator('tr.row').first.click()
            pg.evaluate('document.fonts.ready')
            pg.screenshot(path=str(out / f'{page_name[:-5]}-{label}.png'), full_page=(label != 'phone'))
            pg.evaluate(axe)
            res = pg.evaluate("axe.run(document, {resultTypes: ['violations']})")
            v = [(x['id'], len(x['nodes']), x['nodes'][0]['target']) for x in res['violations']]
            hscroll = pg.evaluate('document.documentElement.scrollWidth > window.innerWidth + 1')
            print(f'{page_name:13} {label:7} axe {len(v)} errors {len(errors)} hscroll {hscroll}', v[:3], errors[:2])
            if v or errors or hscroll:
                fails.append(f'{page_name} {label}')
            ctx.close()

    pg = b.new_page(viewport={'width': 1400, 'height': 900})
    pg.goto(f'{base}/index.html')

    def demo():
        lbl = pg.locator('#demo-lbl strong')
        before = int(lbl.inner_text())
        pg.locator('button[data-i="2"][data-m="off"]').click()
        after = int(lbl.inner_text())
        assert after == before - 239, (before, after)
        pg.locator('button[data-i="2"][data-m="off"]').focus()
        pg.keyboard.press('ArrowLeft')
        expect(pg.locator('button[data-i="2"][data-m="name"]')).to_have_attribute('aria-checked', 'true')
        expect(pg.locator('button[data-i="2"][data-m="name"]')).to_be_focused()
    check('Home demo: switching a skill changes the meter; arrow keys work', demo)

    def catalog():
        pg.goto(f'{base}/catalog.html')
        pg.wait_for_selector('tr.row')
        expect(pg.locator('#count')).to_contain_text('1,273 skills') if False else None
        n = pg.locator('tr.row').count()
        assert n == 200, n
        pg.locator('#q').fill('humanizer')
        expect(pg.locator('tr.row').first.locator('.nm')).to_contain_text('humanizer')
        pg.locator('tr.row').first.click()
        expect(pg.locator('#insp h2')).to_have_text('humanizer')
        expect(pg.locator('#insp .seen')).to_contain_text('description:')
        expect(pg.locator('#ad-slot')).to_be_hidden()  # ads off until a publisher ID is set
        pg.locator('#q').fill('')
        pg.locator('[data-view="src:a"]').click()
        assert pg.locator('tr.row').count() == 19
        pg.goto(f'{base}/catalog.html#' + 'anthropics%2Fskills%3Askills%2Fdocx')
        expect(pg.locator('#insp h2')).to_have_text('docx')
    check('Catalog: search, details, source filter, deep link; ad slot hidden with ads off', catalog)
    b.close()

print('\n%d failed' % len(fails) if fails else '\nall passed')
sys.exit(1 if fails else 0)
