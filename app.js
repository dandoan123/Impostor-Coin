// Shared by the menu and every game page: player name, server calls, tabs, leaderboard, install prompt.
// Loaded as a plain script, so everything declared here is visible to the page's own script (and to extras.js).
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const wait = ms => new Promise(done => setTimeout(done, ms));
function setSeg(seg, attr, val) { seg.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset[attr] === val))); }

/* ---------- player name + server calls ---------- */
// The page's settings, given to initPage(): { game, title, eyebrow, gateArt, modes, starLabel, stepLabel, solveOnly, onPlayer, onBoard }.
let page = {};
const player = { name: '' };
try { player.name = localStorage.getItem('coins12-name') || ''; } catch (_) {}
async function api(url, body) {
  const res = await fetch(url, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : { cache: 'no-store' });
  let data = {};
  try { data = await res.json(); } catch (_) {}
  if (!res.ok) throw new Error(data.error || `Lỗi server (${res.status}).`);
  return data;
}
const NET_ERR = 'Không kết nối được server. Hãy mở trò chơi qua địa chỉ của server (ví dụ http://localhost:3000) và kiểm tra server vẫn đang chạy.';
const errText = e => e instanceof TypeError ? NET_ERR : e.message;

// One game on the server: startGame() opens it, act() sends a move.
const session = { id: null };
async function startGame(mode) {
  const r = await api('/api/start', { game: page.game, name: player.name, mode, prev: session.id });
  session.id = r.id;
  return r;
}
const act = (type, data) => api('/api/act', { id: session.id, type, ...data });

function openGate() {
  $('gate').hidden = false;
  $('gate-name').value = player.name;
  $('gate-warn').textContent = '';
  $('gate-cancel').hidden = !player.name && !!page.game;
  setTimeout(() => $('gate-name').focus(), 30);
}
function showPlayer() {
  $('player-name').textContent = player.name || 'chưa đặt tên';
  $('player-change').textContent = player.name ? 'Đổi tên' : 'Đặt tên';
}

/* ---------- leaderboard ---------- */
let board = null;
const nameKey = s => s.toLocaleLowerCase('vi');
function myStats() { return board && player.name ? board.players.find(p => nameKey(p.name) === nameKey(player.name)) : null; }
const fmtTime = iso => new Date(iso).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
async function loadBoard() {
  if (!page.game) return;
  try {
    board = await api('/api/leaderboard?game=' + page.game);
    $('board-note').textContent = `${board.total} ván đã được ghi lại. Xếp theo cột “${page.starLabel}”, rồi ${page.solveOnly ? 'số lần đã giải' : 'tổng số ván thắng'}.`;
  } catch (e) { $('board-note').textContent = errText(e); }
  renderBoard();
  if (page.onBoard) page.onBoard();
}
function renderBoard() {
  const players = board ? board.players : [], recent = board ? board.recent : [];
  const me = player.name ? nameKey(player.name) : '';
  // Puzzles that only record solved games have no win rate to show.
  const cols = page.solveOnly ? ['#', 'Người chơi', page.starLabel, 'Đã giải'] : ['#', 'Người chơi', page.starLabel, 'Thắng', 'Số ván', 'Tỉ lệ thắng'];
  const cells = p => page.solveOnly ? `<td class="m">${p.stars}</td><td class="m">${p.wins}</td>`
    : `<td class="m">${p.stars}</td><td class="m">${p.wins}</td><td class="m">${p.played}</td><td class="m">${Math.round(100 * p.wins / p.played)}%</td>`;
  $('board').innerHTML = '<thead><tr>' + cols.map(c => `<th>${esc(c)}</th>`).join('') + '</tr></thead><tbody>'
    + (players.length ? players.map((p, i) => `<tr class="${nameKey(p.name) === me ? 'me' : ''}"><td class="m">${i + 1}</td><td>${esc(p.name)}</td>${cells(p)}</tr>`).join('')
      : `<tr><td colspan="${cols.length}" class="empty">Chưa có ván nào. Chơi xong một ván, tên bạn sẽ xuất hiện ở đây.</td></tr>`)
    + '</tbody>';
  const OUTC = { win: '<span class="win">Thắng</span>', lose: '<span class="lose">Thua</span>', abandoned: '<span class="muted">Bỏ dở</span>' };
  const outc = r => page.solveOnly && r.outcome === 'win' ? (r.star ? `<span class="win">${esc(page.starLabel)}</span>` : 'Đã giải') : OUTC[r.outcome] || '';
  $('recent').innerHTML = `<thead><tr><th>Lúc</th><th>Người chơi</th><th>Chế độ</th><th>Kết quả</th><th>${esc(page.stepLabel)}</th></tr></thead><tbody>`
    + (recent.length ? recent.map(r => `<tr><td class="m">${fmtTime(r.at)}</td><td>${esc(r.name)}</td><td>${esc(page.modes[r.mode] || r.mode)}</td><td>${outc(r)}</td><td class="m">${r.n}</td></tr>`).join('')
      : '<tr><td colspan="5" class="empty">Chưa có ván nào.</td></tr>')
    + '</tbody>';
}

// The "your record" line shown next to the task.
function scoreLine() {
  const me = myStats();
  if (!me) return '';
  return page.solveOnly ? `Bạn đã giải <b>${me.wins}</b> lần, trong đó <b>${me.stars}</b> lần với số bước ít nhất`
    : `Thành tích của bạn: thắng <b>${me.wins}</b> / <b>${me.played}</b> ván, trong đó <b>${me.stars}</b> ván khó`;
}

/* ---------- tabs ---------- */
const HASH = { play: 'choi', board: 'xep-hang' };
function showTab(name) {
  document.querySelectorAll('.tab').forEach(t => {
    const on = t.dataset.tab === name;
    t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1;
    $('p-' + t.dataset.tab).hidden = !on;
  });
  if (name === 'board') loadBoard();
}

