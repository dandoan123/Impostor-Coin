// Tháp Hà Nội. The page plays the whole game and then sends its moves; they are replayed here before the result is saved.
const { hanoi } = require('../rules.js');

const MAX_MOVES = 1000;

module.exports = {
  label: 'Tháp Hà Nội',
  modes: { 3: '3 đĩa', 4: '4 đĩa', 5: '5 đĩa', 6: '6 đĩa', 7: '7 đĩa' },
  start: mode => ({ discs: Number(mode) }),
  actions: {
    // moves: digit pairs, "02" = take the top disc of peg 0 and put it on peg 2.
    finish(s, { moves }) {
      if (typeof moves !== 'string' || moves.length % 2 || /[^012]/.test(moves)) return { error: 'Dữ liệu ván chơi không hợp lệ.' };
      if (moves.length > 2 * MAX_MOVES) return { error: `Ván này dài quá ${MAX_MOVES} bước nên không được ghi lại. Hãy chơi lại.` };
      const pegs = hanoi.start(s.discs);
      for (let i = 0; i < moves.length; i += 2) {
        const from = +moves[i], to = +moves[i + 1];
        if (!hanoi.can(pegs, from, to)) return { error: 'Dữ liệu ván chơi không hợp lệ.' };
        hanoi.move(pegs, from, to);
      }
      if (!hanoi.solved(pegs)) return { error: 'Tháp chưa được chuyển xong.' };
      const n = moves.length / 2, best = hanoi.best(s.discs);
      return { reply: { n, best }, end: { outcome: 'win', discs: s.discs, n, best } };
    }
  },
  abandon: () => null,
  star: r => r.outcome === 'win' && r.n === r.best,
  steps: r => r.n,
  csv: r => ({ guess: '', truth: `Ít nhất ${r.best} bước`, detail: '' })
};
