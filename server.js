// Server for the puzzle collection. Run: node server.js  (or PORT=8080 node server.js)
// Players on the same network open http://<this machine's IP>:<port>.
// Every finished game is appended to data/results.jsonl and data/results.csv.
//
// Environment variables (all optional):
//   PORT          port to listen on (default 3000)
//   DATA_DIR      where results are stored (default ./data); on a cloud host point it at a persistent disk
//   ADMIN_TOKEN   enables /admin/results.csv and /admin/results.jsonl?token=...
//   TRUST_PROXY   set to 1 behind a reverse proxy (Render, Railway, nginx) to log the player's real IP
//   TIME_ZONE     time zone for the times in results.csv (default Asia/Ho_Chi_Minh)
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

// The games, in menu order. Each one has its logic in games/<id>.js (never sent to the browser)
// and its page in games/<id>.html (served at /<id>).
const GAME_IDS = ['coins', 'eggs', 'nim', 'bridge', 'jugs', 'hanoi'];
const GAMES = Object.fromEntries(GAME_IDS.map(id => [id, require(`./games/${id}.js`)]));

const PORT = Number(process.env.PORT) || 3000;
const ROOT = __dirname;
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, 'data');
const JSONL = path.join(DATA_DIR, 'results.jsonl');
const CSV = path.join(DATA_DIR, 'results.csv');
const HTML = 'text/html; charset=utf-8', JS = 'text/javascript; charset=utf-8';
const STATIC = {
  '/': ['index.html', HTML],
  '/index.html': ['index.html', HTML],
  '/app.css': ['app.css', 'text/css; charset=utf-8'],
  '/app.js': ['app.js', JS],
  '/core.js': ['core.js', JS],
  '/rules.js': ['rules.js', JS],
  '/sw.js': ['sw.js', JS],
  '/manifest.webmanifest': ['manifest.webmanifest', 'application/manifest+json; charset=utf-8'],
  '/icons/icon-192.png': ['icons/icon-192.png', 'image/png'],
  '/icons/icon-512.png': ['icons/icon-512.png', 'image/png'],
  '/icons/apple-touch-icon.png': ['icons/apple-touch-icon.png', 'image/png'],
  '/icons/favicon-32.png': ['icons/favicon-32.png', 'image/png'],
  '/favicon.ico': ['icons/favicon-32.png', 'image/png']
};
for (const id of GAME_IDS) STATIC['/' + id] = [`games/${id}.html`, HTML];
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
const TRUST_PROXY = process.env.TRUST_PROXY === '1';
// Each IP may send at most this many game requests per minute.
const RATE_LIMIT = 90;
// Times in results.csv are written in this zone (cloud servers usually run on UTC).
const TIME_ZONE = process.env.TIME_ZONE || 'Asia/Ho_Chi_Minh';
const EXTRAS = path.join(ROOT, 'extras.js');
// Players who have lost more than this many 12-coin games also get its solver/solution tabs (extras.js).
// The page is never told about this rule.
const UNLOCK_AFTER_LOSSES = 100;
const GAME_TTL_MS = 30 * 60 * 1000;
const MAX_GAMES = 5000;

fs.mkdirSync(DATA_DIR, { recursive: true });