/* ---------- page start ---------- */
const PLAYERBAR = '<div class="playerbar"><button class="linkbtn" id="install" type="button" hidden>Cài ứng dụng</button><span>Người chơi: <b id="player-name"></b></span><button class="linkbtn" id="player-change" type="button"></button></div>';
const INSTALL_HINT = '<p class="install-hint" id="install-hint" hidden>Trên iPhone/iPad: mở trang bằng Safari, bấm nút <b>Chia sẻ</b> (ô vuông có mũi tên lên), rồi chọn <b>Thêm vào MH chính</b>.</p>';
function initPage(cfg) {
  page = cfg;
  document.body.insertAdjacentHTML('beforeend', `
<div class="gate" id="gate" role="dialog" aria-modal="true" aria-labelledby="gate-title" hidden>
  <form class="gate-card" id="gate-form" novalidate>
    ${cfg.gateArt || ''}
    <p class="eyebrow">${esc(cfg.eyebrow)}</p>
    <h2 id="gate-title">${esc(cfg.title)}</h2>
    <p class="note">Nhập tên để vào chơi. Kết quả mỗi ván được ghi lại kèm tên của bạn và hiện trên bảng xếp hạng.</p>
    <label class="label" for="gate-name">Tên của bạn</label>
    <input class="input" id="gate-name" maxlength="30" autocomplete="nickname" placeholder="Ví dụ: Minh Anh">
    <p class="warn" id="gate-warn"></p>
    <button class="btn primary big" type="submit">${cfg.game ? 'Vào chơi' : 'Lưu tên'}</button>
    <button class="btn" id="gate-cancel" type="button">Để sau</button>
  </form>
</div>`);
  if (!cfg.game) {
    // The menu shows the player in its top bar.
    const top = document.querySelector('.topbar');
    top.insertAdjacentHTML('beforeend', PLAYERBAR);
    top.insertAdjacentHTML('afterend', INSTALL_HINT);
  } else {
    // Game pages get the way back to the menu, the tab bar (with the player in it) and the leaderboard panel.
    const hero = document.querySelector('.hero');
    hero.insertAdjacentHTML('beforebegin', '<a class="back" href="/">← Tất cả trò chơi</a>');
    hero.insertAdjacentHTML('afterend', `
  <div class="tabbar">
    <nav class="tabs" role="tablist" aria-label="Chế độ">
      <button class="tab" role="tab" id="t-play" aria-controls="p-play" data-tab="play">Chơi</button>
      <button class="tab" role="tab" id="t-board" aria-controls="p-board" data-tab="board">Bảng xếp hạng</button>
    </nav>
    ${PLAYERBAR}
  </div>
  ${INSTALL_HINT}
  <section id="p-board" role="tabpanel" aria-labelledby="t-board" hidden>
    <div class="board-head">
      <div><h2 class="sec" style="margin-top:0">Bảng xếp hạng</h2><p class="note" id="board-note">Đang tải…</p></div>
      <button class="btn" id="board-refresh" type="button">Làm mới</button>
    </div>
    <div class="table-wrap"><table id="board"></table></div>
    <h2 class="sec">Ván gần đây</h2>
    <div class="table-wrap"><table id="recent"></table></div>
  </section>`);
    $('board-refresh').addEventListener('click', loadBoard);
    const tabs = document.querySelector('.tabs');
    tabs.addEventListener('click', e => {
      const t = e.target.closest('.tab'); if (!t) return;
      showTab(t.dataset.tab);
      try { history.replaceState(null, '', '#' + HASH[t.dataset.tab]); } catch (_) {}
    });
    tabs.addEventListener('keydown', e => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const all = [...document.querySelectorAll('.tab')], i = all.indexOf(document.activeElement);
      if (i < 0) return;
      const n = all[(i + (e.key === 'ArrowRight' ? 1 : all.length - 1)) % all.length];
      n.focus(); n.click();
    });
    renderBoard();
    showTab(Object.keys(HASH).find(k => '#' + HASH[k] === location.hash) || 'play');
  }

  /* name gate */
  $('gate-form').addEventListener('submit', e => {
    e.preventDefault();
    const name = $('gate-name').value.replace(/\s+/g, ' ').trim().slice(0, 30);
    if (!name) { $('gate-warn').textContent = 'Bạn cần nhập tên để vào chơi.'; $('gate-name').focus(); return; }
    const changed = name !== player.name;
    player.name = name;
    try { localStorage.setItem('coins12-name', name); } catch (_) {}
    $('gate').hidden = true;
    showPlayer();
    cfg.onPlayer(changed);
    loadBoard();
  });
  $('gate-cancel').addEventListener('click', () => { $('gate').hidden = true; });
  $('player-change').addEventListener('click', openGate);
  showPlayer();
  // A game needs a name before it starts; the menu can be browsed without one.
  if (player.name || !cfg.game) { cfg.onPlayer(false); loadBoard(); }
  else openGate();

  /* install as an app (PWA) */
  let installEvt = null;
  const standalone = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; $('install').hidden = false; });
  window.addEventListener('appinstalled', () => { installEvt = null; $('install').hidden = true; $('install-hint').hidden = true; });
  if (isIOS && !standalone) $('install').hidden = false;
  $('install').addEventListener('click', async () => {
    if (installEvt) {
      installEvt.prompt();
      try { await installEvt.userChoice; } catch (_) {}
      installEvt = null; $('install').hidden = true;
    } else if (isIOS) $('install-hint').hidden = !$('install-hint').hidden;
  });
  if ('serviceWorker' in navigator && window.isSecureContext) navigator.serviceWorker.register('/sw.js').catch(() => {});
}
