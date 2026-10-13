// The home page demo: a slice of the app with real token estimates from the catalog.
// Changing a state redraws the meter, the way the app does.
(function () {
  const skills = [
    { id: 'docx', on: 210, mode: 'on' },
    { id: 'pdf', on: 110, mode: 'on' },
    { id: 'xlsx', on: 239, mode: 'on' },
    { id: 'frontend-design', on: 55, mode: 'name' },
    { id: 'humanizer', on: 88, mode: 'on' },
  ];
  const budget = 600;
  const nameTok = (id) => Math.ceil(id.length / 4) + 1;
  const cost = (s) => (s.mode === 'on' ? s.on : s.mode === 'name' ? nameTok(s.id) : 0);
  const rows = document.getElementById('demo-rows');
  const lbl = document.getElementById('demo-lbl');
  const meter = document.getElementById('demo-meter');
  if (!rows) return;

  const labels = { on: 'On', name: 'Name only', off: 'Off' };
  rows.innerHTML = skills.map((s, i) => `<tr>
    <td class="c-state"><div class="seg3" role="radiogroup" aria-label="${s.id} state">${['on', 'name', 'off'].map((m) =>
      `<button type="button" role="radio" data-i="${i}" data-m="${m}" aria-checked="${s.mode === m}" tabindex="${s.mode === m ? 0 : -1}">${labels[m]}</button>`).join('')}</div></td>
    <td class="nm">${s.id}</td><td class="c-tok r num" id="tok-${i}"></td></tr>`).join('');

  function draw() {
    let total = 0, cum = 0;
    const parts = skills.map((s) => ({ s, t: cost(s) })).filter((x) => x.t > 0).sort((a, b) => b.t - a.t);
    total = parts.reduce((n, x) => n + x.t, 0);
    const scale = Math.max(budget, total);
    meter.innerHTML = parts.map((x) => { cum += x.t; return `<span class="sg${cum > budget ? ' over' : ''}" style="flex:${x.t} 1 0" title="${x.s.id}: ${x.t} tokens"></span>`; }).join('')
      + `<span style="flex:${Math.max(0, scale - total)} 1 0"></span><span class="mark" style="left:calc(${(budget / scale * 100).toFixed(2)}% - 1px)"></span>`;
    const over = total - budget;
    lbl.innerHTML = `<span class="sr">Context used: </span><strong class="num">${total}</strong> of ${budget} tokens${over > 0 ? `<span class="over">Over by ${over}</span>` : ''}`;
    skills.forEach((s, i) => { document.getElementById(`tok-${i}`).textContent = cost(s); });
    rows.querySelectorAll('button').forEach((b) => {
      const on = skills[+b.dataset.i].mode === b.dataset.m;
      b.setAttribute('aria-checked', String(on));
      b.tabIndex = on ? 0 : -1;
    });
  }

  rows.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-m]');
    if (!b) return;
    skills[+b.dataset.i].mode = b.dataset.m;
    draw();
  });
  rows.addEventListener('keydown', (e) => {
    const b = e.target.closest('button[data-m]');
    if (!b || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
    e.preventDefault();
    const order = ['on', 'name', 'off'];
    const s = skills[+b.dataset.i];
    s.mode = order[(order.indexOf(s.mode) + (e.key === 'ArrowRight' ? 1 : 2)) % 3];
    draw();
    rows.querySelector(`button[data-i="${b.dataset.i}"][data-m="${s.mode}"]`).focus();
  });
  draw();
})();
