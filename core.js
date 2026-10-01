// Shared by the page (index.html) and the server (server.js).
(function (root) {
  const HYPS = [];
  for (let c = 1; c <= 12; c++) for (const t of ['H', 'L']) HYPS.push({ c, t, id: c + t });

  function weigh(L, R, h) {
    const w = x => x === h.c ? (h.t === 'H' ? 11 : 9) : 10;
    const a = L.reduce((s, x) => s + w(x), 0), b = R.reduce((s, x) => s + w(x), 0);
    return a > b ? 'gt' : a < b ? 'lt' : 'eq';
  }
  function isNode(n) { return n !== null && typeof n === 'object'; }
  function consistent(steps) { return HYPS.filter(h => steps.every(s => weigh(s.L, s.R, h) === s.o)); }

  const api = { HYPS, weigh, isNode, consistent };
  if (typeof module === "object" && module.exports) module.exports = api;
  else Object.assign(root, api);
})(typeof window !== "undefined" ? window : globalThis);
