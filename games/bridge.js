// Qua cầu trong đêm: everyone must cross a bridge that holds two people, carrying the only torch, before it dies.
// The page plays the whole game and then sends its trips; they are replayed here before the result is saved.
const { bridge } = require('../rules.js');
const { int } = require('./random.js');

const MAX_TRIPS = 40;

// Five random walkers for whom "the fastest one escorts everybody" is too slow; the torch lasts exactly the best possible time.
function hardPuzzle() {
  for (;;) {
    const pool = Array.from({ length: 12 }, (_, i) => i + 1), times = [];
    while (times.length < 5) times.push(pool.splice(int(pool.length), 1)[0]);
    times.sort((a, b) => a - b);
    const escort = times.slice(1).reduce((s, t) => s + t, 0) + (times.length - 2) * times[0];
    const limit = bridge.best(times);
    if (limit < escort) return { times, limit };
  }
}

module.exports = {
  label: 'Qua cầu trong đêm',
  modes: { classic: 'Kinh điển', hard: 'Khó' },
  start: mode => mode === 'hard' ? hardPuzzle() : { times: [1, 2, 5, 10], limit: bridge.best([1, 2, 5, 10]) },
  view: s => ({ times: s.times, limit: s.limit }),
  actions: {
    // trips: who walks each time, as indexes into times; trips alternate there, back, there, ...
    finish(s, { trips }) {
      if (!Array.isArray(trips) || !trips.length || trips.length > MAX_TRIPS) return { error: 'Dữ liệu ván chơi không hợp lệ.' };
      const st = bridge.start(s.times.length), walked = [];
      for (const who of trips) {
        if (!bridge.can(st, who)) return { error: 'Dữ liệu ván chơi không hợp lệ.' };
        walked.push((st.torch ? '←' : '→') + who.map(i => s.times[i]).join('+'));
        bridge.cross(st, s.times, who);
        if (st.time > s.limit) break; // the torch died on this trip
      }
      const late = st.time > s.limit;
      if (!late && !bridge.done(st)) return { error: 'Vẫn còn người chưa qua cầu.' };
      const outcome = late ? 'lose' : 'win';
      return { reply: { outcome, time: st.time }, end: { outcome, times: s.times, limit: s.limit, n: st.time, trips: walked } };
    }
  },
  abandon: () => null,
  star: r => r.outcome === 'win' && r.mode === 'hard',
  steps: r => r.n,
  csv: r => ({ guess: `${r.n} phút`, truth: `${r.limit} phút`, detail: `Thời gian ${r.times.join(', ')} phút: ${r.trips.join(' ')}` })
};
