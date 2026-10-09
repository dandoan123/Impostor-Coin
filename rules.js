// Rules of the puzzles that are played in the page: Tháp Hà Nội, Đong nước, Qua cầu, Qua sông.
// The page plays with them; the server replays the submitted moves with the same code before it saves a result.
(function (root) {
  /* Tháp Hà Nội: three pegs, each listed bottom to top; a bigger number is a bigger disc. */
  const top = peg => peg[peg.length - 1];
  const hanoi = {
    start: n => [Array.from({ length: n }, (_, i) => n - i), [], []],
    can: (pegs, from, to) => from !== to && pegs[from].length > 0 && (!pegs[to].length || top(pegs[to]) > top(pegs[from])),
    move(pegs, from, to) { pegs[to].push(pegs[from].pop()); },
    solved: pegs => !pegs[0].length && !pegs[1].length,
    best: n => 2 ** n - 1
  };

  /* Đong nước: [a, b] litres in jugs of caps [A, B]. A move fills a jug (f), empties it (e) or pours one into the other (ab, ba). */
  const jugs = {
    MOVES: ['fa', 'fb', 'ea', 'eb', 'ab', 'ba'],
    apply([a, b], [A, B], m) {
      if (m === 'fa') return [A, b];
      if (m === 'fb') return [a, B];
      if (m === 'ea') return [0, b];
      if (m === 'eb') return [a, 0];
      const k = m === 'ab' ? Math.min(a, B - b) : -Math.min(b, A - a);
      return [a - k, b + k];
    },
    solved: (s, target) => s[0] === target || s[1] === target,
    // Fewest moves from two empty jugs to the target; Infinity when it cannot be measured.
    best(caps, target) {
      const seen = new Set(['0,0']);
      let layer = [[0, 0]], n = 0;
      while (layer.length) {
        if (layer.some(s => jugs.solved(s, target))) return n;
        const next = [];
        for (const s of layer) for (const m of jugs.MOVES) {
          const t = jugs.apply(s, caps, m), k = t.join();
          if (!seen.has(k)) { seen.add(k); next.push(t); }
        }
        layer = next; n++;
      }
      return Infinity;
    }
  };

  /* Qua cầu: times[i] = minutes person i needs. far[i] tells whether person i has crossed; torch is 0 on the near bank, 1 on the far bank. */
  const bridge = {
    start: n => ({ far: Array(n).fill(false), torch: 0, time: 0 }),
    // One or two different people, all standing where the torch is.
    can: (st, who) => Array.isArray(who) && (who.length === 1 || (who.length === 2 && who[0] !== who[1]))
      && who.every(i => Number.isInteger(i) && i >= 0 && i < st.far.length && st.far[i] === (st.torch === 1)),
    cross(st, times, who) {
      who.forEach(i => { st.far[i] = !st.far[i]; });
      st.torch = 1 - st.torch;
      st.time += Math.max(...who.map(i => times[i]));
    },
    done: st => st.far.every(Boolean),
    // Shortest total time to bring everyone across (Dijkstra over "who has crossed" + where the torch is).
    best(times) {
      const all = (1 << times.length) - 1, dist = new Map([['0,0', 0]]), closed = new Set();
      for (;;) {
        let cur = null;
        for (const [k, d] of dist) if (!closed.has(k) && (cur === null || d < dist.get(cur))) cur = k;
        if (cur === null) return Infinity;
        const [mask, torch] = cur.split(',').map(Number), d = dist.get(cur);
        if (mask === all) return d;
        closed.add(cur);
        const here = times.map((_, i) => i).filter(i => (mask >> i & 1) === torch);
        for (let x = 0; x < here.length; x++) for (let y = x; y < here.length; y++) {
          const i = here[x], j = here[y];
          const k = (mask ^ (1 << i) ^ (i === j ? 0 : 1 << j)) + ',' + (1 - torch), nd = d + Math.max(times[i], times[j]);
          if (!dist.has(k) || nd < dist.get(k)) dist.set(k, nd);
        }
      }
    }
  };

  /* Qua sông: kinds[i] is what passenger i is; far[i] tells whether it has crossed; boat is 0 on the near bank, 1 on the far bank.
     A trip takes 1..cap passengers standing where the boat is, at least one of whom can row. */
  const ROWERS = ['farmer', 'monk', 'demon'];
  const river = {
    start: n => ({ far: Array(n).fill(false), boat: 0 }),
    can: (st, kinds, cap, who) => Array.isArray(who) && who.length >= 1 && who.length <= cap && new Set(who).size === who.length
      && who.every(i => Number.isInteger(i) && i >= 0 && i < kinds.length && st.far[i] === (st.boat === 1))
      && who.some(i => ROWERS.includes(kinds[i])),
    cross(st, who) { who.forEach(i => { st.far[i] = !st.far[i]; }); st.boat = 1 - st.boat; },
    // What goes wrong on a bank holding these kinds, or '' when it is safe.
    trouble(kinds) {
      const n = k => kinds.filter(x => x === k).length;
      if (!n('farmer') && n('wolf') && n('goat')) return 'Sói ăn thịt dê';
      if (!n('farmer') && n('goat') && n('cabbage')) return 'Dê ăn mất bắp cải';
      if (n('monk') && n('demon') > n('monk')) return 'Quỷ đông hơn sư và bắt mất các sư';
      return '';
    },
    // The trouble after the boat lands, on either bank: [message, bank] or null.
    check(st, kinds) {
      for (const side of [0, 1]) {
        const t = river.trouble(kinds.filter((_, i) => st.far[i] === (side === 1)));
        if (t) return [t, side];
      }
      return null;
    },
    done: st => st.far.every(Boolean),
    // Fewest trips that bring everyone across without trouble; Infinity when it cannot be done.
    best(kinds, cap) {
      const key = st => st.far.map(Number).join('') + st.boat;
      let layer = [river.start(kinds.length)], n = 0;
      const seen = new Set([key(layer[0])]);
      while (layer.length) {
        if (layer.some(river.done)) return n;
        const next = [];
        for (const st of layer) {
          const here = kinds.map((_, i) => i).filter(i => st.far[i] === (st.boat === 1));
          const groups = here.map(i => [i]);
          if (cap >= 2) for (let x = 0; x < here.length; x++) for (let y = x + 1; y < here.length; y++) groups.push([here[x], here[y]]);
          for (const who of groups) {
            if (!river.can(st, kinds, cap, who)) continue;
            const t = { far: st.far.slice(), boat: st.boat };
            river.cross(t, who);
            const k = key(t);
            if (river.check(t, kinds) || seen.has(k)) continue;
            seen.add(k); next.push(t);
          }
        }
        layer = next; n++;
      }
      return Infinity;
    }
  };

  const api = { hanoi, jugs, bridge, river };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.RULES = api;
})(typeof window !== "undefined" ? window : globalThis);
