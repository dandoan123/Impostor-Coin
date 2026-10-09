// Qua sông: a farmer ferries a wolf, a goat and a cabbage (or three monks and three demons cross on their own) in a small boat.
// The page plays the whole game and then sends its trips; they are replayed here before the result is saved.
const { river } = require('../rules.js');

const MAX_TRIPS = 100;
const PUZZLES = {
  classic: { kinds: ['farmer', 'wolf', 'goat', 'cabbage'], cap: 2 },
  hard: { kinds: ['monk', 'monk', 'monk', 'demon', 'demon', 'demon'], cap: 2 }
};
const NAME = { farmer: 'người', wolf: 'sói', goat: 'dê', cabbage: 'bắp cải', monk: 'sư', demon: 'quỷ' };

module.exports = {
  label: 'Sói, dê và bắp cải',
  modes: { classic: 'Kinh điển', hard: 'Khó' },
  start: mode => { const p = PUZZLES[mode]; return { ...p, best: river.best(p.kinds, p.cap) }; },
  view: s => ({ kinds: s.kinds, cap: s.cap, best: s.best }),
  actions: {
    // trips: who is in the boat each time, as indexes into kinds; trips alternate there, back, there, ...
    finish(s, { trips }) {
      if (!Array.isArray(trips) || !trips.length) return { error: 'Dữ liệu ván chơi không hợp lệ.' };
      if (trips.length > MAX_TRIPS) return { error: `Ván này dài quá ${MAX_TRIPS} lượt nên không được ghi lại. Hãy chơi lại.` };
      const st = river.start(s.kinds.length), rowed = [];
      let trouble = null;
      for (const who of trips) {
        if (trouble || !river.can(st, s.kinds, s.cap, who)) return { error: 'Dữ liệu ván chơi không hợp lệ.' };
        rowed.push((st.boat ? '←' : '→') + who.map(i => NAME[s.kinds[i]]).join('+'));
        river.cross(st, who);
        trouble = river.check(st, s.kinds);
      }
      if (!trouble && !river.done(st)) return { error: 'Vẫn còn người chưa qua sông.' };
      const outcome = trouble ? 'lose' : 'win', n = trips.length;
      return {
        reply: { outcome, n, best: s.best, trouble: trouble && trouble[0], bank: trouble && trouble[1] },
        end: { outcome, n, best: s.best, trouble: trouble ? trouble[0] : '', trips: rowed }
      };
    }
  },
  abandon: () => null,
  star: r => r.outcome === 'win' && r.n === r.best,
  steps: r => r.n,
  csv: r => ({ guess: r.trouble || `${r.n} lượt`, truth: `Ít nhất ${r.best} lượt`, detail: r.trips.join(' ') })
};
