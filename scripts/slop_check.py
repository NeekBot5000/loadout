"""Score a page against the published "AI design slop" patterns, with deterministic checks only.

Rubric: Adrian Krebs' 16 patterns from scoring 1,590 Show HN landing pages
(https://www.adriankrebs.ch/blog/design-slop/, summarized by developersdigest.tech), plus a few
app-specific tells from The Fountain Institute's "7 signs a UI has been vibe coded" (status dots,
emoji icons, cards everywhere). Each check reads computed styles; no model judges anything.
A hit is a default nobody chose, not proof a model made the page.

Usage: python -I scripts/slop_check.py <url> [<url> ...] [--json out.json]
Scores: 0-1 hits clean, 2-3 mild, 4+ heavy (Krebs' buckets).
"""
import json
import sys

sys.stdout.reconfigure(encoding='utf-8', errors='replace')

from playwright.sync_api import sync_playwright

CHECKS_JS = r"""
() => {
  const els = [...document.querySelectorAll('body *')].filter(e => {
    const r = e.getBoundingClientRect(); const s = getComputedStyle(e);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
  });
  const cs = e => getComputedStyle(e);
  const textEls = els.filter(e => [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim().length > 1));
  const fam = e => cs(e).fontFamily.split(',')[0].replace(/["']/g, '').trim().toLowerCase();
  const rgb = c => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).map(Number); return p; };
  const hsl = ([r, g, b]) => { r/=255; g/=255; b/=255; const mx=Math.max(r,g,b), mn=Math.min(r,g,b); let h=0, s=0; const l=(mx+mn)/2;
    if (mx!==mn){ const d=mx-mn; s=l>.5?d/(2-mx-mn):d/(mx+mn); h = mx===r?((g-b)/d+(g<b?6:0)):mx===g?((b-r)/d+2):((r-g)/d+4); h*=60; } return [h, s, l]; };
  const lum = ([r,g,b]) => { const f = v => { v/=255; return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4); }; return .2126*f(r)+.7152*f(g)+.0722*f(b); };
  const bgOf = e => { for (let x = e; x; x = x.parentElement) { const c = rgb(cs(x).backgroundColor); if (c && (c[3] === undefined || c[3] > .5)) return c; } return [255,255,255]; };

  const hits = [];
  const add = (id, label, evidence) => hits.push({ id, label, evidence });

  // Fonts
  const fams = {}; textEls.forEach(e => { const f = fam(e); fams[f] = (fams[f] || 0) + 1; });
  const top = Object.entries(fams).sort((a, b) => b[1] - a[1]);
  const share = f => (fams[f] || 0) / Math.max(1, textEls.length);
  if (share('inter') > .5) add('F1', 'Inter for most text', `${Math.round(share('inter')*100)}% of text`);
  const stock = ['space grotesk', 'instrument serif', 'geist', 'fraunces'].filter(f => fams[f]);
  if (stock.length) add('F2', 'Stock "tasteful" font', stock.join(', '));
  const italicSerifWord = els.some(e => ['H1','H2'].includes(e.parentElement?.tagName) && cs(e).fontStyle === 'italic' && /serif/i.test(cs(e).fontFamily) && !/sans/i.test(cs(e).fontFamily));
  if (italicSerifWord) add('F3', 'Serif italic accent word in a heading', '');

  // Colors
  const colors = els.flatMap(e => [cs(e).color, cs(e).backgroundColor, cs(e).borderTopColor]).map(rgb).filter(c => c && (c[3] === undefined || c[3] > .3));
  const lavender = colors.filter(c => { const [h, s, l] = hsl(c); return h >= 245 && h <= 285 && s > .35 && l > .35 && l < .85; });
  if (lavender.length > 3) add('C1', 'Lavender / "vibe-code purple" accents', `${lavender.length} uses`);
  const bodyBg = rgb(cs(document.body).backgroundColor) || [255,255,255];
  const dark = lum(bodyBg) < .1;
  const caps = textEls.filter(e => cs(e).textTransform === 'uppercase' || (e.textContent.trim().length > 3 && e.textContent.trim() === e.textContent.trim().toUpperCase() && /[A-Z]{4}/.test(e.textContent)));
  if (dark && caps.length > 2) add('C2', 'Dark mode with all-caps section labels', `${caps.length} caps labels`);
  const lowContrast = textEls.filter(e => { const fg = rgb(cs(e).color); if (!fg) return false; const a = lum(fg), b = lum(bgOf(e)); const r = (Math.max(a,b)+.05)/(Math.min(a,b)+.05); return r < 4.5 && parseFloat(cs(e).fontSize) < 18; });
  if (lowContrast.length > 2) add('C3', 'Body text below WCAG AA contrast', `${lowContrast.length} elements`);
  const grads = els.filter(e => /gradient\(/.test(cs(e).backgroundImage) && e.getBoundingClientRect().width > 120);
  if (grads.length > 1) add('C4', 'Gradients on large surfaces', `${grads.length} elements`);
  const glows = els.filter(e => { const s = cs(e).boxShadow; if (s === 'none') return false; return /rgba?\((\d+), (\d+), (\d+)/.test(s) && (() => { const m = s.match(/rgba?\((\d+), (\d+), (\d+)/); const [h, sat] = hsl([+m[1], +m[2], +m[3]]); return sat > .4; })() && /\s(2\d|[3-9]\d)px/.test(s); });
  if (glows.length) add('C5', 'Colored glows / colored large shadows', `${glows.length} elements`);
  const textGrad = els.filter(e => cs(e).backgroundClip === 'text' || cs(e).webkitBackgroundClip === 'text');
  if (textGrad.length) add('C6', 'Gradient-filled text', `${textGrad.length}`);

  // Layout
  const h1 = document.querySelector('h1');
  if (h1 && cs(h1).textAlign === 'center' && parseFloat(cs(h1).fontSize) > 36) {
    add('L1', 'Centered hero headline', '');
    const prev = h1.previousElementSibling;
    if (prev && parseFloat(cs(prev).borderRadius) > 10 && prev.getBoundingClientRect().width < 360) add('L2', 'Pill badge above the hero headline', prev.textContent.trim().slice(0, 40));
  }
  const sideBorders = els.filter(e => { const s = cs(e); const lw = parseFloat(s.borderLeftWidth), rw = parseFloat(s.borderRightWidth), tw = parseFloat(s.borderTopWidth);
    const lc = rgb(s.borderLeftColor); return lw >= 3 && lw > rw + 1 && lw > tw + 1 && lc && hsl(lc)[1] > .3; });
  if (sideBorders.length > 1) add('L3', 'Colored left-border accent on blocks', `${sideBorders.length} elements`);
  const cards = els.filter(e => { const s = cs(e); return parseFloat(s.borderRadius) >= 12 && (s.boxShadow !== 'none' || parseFloat(s.borderTopWidth) > 0) && e.getBoundingClientRect().width > 200; });
  const iconTopCards = cards.filter(c => { const f = c.firstElementChild; return f && (f.tagName === 'svg' || f.querySelector?.('svg')) && f.getBoundingClientRect().height < 64; });
  if (iconTopCards.length >= 3) add('L4', 'Identical feature cards with an icon on top', `${iconTopCards.length} cards`);
  const numbered = els.filter(e => !e.children.length && /^0?[1-9][.)]?$/.test(e.textContent.trim()) && parseFloat(cs(e).fontSize) > 20);
  if (numbered.length >= 3) add('L5', 'Numbered 1 / 2 / 3 step sequence', `${numbered.length}`);
  const statLike = textEls.filter(e => /^[\d.,]+[kKmM%+x]*\+?$/.test(e.textContent.trim()) && parseFloat(cs(e).fontSize) > 28);
  if (statLike.length >= 3) add('L6', 'Stat banner row', statLike.map(e => e.textContent.trim()).slice(0, 4).join(' '));
  const emojiRe = /\p{Extended_Pictographic}/u;
  const emojiNav = [...document.querySelectorAll('nav, aside, [role=navigation]')].some(n => emojiRe.test(n.textContent));
  if (emojiNav) add('L7', 'Emoji icons in navigation', '');
  const capsHeads = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6,label,th')].filter(e => cs(e).textTransform === 'uppercase');
  if (capsHeads.length > 2) add('L8', 'All-caps headings and labels', `${capsHeads.length}`);
  const glass = els.filter(e => /blur/.test(cs(e).backdropFilter || ''));
  if (glass.length) add('L9', 'Glassmorphism (backdrop blur)', `${glass.length}`);
  const bigRadius = cards.filter(c => parseFloat(cs(c).borderRadius) >= 16);
  if (bigRadius.length >= 4) add('L10', 'rounded-2xl + shadow on everything (card kit)', `${bigRadius.length} cards`);

  // App tells (Fountain Institute)
  const dots = els.filter(e => { const r = e.getBoundingClientRect(); const s = cs(e); return r.width <= 12 && r.width >= 5 && Math.abs(r.width - r.height) < 1 && parseFloat(s.borderRadius) >= r.width / 2 - .5 && rgb(s.backgroundColor) && hsl(rgb(s.backgroundColor))[1] > .4; });
  if (dots.length > 3) add('A1', 'Colored status dots', `${dots.length}`);
  const emojiAny = textEls.filter(e => emojiRe.test(e.textContent)).length;
  if (emojiAny > 2) add('A2', 'Emoji used as icons or bullets', `${emojiAny}`);

  return { hits, fonts: top.slice(0, 4), dark };
}
"""

