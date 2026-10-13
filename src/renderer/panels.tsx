// Inspector panels for M4: adding a GitHub repo, and reviewing an update before installing it.
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { Finding, LoadoutApi, RepoPreview, UpdateInfo, UpdatePreview } from '../shared/api';

const fmtB = (b: number) => (b < 1024 ? b + ' B' : b < 1048576 ? (b / 1024).toFixed(b < 10240 ? 1 : 0) + ' KB' : (b / 1048576).toFixed(1) + ' MB');
const plural = (n: number, w: string) => n + ' ' + (n === 1 ? w : w + 's');

/** What each safety rule means, in plain words. */
const RULE_TEXT: Record<string, string> = {
  'override-instructions': 'Tells Claude to ignore earlier instructions',
  'conceal-from-user': 'Tells Claude to keep something from you',
  'stealth-action': 'Does something quietly (sends, installs or deletes)',
  'skip-permissions': 'Turns off Claude Code permission checks',
  'credential-paths': 'Reads a place where passwords or keys are kept',
  'browser-cookies': 'Reads your browser cookies',
  'env-dump': 'Copies all environment variables',
  'pipe-to-shell': 'Downloads a script and runs it straight away',
  'exec-remote': 'Runs code fetched from the internet',
  'decode-and-run': 'Decodes hidden text and runs it',
  'long-base64': 'Contains a long encoded blob',
  'powershell-encoded': 'Runs an encoded PowerShell command',
  'upload-to-host': 'Sends data to a server',
  'webhook-or-paste': 'Sends data to a webhook or paste site',
  'raw-ip-url': 'Talks to a bare IP address',
  persistence: 'Sets something to run at startup or on a schedule',
  destructive: 'Can delete a whole folder or drive',
  'claude-config-write': 'Changes Claude Code settings or CLAUDE.md',
  'hidden-unicode': 'Has invisible characters that can hide text',
  'link-or-special': 'Contains a link or special file',
  'executable-binary': 'Contains a program file',
  'unknown-binary': 'Contains a file that is not text',
  'needs-plugin': 'Needs files its plugin provides',
  'escapes-folder-code': 'Uses files outside its own folder',
};
const SEV: Record<Finding['sev'], string> = { high: 'High', medium: 'Check', low: 'Note', info: 'Note' };

function Findings({ list }: { list: Finding[] }) {
  if (!list.length) return <p className="verdict">The safety check found nothing to flag.</p>;
  return (
    <ul className="findings">
      {list.map((f, i) => (
        <li key={i} data-sev={f.sev}>
          <span className="sev">{SEV[f.sev]}</span>
          <span><b>{RULE_TEXT[f.rule] ?? f.rule}</b> <code>{f.file}{f.line ? `:${f.line}` : ''}</code><span className="snip">{f.snippet}</span></span>
        </li>
      ))}
    </ul>
  );
}

