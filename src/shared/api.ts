// The contract between the renderer (UI) and the main process. The renderer has no file or
// network access; everything goes through window.loadout.

export type Mode = 'on' | 'name' | 'off';

/** anthropic: anthropics/skills. community: reviewed by Loadout's audit. added: from a repo the user added. yours: a folder Loadout did not install. sample: made up (mock only). */
export type Tier = 'anthropic' | 'community' | 'added' | 'yours' | 'sample';

export interface TreeItem {
  /** Path relative to the skill folder. Folders end with "/". */
  p: string;
  k: 'file' | 'dir';
  /** Bytes. */
  b: number;
  /** Number of files that can run code. */
  x: number;
  /** Number of files. */
  n: number;
}

export interface Skill {
  /** Stable row key: "owner/repo:path" for catalog entries, "local:<folder>" for the user's own. */
  key: string;
  /** Folder name in ~/.claude/skills. Two catalog entries can share one; only one can be installed. */
  id: string;
  tier: Tier;
  kind: string;
  blurb: string;
  desc: string;
  /** Estimated tokens when on: name plus description. */
  tok: number;
  /** Estimated tokens when name only. */
  nameTok: number;
  nfiles: number;
  runs: number;
  bytes: number;
  tree: TreeItem[];
  repo: string;
  url: string;
  /** Folder inside the repo, for display. */
  path?: string;
  /** Plain-language cautions from the catalog audit. */
  warnings?: string[];
  /** Other skills (by folder name) this one uses. */
  requires?: string[];
}

export interface CatalogNote {
  repo: string;
  sha: string;
  date: string;
}

export interface Progress {
  key: string;
  step: 'Waiting' | 'Fetching' | 'Downloading' | 'Writing' | 'Done';
  pct: number;
  /** A line for the activity log, or null when the step is not worth logging. */
  message: string | null;
}

export interface ProfileInfo {
  name: string;
  /** Skills the profile wants, by key. Anything not listed is off. */
  set: Record<string, Mode>;
}

export interface ProfilesState {
  active: string | null;
  /** The user's context target, in tokens. */
  budget: number;
  profiles: Record<string, ProfileInfo>;
}

export interface ApplyResult {
  /** Installed skills whose mode changed. */
  changed: number;
  installed: string[];
  /** "key: reason" for installs that failed. The rest of the profile still applies. */
  failed: string[];
  /** Keys the profile wants that Loadout cannot fetch (gone from the catalog, or a deleted skill of yours). */
  missing: string[];
}

/** A line a safety rule flagged. Something for a person to read, not a verdict. */
export interface Finding {
  rule: string;
  sev: 'high' | 'medium' | 'low' | 'info';
  file: string;
  line?: number;
  snippet: string;
}

export interface RepoSkillPreview {
  path: string;
  id: string;
  desc: string;
  /** The whole SKILL.md, shown before adding. */
  skillMd: string;
  nfiles: number;
  bytes: number;
  runs: number;
  tree: TreeItem[];
  /** High and medium findings, plus compatibility notes. */
  findings: Finding[];
  /** Why this skill cannot be added (a link inside, a name Loadout cannot use), or null. */
  problem: string | null;
}

export interface RepoPreview {
  repo: string;
  sha: string;
  skills: RepoSkillPreview[];
}

export interface UpdateInfo {
  key: string;
  from: string;
  to: string;
}

export interface UpdatePreview extends UpdateInfo {
  added: string[];
  removed: string[];
  changed: string[];
  same: number;
  findings: Finding[];
  desc: string;
}

export interface ActivityLine {
  /** ISO time. */
  t: string;
  m: string;
}

export interface LoadoutApi {
  /** True when installs are simulated (browser preview or M0). */
  readonly mock: boolean;
  catalog(): Promise<{ skills: Skill[]; note: CatalogNote }>;
  /** Installed skills and their modes, by key. A key not in the map is not installed. */
  installed(): Promise<Record<string, Mode>>;
  install(key: string, onProgress: (p: Progress) => void): Promise<void>;
  remove(key: string): Promise<void>;
  /** Apply several mode changes (by key) in one settings write. */
  setModes(changes: Record<string, Mode>): Promise<void>;
  profiles(): Promise<ProfilesState>;
  /** Create (id null) or overwrite a profile. Returns its id. */
  saveProfile(id: string | null, name: string, set: Record<string, Mode>): Promise<string>;
  deleteProfile(id: string): Promise<void>;
  /** Install what the profile needs, then change every mode in one settings write. */
  applyProfile(id: string, onProgress: (p: Progress) => void): Promise<ApplyResult>;
  setBudget(tokens: number): Promise<void>;
  /** Recent activity, newest first. */
  activity(): Promise<ActivityLine[]>;
  /** Add a line to the activity log on disk. */
  note(message: string): Promise<void>;
  /** Download a GitHub repo (pinned to its current commit) and review every skill in it. Adds nothing. */
  previewRepo(input: string, onProgress: (p: Progress) => void): Promise<RepoPreview>;
  /** Add the chosen skills from a previewed repo to the list, as "Added by you". */
  addRepo(repo: string, sha: string, paths: string[]): Promise<void>;
  /** Take a repo you added off the list. Installed skills from it stay installed. */
  removeRepo(repo: string): Promise<void>;
  /** Installed skills with a newer version: from the catalog, or a new commit in a repo you added. */
  updates(): Promise<UpdateInfo[]>;
  /** What an update changes, file by file, and what the safety rules flag in the new version. */
  previewUpdate(key: string): Promise<UpdatePreview>;
  /** Install the new version. The old copy goes to .trash. */
  update(key: string, onProgress: (p: Progress) => void): Promise<void>;
  /** Open the folder with Loadout's own log files. */
  openLogs(): Promise<void>;
}

declare global {
  interface Window {
    loadout?: LoadoutApi;
  }
}
