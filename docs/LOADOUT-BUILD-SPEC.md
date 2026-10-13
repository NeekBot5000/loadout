# Loadout: build spec

A desktop app that works like a game mod manager, but for Claude Code skills. You see a list of skills, press **Install**, and flip each one **On / Name only / Off**. No copying folders by hand.

This file is the handoff from the design prototype (`loadout.html`) to a real app. Give Claude Code both files and paste the prompt below.

## Prompt to paste into Claude Code

> Build the app described in LOADOUT-BUILD-SPEC.md. `loadout.html` is the approved design: match its layout, tokens, copy and keyboard behavior exactly. Start with the install engine and its tests (milestone M1) before any UI. Ask me only when you hit a decision listed under "Open decisions". Work in a new folder called `loadout`.

## What is verified and what is not

Verified against Anthropic's documentation (code.claude.com/docs/en/skills and settings-reference) on 2026-10-12:

- Personal skills live in `~/.claude/skills/<skill-name>/SKILL.md`. Project skills live in `.claude/skills/<skill-name>/SKILL.md`.
- Claude Code loads each skill's name and description into context at the start of a chat. The full skill loads only when it is used.
- Each entry's description text is capped at 1,536 characters. The cap is configurable (`skillListingMaxDescChars`).
- The whole list has a character budget that scales with the model's context window (`skillListingBudgetFraction`, or the `SLASH_COMMAND_TOOL_CHAR_BUDGET` environment variable). When it overflows, Claude Code drops descriptions, starting with the skills you use least.
- `skillOverrides` in a settings file hides or collapses a skill without editing it. Values: `"on"`, `"name-only"` (listed without a description), `"user-invocable-only"`, `"off"`. The settings index lists it as valid in any settings file, including `~/.claude/settings.json`. Plugin skills are not affected.
- `~/.claude/skills/.trash/` exists and Claude Code sweeps it after about 30 days. Skills synced from claude.ai land in `~/.claude/skills/synced/`. Loadout must never touch `synced/` or `.trash/` contents.
- `claude plugin validate ~/.claude/skills` checks that SKILL.md frontmatter parses (needs Claude Code v2.1.233 or later).
- `/plugin marketplace add anthropics/skills` already installs Anthropic's skills in whole bundles. Loadout's value is per-skill control, cost and safety visibility, and profiles.
- The repo `anthropics/skills` (commit `dbd4588`, 2026-10-09) holds 19 skills. The prototype's catalog is read from it: names, full descriptions, file counts, sizes, and which files are scripts.

Not verified. Check these before relying on them:

- The default value of `skillListingBudgetFraction`. Read the setting, never hardcode a limit.
- Whether a skill's `name:` frontmatter must equal its folder name.
- The exact Windows location of `~/.claude` (assumed `%USERPROFILE%\.claude`).
- GitHub's unauthenticated API limit (believed to be 60 requests per hour per IP).
- The token estimate (name plus description characters divided by 4). It is a guide only. Claude Code's own `/doctor` and `/context` show real numbers.
- The 6 "Sample" skills in the prototype are made up. Remove them from the real catalog.

## Plain-language glossary

- **Skill**: a folder with a `SKILL.md` file that tells Claude when and how to do one kind of task.
- **Token**: a small piece of text, about four letters. Claude's working memory is measured in tokens.
- **Context**: everything Claude holds in view during a chat. Skill names and descriptions take part of it.
- **Profile**: a saved set of skills and their states, like a loadout in a game.

## Recommended stack

Electron, Vite, React, TypeScript. Reason: you already have Node installed, and Electron needs nothing else. Tauri makes smaller apps but needs the Rust toolchain, which is one more thing to set up. Both can reuse the prototype's UI unchanged, so switching later is cheap. See "Open decisions".

Process split:

- **Main process** (has file and network access): catalog, installs, settings edits, profiles. Exposes a small typed API.
- **Renderer** (the UI): no direct file access. Calls the API only.

API surface:

