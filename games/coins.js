// 12 đồng xu: one coin is fake (heavier or lighter); find it with at most 3 weighings.
// Runs on the server so the fake coin stays hidden from the page.
const { HYPS, weigh } = require('../core.js');
const { pick } = require('./random.js');

const MAX_WEIGHS = 3;
const SYM = { gt: 'T>P', eq: 'T=P', lt: 'T<P' };
const hypText = id => id ? `${parseInt(id, 10)} ${id.endsWith('H') ? 'nặng' : 'nhẹ'}` : '';

function validPans(L, R) {
  const ok = a => Array.isArray(a) && a.every(x => Number.isInteger(x) && x >= 1 && x <= 12);
  if (!ok(L) || !ok(R) || !L.length || L.length !== R.length) return false;
  return new Set([...L, ...R]).size === L.length + R.length;
}

module.exports = {
  label: '12 đồng xu',
  modes: { adv: 'Khó', rand: 'Ngẫu nhiên' },
  start: mode => ({ mode, h: pick(HYPS), cands: HYPS.slice(), weighs: [] }),
  actions: {
    weigh(s, { L, R }) {
      if (s.weighs.length >= MAX_WEIGHS) return { error: 'Bạn đã dùng hết 3 lần cân.' };
      if (!validPans(L, R)) return { error: 'Hai đĩa phải có số đồng bằng nhau và không trùng đồng.' };
      let o;
      if (s.mode === 'rand') o = weigh(L, R, s.h);
      else {
        // Adversary: answer with the outcome that keeps the most possibilities alive.
        const groups = { gt: [], eq: [], lt: [] };
        s.cands.forEach(h => groups[weigh(L, R, h)].push(h));
        const best = Math.max(...Object.values(groups).map(a => a.length));
        o = pick(Object.keys(groups).filter(k => groups[k].length === best));
      }
      s.cands = s.cands.filter(h => weigh(L, R, h) === o);
      s.weighs.push({ L: L.slice(), R: R.slice(), o });
      return { reply: { o, n: s.weighs.length } };
    },
    guess(s, { c, t }) {
      if (!Number.isInteger(c) || c < 1 || c > 12 || (t !== 'H' && t !== 'L')) return { error: 'Đáp án không hợp lệ.' };
      const guess = c + t;
      let fake;
      if (s.mode === 'rand') fake = s.h;
      else {
        const others = s.cands.filter(h => h.id !== guess);
        fake = others.length ? pick(others) : s.cands[0];
      }
      const win = fake.id === guess;
      return {
        reply: { win, fake: { c: fake.c, t: fake.t }, consistentGuess: s.cands.some(h => h.id === guess), remaining: s.cands.length },
        end: { outcome: win ? 'win' : 'lose', guess, fake: fake.id, weighs: s.weighs }
      };
    }
  },
  // A game left after at least one weighing is saved as abandoned.
  abandon: s => s.weighs.length ? { guess: null, fake: s.mode === 'rand' ? s.h.id : null, weighs: s.weighs } : null,
  star: r => r.outcome === 'win' && r.mode === 'adv',
  steps: r => r.weighs.length,
  csv: r => ({ guess: hypText(r.guess), truth: hypText(r.fake), detail: r.weighs.map(w => `${w.L.join(' ')} | ${w.R.join(' ')} → ${SYM[w.o]}`).join('; ') })
};
