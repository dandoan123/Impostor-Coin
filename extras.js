// Extra tabs (machine solver, "you are the scale", full solution).
// Not a public file: server.js sends it only to players who qualify, and the page injects it.
// It runs in the page’s global scope and reuses the page’s helpers (makeScale, renderStrip, OUT, ...).
(function () {
  if (window.__extras) return;
  // Each node: weigh L against R, then follow gt (left heavier), eq (balanced) or lt (right heavier).
  // A leaf is "<coin><H|L>" (H = nặng hơn, L = nhẹ hơn); null means the outcome cannot happen.
  const TREE = {
    L: [1, 2, 3, 4], R: [5, 6, 7, 8],
    why: 'Chia 12 đồng thành ba nhóm 4. 24 khả năng chia đều 8 / 8 / 8 cho ba kết quả.',
    gt: {
      L: [1, 2, 5], R: [3, 6, 9],
      why: 'Còn 8 khả năng: 1–4 nặng hoặc 5–8 nhẹ. Giữ 1, 2 bên trái, chuyển 5 sang trái và 3 sang phải, giữ 6 bên phải, thêm 9 (đồng thật); cất 4, 7, 8.',
      gt: { L: [1], R: [2], why: 'Còn 1 nặng, 2 nặng hoặc 6 nhẹ. So 1 với 2: bên nặng là giả; cân bằng thì 6 nhẹ.', gt: '1H', eq: '6L', lt: '2H' },
      eq: { L: [7], R: [8], why: 'Còn 4 nặng, 7 nhẹ hoặc 8 nhẹ. So 7 với 8: bên nhẹ là giả; cân bằng thì 4 nặng.', gt: '8L', eq: '4H', lt: '7L' },
      lt: { L: [3], R: [12], why: 'Còn 3 nặng hoặc 5 nhẹ. So 3 với 12 (đồng thật).', gt: '3H', eq: '5L', lt: null }
    },
    eq: {
      L: [9, 10, 11], R: [1, 2, 3],
      why: '1–8 đều thật, đồng giả nằm trong 9–12. Đặt 9, 10, 11 với ba đồng thật 1, 2, 3.',
      gt: { L: [9], R: [10], why: 'Một trong 9, 10, 11 nặng. So 9 với 10: bên nặng là giả; cân bằng thì 11 nặng.', gt: '9H', eq: '11H', lt: '10H' },
      eq: { L: [12], R: [1], why: 'Chỉ còn đồng 12. So với đồng thật 1 để biết nặng hay nhẹ.', gt: '12H', eq: null, lt: '12L' },
      lt: { L: [9], R: [10], why: 'Một trong 9, 10, 11 nhẹ. So 9 với 10: bên nhẹ là giả; cân bằng thì 11 nhẹ.', gt: '10L', eq: '11L', lt: '9L' }
    },
    lt: {
      L: [1, 2, 5], R: [3, 6, 9],
      why: 'Còn 8 khả năng: 1–4 nhẹ hoặc 5–8 nặng. Cân đúng như nhánh “trái nặng”, chỉ đảo cách đọc kết quả.',
      gt: { L: [3], R: [12], why: 'Còn 3 nhẹ hoặc 5 nặng. So 3 với 12 (đồng thật).', gt: null, eq: '5H', lt: '3L' },
      eq: { L: [7], R: [8], why: 'Còn 4 nhẹ, 7 nặng hoặc 8 nặng. So 7 với 8: bên nặng là giả; cân bằng thì 4 nhẹ.', gt: '7H', eq: '4L', lt: '8H' },
      lt: { L: [1], R: [2], why: 'Còn 1 nhẹ, 2 nhẹ hoặc 6 nặng. So 1 với 2: bên nhẹ là giả; cân bằng thì 6 nặng.', gt: '2L', eq: '6H', lt: '1L' }
    }
  };
  function solve(h) {
    const path = []; let node = TREE;
    while (isNode(node)) { const o = weigh(node.L, node.R, h); path.push({ node, L: node.L, R: node.R, o }); node = node[o]; }
    return { path, leaf: node };
  }
  function verifyAll() { return HYPS.filter(h => { const r = solve(h); return r.leaf === h.id && r.path.length <= 3; }).length; }

  const TABS = [["sim", "Xem máy giải", "may-giai"], ["oracle", "Bạn là cái cân", "ban-la-can"], ["tree", "Lời giải đầy đủ", "loi-giai"]];
  const added = [];
  const nav = document.querySelector(".tabs");
  for (const [k, label, hash] of TABS) {
    const b = document.createElement("button");
    b.className = "tab"; b.type = "button"; b.id = "t-" + k; b.dataset.tab = k; b.textContent = label;
    b.setAttribute("role", "tab"); b.setAttribute("aria-controls", "p-" + k); b.setAttribute("aria-selected", "false"); b.tabIndex = -1;
    nav.appendChild(b); added.push(b); HASH[k] = hash;
  }
  const holder = document.createElement("div");
  holder.innerHTML = "<!-- Simulation -->\n<section id=\"p-sim\" role=\"tabpanel\" aria-labelledby=\"t-sim\" hidden>\n  <div class=\"stage\">\n    <div class=\"scale-card\">\n      <div class=\"scale-head\"><span class=\"step-label\" id=\"sim-steplabel\"></span><span class=\"pill\" id=\"sim-pill\"></span></div>\n      <div id=\"sim-scale\"></div>\n      <div class=\"strip\" id=\"sim-strip\"></div>\n      <p class=\"legend\"><span><b>±</b> có thể nặng hoặc nhẹ</span><span class=\"h\"><b>+</b> chỉ có thể nặng</span><span class=\"l\"><b>−</b> chỉ có thể nhẹ</span><span>mờ = chắc chắn thật</span><span>viền đậm = đồng giả bạn đặt</span></p>\n    </div>\n    <aside class=\"side\">\n      <div class=\"block\">\n        <p class=\"label\">Đặt đồng giả</p>\n        <p class=\"note\">Chọn đồng giả và nặng/nhẹ. Máy cân theo chiến lược cố định rồi tự suy ra đáp án.</p>\n        <div class=\"picker\" id=\"sim-pick\"></div>\n        <div class=\"row\">\n          <div class=\"seg\" id=\"sim-type\"><button data-t=\"H\">Nặng hơn</button><button data-t=\"L\">Nhẹ hơn</button></div>\n          <button class=\"btn\" id=\"sim-rand\">Ngẫu nhiên</button>\n        </div>\n      </div>\n      <div class=\"row\">\n        <button class=\"btn primary\" id=\"sim-next\"></button>\n        <button class=\"btn\" id=\"sim-all\">Cân hết</button>\n        <button class=\"btn\" id=\"sim-reset\">Làm lại</button>\n      </div>\n      <ol class=\"log\" id=\"sim-log\"></ol>\n      <div class=\"verdict good\" id=\"sim-verdict\" hidden></div>\n    </aside>\n  </div>\n</section>\n<!-- Oracle -->\n<section id=\"p-oracle\" role=\"tabpanel\" aria-labelledby=\"t-oracle\" hidden>\n  <div class=\"stage\">\n    <div class=\"scale-card\">\n      <div class=\"scale-head\"><span class=\"step-label\" id=\"or-steplabel\"></span><span class=\"pill\" id=\"or-pill\"></span></div>\n      <div id=\"or-scale\"></div>\n      <div class=\"strip\" id=\"or-strip\"></div>\n      <p class=\"legend\"><span><b>±</b> có thể nặng hoặc nhẹ</span><span class=\"h\"><b>+</b> chỉ có thể nặng</span><span class=\"l\"><b>−</b> chỉ có thể nhẹ</span><span>mờ = chắc chắn thật</span></p>\n    </div>\n    <aside class=\"side\">\n      <div class=\"block\">\n        <p class=\"label\">Cách chơi</p>\n        <p class=\"note\">Nghĩ sẵn trong đầu một đồng giả: số từ 1 đến 12, nặng hay nhẹ. Máy đặt đồng xu lên cân, bạn báo kết quả. Sau tối đa 3 lần, máy nói ra đồng bạn nghĩ.</p>\n      </div>\n      <div class=\"block\" id=\"or-ask\">\n        <p class=\"label\" id=\"or-prompt\"></p>\n        <div class=\"answers\">\n          <button class=\"btn\" data-o=\"gt\">Trái nặng hơn<small>T &gt; P</small></button>\n          <button class=\"btn\" data-o=\"eq\">Cân bằng<small>T = P</small></button>\n          <button class=\"btn\" data-o=\"lt\">Phải nặng hơn<small>T &lt; P</small></button>\n        </div>\n      </div>\n      <ol class=\"log\" id=\"or-log\"></ol>\n      <div class=\"verdict\" id=\"or-verdict\" hidden></div>\n      <div class=\"row\"><button class=\"btn\" id=\"or-reset\">Chơi lại</button></div>\n    </aside>\n  </div>\n</section>\n<!-- Full solution -->\n<section id=\"p-tree\" role=\"tabpanel\" aria-labelledby=\"t-tree\" hidden>\n  <div class=\"idea\">\n    <div><span class=\"n\">24 → 8</span><h3>Chia ba, không chia đôi</h3><p>Mỗi lần cân có 3 kết quả, nên phải chia các khả năng thành 3 phần gần bằng nhau. Lần 1 đặt 4 đồng mỗi bên, để 4 đồng ngoài: mỗi kết quả còn đúng 8 khả năng.</p></div>\n    <div><span class=\"n\">8 → 3</span><h3>Đổi chỗ đồng xu</h3><p>Khi cân lệch, ta biết đồng nào chỉ có thể nặng, đồng nào chỉ có thể nhẹ. Lần 2 chuyển vài đồng sang đĩa bên kia và thêm đồng thật, nên mỗi kết quả còn không quá 3 khả năng.</p></div>\n    <div><span class=\"n\">3 → 1</span><h3>Lần cuối</h3><p>Với 3 khả năng còn lại, so hai đồng với nhau (hoặc với một đồng chắc chắn thật). Mỗi kết quả trỏ đúng một đồng và cho biết nó nặng hay nhẹ.</p></div>\n  </div>\n  <div id=\"tree\"></div>\n  <h2 class=\"sec\">Kiểm tra cả 24 trường hợp</h2>\n  <p class=\"note\">Mỗi dòng là một khả năng. Ba cột giữa là kết quả của từng lần cân khi đi theo cây trên. Không có hai dòng nào trùng dãy kết quả, nên đáp án luôn xác định được.</p>\n  <div class=\"table-wrap\"><table id=\"cases\"></table></div>\n</section>";
  const wrap = document.querySelector(".wrap");
  for (const s of [...holder.children]) { wrap.appendChild(s); added.push(s); }

  /* ---------- tab 1: simulation ---------- */
  const simScale = makeScale($('sim-scale'));
  const sim = { h: HYPS.find(x => x.id === '7L'), step: 0, path: [] };
  const simPick = coinButtons($('sim-pick'), c => { sim.h = HYPS.find(x => x.c === c && x.t === sim.h.t); simReset(); });
  $('sim-type').addEventListener('click', e => { const t = e.target.closest('button')?.dataset.t; if (t) { sim.h = HYPS.find(x => x.c === sim.h.c && x.t === t); simReset(); } });
  $('sim-rand').addEventListener('click', () => { sim.h = HYPS[Math.floor(Math.random() * HYPS.length)]; simReset(); });
  $('sim-next').addEventListener('click', () => { if (sim.step < sim.path.length) { sim.step++; simRender(true); } });
  $('sim-all').addEventListener('click', () => { sim.step = sim.path.length; simRender(true); });
  $('sim-reset').addEventListener('click', simReset);
  function simReset() { sim.path = solve(sim.h).path; sim.step = 0; simRender(false); }
  function simRender(animate) {
    const n = sim.path.length, done = sim.path.slice(0, sim.step), finished = sim.step === n;
    simPick.forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.c === sim.h.c)));
    setSeg($('sim-type'), 't', sim.h.t);
    const marks = finished ? { [sim.h.c]: sim.h.t } : {};
    if (sim.step === 0) { simScale.show(sim.path[0].L, sim.path[0].R, 0); pill($('sim-pill'), null); }
    else { const s = done[done.length - 1]; simScale.show(s.L, s.R, OUT[s.o].tilt, marks, animate); pill($('sim-pill'), s.o); }
    $('sim-steplabel').textContent = finished ? `Xong sau ${n} lần cân` : `Lần cân ${sim.step === 0 ? 1 : sim.step} / 3`;
    renderStrip($('sim-strip'), consistent(done), sim.h.c);
    let html = done.map((s, i) => `<li><span class="num">${i + 1}</span><div class="body">${wlineHTML(s.L, s.R)}${outHTML(s.o)}<div class="hyps">${hypsHTML(consistent(done.slice(0, i + 1)))}</div></div></li>`).join('');
    if (!finished) { const nx = sim.path[sim.step]; html += `<li class="next"><span class="num">${sim.step + 1}</span><div class="body">${wlineHTML(nx.L, nx.R)}<p class="why">${esc(nx.node.why)}</p></div></li>`; }
    $('sim-log').innerHTML = html;
    $('sim-next').textContent = finished ? 'Đã cân xong' : `Cân lần ${sim.step + 1}`;
    $('sim-next').disabled = finished; $('sim-all').disabled = finished;
    const v = $('sim-verdict'); v.hidden = !finished;
    if (finished) {
      const leaf = solve(sim.h).leaf;
      v.innerHTML = `<p class="label">Kết luận</p><div class="big">${verdictBig(leaf)}</div><p class="tag">${leaf === sim.h.id ? '✓ Khớp với đồng giả bạn đã đặt' : '✗ Sai'}</p>`;
    }
  }

  /* ---------- tab 2: you are the scale ---------- */
  const orScale = makeScale($('or-scale'));
  const orc = { node: TREE, steps: [], busy: false, done: false, result: null };
  $('or-ask').addEventListener('click', e => { const o = e.target.closest('button')?.dataset.o; if (o) orAnswer(o); });
  $('or-reset').addEventListener('click', orReset);
  function orReset() { Object.assign(orc, { node: TREE, steps: [], busy: false, done: false, result: null }); orScale.show(TREE.L, TREE.R, 0); orRender(); }
  function orAnswer(o) {
    if (orc.busy || orc.done) return;
    const node = orc.node;
    orc.steps.push({ node, L: node.L, R: node.R, o });
    orc.busy = true; orScale.tilt(OUT[o].tilt); pill($('or-pill'), o); orRender();
    const next = node[o];
    setTimeout(() => {
      orc.busy = false;
      if (isNode(next)) { orc.node = next; orScale.show(next.L, next.R, 0); pill($('or-pill'), null); }
      else { orc.done = true; orc.result = next; if (next) orScale.mark({ [hc(next)]: ht(next) }); }
      orRender();
    }, reduceMotion ? 300 : 1100);
  }
  function orRender() {
    const k = orc.steps.length;
    $('or-steplabel').textContent = orc.done ? `Xong sau ${k} lần cân` : `Lần cân ${orc.busy ? k : k + 1} / 3`;
    if (!orc.busy && !orc.done) pill($('or-pill'), null);
    renderStrip($('or-strip'), consistent(orc.steps));
    $('or-prompt').textContent = orc.done ? 'Đã đủ thông tin' : `Lần ${k + (orc.busy ? 0 : 1)}: máy đã đặt đồng xu lên cân. Kết quả thế nào?`;
    $('or-ask').querySelectorAll('button').forEach(b => { b.disabled = orc.busy || orc.done; });
    $('or-log').innerHTML = orc.steps.map((s, i) => `<li><span class="num">${i + 1}</span><div class="body">${wlineHTML(s.L, s.R)}${outHTML(s.o)}<div class="hyps">${hypsHTML(consistent(orc.steps.slice(0, i + 1)))}</div></div></li>`).join('')
      + (!orc.done && !orc.busy ? `<li class="next"><span class="num">${k + 1}</span><div class="body">${wlineHTML(orc.node.L, orc.node.R)}<p class="why">${esc(orc.node.why)}</p></div></li>` : '');
    const v = $('or-verdict'); v.hidden = !orc.done;
    if (orc.done) {
      if (orc.result) { v.className = 'verdict good'; v.innerHTML = `<p class="label">Đồng bạn nghĩ</p><div class="big">${verdictBig(orc.result)}</div>`; }
      else { v.className = 'verdict bad'; v.innerHTML = `<p class="label">Có mâu thuẫn</p><p>Không đồng nào khớp với các kết quả này, nghĩa là cả 12 đồng đều thật. Có lẽ một câu trả lời bị nhầm; bấm “Chơi lại” để thử lại.</p>`; }
    }
  }

  /* ---------- tab 4: full solution ---------- */
  function renderTree() {
    const card = (node, tag) => `<div class="wcard"><span class="tagline">${tag}</span>${wlineHTML(node.L, node.R)}<p class="why">${esc(node.why)}</p></div>`;
    const branch = (o, node, steps, level) => {
      const s = steps.concat([{ L: node.L, R: node.R, o }]), child = node[o];
      let html = `<div class="${level === 1 ? 'branch' : 'sub'}"><div class="bhead"><span class="sym">${esc(OUT[o].sym)}</span><span class="t">${OUT[o].text}</span></div><div class="hyps">${hypsHTML(consistent(s))}</div>`;
      if (isNode(child)) {
        html += card(child, `Lần ${level + 1}`);
        if (level === 1) html += ORDER.map(o2 => branch(o2, child, s, 2)).join('');
        else html += '<ul class="leaves">' + ORDER.map(o3 => `<li><span class="sym">${esc(OUT[o3].sym)}</span>${child[o3] ? hypChip(child[o3]) : '<span class="none">không xảy ra</span>'}</li>`).join('') + '</ul>';
      }
      return html + '</div>';
    };
    $('tree').innerHTML = `<div class="root-card">${card(TREE, 'Lần 1')}</div><div class="branches">${ORDER.map(o => branch(o, TREE, [], 1)).join('')}</div>`;
    $('cases').innerHTML = '<thead><tr><th>Đồng giả</th><th>Lần 1</th><th>Lần 2</th><th>Lần 3</th><th>Kết luận</th><th>Đúng?</th></tr></thead><tbody>'
      + HYPS.map(h => { const r = solve(h); const cell = i => r.path[i] ? esc(OUT[r.path[i].o].sym) : '–';
        return `<tr><td>${hypChip(h.id)}</td><td class="m">${cell(0)}</td><td class="m">${cell(1)}</td><td class="m">${cell(2)}</td><td>${r.leaf ? hypChip(r.leaf) : '–'}</td><td class="okc">${r.leaf === h.id ? '✓' : '✗'}</td></tr>`; }).join('')
      + '</tbody>';
  }


  renderTree();
  simReset();
  orReset();
  window.__extras = {
    remove() { added.forEach(e => e.remove()); TABS.forEach(([k]) => delete HASH[k]); delete window.__extras; }
  };
})();