```ts
catalog.load(): Promise<CatalogEntry[]>            // merged from all sources
skills.list(): Promise<InstalledSkill[]>           // folders in ~/.claude/skills + receipts
skills.install(id: string): AsyncIterable<Progress>
skills.remove(id: string): Promise<void>           // moves to .trash, never deletes
skills.setMode(id: string, mode: 'on'|'name'|'off'): Promise<void>
profiles.list() / save(name) / apply(name): Promise<ApplyResult>
usage.estimate(): { total: number, bySkill: {id: string, tokens: number}[] }
```

## Files on disk

| Path | Owner | Purpose |
| --- | --- | --- |
| `~/.claude/skills/<name>/` | Loadout writes | The installed skill folder, exactly as in the repo |
| `~/.claude/settings.json` | Shared with Claude Code | `skillOverrides` map. Loadout edits only that key |
| `~/.loadout/state.json` | Loadout | Receipts (source, commit, file hashes), profiles, target budget |
| `~/.loadout/cache/` | Loadout | Downloaded repo archives, keyed by commit |

Do not put Loadout files inside skill folders. Keep skill folders identical to their source.

Mode mapping:

| Control | Written to `skillOverrides` |
| --- | --- |
| On | key removed |
| Name only | `"name-only"` |
| Off | `"off"` |

## Install algorithm

Input: a catalog entry `{ id, repo, path, ref }`, for example `anthropics/skills`, `skills/docx`, `main`.

1. Resolve `ref` to a commit SHA. Always pin installs to the SHA.
2. Download the repo archive for that SHA once (`https://codeload.github.com/<owner>/<repo>/tar.gz/<sha>`). Cache it. Installing 100 skills from one repo is one download.
3. Extract only entries under `<path>/` into `~/.loadout/tmp/<random>/`. Reject the whole install if any entry:
   - has an absolute path or contains `..`
   - is a symlink or hard link
   - makes the total larger than 25 MB, or one file larger than 10 MB (defaults, configurable; `canvas-design` is 5.5 MB)
   Use `tar` version 7.5.22 or newer. Older versions of the `tar` npm package have published path-traversal and symlink advisories (checked with `npm audit` on 2026-10-12). Loadout's own pre-scan stays in place anyway.
4. Require `SKILL.md` at the top of the extracted folder with parseable frontmatter. Optionally run `claude plugin validate` on it.
5. If `~/.claude/skills/<id>` already exists and Loadout has no receipt for it, stop and ask. Never overwrite a folder Loadout did not create.
6. Move the temp folder into place with one rename. Write the receipt: source, commit, install time, SHA-256 of every file.
7. Report progress as real steps (fetching, downloading N files, writing), not a fake timer.

Remove: move the folder to `~/.claude/skills/.trash/<id>-<timestamp>` and delete its override and receipt. Update: install the new commit to temp, show a file-level diff, then swap. Keep the old folder in `.trash`.

## Settings edits (the risky part)

`~/.claude/settings.json` is shared with Claude Code and the user. Rules:

- Read it fresh immediately before every write. Change only `skillOverrides`. Keep every other key and its order.
- If the file is missing, create it with just `skillOverrides`.
- If it does not parse, refuse and tell the user. Never overwrite it.
- Write to a temp file, then rename. Keep the previous version as `settings.json.loadout-backup` (one copy).
- Applying a profile is one write, not one per skill.

## Safety rules

- Loadout never runs anything from a skill. It only copies files.
- Scripts are flagged by extension (`.py .sh .js .ts .mjs .ps1 .bat .cmd`) and by a shebang line. The inspector lists them before install and states that they can run code on the user's computer.
- Only `https://github.com` and `https://codeload.github.com` are allowed as sources. No other hosts.
- Official source badge only for `anthropics/skills`. Any other repo shows as "Added by you" until the user marks it.
- Show the whole `SKILL.md` before install, not just the description.

## Catalog

`catalog.json` is a list. Adding a skill to the menu means adding one entry:

```json
{ "id": "docx", "repo": "anthropics/skills", "path": "skills/docx", "ref": "main",
  "kind": "documents", "blurb": "Creates and edits Word documents and templates." }
```

Description, file list, sizes and script flags are read from the repo at fetch time, not stored. An "Add repo" button takes a GitHub URL, finds every `SKILL.md` in it, and offers them as new rows.

