"""Interaction checks for the renderer (mock API): keyboard, install, profiles, drawers, phone sheet.
Usage: python -I scripts/qa_interact.py <url>
"""
import sys

from playwright.sync_api import sync_playwright, expect

url = sys.argv[1]
fails = []


def check(name, fn):
    try:
        fn()
        print('ok  ', name)
    except Exception as e:  # noqa: BLE001
        fails.append(name)
        try:
            page.screenshot(path=f'qa-fail-{len(fails)}.png')
        except Exception:  # noqa: BLE001
            pass
        print('FAIL', name, '-', (str(e) or repr(e)).splitlines()[0][:300])


with sync_playwright() as p:
    b = p.chromium.launch()
    page = b.new_page(viewport={'width': 1400, 'height': 860})
    page.goto(url)
    page.wait_for_selector('tr.row')
    row = lambda i: page.locator(f'tr.row[data-key="{i}"]')
    active = lambda: page.evaluate('document.activeElement.dataset.fk || document.activeElement.id')

    def keyboard_select():
        row('docx').focus()
        page.keyboard.press('ArrowDown')
        assert active() == 'row:frontend-design', active()
        expect(page.locator('#insp h2')).to_have_text('frontend-design')
        page.keyboard.press('ArrowUp')
        assert active() == 'row:docx', active()
    check('Up/Down moves selection and focus', keyboard_select)

    def space_toggles():
        row('docx').focus()
        page.keyboard.press(' ')
        expect(row('docx').locator('[data-m="off"]')).to_have_attribute('aria-checked', 'true')
        page.keyboard.press(' ')
        expect(row('docx').locator('[data-m="on"]')).to_have_attribute('aria-checked', 'true')
    check('Space turns a skill off and on', space_toggles)

    def arrows_cycle():
        row('docx').locator('[data-m="on"]').focus()
        page.keyboard.press('ArrowRight')
        expect(row('docx').locator('[data-m="name"]')).to_have_attribute('aria-checked', 'true')
        assert active() == 'm:docx:name', active()
        page.keyboard.press('ArrowRight')
        assert active() == 'm:docx:off', active()
        page.keyboard.press('ArrowLeft')
        page.keyboard.press('ArrowLeft')
        assert active() == 'm:docx:on', active()
    check('Left/Right cycle state and keep focus', arrows_cycle)

    def dirty_and_revert():
        row('docx').locator('[data-m="off"]').click()
        expect(page.locator('#mod b')).to_have_text('Unsaved changes')
        page.get_by_role('button', name='Revert').click()
        expect(page.locator('#mod b')).to_have_count(0)
        expect(row('docx').locator('[data-m="on"]')).to_have_attribute('aria-checked', 'true')
    check('Changing a skill marks the profile unsaved; Revert restores it', dirty_and_revert)

    def slash_search():
        page.locator('body').click(position={'x': 700, 'y': 830})
        row('docx').focus()
        page.keyboard.press('/')
        assert active() == 'q', active()
        page.keyboard.type('pdf')  # matches names and descriptions, like the prototype
        expect(row('pdf')).to_be_visible()
        expect(row('mcp-builder')).to_have_count(0)
        page.keyboard.press('Escape')
        expect(page.locator('#q')).to_have_value('')
        expect(page.locator('tr.row')).to_have_count(25)
    check('/ focuses search; Escape clears it', slash_search)

    def enter_installs():
        row('mcp-builder').focus()
        page.keyboard.press('Enter')
        expect(row('mcp-builder')).to_have_class('row busy')
        expect(row('mcp-builder').locator('[data-m="on"]')).to_have_attribute('aria-checked', 'true', timeout=5000)
        page.locator('#logbtn').click()
        expect(page.locator('#loglist')).to_contain_text('Installed mcp-builder')
        expect(page.locator('#loglist')).to_contain_text('Writing to ~/.claude/skills/mcp-builder')
        page.keyboard.press('Escape')
        expect(page.locator('#dr-log')).to_be_hidden()
    check('Enter installs with real steps logged; Escape closes drawer', enter_installs)

    def remove():
        row('mcp-builder').click()
        page.locator('#insp').get_by_role('button', name='Remove').click()
        expect(row('mcp-builder').get_by_role('button', name='Install')).to_be_visible()
    check('Remove returns the row to Install', remove)

    def profile_apply():
        page.select_option('#profile', 'documents')
        expect(row('frontend-design').locator('[data-m="off"]')).to_have_attribute('aria-checked', 'true')
        expect(page.locator('#mod b')).to_have_count(0)
        page.select_option('#profile', 'sticker')
        expect(row('copyright-check')).to_have_class('row busy')
        expect(row('copyright-check').locator('[data-m="on"]')).to_have_attribute('aria-checked', 'true', timeout=20000)
        expect(row('listing-writer').locator('[data-m="on"]')).to_have_attribute('aria-checked', 'true', timeout=20000)
        expect(page.locator('#mod b')).to_have_count(0)
    check('Applying profiles changes modes and installs missing skills', profile_apply)

    def target_changes_midinstall():
        page.select_option('#profile', 'server')
        expect(row('minecraft-server-admin')).to_have_class('row busy')
        page.select_option('#profile', 'everyday')  # change target while installing
        expect(row('minecraft-server-admin').locator('[data-m="off"]')).to_have_attribute('aria-checked', 'true', timeout=20000)
    check('A profile applied mid-install sets where the install lands', target_changes_midinstall)

    def meter_drawer():
        page.locator('#meterbtn').click()
        expect(page.locator('#dr-ctx')).to_be_visible()
        n = page.locator('#legend .lg').count()
        assert n > 0, n
        page.locator('#budget').fill('500')
        expect(page.locator('#meterlbl .over')).to_be_visible()
        page.locator('#legend .lg').first.click()
        page.locator('.tablewrap').click(position={'x': 600, 'y': 700})
        expect(page.locator('#dr-ctx')).to_be_hidden()
    check('Context drawer: legend, target slider, over-budget, click outside closes', meter_drawer)

    def sort_header():
        page.locator('#th-name button').click()
        expect(page.locator('#th-name')).to_have_attribute('aria-sort', 'ascending')
        assert page.locator('tr.row').first.get_attribute('data-key') == 'academy-guide'
        page.locator('#th-name button').click()
        expect(page.locator('#th-name')).to_have_attribute('aria-sort', 'descending')
    check('Sorting by name toggles direction', sort_header)

    phone = b.new_page(viewport={'width': 390, 'height': 844}, has_touch=True)
    phone.goto(url)
    phone.wait_for_selector('tr.row')

    def sheet():
        phone.locator('tr.row[data-key="pdf"] .nm').click()
        expect(phone.locator('#app')).to_have_class('app sheet')
        assert phone.evaluate('document.activeElement.dataset.fk') == 'sheetclose'
        phone.keyboard.press('Escape')
        expect(phone.locator('#app')).to_have_class('app')
        assert phone.evaluate('document.activeElement.dataset.fk') == 'row:pdf'
    check('Phone: tapping a row opens the sheet; Escape closes and refocuses the row', sheet)
    b.close()

print('\n%d failed' % len(fails) if fails else '\nall passed')
sys.exit(1 if fails else 0)
