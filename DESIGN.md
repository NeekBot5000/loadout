# DESIGN.md: Loadout

The contract every screen and web page is built from. Change it here first, then in code.
Source of truth for tokens: `src/renderer/styles.css` (`:root` blocks), ported from `docs/loadout.html`.

## What the product is made of

A mod manager for Claude Code skills. Its world: a dense, sortable list; an inspector that shows what
Claude actually reads; a status bar with a segmented meter of context spent. Build from those, not from a
landing-page template.

**Signature:** the segmented context meter. Each segment is a skill, sized by its tokens; segments past the
user's target turn amber. It is the one bold element on any screen, and the website's hero is this meter,
not a headline.

## Color (one accent, one warning)

| Role | Light | Dark |
| --- | --- | --- |
| Ground | `#E8EBF0` | `#11151C` |
| Panel | `#F5F6F9` | `#171C25` |
| Raised surface | `#FFFFFF` | `#1F2531` |
| Line / soft line | `#C9CED9` / `#DADEE6` | `#2D3544` / `#232A37` |
| Ink, ink-2, ink-3 | `#151A27`, `#444D61`, `#5B647A` | `#E6E9F0`, `#AEB5C5`, `#9AA3B7` |
| Accent (selection, primary action, official marker) | `#2C4BD0` | `#8DA3FF` |
| On (the On state only) | `#0E7A56` | `#4FD1A1` |
| Caution (scripts, over target, warnings) | `#7A5000` on `#F3E3B8` | `#E8B04A` on `#3B3015` |

Rules: one accent. Green means exactly "On". Amber means exactly "can run code / over target / check this".
No gradients on surfaces, no colored glows, no purple.

## Type

- Archivo (variable width axis). Headings use the condensed width (`font-stretch` 62 to 80%), weight 700 to 800.
- IBM Plex Mono only for paths, file names and code.
- Sentence case everywhere. No all-caps labels, no tracked eyebrows.
- Tabular figures for every number in a column.

## Shape and space

- Radius 3 to 4px on controls and boxes. Nothing rounder; no pills.
- Borders, not shadows, separate things. The only shadow is the drawer's.
- Dense where the user scans (table rows 58px), roomy where they read (inspector).

## Markers

Shape plus text, never color alone: filled diamond = Anthropic, outline diamond = Community,
dashed diamond = Added by you / Sample, small square = Yours.

## Copy

Plain and specific. Active verbs, one name per thing (Install, Remove, On, Name only, Off, Profile, Activity).
No exclamation marks, no "Oops", no elevate/seamless/unleash, no em dashes in UI text.
Every number that is an estimate says so.

## Banned (each is a measured AI-design tell; see docs/design-research.md)

Inter, Space Grotesk, Instrument Serif, Geist; lavender; dark-by-default; gradient text; centered hero with a
badge above it; three icon-topped feature cards; 01 / 02 / 03; stat banners; emoji icons; status dots;
colored left borders; glassmorphism; cream-and-terracotta; near-black with one acid-green.

## Check

`python -I scripts/slop_check.py <url>` must report 0 or 1 hits. axe-core must report 0 violations.
