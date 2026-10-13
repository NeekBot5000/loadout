// Port of docs/loadout.html. Markup, class names, copy and keyboard behavior match the prototype;
// state lives here and every change to disk goes through window.loadout.
//
// Rows are identified by Skill.key (unique). Skill.id is the folder name: it is what the user sees
// and what lands in ~/.claude/skills, and two catalog entries can share one.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import type { CatalogNote, LoadoutApi, Mode, Skill, UpdateInfo } from '../shared/api';
import { AddRepo, UpdatePanel } from './panels';

type SortKey = 'state' | 'name' | 'tok' | 'files';
type Busy = { pct: number; step: string; target: Mode };
type Profile = { name: string; set: Record<string, Mode> };
type LogLine = { k: number; t: string; m: string };
let logSeq = 0;

export const KIND_LABEL: Record<string, string> = {
  documents: 'Documents', design: 'Design', building: 'Building', writing: 'Writing', research: 'Research',
  guidance: 'Guidance', selling: 'Selling', games: 'Games',
};

const fmtN = (n: number) => n.toLocaleString('en-US');
const fmtB = (b: number) => (b < 1024 ? b + ' B' : b < 1048576 ? (b / 1024).toFixed(b < 10240 ? 1 : 0) + ' KB' : (b / 1048576).toFixed(1) + ' MB');
const plural = (n: number, w: string, p?: string) => n + ' ' + (n === 1 ? w : p || w + 's');
const now = () => new Date().toTimeString().slice(0, 8);
const modeWord = (m: Mode) => (m === 'on' ? 'on' : m === 'name' ? 'name only' : 'off');
/** data-set="<key>:<mode>"; keys contain colons, modes do not. */
const splitSet = (v: string): [string, Mode] => { const i = v.lastIndexOf(':'); return [v.slice(0, i), v.slice(i + 1) as Mode]; };
const MOBILE = '(max-width:760px)';
const NEW_PROFILE = '__new';