/* ---------- results storage ---------- */
const results = [];
if (fs.existsSync(JSONL)) {
  for (const line of fs.readFileSync(JSONL, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    let rec;
    try { rec = JSON.parse(line); } catch (_) { continue; /* skip a damaged line */ }
    if (!rec.game) rec.game = 'coins'; // saved before there were other games
    if (GAMES[rec.game]) results.push(rec);
  }
}
const CSV_HEADER = ['Thời gian', 'Tên', 'Trò chơi', 'Chế độ', 'Kết quả', 'Đáp án người chơi', 'Đáp án đúng', 'Số bước', 'Diễn biến', 'Thời gian chơi (giây)', 'IP'];
const csvCell = v => {
  let s = String(v ?? '');
  if (/^[=+\-@]/.test(s)) s = "'" + s; // keep Excel from treating a name as a formula
  return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
// BOM so Excel reads Vietnamese names as UTF-8.
const CSV_HEAD = '﻿' + CSV_HEADER.map(csvCell).join(',') + '\r\n';
function csvRow(rec) {
  const game = GAMES[rec.game], d = game.csv(rec);
  return [
    new Date(rec.at).toLocaleString('vi-VN', { timeZone: TIME_ZONE }), rec.name, game.label, game.modes[rec.mode] || rec.mode,
    { win: 'Thắng', lose: 'Thua', abandoned: 'Bỏ dở' }[rec.outcome], d.guess, d.truth, game.steps(rec), d.detail,
    Math.round(rec.durationMs / 1000), rec.ip
  ].map(csvCell).join(',') + '\r\n';
}
// A results.csv from before the other games were added has different columns:
// set it aside as results-old.csv and write the file again from results.jsonl.
try {
  if (fs.existsSync(CSV) && !fs.readFileSync(CSV, 'utf8').startsWith(CSV_HEAD)) {
    fs.renameSync(CSV, path.join(DATA_DIR, 'results-old.csv'));
    fs.writeFileSync(CSV, CSV_HEAD + results.map(csvRow).join(''), 'utf8');
  }
} catch (e) {
  console.warn(`Không cập nhật được ${CSV} sang dạng cột mới (có thể đang mở trong Excel). Hãy đóng file rồi chạy lại server.`);
}

function saveResult(rec) {
  results.push(rec);
  fs.appendFileSync(JSONL, JSON.stringify(rec) + '\n', 'utf8');
  try {
    fs.appendFileSync(CSV, (fs.existsSync(CSV) ? '' : CSV_HEAD) + csvRow(rec), 'utf8');
  } catch (e) {
    console.warn(`Không ghi được ${CSV} (có thể đang mở trong Excel). Kết quả vẫn được lưu trong ${JSONL}.`);
  }
  const game = GAMES[rec.game];
  console.log(`[${new Date(rec.at).toLocaleTimeString('vi-VN', { timeZone: TIME_ZONE })}] ${rec.name}: ${game.label} (${game.modes[rec.mode] || rec.mode}), ${rec.outcome}`);
}

// Per player (names compared without case): games played, wins, and "stars" as each game defines them
// (a win against the hard opponent, or a solution in the fewest moves).
function standings(id) {
  const by = new Map();
  for (const r of results) {
    if (r.game !== id) continue;
    const key = r.name.toLocaleLowerCase('vi');
    const p = by.get(key) || { name: r.name, played: 0, wins: 0, stars: 0, last: r.at };
    p.played++; if (r.outcome === 'win') p.wins++; if (GAMES[id].star(r)) p.stars++;
    if (r.at >= p.last) { p.last = r.at; p.name = r.name; }
    by.set(key, p);
  }
  return by;
}

/* ---------- games (kept in memory while being played) ---------- */
// g.s is the game's own state, made by its start() and changed by its actions.
const games = new Map();

function finish(g, end) {
  if (g.over) return;
  g.over = true;
  saveResult({ at: new Date().toISOString(), game: g.game, name: g.name, mode: g.mode, ...end, durationMs: Date.now() - g.startedAt, ip: g.ip });
}
// A game left half-way is saved as abandoned, when its logic says there is something worth saving.
function abandon(g) {
  const left = !g.over && GAMES[g.game].abandon(g.s);
  if (left) finish(g, { outcome: 'abandoned', ...left });
}
function sweep() {
  const now = Date.now();
  for (const [id, g] of games) {
    if (now - g.touched > GAME_TTL_MS) { abandon(g); games.delete(id); }
  }
}
setInterval(sweep, 60 * 1000).unref();

function cleanName(v) {
  if (typeof v !== 'string') return '';
  return v.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 30);
}

const api = {
  'POST /api/start'(body, ip) {
    const name = cleanName(body.name);
    if (!name) return [400, { error: 'Bạn cần nhập tên trước khi chơi.' }];
    if (!Object.hasOwn(GAMES, body.game)) return [400, { error: 'Không có trò chơi này.' }];
    const game = GAMES[body.game];
    const mode = Object.hasOwn(game.modes, body.mode) ? String(body.mode) : Object.keys(game.modes)[0];
    const prev = games.get(body.prev);
    if (prev) { abandon(prev); games.delete(body.prev); }
    if (games.size >= MAX_GAMES) sweep();
    if (games.size >= MAX_GAMES) return [503, { error: 'Server đang quá tải, thử lại sau.' }];
    const id = crypto.randomUUID(), s = game.start(mode);
    games.set(id, { id, game: body.game, name, mode, ip, s, over: false, startedAt: Date.now(), touched: Date.now() });
    return [200, { id, ...(game.view ? game.view(s) : {}) }];
  },
  // One move in a running game: body.type names one of the game's actions.
  'POST /api/act'(body) {
    const g = games.get(body.id);
    if (!g || g.over) return [404, { error: 'Ván này đã kết thúc. Bấm “Ván mới”.' }];
    const actions = GAMES[g.game].actions;
    if (!Object.hasOwn(actions, body.type)) return [400, { error: 'Thao tác không hợp lệ.' }];
    const r = actions[body.type](g.s, body);
    if (r.error) return [400, { error: r.error }];
    g.touched = Date.now();
    if (r.end) { finish(g, r.end); games.delete(g.id); }
    return [200, r.reply];
  },
  'GET /api/leaderboard'(_, ip, query) {
    const id = query.get('game');
    if (!Object.hasOwn(GAMES, id)) return [400, { error: 'Không có trò chơi này.' }];
    const players = [...standings(id).values()].sort((a, b) => b.stars - a.stars || b.wins - a.wins || (b.wins / b.played) - (a.wins / a.played) || a.played - b.played);
    const mine = results.filter(r => r.game === id);
    const recent = mine.slice(-12).reverse().map(r => ({ name: r.name, mode: r.mode, outcome: r.outcome, star: GAMES[id].star(r), at: r.at, n: GAMES[id].steps(r) }));
    return [200, { players: players.slice(0, 50), recent, total: mine.length }];
  },
  // For the menu: how many people have played each game, and how this player is doing.
  'GET /api/summary'(_, ip, query) {
    const key = cleanName(query.get('name')).toLocaleLowerCase('vi');
    const summary = {};
    for (const id of GAME_IDS) {
      const by = standings(id), me = key && by.get(key);
      summary[id] = { players: by.size, me: me ? { played: me.played, wins: me.wins, stars: me.stars } : null };
    }
    return [200, { games: summary }];
  }
};

/* ---------- http ---------- */
function send(res, status, body, type = 'application/json; charset=utf-8', extra = {}) {
  res.writeHead(status, {
    'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY', 'Referrer-Policy': 'same-origin', ...extra
  });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}
function clientIp(req) {
  const fwd = TRUST_PROXY && req.headers['x-forwarded-for'];
  const ip = fwd ? String(fwd).split(',')[0].trim() : (req.socket.remoteAddress || '');
  return ip.replace(/^::ffff:/, '');
}
const hits = new Map();
function limited(ip) {
  const now = Date.now(), h = hits.get(ip);
  if (!h || now - h.start > 60 * 1000) { hits.set(ip, { start: now, n: 1 }); return false; }
  return ++h.n > RATE_LIMIT;
}
setInterval(() => { const now = Date.now(); for (const [ip, h] of hits) if (now - h.start > 60 * 1000) hits.delete(ip); }, 60 * 1000).unref();
function tokenOk(given) {
  if (!ADMIN_TOKEN || typeof given !== 'string') return false;
  const a = crypto.createHash('sha256').update(given).digest(), b = crypto.createHash('sha256').update(ADMIN_TOKEN).digest();
  return crypto.timingSafeEqual(a, b);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const ip = clientIp(req);
  const st = req.method === 'GET' && Object.hasOwn(STATIC, url.pathname) && STATIC[url.pathname];
  if (st) return fs.readFile(path.join(ROOT, st[0]), (err, buf) => err ? send(res, 500, 'Lỗi đọc file', 'text/plain; charset=utf-8') : send(res, 200, buf, st[1]));
  if (req.method === 'GET' && url.pathname === '/healthz') return send(res, 200, 'ok', 'text/plain; charset=utf-8');
  const adminFile = req.method === 'GET' && { '/admin/results.csv': [CSV, 'text/csv; charset=utf-8'], '/admin/results.jsonl': [JSONL, 'application/x-ndjson; charset=utf-8'] }[url.pathname];
  if (adminFile) {
    const auth = req.headers.authorization || '';
    if (!tokenOk(url.searchParams.get('token') || auth.replace(/^Bearer\s+/i, ''))) return send(res, 403, { error: 'Sai hoặc thiếu mã quản trị.' });
    if (!fs.existsSync(adminFile[0])) return send(res, 404, { error: 'Chưa có kết quả nào.' });
    return fs.readFile(adminFile[0], (err, buf) => err ? send(res, 500, { error: 'Lỗi đọc file' })
      : send(res, 200, buf, adminFile[1], { 'Content-Disposition': `attachment; filename="${path.basename(adminFile[0])}"` }));
  }
  if (url.pathname.startsWith('/api/') && limited(ip)) return send(res, 429, { error: 'Bạn thao tác quá nhanh, thử lại sau ít giây.' });
  if (req.method === 'GET' && url.pathname === '/api/extras') {
    const key = cleanName(url.searchParams.get('name')).toLocaleLowerCase('vi');
    const losses = key ? results.filter(r => r.game === 'coins' && r.outcome === 'lose' && r.name.toLocaleLowerCase('vi') === key).length : 0;
    if (losses <= UNLOCK_AFTER_LOSSES) { res.writeHead(204, { 'Cache-Control': 'no-store' }); return res.end(); }
    return fs.readFile(EXTRAS, (err, buf) => err ? send(res, 500, 'Lỗi đọc file', 'text/plain; charset=utf-8') : send(res, 200, buf, 'text/javascript; charset=utf-8'));
  }
  const route = `${req.method} ${url.pathname}`;
  const handler = Object.hasOwn(api, route) && api[route];
  if (!handler) return send(res, 404, { error: 'Không tìm thấy' });
  if (req.method === 'GET') return send(res, ...handler({}, ip, url.searchParams));
  let raw = '';
  req.setEncoding('utf8');
  req.on('data', chunk => { raw += chunk; if (raw.length > 10000) req.destroy(); });
  req.on('end', () => {
    let body;
    try { body = JSON.parse(raw || '{}'); } catch (_) { return send(res, 400, { error: 'Dữ liệu gửi lên không hợp lệ.' }); }
    try { send(res, ...handler(body && typeof body === 'object' ? body : {}, ip)); }
    catch (e) { console.error(e); send(res, 500, { error: 'Lỗi server.' }); }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\nCâu đố kinh điển đang chạy (${GAME_IDS.length} trò chơi).`);
  console.log(`  Trên máy này:    http://localhost:${PORT}`);
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal) console.log(`  Người cùng mạng: http://${a.address}:${PORT}`);
  }
  console.log(`  Kết quả lưu tại: ${CSV}`);
  console.log(ADMIN_TOKEN ? `  Tải kết quả:     /admin/results.csv?token=<ADMIN_TOKEN>` : `  (Đặt ADMIN_TOKEN để bật trang tải kết quả /admin/results.csv)`);
  console.log(`  Đã có ${results.length} ván trong lịch sử. Nhấn Ctrl+C để tắt.\n`);
});
