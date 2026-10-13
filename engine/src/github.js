import fs from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { EngineError } from './errors.js';
import { exists } from './fsutil.js';

/** The only hosts Loadout ever talks to. Redirects to anything else are refused. */
export const ALLOWED_HOSTS = new Set(['github.com', 'codeload.github.com']);
export const MAX_ARCHIVE_BYTES = 300 * 1024 * 1024;
const MAX_REDIRECTS = 3;

const REPO_RE = /^([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))\/([A-Za-z0-9._-]{1,100})$/;
const SHA_RE = /^[0-9a-f]{40}$/;

/** Parse "owner/repo" or a github.com URL. Returns { owner, repo } or throws. */
export function parseRepo(input) {
  let s = String(input ?? '').trim();
  const url = s.match(/^https:\/\/github\.com\/([^/?#]+)\/([^/?#]+)/);
  if (url) s = `${url[1]}/${url[2]}`;
  s = s.replace(/\.git$/, '');
  const m = s.match(REPO_RE);
  if (!m || m[2] === '.' || m[2] === '..') throw new EngineError('bad-repo', `"${input}" is not a GitHub repo. Use owner/name or a https://github.com link.`);
  return { owner: m[1], repo: m[2] };
}

function checkRef(ref) {
  if (typeof ref !== 'string' || !ref || ref.length > 200 || ref.includes('..') || /[\s~^:?*\[\\\0]/.test(ref) || ref.startsWith('/') || ref.endsWith('/')) {
    throw new EngineError('bad-ref', `"${ref}" is not a valid branch, tag or commit.`);
  }
}

function checkHost(url) {
  const u = new URL(url);
  if (u.protocol !== 'https:' || !ALLOWED_HOSTS.has(u.hostname) || u.port) {
    throw new EngineError('blocked-host', `Loadout only downloads from github.com. It refused ${u.origin}.`);
  }
  return u;
}

/** fetch() that only reaches allowed hosts, and checks every redirect hop before following it. */
async function safeFetch(url, { fetchImpl = fetch, signal } = {}) {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    checkHost(current);
    const res = await fetchImpl(current, { redirect: 'manual', signal, headers: { 'user-agent': 'loadout' } });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (!loc) throw new EngineError('network', `GitHub sent a redirect with no address (${res.status}).`);
      current = new URL(loc, current).toString();
      continue;
    }
    if (res.status === 404) throw new EngineError('not-found', 'GitHub says that repo or commit does not exist, or it is private.');
    if (res.status === 403 || res.status === 429) throw new EngineError('rate-limited', 'GitHub is limiting requests right now. Try again in a few minutes.');
    if (!res.ok) throw new EngineError('network', `GitHub answered ${res.status}.`);
    return res;
  }
  throw new EngineError('network', 'Too many redirects from GitHub.');
}

/** Read git's pkt-line ref advertisement. Returns { head, refs: Map<name, sha> }. */
export function parseRefAdvertisement(text) {
  const refs = new Map();
  let head = null;
  let i = 0;
  while (i + 4 <= text.length) {
    const len = parseInt(text.slice(i, i + 4), 16);
    if (Number.isNaN(len)) break;
    if (len === 0) { i += 4; continue; }
    const line = text.slice(i + 4, i + len).replace(/\n$/, '');
    i += len;
    if (line.startsWith('#')) continue;
    const [refPart, caps = ''] = line.split('\0');
    const [sha, name] = refPart.split(' ');
    if (!SHA_RE.test(sha ?? '') || !name) continue;
    refs.set(name, sha);
    const sym = caps.match(/symref=HEAD:(\S+)/);
    if (sym) head = sym[1];
  }
  return { head, refs };
}

/**
 * Turn a branch, tag or "HEAD" into a full commit SHA. A 40-character SHA is returned as is.
 * Uses git's own ref listing on github.com, which has no API rate limit.
 */
export async function resolveRef({ repo, ref = 'HEAD', fetchImpl }) {
  const { owner, repo: name } = parseRepo(repo);
  checkRef(ref);
  if (SHA_RE.test(ref)) return { sha: ref, ref };
  const res = await safeFetch(`https://github.com/${owner}/${name}.git/info/refs?service=git-upload-pack`, { fetchImpl });
  const { head, refs } = parseRefAdvertisement(await res.text());
  const candidates = ref === 'HEAD'
    ? [head, 'HEAD']
    : [`refs/heads/${ref}`, `refs/tags/${ref}^{}`, `refs/tags/${ref}`, ref];
  for (const c of candidates) {
    if (c && refs.has(c)) return { sha: refs.get(c), ref: c === 'HEAD' ? head ?? 'HEAD' : c };
  }
  throw new EngineError('not-found', `${owner}/${name} has no branch or tag called "${ref}".`);
}

const inflight = new Map();

/**
 * Download the repo archive for one commit into the cache, once. Later calls reuse the file.
 * Calls at the same time for the same commit share one download.
 */
export function downloadArchive({ repo, sha, cacheDir, fetchImpl, onProgress, maxBytes = MAX_ARCHIVE_BYTES }) {
  const { owner, repo: name } = parseRepo(repo);
  if (!SHA_RE.test(sha)) throw new EngineError('bad-ref', 'Downloads must be pinned to a full commit SHA.');
  const file = path.join(cacheDir, `${owner}__${name}__${sha}.tar.gz`);
  if (inflight.has(file)) return inflight.get(file);
  const job = (async () => {
    if (await exists(file)) { onProgress?.({ step: 'cached', file }); return { file, cached: true }; }
    await fs.mkdir(cacheDir, { recursive: true });
    onProgress?.({ step: 'fetching', repo: `${owner}/${name}`, sha });
    const res = await safeFetch(`https://codeload.github.com/${owner}/${name}/tar.gz/${sha}`, { fetchImpl });
    const total = Number(res.headers.get('content-length')) || null;
    if (total && total > maxBytes) throw new EngineError('too-large', `The repo archive is ${total} bytes. The limit is ${maxBytes}.`);
    const tmp = `${file}.${randomUUID()}.part`;
    let got = 0;
    try {
      const out = createWriteStream(tmp);
      try {
        for await (const chunk of res.body) {
          got += chunk.length;
          if (got > maxBytes) throw new EngineError('too-large', `The repo archive is over ${maxBytes} bytes. Download stopped.`);
          if (!out.write(chunk)) await new Promise((r) => out.once('drain', r));
          onProgress?.({ step: 'downloading', bytes: got, total });
        }
      } finally {
        await new Promise((resolve, reject) => out.end((e) => (e ? reject(e) : resolve())));
      }
      const head = Buffer.alloc(2);
      const fh = await fs.open(tmp, 'r');
      try { await fh.read(head, 0, 2, 0); } finally { await fh.close(); }
      if (head[0] !== 0x1f || head[1] !== 0x8b) throw new EngineError('network', 'GitHub sent something that is not a .tar.gz archive.');
      await fs.rename(tmp, file);
    } catch (e) {
      await fs.rm(tmp, { force: true });
      throw e;
    }
    onProgress?.({ step: 'downloaded', bytes: got, file });
    return { file, cached: false, bytes: got };
  })().finally(() => inflight.delete(file));
  inflight.set(file, job);
  return job;
}
