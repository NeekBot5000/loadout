# Loadout install engine

The part of Loadout that touches your files. No UI.

- `src/archive.js` reads a `.tar.gz` (GitHub's format) without extracting it, and rejects unsafe paths, links, oversize skills and folders with no `SKILL.md`.
- `src/install.js` installs one skill into `~/.claude/skills/<name>` with a single rename after every check passes. Removing moves it to `.trash`.
- `src/settings.js` flips a skill On, Name only or Off by editing only `skillOverrides` in `~/.claude/settings.json`, one atomic write with a backup.
- `src/state.js` keeps receipts (source, commit, SHA-256 of every file) in `~/.loadout/state.json`.
- `src/github.js` resolves a branch or tag to a commit (git's ref listing on github.com, no API rate limit) and downloads the archive for that commit once into `~/.loadout/cache/`. Only `github.com` and `codeload.github.com` are reachable, including across redirects.
- `src/remote.js` (`installFromGitHub`) runs the whole path: resolve, download, checked install, with real progress steps.
- `findSkills` in `src/archive.js` lists every skill in a repo archive with its full `SKILL.md`, file count, size and scripts, without extracting.

Run the tests (Node 22 or newer):

```
npm install
npm test
```

Two tests are skipped by default:

- the real-archive test needs a clone of `anthropics/skills`; point `LOADOUT_REAL_REPO` at it.
- the live GitHub test downloads from github.com; set `LOADOUT_NET=1`.

Not here yet: profiles, token estimates. See `../docs/LOADOUT-BUILD-SPEC.md`.
