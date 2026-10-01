// Server for the 12-coin game. Run: node server.js  (or PORT=8080 node server.js)
// Players on the same network open http://<this machine's IP>:<port>.
// Every finished game is appended to data/results.jsonl and data/results.csv.
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { HYPS, weigh } = require('./core.js');

const PORT = Number(process.env.PORT) || 3000;
const ROOT = __dirname;
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, 'data');
const JSONL = path.join(DATA_DIR, 'results.jsonl');
const CSV = path.join(DATA_DIR, 'results.csv');
const STATIC = { '/': ['index.html', 'text/html; charset=utf-8'], '/index.html': ['index.html', 'text/html; charset=utf-8'], '/core.js': ['core.js', 'text/javascript; charset=utf-8'] };
const EXTRAS = path.join(ROOT, 'extras.js');
// Players who have lost more than this many games also get the solver/solution tabs (extras.js).
// The page is never told about this rule.
const UNLOCK_AFTER_LOSSES = 10;
const GAME_TTL_MS = 30 * 60 * 1000;
const MAX_GAMES = 5000;

fs.mkdirSync(DATA_DIR, { recursive: true });

/* ---------- results storage ---------- */
const results = [];
if (fs.existsSync(JSONL)) {
  for (const line of fs.readFileSync(JSONL, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try { results.push(JSON.parse(line)); } catch (_) { /* skip a damaged line */ }
  }
}
const CSV_HEADER = ['Thời gian', 'Tên', 'Chế độ', 'Kết quả', 'Đáp án người chơi', 'Đồng giả', 'Số lần cân', 'Các lần cân', 'Thời gian chơi (giây)', 'IP'];
const csvCell = v => {
  let s = String(v ?? '');
  if (/^[=+\-@]/.test(s)) s = "'" + s; // keep Excel from treating a name as a formula
  return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
const hypText = id => id ? `${parseInt(id, 10)} ${id.endsWith('H') ? 'nặng' : 'nhẹ'}` : '';
const SYM = { gt: 'T>P', eq: 'T=P', lt: 'T<P' };

function saveResult(rec) {
  results.push(rec);
  fs.appendFileSync(JSONL, JSON.stringify(rec) + '\n', 'utf8');
  const row = [
    new Date(rec.at).toLocaleString('vi-VN'), rec.name, rec.mode === 'adv' ? 'Khó' : 'Ngẫu nhiên',
    { win: 'Thắng', lose: 'Thua', abandoned: 'Bỏ dở' }[rec.outcome], hypText(rec.guess), hypText(rec.fake),
    rec.weighs.length, rec.weighs.map(w => `${w.L.join(' ')} | ${w.R.join(' ')} → ${SYM[w.o]}`).join('; '),
    Math.round(rec.durationMs / 1000), rec.ip
  ];
  try {
    const fresh = !fs.existsSync(CSV);
    // BOM so Excel reads Vietnamese names as UTF-8.
    fs.appendFileSync(CSV, (fresh ? '﻿' + CSV_HEADER.map(csvCell).join(',') + '\r\n' : '') + row.map(csvCell).join(',') + '\r\n', 'utf8');
  } catch (e) {
    console.warn(`Không ghi được ${CSV} (có thể đang mở trong Excel). Kết quả vẫn được lưu trong ${JSONL}.`);
  }
  console.log(`[${new Date(rec.at).toLocaleTimeString('vi-VN')}] ${rec.name}: ${rec.outcome} (${rec.mode}, ${rec.weighs.length} lần cân)`);
}

/* ---------- games (kept in memory while being played) ---------- */
const games = new Map();
const pick = arr => arr[crypto.randomInt(arr.length)];

function finish(g, outcome, guess, fake) {
  if (g.over) return;
  g.over = true;
  saveResult({
    at: new Date().toISOString(), name: g.name, mode: g.mode, outcome, guess: guess || null, fake: fake || null,
    weighs: g.weighs, durationMs: Date.now() - g.startedAt, ip: g.ip
  });
}
function sweep() {
  const now = Date.now();
  for (const [id, g] of games) {
    if (now - g.touched > GAME_TTL_MS) {
      if (!g.over && g.weighs.length) finish(g, 'abandoned', null, g.mode === 'rand' ? g.h.id : null);
      games.delete(id);
    }
  }
}
setInterval(sweep, 60 * 1000).unref();

function cleanName(v) {
  if (typeof v !== 'string') return '';
  return v.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 30);
}
function validPans(L, R) {
  const ok = a => Array.isArray(a) && a.every(x => Number.isInteger(x) && x >= 1 && x <= 12);
  if (!ok(L) || !ok(R) || !L.length || L.length !== R.length) return false;
  return new Set([...L, ...R]).size === L.length + R.length;
}

const api = {
  'POST /api/start'(body, ip) {
    const name = cleanName(body.name);
    if (!name) return [400, { error: 'Bạn cần nhập tên trước khi chơi.' }];
    const mode = body.mode === 'rand' ? 'rand' : 'adv';
    const prev = games.get(body.prev);
    if (prev && !prev.over && prev.weighs.length) finish(prev, 'abandoned', null, prev.mode === 'rand' ? prev.h.id : null);
    if (prev) games.delete(body.prev);
    if (games.size >= MAX_GAMES) sweep();
    if (games.size >= MAX_GAMES) return [503, { error: 'Server đang quá tải, thử lại sau.' }];
    const id = crypto.randomUUID();
    games.set(id, { id, name, mode, ip, h: pick(HYPS), cands: HYPS.slice(), weighs: [], over: false, startedAt: Date.now(), touched: Date.now() });
    return [200, { id }];
  },
  'POST /api/weigh'(body) {
    const g = games.get(body.id);
    if (!g || g.over) return [404, { error: 'Ván này đã kết thúc. Bấm “Ván mới”.' }];
    if (g.weighs.length >= 3) return [400, { error: 'Bạn đã dùng hết 3 lần cân.' }];
    const { L, R } = body;
    if (!validPans(L, R)) return [400, { error: 'Hai đĩa phải có số đồng bằng nhau và không trùng đồng.' }];
    let o;
    if (g.mode === 'rand') o = weigh(L, R, g.h);
    else {
      // Adversary: answer with the outcome that keeps the most possibilities alive.
      const groups = { gt: [], eq: [], lt: [] };
      g.cands.forEach(h => groups[weigh(L, R, h)].push(h));
      const best = Math.max(...Object.values(groups).map(a => a.length));
      o = pick(Object.keys(groups).filter(k => groups[k].length === best));
    }
    g.cands = g.cands.filter(h => weigh(L, R, h) === o);
    g.weighs.push({ L: L.slice(), R: R.slice(), o });
    g.touched = Date.now();
    return [200, { o, n: g.weighs.length }];
  },
  'POST /api/guess'(body) {
    const g = games.get(body.id);
    if (!g || g.over) return [404, { error: 'Ván này đã kết thúc. Bấm “Ván mới”.' }];
    const c = body.c, t = body.t;
    if (!Number.isInteger(c) || c < 1 || c > 12 || (t !== 'H' && t !== 'L')) return [400, { error: 'Đáp án không hợp lệ.' }];
    const guess = c + t;
    let fake;
    if (g.mode === 'rand') fake = g.h;
    else {
      const others = g.cands.filter(h => h.id !== guess);
      fake = others.length ? pick(others) : g.cands[0];
    }
    const win = fake.id === guess;
    const consistentGuess = g.cands.some(h => h.id === guess);
    const remaining = g.cands.length;
    finish(g, win ? 'win' : 'lose', guess, fake.id);
    games.delete(g.id);
    return [200, { win, fake: { c: fake.c, t: fake.t }, consistentGuess, remaining }];
  },
  'GET /api/leaderboard'() {
    const by = new Map();
    for (const r of results) {
      const key = r.name.toLocaleLowerCase('vi');
      const p = by.get(key) || { name: r.name, played: 0, wins: 0, hardWins: 0, last: r.at };
      p.played++; if (r.outcome === 'win') { p.wins++; if (r.mode === 'adv') p.hardWins++; }
      if (r.at >= p.last) { p.last = r.at; p.name = r.name; }
      by.set(key, p);
    }
    const players = [...by.values()].sort((a, b) => b.hardWins - a.hardWins || b.wins - a.wins || (b.wins / b.played) - (a.wins / a.played) || a.played - b.played);
    const recent = results.slice(-12).reverse().map(r => ({ name: r.name, mode: r.mode, outcome: r.outcome, at: r.at, n: r.weighs.length }));
    return [200, { players: players.slice(0, 50), recent, total: results.length }];
  }
};

/* ---------- http ---------- */
function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const ip = (req.socket.remoteAddress || '').replace(/^::ffff:/, '');
  const st = req.method === 'GET' && STATIC[url.pathname];
  if (st) return fs.readFile(path.join(ROOT, st[0]), (err, buf) => err ? send(res, 500, 'Lỗi đọc file', 'text/plain; charset=utf-8') : send(res, 200, buf, st[1]));
  if (req.method === 'GET' && url.pathname === '/api/extras') {
    const key = cleanName(url.searchParams.get('name')).toLocaleLowerCase('vi');
    const losses = key ? results.filter(r => r.outcome === 'lose' && r.name.toLocaleLowerCase('vi') === key).length : 0;
    if (losses <= UNLOCK_AFTER_LOSSES) { res.writeHead(204, { 'Cache-Control': 'no-store' }); return res.end(); }
    return fs.readFile(EXTRAS, (err, buf) => err ? send(res, 500, 'Lỗi đọc file', 'text/plain; charset=utf-8') : send(res, 200, buf, 'text/javascript; charset=utf-8'));
  }
  const handler = api[`${req.method} ${url.pathname}`];
  if (!handler) return send(res, 404, { error: 'Không tìm thấy' });
  if (req.method === 'GET') return send(res, ...handler({}, ip));
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
  console.log(`\nTrò chơi 12 đồng xu đang chạy.`);
  console.log(`  Trên máy này:    http://localhost:${PORT}`);
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal) console.log(`  Người cùng mạng: http://${a.address}:${PORT}`);
  }
  console.log(`  Kết quả lưu tại: ${CSV}`);
  console.log(`  Đã có ${results.length} ván trong lịch sử. Nhấn Ctrl+C để tắt.\n`);
});
