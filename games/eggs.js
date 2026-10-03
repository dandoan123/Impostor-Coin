// Thả trứng: a 100-floor building, 2 eggs, at most 14 drops.
// The answer T is the highest floor an egg survives (0 = it breaks even from floor 1, 100 = it never breaks).
const { int, pick } = require('./random.js');

const FLOORS = 100, EGGS = 2, MAX_DROPS = 14;

// need[e][m]: fewest drops that always tell apart m neighbouring values of T with e eggs left.
const need = [];
for (let e = 0; e <= EGGS; e++) {
  need[e] = [0, 0];
  for (let m = 2; m <= FLOORS + 1; m++) {
    let best = Infinity;
    // A drop splits the m values into the lower j (egg broke, one egg fewer) and the upper m - j (egg survived).
    if (e > 0) for (let j = 1; j < m; j++) best = Math.min(best, 1 + Math.max(need[e - 1][j], need[e][m - j]));
    need[e][m] = best;
  }
}

module.exports = {
  label: 'Thả trứng',
  modes: { adv: 'Khó', rand: 'Ngẫu nhiên' },
  // lo..hi are the values of T still possible after the drops so far.
  start: mode => ({ mode, T: int(FLOORS + 1), lo: 0, hi: FLOORS, eggs: EGGS, drops: [] }),
  actions: {
    drop(s, { f }) {
      if (!Number.isInteger(f) || f < 1 || f > FLOORS) return { error: 'Tầng không hợp lệ.' };
      if (!s.eggs) return { error: 'Bạn đã hết trứng.' };
      if (s.drops.length >= MAX_DROPS) return { error: `Bạn đã dùng hết ${MAX_DROPS} lần thả.` };
      let broke;
      if (s.mode === 'rand') broke = f > s.T;
      else if (f <= s.lo) broke = false;
      else if (f > s.hi) broke = true;
      else {
        // Adversary: T is not fixed yet. Give the outcome that leaves the player needing more drops
        // (then the one that keeps more floors possible).
        const below = f - s.lo, above = s.hi - f + 1;
        const ifBroke = need[s.eggs - 1][below], ifSafe = need[s.eggs][above];
        broke = ifBroke !== ifSafe ? ifBroke > ifSafe : below !== above ? below > above : pick([true, false]);
      }
      if (broke) { s.eggs--; s.hi = Math.min(s.hi, f - 1); } else s.lo = Math.max(s.lo, f);
      s.drops.push({ f, broke });
      return { reply: { broke, eggs: s.eggs, n: s.drops.length } };
    },
    guess(s, { t }) {
      if (!Number.isInteger(t) || t < 0 || t > FLOORS) return { error: 'Đáp án không hợp lệ.' };
      const remaining = s.hi - s.lo + 1;
      let truth;
      if (s.mode === 'rand') truth = s.T;
      else if (remaining === 1) truth = s.lo;
      else do truth = s.lo + int(remaining); while (truth === t);
      const win = truth === t;
      return {
        reply: { win, truth, consistentGuess: t >= s.lo && t <= s.hi, remaining },
        end: { outcome: win ? 'win' : 'lose', guess: t, truth, n: s.drops.length, drops: s.drops }
      };
    }
  },
  abandon: s => s.drops.length ? { guess: null, truth: s.mode === 'rand' ? s.T : null, n: s.drops.length, drops: s.drops } : null,
  star: r => r.outcome === 'win' && r.mode === 'adv',
  steps: r => r.n,
  csv: r => ({
    guess: r.guess === null ? '' : `Tầng ${r.guess}`, truth: r.truth === null ? '' : `Tầng ${r.truth}`,
    detail: r.drops.map(d => `${d.f} ${d.broke ? 'vỡ' : 'không vỡ'}`).join('; ')
  })
};