function useMobile() {
  const [m, setM] = useState(() => window.matchMedia(MOBILE).matches);
  useEffect(() => {
    const mq = window.matchMedia(MOBILE);
    const on = () => setM(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return m;
}

/** Source markers: shape plus text, never color alone. */
function TierIcon({ tier }: { tier: Skill['tier'] }) {
  switch (tier) {
    case 'anthropic':
      return <svg className="tier t-anthropic" viewBox="0 0 10 10" aria-hidden="true"><path d="M5 .5 9.5 5 5 9.5.5 5z" fill="currentColor" /></svg>;
    case 'community':
      return <svg className="tier t-community" viewBox="0 0 10 10" aria-hidden="true"><path d="M5 1 9 5 5 9 1 5z" fill="none" stroke="currentColor" strokeWidth="1.4" /></svg>;
    case 'yours':
      return <svg className="tier t-yours" viewBox="0 0 10 10" aria-hidden="true"><rect x="1.8" y="1.8" width="6.4" height="6.4" fill="currentColor" /></svg>;
    default:
      return <svg className="tier t-sample" viewBox="0 0 10 10" aria-hidden="true"><path d="M5 1 9 5 5 9 1 5z" fill="none" stroke="currentColor" strokeWidth="1.2" strokeDasharray="2 1.4" /></svg>;
  }
}
const tierName = (t: Skill['tier']) => ({ anthropic: 'Anthropic', community: 'Community', added: 'Added by you', yours: 'Yours', sample: 'Sample' })[t];

export function App({ api }: { api: LoadoutApi }) {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [note, setNote] = useState<CatalogNote | null>(null);
  const [view, setView] = useState('all');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<{ k: SortKey; dir: number }>({ k: 'state', dir: 1 });
  const [sel, setSel] = useState('');
  const [mode, setModeMap] = useState<Record<string, Mode>>({});
  const [busy, setBusy] = useState<Record<string, Busy>>({});
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [profile, setProfile] = useState('');
  /** Inline "new profile" name field, shown in place of the unsaved-changes buttons. */
  const [naming, setNaming] = useState<string | null>(null);
  const [budget, setBudget] = useState(1500);
  const budgetTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [drawer, setDrawer] = useState<null | 'context' | 'log'>(null);
  const [sheet, setSheet] = useState(false);
  /** The inspector shows a skill, or the Add repo panel. */
  const [panel, setPanel] = useState<null | 'add'>(null);
  const [updates, setUpdates] = useState<Record<string, UpdateInfo>>({});
  const [logLines, setLog] = useState<LogLine[]>([]);
  const [status, setStatus] = useState('');
  const mobile = useMobile();
  const searchRef = useRef<HTMLInputElement>(null);
  const pendingFocus = useRef<string | null>(null);
  // The mode an in-flight install should land in. A profile applied mid-install can change it.
  const targets = useRef<Record<string, Mode>>({});

  // Latest values for handlers registered once on document.
  const live = useRef({ mode, busy, sel, sheet, drawer, mobile });
  live.current = { mode, busy, sel, sheet, drawer, mobile };

  const byKey = useMemo(() => Object.fromEntries(skills.map((s) => [s.key, s])), [skills]);
  const isInst = (key: string) => key in mode;
  const nameOf = (key: string) => byKey[key]?.id ?? key;
  /** Folder names taken by an installed skill: key of the installed one, by folder. */
  const takenBy = useMemo(() => {
    const m: Record<string, string> = {};
    for (const k of Object.keys(mode)) { const s = byKey[k]; if (s) m[s.id] = k; }
    for (const k of Object.keys(busy)) { const s = byKey[k]; if (s && !m[s.id]) m[s.id] = k; }
    return m;
  }, [mode, busy, byKey]);
  const blockedBy = (s: Skill) => { const k = takenBy[s.id]; return k && k !== s.key ? byKey[k] : undefined; };

  const log = useCallback((m: string) => {
    setLog((l) => [{ k: ++logSeq, t: now(), m }, ...l].slice(0, 80));
    setStatus(m);
    api.note(m).catch(() => { /* the on-screen log still has it */ });
  }, [api]);
  const focusFk = (fk: string) => { pendingFocus.current = fk; };
  useLayoutEffect(() => {
    if (!pendingFocus.current) return;
    const n = document.querySelector<HTMLElement>(`[data-fk="${CSS.escape(pendingFocus.current)}"]`);
    pendingFocus.current = null;
    if (n) {
      n.focus({ preventScroll: true });
      if (n.matches('tr.row')) n.scrollIntoView({ block: 'nearest' });
    }
  });

  useEffect(() => {
    (async () => {
      try {
        const [{ skills, note }, inst, ps, past] = await Promise.all([api.catalog(), api.installed(), api.profiles(), api.activity()]);
        setSkills(skills);
        setNote(note);
        setModeMap(inst);
        setProfiles(ps.profiles);
        setProfile(ps.active ?? '');
        setBudget(ps.budget);
        setSel((cur) => cur || (skills.find((s) => s.id === 'docx' && s.tier !== 'yours') ?? skills[0])?.key || '');
        const community = new Set(skills.filter((s) => s.tier === 'community').map((s) => s.repo)).size;
        const yours = skills.filter((s) => s.tier === 'yours').length;
        const opening = `Read ${skills.filter((s) => s.tier === 'anthropic').length} skills from ${note.repo} (commit ${note.sha})${community ? `, ${skills.filter((s) => s.tier === 'community').length} from ${community} community repos` : ''}${yours ? `, and ${plural(yours, 'skill')} of yours` : ''}`;
        setLog([{ k: ++logSeq, t: now(), m: opening }, ...past.map((x) => ({ k: ++logSeq, t: new Date(x.t).toTimeString().slice(0, 8), m: x.m }))].slice(0, 80));
        const active = ps.active && ps.profiles[ps.active];
        refreshUpdates();
        setStatus(active ? `Profile “${active.name}” is active` : `${plural(Object.keys(inst).length, 'skill')} in ~/.claude/skills`);
      } catch (e) {
        log(`Could not load skills: ${(e as Error).message}`);
      }
    })();
  }, [api, log]);

  /* ---------- views, filtering, sorting ---------- */
  const has = (t: Skill['tier']) => skills.some((s) => s.tier === t);
  const VIEWS: { g: string; items: [string, string][] }[] = [
    { g: 'Library', items: [['all', 'All skills'], ['installed', 'Installed'], ['available', 'Available'], ['scripts', 'Runs scripts'], ...(Object.keys(updates).length ? [['updates', 'Updates'] as [string, string]] : [])] },
    { g: 'Source', items: ([['src:anthropic', 'Anthropic'], ['src:community', 'Community'], ['src:added', 'Added by you'], ['src:yours', 'Yours'], ['src:sample', 'Samples']] as [string, string][]).filter(([k]) => has(k.slice(4) as Skill['tier'])) },
    { g: 'Kind', items: Object.entries(KIND_LABEL).filter(([k]) => skills.some((s) => s.kind === k)) },
  ];
  const inView = (s: Skill, v: string) => {
    switch (v) {
      case 'all': return true;
      case 'installed': return isInst(s.key);
      case 'available': return !isInst(s.key);
      case 'scripts': return s.runs > 0;
      case 'updates': return s.key in updates;
      default:
        if (v.startsWith('src:')) return s.tier === v.slice(4);
        return s.kind === v;
    }
  };
  const visible = () => {
    const qq = q.trim().toLowerCase();
    let list = skills.filter((s) => inView(s, view));
    if (qq) list = list.filter((s) => (s.id + ' ' + s.blurb + ' ' + s.desc + ' ' + s.repo).toLowerCase().includes(qq));
    const rank = (s: Skill) => (!isInst(s.key) ? 2 : mode[s.key] === 'off' ? 1 : 0);
    const key: Record<SortKey, (s: Skill) => string | number> = { state: rank, name: (s) => s.id, tok: (s) => s.tok, files: (s) => s.nfiles };
    const f = key[sort.k];
    return [...list].sort((a, b) => { const x = f(a), y = f(b); return (x < y ? -1 : x > y ? 1 : a.id.localeCompare(b.id) || a.key.localeCompare(b.key)) * sort.dir; });
  };
  const list = visible();
  const visRef = useRef<string[]>([]);
  visRef.current = list.map((s) => s.key);

  /* ---------- context meter ---------- */
  const usage = () => {
    const segs: { key: string; name: string; t: number; m: Mode }[] = [];
    let total = 0;
    for (const s of skills) {
      if (!isInst(s.key)) continue;
      const m = mode[s.key];
      if (m === 'off') continue;
      const t = m === 'on' ? s.tok : s.nameTok;
      segs.push({ key: s.key, name: s.id, t, m });
      total += t;
    }
    segs.sort((a, b) => b.t - a.t || a.name.localeCompare(b.name));
    return { segs, total };
  };
  const u = usage();
  const bar = (interactive: boolean) => {
    const scale = Math.max(budget, u.total, 1);
    let cum = 0;
    const out: ReactNode[] = u.segs.map((g) => {
      cum += g.t;
      const cls = ['sg', cum > budget ? 'over' : '', g.key === sel ? 'sel' : ''].join(' ').trim();
      const title = `${g.name}: ${g.t} tokens (${g.m === 'on' ? 'on' : 'name only'})`;
      return interactive
        ? <button key={g.key} type="button" tabIndex={-1} className={cls} data-seg={g.key} aria-label={`${g.name}, ${g.t} tokens`} style={{ flex: `${g.t} 1 0` }} title={title} onClick={() => select(g.key)} />
        : <span key={g.key} className={cls} style={{ flex: `${g.t} 1 0` }} title={title} />;
    });
    out.push(<span key="rest" className="sg-rest" style={{ flex: `${Math.max(0, scale - u.total)} 1 0` }} />);
    out.push(<span key="mark" className="mark" style={{ left: `calc(${((budget / scale) * 100).toFixed(2)}% - 1px)` }} title={`Your target: ${fmtN(budget)} tokens`} />);
    return out;
  };

  /* ---------- actions ---------- */
  const setMode = (key: string, m: Mode, focus?: string) => {
    if (!(key in live.current.mode)) return;
    const prev = live.current.mode[key];
    setModeMap((x) => ({ ...x, [key]: m }));
    log(`${nameOf(key)} set to ${modeWord(m)}`);
    if (focus) focusFk(focus);
    api.setModes({ [key]: m }).catch((e) => {
      setModeMap((x) => ({ ...x, [key]: prev }));
      log(`Could not change ${nameOf(key)}: ${e.message}`);
    });
  };

  const startInstall = (key: string, target: Mode = 'on', delay = 0) => {
    const s = byKey[key];
    if (!s || key in live.current.mode || live.current.busy[key]) return;
    if (blockedBy(s)) { log(`${s.id} is already installed from ${blockedBy(s)!.repo || 'your own folder'}. Remove it first.`); return; }
    targets.current[key] = target;
    setBusy((b) => ({ ...b, [key]: { pct: 0, step: 'Waiting', target } }));
    setTimeout(async () => {
      try {
        await api.install(key, (p) => {
          setBusy((b) => (b[key] ? { ...b, [key]: { ...b[key], step: p.step === 'Done' ? 'Writing' : p.step, pct: p.pct } } : b));
          if (p.message) log(p.message);
        });
        const tg = targets.current[key] ?? target;
        delete targets.current[key];
        if (tg !== 'on') await api.setModes({ [key]: tg });
        setBusy((b) => { const { [key]: _, ...rest } = b; return rest; });
        setModeMap((x) => ({ ...x, [key]: tg }));
        log(`Installed ${s.id}${tg === 'on' ? '' : tg === 'name' ? ' (name only)' : ' (off)'}`);
      } catch (e) {
        delete targets.current[key];
        setBusy((b) => { const { [key]: _, ...rest } = b; return rest; });
        log(`Could not install ${s.id}: ${(e as Error).message}`);
      }
    }, delay);
  };

  const removeSkill = async (key: string) => {
    if (!isInst(key)) return;
    try {
      await api.remove(key);
      setModeMap((x) => { const { [key]: _, ...rest } = x; return rest; });
      log(`Removed ${nameOf(key)} from ~/.claude/skills (kept in .trash)`);
    } catch (e) {
      log(`Could not remove ${nameOf(key)}: ${(e as Error).message}`);
    }
  };

  const currentEff = (key: string): Mode => (busy[key] ? busy[key].target : isInst(key) ? mode[key] : 'off');
  const isDirty = () => {
    const p = profiles[profile];
    return !!p && skills.some((s) => currentEff(s.key) !== (p.set[s.key] || 'off'));
  };

  /**
   * The main process installs what the profile needs, then writes every mode in one settings write.
   * Modes of skills already installed change on screen at once; rows being installed show progress.
   */
  const applyProfile = async (pid: string) => {
    const p = profiles[pid];
    if (!p) return;
    setProfile(pid);
    const nextMode = { ...mode };
    const expected: Record<string, Busy> = {};
    for (const s of skills) {
      const want = p.set[s.key] || 'off';
      if (isInst(s.key)) nextMode[s.key] = want;
      else if (want !== 'off' && !busy[s.key] && !blockedBy(s)) expected[s.key] = { pct: 0, step: 'Waiting', target: want };
    }
    setModeMap(nextMode);
    setBusy((b) => ({ ...b, ...expected }));
    const queued = Object.keys(expected).length;
    log(`Applying profile “${p.name}”${queued ? `: installing ${queued}` : ''}`);
    try {
      const r = await api.applyProfile(pid, (pr) => {
        if (pr.step === 'Done') setBusy((b) => { const { [pr.key]: _, ...rest } = b; return rest; });
        else setBusy((b) => ({ ...b, [pr.key]: { ...(b[pr.key] ?? { target: p.set[pr.key] ?? 'on' }), step: pr.step, pct: pr.pct } }));
        if (pr.message) log(pr.message);
      });
      log(`Applied profile “${p.name}”: changed ${r.changed}, installed ${r.installed.length}`);
      for (const f of r.failed) log(`Could not install ${f}`);
      if (r.missing.length) log(`Not available any more: ${r.missing.map(nameOf).join(', ')}`);
    } catch (e) {
      log(`Could not apply profile “${p.name}”: ${(e as Error).message}`);
    } finally {
      setBusy((b) => Object.fromEntries(Object.entries(b).filter(([k]) => !(k in expected))));
      setModeMap(await api.installed());
    }
  };

  const currentSet = () => {
    const set: Record<string, Mode> = {};
    for (const s of skills) { const e = currentEff(s.key); if (e !== 'off') set[s.key] = e; }
    return set;
  };

  const saveProfile = async () => {
    const p = profiles[profile];
    if (!p) return;
    try {
      await api.saveProfile(profile, p.name, currentSet());
      setProfiles((await api.profiles()).profiles);
      log(`Saved profile “${p.name}”`);
    } catch (e) {
      log(`Could not save profile: ${(e as Error).message}`);
    }
  };

  const createProfile = async (name: string) => {
    try {
      const id = await api.saveProfile(null, name.trim(), currentSet());
      const ps = await api.profiles();
      setProfiles(ps.profiles);
      setProfile(id);
      setNaming(null);
      log(`Saved profile “${ps.profiles[id]?.name ?? name}”`);
      focusFk('p:select');
    } catch (e) {
      setStatus(`Could not save profile: ${(e as Error).message}`);
    }
  };

  const changeBudget = (n: number) => {
    setBudget(n);
    clearTimeout(budgetTimer.current);
    budgetTimer.current = setTimeout(() => { api.setBudget(n).catch(() => {}); }, 400);
  };

  const select = (key: string, focusRow = false) => {
    setSel(key);
    setPanel(null);
    if (live.current.mobile) { setSheet(true); focusFk('sheetclose'); }
    if (focusRow) focusFk(`row:${key}`);
  };
  const closeSheet = () => {
    setSheet(false);
    focusFk(`row:${live.current.sel}`);
  };

  /* ---------- document-level events ---------- */
  const handlers = useRef({ closeSheet, setMode, startInstall, select });
  handlers.current = { closeSheet, setMode, startInstall, select };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const tag = (t.tagName || '').toLowerCase();
      const typing = tag === 'input' || tag === 'select' || tag === 'textarea';
      const L = live.current, H = handlers.current;
      if (e.key === 'Escape') {
        if (L.drawer) { setDrawer(null); return; }
        if (L.sheet && L.mobile) { H.closeSheet(); return; }
        if (tag === 'input' && t.id === 'q') { setQ(''); (t as HTMLInputElement).blur(); return; }
      }
      const rg = t.closest?.('[role="radiogroup"]');
      if (rg && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        e.preventDefault();
        const order: Mode[] = ['on', 'name', 'off'];
        const [key] = splitSet(rg.querySelector<HTMLElement>('[data-set]')!.dataset.set as string);
        const cur = order.indexOf(L.mode[key]);
        const nx = order[(cur + (e.key === 'ArrowRight' ? 1 : 2)) % 3];
        const g = rg.closest('#insp') ? 'im' : 'm';
        H.setMode(key, nx, `${g}:${key}:${nx}`);
        return;
      }
      if (typing) return;
      if (e.key === '/' && !e.ctrlKey && !e.metaKey) { e.preventDefault(); searchRef.current?.focus(); return; }
      const onRow = t.matches?.('tr.row');
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (!(onRow || t === document.body)) return;
        e.preventDefault();
        const keys = visRef.current;
        if (!keys.length) return;
        let i = keys.indexOf(L.sel);
        i = i < 0 ? 0 : Math.max(0, Math.min(keys.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)));
        setSel(keys[i]);
        pendingFocus.current = `row:${keys[i]}`;
        return;
      }
      if (onRow && (e.key === ' ' || e.key === 'Enter')) {
        e.preventDefault();
        const key = t.dataset.key as string;
        if (!(key in L.mode) && !L.busy[key]) H.startInstall(key);
        else if (e.key === ' ' && key in L.mode) H.setMode(key, L.mode[key] === 'off' ? 'on' : 'off');
      }
    };
    const onClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (live.current.drawer && !t.closest('.drawer') && !t.closest('#status')) setDrawer(null);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('click', onClick);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('click', onClick); };
  }, []);

  /* ---------- pieces ---------- */
  const stop = (fn: () => void) => (e: { stopPropagation(): void }) => { e.stopPropagation(); fn(); };

  const segCtl = (s: Skill, inInspector = false) => {
    const m = mode[s.key];
    const opts: [Mode, ReactNode, string][] = inInspector
      ? [['on', 'On', ''], ['name', 'Name only', ''], ['off', 'Off', '']]
      : [['on', 'On', 'Claude reads the full description'], ['name', <>Name<span className="only"> only</span></>, 'Claude sees only the name'], ['off', 'Off', 'Claude does not see this skill']];
    const pre = inInspector ? 'im' : 'm';
    return (
      <div className="seg3 ctl" role="radiogroup" aria-label={`${s.id} state`}>
        {opts.map(([k, l, title]) => (
          <button key={k} type="button" role="radio" aria-checked={m === k} data-m={k} data-set={`${s.key}:${k}`} data-fk={`${pre}:${s.key}:${k}`}
            title={title || undefined} aria-label={inInspector ? undefined : k === 'name' ? 'Name only' : (l as string)} tabIndex={m === k ? 0 : -1}
            onClick={stop(() => setMode(s.key, k))}>{l}</button>
        ))}
      </div>
    );
  };

  const rowCtl = (s: Skill) => {
    if (busy[s.key]) return <span className="prog">{busy[s.key].step}</span>;
    if (isInst(s.key)) return segCtl(s);
    const other = blockedBy(s);
    if (other) return <span className="taken" title={`${s.id} is installed from ${other.repo || 'your own folder'}. Only one skill can use a name.`}>Name taken</span>;
    return <button type="button" className="btn sm ctl" data-install={s.key} data-fk={`inst:${s.key}`} onClick={stop(() => startInstall(s.key))}>Install</button>;
  };

  const tokCell = (s: Skill) => {
    const inst = isInst(s.key), m = mode[s.key];
    const title = !inst ? `Would cost about ${s.tok} tokens if turned on` : m === 'off' ? 'Costs nothing while off' : `About ${m === 'name' ? s.nameTok : s.tok} tokens`;
    const val = !inst ? s.tok : m === 'on' ? s.tok : m === 'name' ? s.nameTok : 0;
    return <td className={`c-tok r num${!inst || m === 'off' ? ' dim' : ''}`} title={title}>{val}</td>;
  };

  const selVisible = list.some((s) => s.key === sel);
  const s = byKey[sel];
  const over = u.total - budget;
  const sortAttr = (k: SortKey) => (sort.k === k ? (sort.dir > 0 ? 'ascending' : 'descending') : undefined);
  const clickSort = (k: SortKey) => setSort((cur) => (cur.k === k ? { k, dir: -cur.dir } : { k, dir: k === 'name' || k === 'state' ? 1 : -1 }));

  const refreshUpdates = () => {
    api.updates().then((list) => {
      setUpdates(Object.fromEntries(list.map((x) => [x.key, x])));
      if (list.length) log(`${plural(list.length, 'update')} available`);
    }).catch(() => { /* offline: try again next launch */ });
  };

  /** Catalog and installed state again, after something changed what is listed. */
  const reload = async () => {
    const [{ skills }, inst] = await Promise.all([api.catalog(), api.installed()]);
    setSkills(skills);
    setModeMap(inst);
    return skills;
  };

  const afterAdd = async (repo: string) => {
    const fresh = await reload();
    setPanel(null);
    setView('src:added');
    const first = fresh.find((x) => x.repo === repo && x.tier === 'added');
    if (first) { setSel(first.key); focusFk(`row:${first.key}`); }
  };

  const removeRepo = async (repo: string) => {
    try {
      await api.removeRepo(repo);
      await reload();
      log(`Took ${repo} off the list. Skills you installed from it stay installed.`);
    } catch (e) {
      log(`Could not take ${repo} off the list: ${(e as Error).message}`);
    }
  };

  const runUpdate = async (key: string) => {
    const name = nameOf(key);
    setBusy((b) => ({ ...b, [key]: { pct: 0, step: 'Waiting', target: mode[key] ?? 'on' } }));
    try {
      await api.update(key, (p) => {
        setBusy((b) => (b[key] ? { ...b, [key]: { ...b[key], step: p.step === 'Done' ? 'Writing' : p.step, pct: p.pct } } : b));
        if (p.message) log(p.message);
      });
      setUpdates((u) => { const { [key]: _, ...rest } = u; return rest; });
      await reload();
      log(`Updated ${name}. The old copy is in ~/.claude/skills/.trash`);
    } catch (e) {
      log(`Could not update ${name}: ${(e as Error).message}`);
    } finally {
      setBusy((b) => { const { [key]: _, ...rest } = b; return rest; });
    }
  };

  const sheetClose = <button type="button" className="btn sm sheet-close" data-sheet-close data-fk="sheetclose" onClick={closeSheet}>Close</button>;

  const inspector = () => {
    if (panel === 'add') return <AddRepo api={api} log={log} onClose={() => { setPanel(null); focusFk('v:add'); }} onAdded={afterAdd} closeButton={sheetClose} />;
    if (!s) return null;
    const inst = isInst(s.key), m = mode[s.key] || 'off';
    const other = blockedBy(s);
    const src = s.tier === 'sample'
      ? <span className="repo">Sample entry. There is no repository behind it.</span>
      : s.tier === 'yours'
        ? <span className="repo">Your own skill. Loadout did not install it and will not remove it.</span>
        : <><a href={s.url} target="_blank" rel="noreferrer">View on GitHub</a><span className="repo">{s.repo}</span><span className="repo">folder {s.path ?? `skills/${s.id}`}</span>{s.tier === 'added' && <span><button type="button" className="linkbtn" onClick={() => removeRepo(s.repo)}>Take {s.repo} off the list</button></span>}</>;
    const verdict = s.runs
      ? <p className="verdict warn">{plural(s.runs, 'file')} in this skill can run code on your computer.{inst ? '' : ' Read ' + (s.runs === 1 ? 'it' : 'them') + ' before you install.'}</p>
      : <p className="verdict">Instructions only. This skill has no files that run code.</p>;
    const act = busy[s.key]
      ? <span className="prog">{busy[s.key].step}</span>
      : inst
        ? <>{segCtl(s, true)}{s.tier !== 'yours' && <button type="button" className="btn" data-remove={s.key} data-fk={`rm:${s.key}`} onClick={() => removeSkill(s.key)}>Remove</button>}</>
        : other
          ? <span className="taken">Name taken by {other.repo || 'your own'} {other.id}. Remove that one to install this.</span>
          : <button type="button" className="btn primary" data-install={s.key} data-fk={`iinst:${s.key}`} onClick={() => startInstall(s.key)}>Install</button>;
    return (
      <>
        <div className="acts"><span className="srcl"><TierIcon tier={s.tier} />{tierName(s.tier)} skill{KIND_LABEL[s.kind] ? `, ${KIND_LABEL[s.kind].toLowerCase()}` : ''}</span><button type="button" className="btn sm sheet-close" data-sheet-close data-fk="sheetclose" onClick={closeSheet}>Close</button></div>
        <div><h2>{s.id}</h2><div className="meta">{src}</div></div>
        <div className="acts">{act}</div>
        {updates[s.key] && !busy[s.key] && <UpdatePanel key={s.key} api={api} info={updates[s.key]} onUpdate={() => runUpdate(s.key)} />}
        <section>
          <h3>What Claude sees</h3>
          <pre className="seen" tabIndex={0} aria-label="Skill name and description text"><span className="k">name:</span> {s.id}{'\n'}<span className="k">description:</span> {s.desc}</pre>
          <dl className="cost">
            <div data-cur={String(inst && m === 'on')}><dt>On</dt><dd className="num">{s.tok}</dd></div>
            <div data-cur={String(inst && m === 'name')}><dt>Name only</dt><dd className="num">{s.nameTok}</dd></div>
            <div data-cur={String(!inst || m === 'off')}><dt>Off</dt><dd className="num">0</dd></div>
          </dl>
          <p className="note">Estimated tokens Claude reads at the start of each chat.</p>
        </section>
        <section>
          <h3>Files in this skill</h3>
          {verdict}
          {!!s.warnings?.length && <ul className="cautions">{s.warnings.map((w) => <li key={w}>{w}</li>)}</ul>}
          <ul className="tree">
            {s.tree.map((t) => (
              <li key={t.p}><span className="p">{t.p}</span><span className="m">{t.k === 'dir' ? plural(t.n, 'file') + ', ' : ''}{fmtB(t.b)}</span>{t.x ? <span className="fl">{t.k === 'dir' ? plural(t.x, 'script') : 'script'}</span> : <span className="blank" />}</li>
            ))}
          </ul>
          <p className="where">{plural(s.nfiles, 'file')}, {fmtB(s.bytes)} in total. {s.tier === 'yours' ? 'Lives in' : 'Installs to'} <code>~/.claude/skills/{s.id}</code></p>
          {!!s.requires?.length && <p className="where">Works with {s.requires.map((r, i) => <span key={r}>{i ? ', ' : ''}<code>{r}</code></span>)} from the same repo. Install {s.requires.length === 1 ? 'it' : 'them'} too.</p>}
        </section>
      </>
    );
  };

  const qq = q.trim();
  const sum = u.total || 1;
  const communityRepos = new Set(skills.filter((x) => x.tier === 'community').map((x) => x.repo)).size;

  return (
    <div className={`app${api.mock ? '' : ' no-notice'}${sheet && mobile ? ' sheet' : ''}`} id="app">
      {api.mock && <aside className="notice" aria-label="Prototype notice"><b>Prototype</b>Installs are simulated, so nothing is downloaded or changed on your computer.</aside>}
      <header className="bar">
        <h1 className="brand">
          <svg width="26" height="18" viewBox="0 0 26 18" aria-hidden="true"><rect x="0" y="0" width="14" height="5" rx="1" fill="currentColor" /><rect x="0" y="6.5" width="22" height="5" rx="1" fill="currentColor" opacity=".65" /><rect x="0" y="13" width="9" height="5" rx="1" fill="currentColor" opacity=".35" /></svg>
          <span>Loadout</span>
        </h1>
        <div className="profile">
          <label htmlFor="profile">Profile</label>
          <select id="profile" data-fk="p:select" value={naming !== null ? NEW_PROFILE : profiles[profile] ? profile : ''}
            onChange={(e) => (e.target.value === NEW_PROFILE ? (setNaming(''), focusFk('p:name')) : (setNaming(null), applyProfile(e.target.value)))}>
            {!profiles[profile] && naming === null && <option value="">No profile</option>}
            {Object.entries(profiles).map(([k, p]) => <option key={k} value={k}>{p.name}</option>)}
            <option value={NEW_PROFILE}>New profile…</option>
          </select>
          <span className="mod" id="mod">
            {naming !== null
              ? <form className="newprof" onSubmit={(e) => { e.preventDefault(); if (naming.trim()) createProfile(naming); }}>
                <input type="text" data-fk="p:name" aria-label="New profile name" placeholder="Profile name" maxLength={60} value={naming}
                  onChange={(e) => setNaming(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setNaming(null); focusFk('p:select'); } }} />
                <button type="submit" className="btn sm" disabled={!naming.trim()}>Save profile</button>
                <button type="button" className="btn sm" onClick={() => { setNaming(null); focusFk('p:select'); }}>Cancel</button>
              </form>
              : isDirty() && <><b>Unsaved changes</b><button type="button" className="btn sm" data-fk="p:save" onClick={saveProfile}>Save profile</button><button type="button" className="btn sm" data-fk="p:revert" onClick={() => applyProfile(profile)}>Revert</button></>}
          </span>
        </div>
        <div className="search">
          <input ref={searchRef} id="q" type="search" placeholder="Search skills" aria-label="Search skills" autoComplete="off" value={q} onChange={(e) => setQ(e.target.value)} />
          <kbd>/</kbd>
        </div>
      </header>
      <div className="work">
        <nav className="rail" id="rail" aria-label="Views">
          {VIEWS.filter((g) => g.items.length).map((g) => (
            <RailGroup key={g.g} title={g.g}>
              {g.items.map(([k, l]) => (
                <button key={k} type="button" data-view={k} data-fk={`v:${k}`} aria-current={view === k} onClick={() => setView(k)}>
                  <span>{l}</span><span className="n">{skills.filter((x) => inView(x, k)).length}</span>
                </button>
              ))}
            </RailGroup>
          ))}
          <h2>Repos</h2>
          <button type="button" data-view="add" data-fk="v:add" aria-current={panel === 'add'} onClick={() => { setPanel('add'); if (live.current.mobile) setSheet(true); }}><span>Add repo</span><span className="n" aria-hidden="true">+</span></button>
          {note && (communityRepos
            ? <div className="src">Catalog checked on {note.date}: <code>{note.repo}</code> at commit <code>{note.sha}</code> and {communityRepos} community repos, each pinned to the commit that was checked.</div>
            : <div className="src">Catalog read from <code>{note.repo}</code>, commit <code>{note.sha}</code> from {note.date}.{has('sample') ? ' Samples are made-up entries.' : ''}</div>)}
        </nav>
        <main className="tablewrap" id="tablewrap" aria-label="Skill list">
          <table className="tbl">
            <thead><tr>
              <th className="c-state" scope="col" id="th-state" aria-sort={sortAttr('state')}><button type="button" data-sort="state" data-fk="sort:state" title="Installed skills first" onClick={() => clickSort('state')}>State</button></th>
              <th className="c-name" scope="col" id="th-name" aria-sort={sortAttr('name')}><button type="button" data-sort="name" data-fk="sort:name" onClick={() => clickSort('name')}>Skill</button></th>
              <th className="c-src" scope="col">Source</th>
              <th className="c-tok r" scope="col" id="th-tok" aria-sort={sortAttr('tok')}><button type="button" data-sort="tok" data-fk="sort:tok" title="Estimated tokens Claude reads when the skill is on" onClick={() => clickSort('tok')}>Context</button></th>
              <th className="c-files r" scope="col" id="th-files" aria-sort={sortAttr('files')}><button type="button" data-sort="files" data-fk="sort:files" onClick={() => clickSort('files')}>Files</button></th>
            </tr></thead>
            <tbody id="rows">
              {list.map((x, i) => {
                const cur = x.key === sel, b = busy[x.key];
                return (
                  <tr key={x.key} className={`row${b ? ' busy' : ''}`} data-key={x.key} data-fk={`row:${x.key}`} tabIndex={cur || (!selVisible && i === 0) ? 0 : -1}
                    aria-current={cur} style={{ '--p': `${b ? b.pct : 0}%` } as CSSProperties} onClick={() => select(x.key)}>
                    <td className="c-state">{rowCtl(x)}</td>
                    <td className="c-name"><div className="nm">{x.id}{updates[x.key] && <span className="flag upd">Update</span>}</div><div className="bl">{x.blurb}</div></td>
                    <td className="c-src"><span className="srcl" title={x.repo || undefined}><TierIcon tier={x.tier} />{tierName(x.tier)}</span></td>
                    {tokCell(x)}
                    <td className="c-files r num fcell">{x.nfiles}{x.runs ? <span className="flag">{plural(x.runs, 'script')}</span> : null}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="empty" id="empty" hidden={list.length > 0 || skills.length === 0}>
            {qq
              ? <><b>No skills match “{qq}”</b>Check the spelling, or clear the search to see this view again.</>
              : view === 'installed'
                ? <><b>Nothing installed yet</b>Open All skills and press Install on any row to add it.</>
                : <><b>Nothing in this view</b>Pick another view from the list.</>}
          </div>
          <div className="hint">
            <span><kbd>Up</kbd><kbd>Down</kbd> select</span>
            <span><kbd>Space</kbd> turn on or off</span>
            <span><kbd>Enter</kbd> install</span>
            <span><kbd>/</kbd> search</span>
          </div>
        </main>
        <aside className="insp" id="insp" aria-label="Skill details">{inspector()}</aside>
      </div>
      <footer className="status" id="status">
        <button type="button" className="meterbtn" id="meterbtn" aria-expanded={drawer === 'context'} aria-controls="dr-ctx" onClick={() => setDrawer((d) => (d === 'context' ? null : 'context'))}>
          <span className="lbl" id="meterlbl"><span className="sr">Context used: </span><strong className="num">{fmtN(u.total)}</strong> of {fmtN(budget)} tokens{over > 0 && <span className="over">Over by {fmtN(over)}</span>}</span>
          <span className="meter" id="meter" aria-hidden="true">{bar(false)}</span>
        </button>
        <span className="statusmsg" id="statusmsg" aria-live="polite">{status}</span>
        <button type="button" className="btn sm" id="logbtn" aria-expanded={drawer === 'log'} aria-controls="dr-log" onClick={() => setDrawer((d) => (d === 'log' ? null : 'log'))}>Activity</button>

        <div className="drawer" id="dr-ctx" role="region" aria-label="Context used details" hidden={drawer !== 'context'}>
          <div className="dr-head"><h3>Context used</h3><button type="button" className="btn sm" onClick={() => setDrawer(null)}>Close</button></div>
          <p>Claude keeps the name and description of every skill that is on in view at the start of each chat. Tokens are small pieces of text, about four letters each. If the list grows too long, Claude Code starts dropping descriptions, so a lower total keeps every skill working properly.</p>
          <div className="meter big" id="bigmeter">{drawer === 'context' && bar(true)}</div>
          <div className="budget">
            <label htmlFor="budget">Your target</label>
            <input type="range" id="budget" min="500" max="4000" step="100" value={budget} onChange={(e) => changeBudget(+e.target.value)} />
            <output id="budgetval" htmlFor="budget">{fmtN(budget)} tokens</output>
          </div>
          <div className="legend" id="legend">
            {drawer === 'context' && (u.segs.length
              ? u.segs.map((g) => (
                <button key={g.key} type="button" className={`lg${g.key === sel ? ' sel' : ''}`} data-seg={g.key} onClick={() => select(g.key)}>
                  <span>{g.name}</span><span>{g.m === 'on' ? 'On' : 'Name only'}</span><span>{fmtN(g.t)}</span><span>{Math.round((g.t / sum) * 100)}%</span>
                </button>))
              : <p style={{ margin: '12px 0 0', color: 'var(--ink-3)' }}>No skills are on, so Claude reads nothing extra.</p>)}
          </div>
        </div>
        <div className="drawer" id="dr-log" role="region" aria-label="Activity log" hidden={drawer !== 'log'}>
          <div className="dr-head"><h3>Activity</h3><span className="acts">{!api.mock && <button type="button" className="btn sm" onClick={() => api.openLogs()}>Open log folder</button>}<button type="button" className="btn sm" onClick={() => setDrawer(null)}>Close</button></span></div>
          <div id="loglist">{logLines.map((l) => <div key={l.k} className="logline"><time>{l.t}</time><span>{l.m}</span></div>)}</div>
        </div>
      </footer>
    </div>
  );
}

function RailGroup({ title, children }: { title: string; children: ReactNode }) {
  return <><h2>{title}</h2>{children}</>;
}