args = [a for a in sys.argv[1:] if not a.startswith('--')]
out_json = sys.argv[sys.argv.index('--json') + 1] if '--json' in sys.argv else None
if out_json in args:
    args.remove(out_json)
results = {}
with sync_playwright() as p:
    b = p.chromium.launch()
    for url in args:
        for scheme in ('light', 'dark'):
            page = b.new_page(viewport={'width': 1400, 'height': 900}, color_scheme=scheme)
            page.goto(url)
            page.wait_for_load_state('networkidle')
            page.evaluate('document.fonts.ready')
            r = page.evaluate(CHECKS_JS)
            n = len(r['hits'])
            bucket = 'clean' if n <= 1 else 'mild' if n <= 3 else 'heavy'
            results[f'{url} [{scheme}]'] = {**r, 'score': n, 'bucket': bucket}
            print(f'{url} [{scheme}]: {n} hit(s), {bucket}. Fonts: {", ".join(f"{f} ({c})" for f, c in r["fonts"])}')
            for h in r['hits']:
                print(f'  {h["id"]:4} {h["label"]}{": " + h["evidence"] if h["evidence"] else ""}')
            page.close()
    b.close()
if out_json:
    with open(out_json, 'w', encoding='utf8') as f:
        json.dump(results, f, indent=1)