export function AddRepo({ api, log, onClose, onAdded, closeButton }: {
  api: LoadoutApi; log: (m: string) => void; onClose: () => void; onAdded: (repo: string) => void; closeButton: ReactNode;
}) {
  const [url, setUrl] = useState('');
  const [step, setStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<RepoPreview | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());

  const check = async () => {
    setError(null);
    setPreview(null);
    setStep('Fetching');
    try {
      const p = await api.previewRepo(url, (pr) => { setStep(pr.step); if (pr.message) log(pr.message); });
      setPreview(p);
      // Preselect skills with nothing flagged high; anything flagged is the user's call.
      setChosen(new Set(p.skills.filter((s) => !s.problem && !s.findings.some((f) => f.sev === 'high')).map((s) => s.path)));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setStep(null);
    }
  };

  const add = async () => {
    if (!preview) return;
    try {
      await api.addRepo(preview.repo, preview.sha, [...chosen]);
      log(`Added ${plural(chosen.size, 'skill')} from ${preview.repo} at ${preview.sha.slice(0, 7)}`);
      onAdded(preview.repo);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const toggle = (p: string) => setChosen((c) => { const n = new Set(c); if (n.has(p)) n.delete(p); else n.add(p); return n; });

  return (
    <>
      <div className="acts"><span className="srcl">Repos</span>{closeButton}</div>
      <div><h2>Add a repo</h2></div>
      <p className="note">Paste a GitHub link. Loadout downloads the repo, reads every file in every skill and shows what its safety check flags. Nothing is installed until you press Install on a skill.</p>
      <form className="addform" onSubmit={(e) => { e.preventDefault(); if (url.trim() && !step) check(); }}>
        <input type="text" aria-label="GitHub repo" placeholder="https://github.com/owner/repo" value={url} data-fk="add:url" autoFocus onChange={(e) => setUrl(e.target.value)} />
        <button type="submit" className="btn primary" disabled={!url.trim() || !!step}>Check repo</button>
      </form>
      {step && <p className="prog" role="status">{step}</p>}
      {error && <p className="verdict warn" role="alert">{error}</p>}
      {preview && (
        <section>
          <h3>{plural(preview.skills.length, 'skill')} in {preview.repo} at <code>{preview.sha.slice(0, 7)}</code></h3>
          {!preview.skills.length && <p className="verdict">This repo has no folder with a SKILL.md.</p>}
          <ul className="picks">
            {preview.skills.map((s) => {
              const high = s.findings.filter((f) => f.sev === 'high').length;
              return (
                <li key={s.path}>
                  <label className="pick">
                    <input type="checkbox" checked={chosen.has(s.path)} disabled={!!s.problem} onChange={() => toggle(s.path)} />
                    <span>
                      <b>{s.id}</b> <span className="dim">{s.path === '.' ? 'repo root' : s.path}</span>
                      <span className="pickmeta">{plural(s.nfiles, 'file')}, {fmtB(s.bytes)}{s.runs ? `, ${plural(s.runs, 'script')}` : ''}{high ? `, ${high} flagged high` : s.findings.length ? `, ${plural(s.findings.length, 'note')}` : ''}</span>
                    </span>
                  </label>
                  {s.problem && <p className="verdict warn">{s.problem}</p>}
                  <details>
                    <summary>Safety check and SKILL.md</summary>
                    <Findings list={s.findings} />
                    <pre className="seen" tabIndex={0} aria-label={`${s.id} SKILL.md`}>{s.skillMd}</pre>
                  </details>
                </li>
              );
            })}
          </ul>
          <div className="acts">
            <button type="button" className="btn primary" disabled={!chosen.size} onClick={add}>Add {plural(chosen.size, 'skill')}</button>
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
          </div>
          <p className="note">Added skills show as “Added by you” and stay pinned to this commit until you update them.</p>
        </section>
      )}
    </>
  );
}

export function UpdatePanel({ api, info, onUpdate }: { api: LoadoutApi; info: UpdateInfo; onUpdate: () => void }) {
  const [preview, setPreview] = useState<UpdatePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => { setPreview(null); setError(null); }, [info.key, info.to]);

  const review = async () => {
    setLoading(true);
    setError(null);
    try { setPreview(await api.previewUpdate(info.key)); } catch (e) { setError((e as Error).message); } finally { setLoading(false); }
  };

  const list = (label: string, items: string[]) => items.length > 0 && (
    <div className="difflist"><b>{label} ({items.length})</b><ul>{items.slice(0, 40).map((p) => <li key={p}><code>{p}</code></li>)}{items.length > 40 && <li className="dim">and {items.length - 40} more</li>}</ul></div>
  );

  return (
    <section className="update">
      <h3>Update available</h3>
      <p className="note">From <code>{info.from.slice(0, 7)}</code> to <code>{info.to.slice(0, 7)}</code>. Review what changes before you update. The old copy goes to .trash.</p>
      {!preview && <button type="button" className="btn" disabled={loading} onClick={review}>{loading ? 'Checking' : 'Review update'}</button>}
      {error && <p className="verdict warn" role="alert">{error}</p>}
      {preview && (
        <>
          <p className="verdict">{plural(preview.changed.length, 'file')} changed, {preview.added.length} added, {preview.removed.length} removed, {preview.same} the same.</p>
          {list('Changed', preview.changed)}
          {list('Added', preview.added)}
          {list('Removed', preview.removed)}
          <h3>Safety check of the new version</h3>
          <Findings list={preview.findings} />
          <div className="acts"><button type="button" className="btn primary" onClick={onUpdate}>Update</button></div>
        </>
      )}
    </section>
  );
}
