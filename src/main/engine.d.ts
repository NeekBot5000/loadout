// Types for the plain-JS install engine (engine/src). Only what the main process uses.
declare module 'loadout-engine' {
  export class EngineError extends Error {
    constructor(code: string, message: string);
    code: string;
  }
  export interface FileInfo { path: string; bytes: number; sha256: string; isScript: boolean }
  export interface Receipt {
    id: string;
    source: { repo: string; ref?: string; sha: string; path: string };
    installedAt: string;
    frontmatter: { name: string | null; description: string | null };
    files: FileInfo[];
  }
  export interface State { version: number; receipts: Record<string, Receipt>; profiles: Record<string, unknown>; budget: number }
  export type EngineProgress =
    | { step: 'resolving'; ref: string }
    | { step: 'cached'; file: string }
    | { step: 'fetching'; repo: string; sha: string }
    | { step: 'downloading'; bytes: number; total: number | null }
    | { step: 'downloaded'; bytes: number; file: string }
    | { step: 'writing'; id: string }
    | { step: 'done'; id: string; files: number };
  export function installFromGitHub(opts: {
    entry: { id: string; repo: string; path: string; ref?: string };
    skillsDir: string; stateDir: string;
    onProgress?: (p: EngineProgress) => void;
    replace?: boolean;
  }): Promise<{ id: string; target: string; files: number; bytes: number; scripts: string[]; sha: string }>;
  export function removeSkill(opts: { id: string; skillsDir: string; stateDir: string; settingsFile?: string }): Promise<{ status: 'absent' | 'removed'; trash?: string }>;
  export function applyModes(file: string, changes: Record<string, 'on' | 'name' | 'off'>): Promise<{ changed: boolean }>;
  export function readOverrides(file: string): Promise<Record<string, string>>;
  export function modeOf(overrides: Record<string, string>, id: string): 'on' | 'name' | 'off' | 'other';
  export function readState(stateDir: string): Promise<State>;
  export function writeState(stateDir: string, state: State): Promise<void>;
  export function inspectDir(root: string): Promise<{ files: FileInfo[]; bytes: number; scripts: string[] }>;
  export function readFrontmatter(text: string): { name?: string; description?: string } | null;
  export function validateId(id: string): void;
  type M = 'on' | 'name' | 'off';
  export function planProfile(opts: { installed: Record<string, M>; set: Record<string, M>; known: Set<string> }): { install: string[]; modes: Record<string, M>; missing: string[] };
  export function listProfiles(stateDir: string): Promise<{ active: string | null; budget: number; profiles: Record<string, { name: string; set: Record<string, M> }> }>;
  export function saveProfile(stateDir: string, p: { id?: string | null; name: string; set: Record<string, M> }): Promise<string>;
  export function deleteProfile(stateDir: string, id: string): Promise<boolean>;
  export function setActive(stateDir: string, id: string | null): Promise<void>;
  export function setBudget(stateDir: string, budget: number): Promise<void>;
  export function appendActivity(stateDir: string, message: string, when?: Date): Promise<void>;
  export function readActivity(stateDir: string, limit?: number): Promise<{ t: string; m: string }[]>;
  export interface ReviewFinding { rule: string; sev: 'high' | 'medium' | 'low' | 'info'; file: string; line?: number; snippet: string }
  export interface ReviewedSkill {
    path: string; name: string | null; description: string; skillMd: string;
    files: number; bytes: number; scripts: number; unsafe: boolean;
    findings: ReviewFinding[];
    tree: { p: string; k: 'file' | 'dir'; b: number; x: number; n: number }[];
    hashes: Record<string, string>;
  }
  export function reviewArchive(opts: { tarball: string; paths?: string[] | null }): Promise<ReviewedSkill[]>;
  export function diffFiles(oldFiles: FileInfo[], newHashes: Record<string, string>): { added: string[]; removed: string[]; changed: string[]; same: number };
  export function parseRepo(input: string): { owner: string; repo: string };
  export function resolveRef(opts: { repo: string; ref?: string }): Promise<{ sha: string; ref: string }>;
  export function downloadArchive(opts: { repo: string; sha: string; cacheDir: string; onProgress?: (p: EngineProgress) => void }): Promise<{ file: string; cached: boolean; bytes?: number }>;
}