## UI port notes

The prototype is one HTML file. Port it, do not redesign it.

- **Layout**: top bar (name, profile picker, search), left rail of views, sortable table, inspector, status bar with the context meter. On phones the inspector becomes a bottom sheet.
- **Tokens**: copy the `:root` blocks from the prototype. Light and dark are both designed. Fonts: Archivo (width axis, condensed for headings) and IBM Plex Mono (paths and file names only). Bundle the font files in the app instead of loading from Google.
- **One bold element**: the segmented context meter. Each segment is a skill, sized by its tokens. The user sets a target. Segments past it turn amber.
- **Source markers**: a filled diamond for official, a dashed diamond for samples or unverified. Shape plus text, never color alone.
- **Copy rules**: sentence case, active verbs, one name per thing everywhere (Install, Remove, On, Name only, Off, Profile, Activity). No ALL CAPS labels.
- **Keyboard**: Up and Down select, Space toggles on or off, Enter installs, `/` focuses search, Escape closes drawers and the phone sheet, Left and Right change a row's state.
- **Accessibility**: the prototype scored zero violations on axe-core 4.10.2 in light, dark and phone layouts. Keep that in CI.
- **Estimates**: label every token number as an estimate. Name-only cost in the prototype is `ceil(name length / 4) + 1`, which is a rough guess to be replaced after measuring.

## Milestones

| | Deliverable | Done when |
| --- | --- | --- |
| M0 | Project scaffold, prototype UI ported with mock data | Looks identical to `loadout.html` |
| M1 | Install engine + settings editor, no UI | All tests below pass |
| M2 | Real catalog from `anthropics/skills`, real installs, real modes | Install, toggle, remove work on a test folder |
| M3 | Profiles, usage meter from real descriptions, activity log | Applying a profile is one settings write |
| M4 | Add-repo flow, update check with file diff | Update keeps the old copy in `.trash` |
| M5 | Windows installer, auto-update, crash-safe logs | Fresh machine install works |

## Tests the engine must pass before any UI work

- Extracting an archive with `../evil` or an absolute path installs nothing.
- Extracting an archive with a symlink installs nothing.
- A skill over the size limit installs nothing.
- A folder without `SKILL.md` installs nothing.
- An existing folder Loadout did not create is left untouched and reported.
- A failed install leaves `~/.claude/skills` unchanged (no half-written folder).
- Settings edit keeps unrelated keys, refuses invalid JSON, and writes atomically.
- Removing moves to `.trash` and a second remove is a no-op.
- Two installs of the same skill at once do not corrupt it.

A reference implementation of these is in `engine/` next to this file (Node, no UI).

Engine status: 20 tests pass, including one that builds a GitHub-style archive from the real `anthropics/skills` repo and installs `docx` (61 files, 15 scripts) and `canvas-design` (83 files). Four of the safety checks (unsafe paths, links, the per-skill install lock, and refusing to overwrite a folder Loadout did not create) were confirmed by breaking the code and watching the matching tests fail. Not built yet: resolving a branch to a commit through the GitHub API, downloading the archive, the profile and usage logic, and any UI. Network access to GitHub's download and API hosts was blocked where this was written, so downloads are untested.

## Open decisions

| # | Question | Options | Recommendation |
| --- | --- | --- | --- |
| 1 | Electron or Tauri | Electron: only Node needed. Tauri: smaller app, needs Rust | Electron for v1 |
| 2 | How an "Off" skill is hidden | `skillOverrides` in settings (keeps files) vs moving the folder | `skillOverrides`. It is Anthropic's own mechanism and reversible |
| 3 | Personal or project skills | Personal only vs also per-project folders | Personal only for v1 |
| 4 | Which catalogs ship | Only `anthropics/skills`, or add community repos | Only `anthropics/skills` until you pick other repos to trust. I verified no community repo, so I list none |
| 5 | Claude desktop chat app skills | Claude Code only vs also export a zip for the chat app | Claude Code only for v1 |
| 6 | Profile apply behavior | Apply immediately vs show a preview ("installs 4, turns on 3") | Preview when it installs more than 3 skills. The prototype applies immediately |
