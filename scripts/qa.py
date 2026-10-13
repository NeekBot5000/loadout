"""Visual and accessibility QA for the renderer.

Screenshots the port and the prototype at the same sizes and themes, and runs axe-core on the port.
Usage: python -I scripts/qa.py <port-url> <prototype-url> <out-dir>
"""
import json
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

port_url, proto_url, out = sys.argv[1], sys.argv[2], Path(sys.argv[3])
out.mkdir(parents=True, exist_ok=True)
axe_js = (Path(__file__).resolve().parent.parent / 'node_modules/axe-core/axe.min.js').read_text(encoding='utf8')

LAYOUTS = [
    ('desktop-light', 1400, 860, 'light'),
    ('desktop-dark', 1400, 860, 'dark'),
    ('tablet', 1000, 800, 'light'),
    ('phone', 390, 844, 'light'),
]

report = {}
with sync_playwright() as p:
    browser = p.chromium.launch()
    for name, w, h, scheme in LAYOUTS:
        for label, url in (('port', port_url), ('proto', proto_url)):
            ctx = browser.new_context(viewport={'width': w, 'height': h}, color_scheme=scheme, bypass_csp=True)  # QA only: lets axe load
            page = ctx.new_page()
            errors = []
            page.on('pageerror', lambda e: errors.append(str(e)))
            page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
            page.goto(url)
            page.wait_for_selector('tr.row')
            page.evaluate('document.fonts.ready')
            page.wait_for_timeout(300)
            page.screenshot(path=str(out / f'{name}-{label}.png'))
            if label == 'port':
                page.add_script_tag(content=axe_js)
                res = page.evaluate("axe.run(document, {resultTypes: ['violations']})")
                report[name] = {
                    'violations': [{'id': v['id'], 'impact': v['impact'], 'nodes': len(v['nodes']), 'help': v['help'],
                                    'target': v['nodes'][0]['target']} for v in res['violations']],
                    'errors': errors,
                }
            ctx.close()
    browser.close()

(out / 'report.json').write_text(json.dumps(report, indent=1))
for k, v in report.items():
    print(k, 'violations:', len(v['violations']), 'errors:', len(v['errors']))
    for x in v['violations']:
        print('  ', x['impact'], x['id'], x['nodes'], x['help'], x['target'])
    for e in v['errors'][:5]:
        print('   err', e[:200])
