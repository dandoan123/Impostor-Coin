// Đong nước: two jugs without marks, measure an exact number of litres.
// The page plays the whole game and then sends its moves; they are replayed here before the result is saved.
const { jugs } = require('../rules.js');
const { int } = require('./random.js');

const MAX_MOVES = 200;
const TEXT = { fa: 'đầy A', fb: 'đầy B', ea: 'bỏ A', eb: 'bỏ B', ab: 'A→B', ba: 'B→A' };
const gcd = (a, b) => b ? gcd(b, a % b) : a;

// A random puzzle that needs between 8 and 14 moves.
function hardPuzzle() {
  for (;;) {
    const a = 3 + int(9), b = a + 1 + int(13 - a), target = 1 + int(b - 1); // a in 3..11, b in a+1..13
    if (gcd(a, b) !== 1 || target === a) continue;
    const best = jugs.best([a, b], target);
    if (best >= 8 && best <= 14) return { caps: [a, b], target, best };
  }
}

module.exports = {
  label: 'Đong nước',
  modes: { classic: 'Kinh điển', hard: 'Khó' },
  start: mode => mode === 'hard' ? hardPuzzle() : { caps: [3, 5], target: 4, best: jugs.best([3, 5], 4) },
  view: s => ({ caps: s.caps, target: s.target, best: s.best }),
  actions: {
    finish(s, { moves }) {
      if (!Array.isArray(moves) || !moves.length || moves.some(m => !jugs.MOVES.includes(m))) return { error: 'Dữ liệu ván chơi không hợp lệ.' };
      if (moves.length > MAX_MOVES) return { error: `Ván này dài quá ${MAX_MOVES} bước nên không được ghi lại. Hãy chơi lại.` };
      const last = moves.reduce((st, m) => jugs.apply(st, s.caps, m), [0, 0]);
      if (!jugs.solved(last, s.target)) return { error: `Chưa bình nào có đúng ${s.target} lít.` };
      const n = moves.length;
      return { reply: { n, best: s.best }, end: { outcome: 'win', caps: s.caps, target: s.target, n, best: s.best, moves } };
    }
  },
  abandon: () => null,
  star: r => r.outcome === 'win' && r.n === r.best,
  steps: r => r.n,
  csv: r => ({
    guess: '', truth: `Ít nhất ${r.best} bước`,
    detail: `Bình A ${r.caps[0]} lít, bình B ${r.caps[1]} lít, đong ${r.target} lít: ${r.moves.map(m => TEXT[m]).join('; ')}`
  })
};
