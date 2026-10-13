# Not looking vibe coded: research and audit

Written overnight, 2026-10-12. Sources are linked; anything not from a source is marked as my own judgment.

## The short version

Loadout scores **0 hits** (clean) on a deterministic check of the published patterns, in light and dark,
and so does every page of the website (`site/`).
A deliberately generic test page scores 15. The prototype was already built against most of these
tells, so the work tonight was measuring it, fixing the one real tell (a green status-style dot), and
writing the rules down in [`DESIGN.md`](../DESIGN.md) so the website and future screens keep to them.

## What makes a UI read as AI-made

### The measured list (16 patterns)

Adrian Krebs scored 1,590 Show HN landing pages with Playwright against 16 patterns that designers
named as tells. 22% hit four or more (heavy), 32% two or three (mild), 46% zero or one (clean).
Source: [adriankrebs.ch/blog/design-slop](https://www.adriankrebs.ch/blog/design-slop/), summarized at
[developersdigest.tech](https://www.developersdigest.tech/blog/ai-design-slop-and-how-to-spot-it).

| Group | Pattern | Loadout |
| --- | --- | --- |
| Fonts | Inter for everything | Archivo (variable width) + IBM Plex Mono for paths. Not hit. |
| Fonts | The stock "tasteful" set: Space Grotesk, Instrument Serif, Geist | Not used. |
| Fonts | Serif italic accent word in a sans headline | No. |
| Color | Lavender "vibe-code purple" | Accent is a cobalt blue (#2C4BD0, hue 229). Not hit. |
| Color | Permanent dark mode, grey body text, all-caps labels | Follows the system theme; no caps labels. |
| Color | Barely passing body contrast in dark themes | axe-core: 0 violations in both themes. |
| Color | Gradients everywhere | None, except the install progress fill. |
| Color | Big colored glows and shadows | One neutral drawer shadow. |
| Layout | Centered hero in a generic sans | App, no hero. The website must avoid it too. |
| Layout | Badge above the H1 | No. |
| Layout | Colored left or top borders on cards | No. |
| Layout | Identical icon-topped feature cards | No. |
| Layout | Numbered 1 / 2 / 3 steps | No. |
| Layout | Stat banner row | No. |
| Layout | Sidebar with emoji icons | Rail has text only. |
| Layout | All-caps headings and labels | Sentence case everywhere (a spec rule). |

### App-specific tells

From [The Fountain Institute, "7 signs a UI has been vibe coded"](https://www.thefountaininstitute.com/blog/signs-vibe-coded-ui):
neon palettes with no priority, emoji as icons, cards nested in cards, rainbow side tabs, and
**status dots that mean nothing**. Loadout had one: the "Yours" source marker was a filled green
circle, which reads as "online". It is now a small square in the neutral ink color, still paired with
the word "Yours" (shape plus text, never color alone).

### The second wave

Once models learned to avoid purple, they converged again on what
[avoid-ai-design](https://github.com/funboy322/avoid-ai-design) calls *second-order defaults*:
cream with a terracotta accent, near-black with one acid-green signal, tracked all-caps mono
"eyebrow" labels, one colored word in the headline, decorative 01 / 02 / 03, fake window dots.
Loadout uses none of them. The website must not reach for them either; it is the easy trap
when "making it look less AI".

### Copy

Words like elevate, seamless, unleash, next-gen and game-changer, exclamation marks in success
messages, "Oops" errors, and em dashes all read as generated. A scan of the UI strings found none.

## The tools, and which to use

| Tool | What it is | Use it for |
| --- | --- | --- |
| `scripts/slop_check.py` (new tonight) | Deterministic checker for the 16 patterns plus app tells, reading computed styles in Playwright. Run it on any URL. | A gate before shipping a screen or a web page. |
| [`DESIGN.md`](../DESIGN.md) (new tonight) | The design contract: palette with roles, type, layout primitive, what is banned. The [pattern](https://www.developersdigest.tech/blog/design-md-for-ai-agents) is to write it once so every new page is built from it, not re-guessed. | Every future change, by a person or an agent. |
| `taste-skill`, `redesign-skill`, `soft-skill` | Installed Claude skills with anti-generic rules and audits. | Starting a new page; auditing an existing one. |
| Anthropic `frontend-design` skill | Guides UI while it is being built from a brief. | New screens. |
| [avoid-ai-design](https://github.com/funboy322/avoid-ai-design) | Third-party skill with a 67-tell catalog and a zero-dependency scanner. MIT, ~100 stars. | Worth reading. I did not download or run its scanner tonight (untrusted code while unattended); the catalog itself is the useful part. |
| [Impeccable](https://github.com/pbakaus/impeccable), [taste-skill](https://github.com/leonxlnx/taste-skill), [Hallmark](https://github.com/nutlope/hallmark) | Larger anti-slop frameworks, listed by the avoid-ai-design README. | Not evaluated tonight. |

My judgment on what matters most for Loadout: the strongest defence is that the design starts from
what the product *is*. A mod manager is a dense table, an inspector and a status bar with a meter.
Keep that as the signature (the segmented context meter is the one bold element) and the rest stays
quiet. That is also exactly what the clean 46% in Krebs' study do: one strong primitive, repeated.

## Tools compared on the website

Run on the website after it was built, to see what each tool adds:

| Tool | What it caught | Verdict |
| --- | --- | --- |
| `scripts/slop_check.py` | 0 hits on every page in both themes. | Good gate for the measured patterns; blind to copy and composition. |
| axe-core | 2 problems over the night (a page without an `h1`, then none). | Required, but says nothing about looking generic. |
| `taste-skill` pre-flight | 5 real issues the scanner could not see: hero subtext of 27 words (limit 20), a small tagline under the hero buttons, one action with three labels ("Download for Windows", "Download the installer", "Install with Loadout"), the same two-column layout three times in a row, and no pressed state on buttons. All fixed. | The most useful second pass. Its stack advice (Tailwind, Motion, icon libraries) does not apply to a plain static site and was ignored. |
| `redesign-skill` audit | Confirmed the app's type, color and component choices; its "add texture, grain, imagery" suggestions conflict with DESIGN.md and were not applied. | Good for a first audit of an older UI. |

Takeaway: a deterministic scanner for the measured tells, then a checklist pass for composition and copy,
then a person looking at screenshots in both themes. None of the three replaces the others.

## How to check a change

```
python -I scripts/slop_check.py http://localhost:5173/          # the app (mock) in light and dark
python -I scripts/slop_check.py file:///.../site/index.html     # a web page
python -I scripts/slop_check.py file:///.../scripts/fixtures/slop.html   # the control: should score ~15
```

A hit is evidence of a default nobody chose, not proof a model made the page.
