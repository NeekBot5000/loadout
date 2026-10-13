// Read-only catalog browser. Data is built from catalog/catalog.json by site/build.mjs.
(function () {
  const $ = (s) => document.querySelector(s);
  const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmtB = (b) => (b < 1024 ? b + ' B' : b < 1048576 ? (b / 1024).toFixed(b < 10240 ? 1 : 0) + ' KB' : (b / 1048576).toFixed(1) + ' MB');
  const plural = (n, w) => n + ' ' + (n === 1 ? w : w + 's');
  const KIND = { documents: 'Documents', design: 'Design', building: 'Building', writing: 'Writing', research: 'Research', guidance: 'Guidance', selling: 'Selling', games: 'Games' };
  const ICON = {
    a: '<svg class="tier t-anthropic" viewBox="0 0 10 10" aria-hidden="true"><path d="M5 .5 9.5 5 5 9.5.5 5z" fill="currentColor"/></svg>',
    c: '<svg class="tier t-community" viewBox="0 0 10 10" aria-hidden="true"><path d="M5 1 9 5 5 9 1 5z" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>',
  };
  const PAGE = 200;
  const repo = (window.LOADOUT_SITE || {}).repo || '';

  let all = [];
  let view = 'all';
  let shown = PAGE;
  let sel = null;

  function inView(s, v) {
    if (v === 'all') return true;
    if (v === 'scripts') return s.x > 0;
    if (v.startsWith('src:')) return s.t === v.slice(4);
    if (v.startsWith('repo:')) return s.r === v.slice(5);
    return s.kind === v;
  }

  function filtered() {
    const q = $('#q').value.trim().toLowerCase();
    return all.filter((s) => inView(s, view) && (!q || s.search.includes(q)));
  }

  function rail() {
    const groups = [
      ['Library', [['all', 'All skills'], ['scripts', 'Runs scripts']]],
      ['Source', [['src:a', 'Anthropic'], ['src:c', 'Community']]],
      ['Kind', Object.entries(KIND).filter(([k]) => all.some((s) => s.kind === k))],
    ];
    $('#rail').innerHTML = groups.map(([g, items]) => `<h2>${g}</h2>` + items.map(([k, l]) =>
      `<button type="button" data-view="${k}" aria-pressed="${view === k}"><span>${l}</span><span class="n num">${all.filter((s) => inView(s, k)).length}</span></button>`).join('')).join('');
  }

  function rows() {
    const list = filtered();
    $('#count').textContent = plural(list.length, 'skill');
    $('#rows').innerHTML = list.slice(0, shown).map((s) => `<tr class="row" tabindex="0" data-k="${esc(s.k)}" aria-selected="${s.k === sel}">
      <td><div class="nm">${esc(s.id)}</div><div class="bl">${esc(s.b)}</div></td>
      <td class="c-src"><span class="srcl" title="${esc(s.r)}">${ICON[s.t]}${s.t === 'a' ? 'Anthropic' : 'Community'}</span></td>
      <td class="c-tok r num">${s.tok}</td>
      <td class="c-files r num">${s.f}${s.x ? `<span class="flag">${plural(s.x, 'script')}</span>` : ''}</td></tr>`).join('');
    $('#more').innerHTML = list.length > shown
      ? `<button type="button" class="btn sm" id="showmore">Show ${Math.min(PAGE, list.length - shown)} more</button>`
      : list.length ? '' : 'No skills match. Check the spelling, or clear the search.';
  }

  function inspector(s) {
    const url = `https://github.com/${s.r}/tree/${s.ref}${s.p === '.' ? '' : '/' + s.p}`;
    const tree = (s.tr || []).map((t) => `<li><span class="p">${esc(t.p)}</span><span class="m">${t.k === 'dir' ? plural(t.n, 'file') + ', ' : ''}${fmtB(t.b)}${t.x ? ` <span class="flag">${t.k === 'dir' ? plural(t.x, 'script') : 'script'}</span>` : ''}</span></li>`).join('');
    $('#insp').innerHTML = `
      <div><span class="srcl">${ICON[s.t]}${s.t === 'a' ? 'Anthropic' : 'Community'} skill${KIND[s.kind] ? ', ' + KIND[s.kind].toLowerCase() : ''}</span></div>
      <div><h2>${esc(s.id)}</h2>
        <a href="${esc(url)}" rel="noopener">View on GitHub</a>
        <span class="repo">${esc(s.r)}</span><span class="repo">${s.p === '.' ? 'repo root' : 'folder ' + esc(s.p)} at ${esc(s.ref.slice(0, 7))}</span></div>
      <section><h3>What Claude sees</h3><pre class="seen" tabindex="0" aria-label="Skill name and description"><span>name:</span> ${esc(s.id)}\n<span>description:</span> ${esc(s.d)}</pre>
        <p class="note">About ${s.tok} tokens when on, ${Math.ceil(s.id.length / 4) + 1} as name only. Estimates.</p></section>
      <section><h3>Files in this skill</h3>
        ${s.x ? `<p class="warn">${plural(s.x, 'file')} in this skill can run code on your computer. Read ${s.x === 1 ? 'it' : 'them'} before you install.</p>` : '<p class="note">Instructions only. No files that run code.</p>'}
        ${s.w && s.w.length ? `<ul class="cautions">${s.w.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}
        <ul class="tree">${tree}</ul>
        <p class="note">${plural(s.f, 'file')}, ${fmtB(s.by)} in total.</p></section>
      <p><a class="btn primary" href="https://github.com/${esc(repo)}/releases/latest">Download for Windows</a></p>
      <p class="note">Install this skill from Loadout's catalog with one click.</p>
      <div class="ad" id="ad-slot" hidden></div>`;
    if (window.loadoutAds) window.loadoutAds.mount(document.getElementById('ad-slot'));
  }

  function select(k) {
    sel = k;
    const s = all.find((x) => x.k === k);
    if (!s) return;
    document.querySelectorAll('tr.row').forEach((r) => r.setAttribute('aria-selected', String(r.dataset.k === k)));
    inspector(s);
    history.replaceState(null, '', '#' + encodeURIComponent(k));
  }

  document.addEventListener('click', (e) => {
    const v = e.target.closest('[data-view]');
    if (v) { view = v.dataset.view; shown = PAGE; rail(); rows(); return; }
    if (e.target.closest('#showmore')) { shown += PAGE; rows(); return; }
    const r = e.target.closest('tr.row');
    if (r) select(r.dataset.k);
  });
  document.addEventListener('keydown', (e) => {
    const r = e.target.closest && e.target.closest('tr.row');
    if (r && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); select(r.dataset.k); }
    if (r && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      const n = e.key === 'ArrowDown' ? r.nextElementSibling : r.previousElementSibling;
      if (n) { n.focus(); select(n.dataset.k); }
    }
    if (e.key === '/' && e.target.tagName !== 'INPUT') { e.preventDefault(); $('#q').focus(); }
  });
  $('#q').addEventListener('input', () => { shown = PAGE; rows(); });

  fetch('catalog-data.json').then((r) => r.json()).then((data) => {
    all = data.map((s) => ({ ...s, search: `${s.id} ${s.b} ${s.d} ${s.r}`.toLowerCase() }));
    rail();
    rows();
    fromHash();
  });

  // Links like catalog.html#owner/repo:path open that skill, on load and when the hash changes.
  function fromHash() {
    const want = decodeURIComponent(location.hash.slice(1));
    if (want && want !== sel && all.some((s) => s.k === want)) select(want);
  }
  window.addEventListener('hashchange', fromHash);
})();
