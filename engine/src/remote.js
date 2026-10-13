import path from 'node:path';
import { resolveRef, downloadArchive, parseRepo } from './github.js';
import { installSkill } from './install.js';

/**
 * Install one catalog entry from GitHub: resolve the ref to a commit, download the archive
 * once (cached by commit), then run the checked install. Progress steps are real events.
 */
export async function installFromGitHub({ entry, skillsDir, stateDir, fetchImpl, onProgress, limits, replace }) {
  const { owner, repo } = parseRepo(entry.repo);
  onProgress?.({ step: 'resolving', ref: entry.ref ?? 'HEAD' });
  const { sha } = await resolveRef({ repo: entry.repo, ref: entry.ref ?? 'HEAD', fetchImpl });
  const { file } = await downloadArchive({ repo: entry.repo, sha, cacheDir: path.join(stateDir, 'cache'), fetchImpl, onProgress });
  onProgress?.({ step: 'writing', id: entry.id });
  const result = await installSkill({
    tarball: file, subpath: entry.path, id: entry.id, skillsDir, stateDir, limits, replace,
    source: { repo: `${owner}/${repo}`, ref: entry.ref ?? 'HEAD', sha },
  });
  onProgress?.({ step: 'done', id: entry.id, files: result.files });
  return { ...result, sha };
}
