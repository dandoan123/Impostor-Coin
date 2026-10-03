// Nim: rows of coins. A move takes any number of coins from one row; whoever takes the last coin wins.
// The player moves first, the machine answers here on the server.
const { int, pick } = require('./random.js');

const nimSum = rows => rows.reduce((x, n) => x ^ n, 0);
const rowsLeft = rows => rows.map((n, i) => n ? i : -1).filter(i => i >= 0);

// 3 or 4 rows of different sizes (1..7), smallest first, from which the player to move can force a win.
function deal() {
  for (;;) {
    const pool = [1, 2, 3, 4, 5, 6, 7], rows = [];
    for (let k = 3 + int(2); k > 0; k--) rows.push(pool.splice(int(pool.length), 1)[0]);
    if (nimSum(rows)) return rows.sort((a, b) => a - b);
  }
}
// Perfect play: leave a Nim-sum of 0 whenever possible, otherwise take one coin and wait for a mistake.
function perfectMove(rows) {
  const x = nimSum(rows);
  if (!x) return { row: pick(rowsLeft(rows)), k: 1 };
  const row = pick(rowsLeft(rows).filter(i => (rows[i] ^ x) < rows[i]));
  return { row, k: rows[row] - (rows[row] ^ x) };
}
// Easy machine: random moves, but it does take the last row when that wins.
function casualMove(rows) {
  const left = rowsLeft(rows), row = pick(left);
  return { row, k: left.length === 1 ? rows[row] : 1 + int(rows[row]) };
}
const moveText = ([who, row, k]) => `${who === 'P' ? 'Người' : 'Máy'} h${row + 1}×${k}`;

module.exports = {
  label: 'Nim',
  modes: { adv: 'Khó', rand: 'Dễ' },
  start: mode => { const rows = deal(); return { mode, first: rows.slice(), rows, moves: [] }; },
  view: s => ({ rows: s.rows }),
  actions: {
    take(s, { row, k }) {
      if (!Number.isInteger(row) || row < 0 || row >= s.rows.length || !Number.isInteger(k) || k < 1 || k > s.rows[row]) return { error: 'Nước đi không hợp lệ.' };
      const end = outcome => ({ outcome, rows: s.first, n: s.moves.filter(m => m[0] === 'P').length, moves: s.moves });
      s.rows[row] -= k; s.moves.push(['P', row, k]);
      if (!rowsLeft(s.rows).length) return { reply: { rows: s.rows, bot: null, over: 'win' }, end: end('win') };
      const bot = s.mode === 'adv' ? perfectMove(s.rows) : casualMove(s.rows);
      s.rows[bot.row] -= bot.k; s.moves.push(['M', bot.row, bot.k]);
      const lost = !rowsLeft(s.rows).length;
      return { reply: { rows: s.rows, bot, over: lost ? 'lose' : null }, end: lost ? end('lose') : null };
    }
  },
  abandon: s => s.moves.length ? { rows: s.first, n: s.moves.filter(m => m[0] === 'P').length, moves: s.moves } : null,
  star: r => r.outcome === 'win' && r.mode === 'adv',
  steps: r => r.n,
  csv: r => ({ guess: '', truth: '', detail: `Các hàng ${r.rows.join('-')}: ${r.moves.map(moveText).join('; ')}` })
};
