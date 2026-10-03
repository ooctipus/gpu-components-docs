/* Interactive figures for the GPU Components documentation.
   Vanilla JS, no dependencies. Each widget is a small model of one component,
   drawn with inline SVG, with a log that names the operation and the rule. */
(function () {
  "use strict";

  const C = {
    live: "#2563eb", fresh: "#16a34a", free: "#e5e7eb", freeStroke: "#9ca3af",
    notReady: "#fef3c7", unmapped: "#f3f4f6", outside: "#f97316", text: "#111827",
    muted: "#6b7280", bad: "#dc2626", mapped: "#93c5fd", ready: "#2563eb",
  };

  function el(tag, attrs, children) {
    const n = document.createElement(tag);
    for (const k in attrs || {}) {
      if (k === "onclick" || k === "oninput") n.addEventListener(k.slice(2), attrs[k]);
      else if (k === "text") n.textContent = attrs[k];
      else n.setAttribute(k, attrs[k]);
    }
    (children || []).forEach((c) => n.appendChild(typeof c === "string" ? document.createTextNode(c) : c));
    return n;
  }
  function svg(tag, attrs, children) {
    const n = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (const k in attrs || {}) {
      if (k === "onclick") n.addEventListener("click", attrs[k]);
      else if (k === "text") n.textContent = attrs[k];
      else n.setAttribute(k, attrs[k]);
    }
    (children || []).forEach((c) => n.appendChild(c));
    return n;
  }
  function button(label, onclick, primary) {
    return el("button", { class: "gc-btn" + (primary ? " gc-btn-primary" : ""), onclick, text: label });
  }
  function logPanel() {
    const box = el("div", { class: "gc-log" });
    return {
      box,
      add(msg, kind) {
        const line = el("div", { class: "gc-log-line" + (kind ? " gc-log-" + kind : ""), text: msg });
        box.prepend(line);
        while (box.children.length > 7) box.removeChild(box.lastChild);
      },
    };
  }
  function stat(label, value) {
    return el("div", { class: "gc-stat" }, [el("div", { class: "gc-stat-label", text: label }), el("div", { class: "gc-stat-value", text: String(value) })]);
  }

  /* ------------------------------------------------------------------ */
  /* 1. Population: directory worlds, handles, readiness, prefix coverage  */
  /* ------------------------------------------------------------------ */
  function population(root) {
    const PROTOS = [
      { name: "cartpole", cap: 16, ready: 8, bytes: 1, color: C.live, h: 34 },
      { name: "G1 humanoid", cap: 8, ready: 4, bytes: 16, color: "#7c3aed", h: 34 },
    ];
    const S = { gen: {}, nextId: 0, dense: [true, true], seq: 0, retired: [], rows: PROTOS.map((p) => Array(p.cap).fill(null)), ready: PROTOS.map((p) => p.ready) };
    const log = logPanel(); const figure = el("div", { class: "gc-figure" }); const stats = el("div", { class: "gc-stats" });
    const liveCount = (k) => S.rows[k].filter(Boolean).length;
    const freeRows = (k) => { const out = []; for (let r = 0; r < S.ready[k]; r++) if (!S.rows[k][r]) out.push(r); return out; };
    const pick = (k, free) => (S.dense[k] ? free[0] : free[(S.seq * 7919 + free.length * 31) % free.length]);
    const bytesLive = () => PROTOS.reduce((a, p, k) => a + liveCount(k) * p.bytes, 0);
    function create(k) {
      const p = PROTOS[k], free = freeRows(k);
      if (!free.length) { log.add(`admit (${p.name}): NO_SLOTS. No free admissible slot below ready=${S.ready[k]}. Grow this prototype first.`, "bad"); render(); return; }
      const row = pick(k, free), id = S.nextId++;
      S.gen[id] = 1; S.rows[k][row] = { id, gen: 1, fresh: true };
      const wasDense = S.dense[k]; S.dense[k] = false; S.seq += 1;
      log.add(`CREATE ${p.name} → world id ${id} gen 1 at slot ${row}. ${p.name} live_count=${liveCount(k)}; Data bytes live=${bytesLive()} units (${p.bytes} unit${p.bytes > 1 ? "s" : ""} added).` +
        (wasDense ? " Dense certificate held: lowest free slot. Any publication clears it." : " Sparse mode: a free slot in no promised order."));
      render();
    }
    function destroy(k, row) {
      const h = S.rows[k][row]; if (!h) return; const p = PROTOS[k];
      S.rows[k][row] = null; S.gen[h.id] += 1; S.retired.push({ id: h.id, gen: h.gen, row, k }); S.dense[k] = false; S.seq += 1;
      log.add(`DESTROY ${p.name} world (${h.id}, ${h.gen}) at slot ${row}. Slot freed, ${p.bytes} unit${p.bytes > 1 ? "s" : ""} of budget back; generation advanced to ${S.gen[h.id]}, so handle (${h.id}, ${h.gen}) is stale forever.`);
      render();
    }
    function compact(k) {
      const p = PROTOS[k]; const live = S.rows[k].map((h, r) => (h ? { ...h, from: r } : null)).filter(Boolean);
      const moves = live.filter((h) => h.from >= live.length).length; const packed = Array(p.cap).fill(null);
      live.forEach((h, i) => (packed[i] = { id: h.id, gen: h.gen, fresh: false }));
      S.rows[k] = packed; S.dense[k] = true; S.seq += 1;
      log.add(`plan_compaction (${p.name}) → ${moves} move(s), ${moves * p.bytes} unit(s) of Data copied and acknowledged; publish_compaction. Live slots are [0, ${live.length}). Handles unchanged. Certificate restored.`, "good");
      render();
    }
    function grow(k) {
      const p = PROTOS[k]; if (S.ready[k] >= p.cap) { log.add(`${p.name}: reserved capacity reached.`, "bad"); return; }
      const before = S.ready[k]; S.ready[k] = Math.min(p.cap, S.ready[k] + (k === 0 ? 8 : 2));
      log.add(`map_backing (${p.name}) → slots [${before}, ${S.ready[k]}) backed, ${(S.ready[k] - before) * p.bytes} unit(s) of pages mapped; publish_ready after initialization. No reader join: nothing could address these slots yet.`, "good");
      render();
    }
    function lookupStale() {
      if (!S.retired.length) { log.add("No retired handles yet. Destroy a world first.", "bad"); return; }
      const h = S.retired[S.retired.length - 1];
      log.add(`location(${h.id}, ${h.gen}) → invalid: current generation of id ${h.id} is ${S.gen[h.id]}. Slot ${h.row} of ${PROTOS[h.k].name} may now hold another world; the stale handle cannot reach it.`, "bad");
    }
    function reset() {
      S.rows = PROTOS.map((p) => Array(p.cap).fill(null)); S.ready = PROTOS.map((p) => p.ready); S.gen = {}; S.nextId = 0; S.dense = [true, true]; S.seq = 0; S.retired = [];
      log.add("allocate(slot_limits=(16, 8)) → two empty prototypes. Cartpole: 8 of 16 slots ready. G1: 4 of 8 slots ready."); render();
    }
    function render() {
      figure.innerHTML = "";
      const W = 720, x0 = 150, rowW = 34, UNITS_PER_GRANULE = 16;
      const s = svg("svg", { viewBox: `0 0 ${W} 230`, width: "100%" });
      s.appendChild(svg("text", { x: 16, y: 16, "font-size": 12, "font-weight": "600", fill: C.text, text: "Directory slots: positions in each prototype's virtual reservation (world indices)" }));
      s.appendChild(svg("text", { x: 16, y: 30, "font-size": 10, fill: C.muted, text: "Virtual: every slot has a fixed address. Physical: only slots left of the red ready marker have mapped pages. Pale slots are reserved only." }));
      PROTOS.forEach((p, k) => {
        const y0 = 54 + k * 84, live = liveCount(k);
        const granules = Math.ceil((S.ready[k] * p.bytes) / UNITS_PER_GRANULE);
        s.appendChild(svg("text", { x: 16, y: y0 + 12, "font-size": 12, fill: C.text, "font-weight": "600", text: p.name }));
        s.appendChild(svg("text", { x: 16, y: y0 + 26, "font-size": 9.5, fill: C.muted, text: `virtual: ${p.cap} slots reserved` }));
        s.appendChild(svg("text", { x: 16, y: y0 + 38, "font-size": 9.5, fill: C.muted, text: `physical: ${granules} granule${granules === 1 ? "" : "s"} = ${S.ready[k] * p.bytes} units` }));
        s.appendChild(svg("text", { x: 16, y: y0 + 50, "font-size": 9.5, fill: C.muted, text: `${p.bytes} unit${p.bytes > 1 ? "s" : ""} per world` }));
        s.appendChild(svg("rect", { x: x0, y: y0 - 6, width: Math.max(0, live * rowW - 4), height: 5, rx: 2, fill: p.color, opacity: 0.35 }));
        s.appendChild(svg("line", { x1: x0 + S.ready[k] * rowW - 2, y1: y0 - 8, x2: x0 + S.ready[k] * rowW - 2, y2: y0 + p.h + 6, stroke: C.bad, "stroke-width": 2, "stroke-dasharray": "4 3" }));
        s.appendChild(svg("text", { x: x0 + S.ready[k] * rowW + 2, y: y0 + p.h + 16, "font-size": 10, fill: C.bad, text: `ready ${S.ready[k]} (mapped)` }));
        for (let r = 0; r < p.cap; r++) {
          const x = x0 + r * rowW, h = S.rows[k][r];
          let fill = C.free, stroke = C.freeStroke;
          if (r >= S.ready[k]) { fill = C.unmapped; stroke = "#d1d5db"; }
          if (h) { fill = h.fresh ? C.fresh : p.color; stroke = "#1f2937"; if (r >= live) stroke = C.outside; }
          const rect = svg("rect", { x, y: y0, width: rowW - 4, height: p.h, rx: 5, fill, stroke, "stroke-width": h && r >= live ? 3 : 1, class: h ? "gc-clickable" : "", onclick: () => destroy(k, r) });
          if (h) rect.appendChild(svg("title", { text: `${p.name} id ${h.id} gen ${h.gen}. Click to destroy.` }));
          s.appendChild(rect);
          if (h) {
            s.appendChild(svg("text", { x: x + (rowW - 4) / 2, y: y0 + 14, "text-anchor": "middle", "font-size": 9.5, fill: "white", text: `id ${h.id}` }));
            s.appendChild(svg("text", { x: x + (rowW - 4) / 2, y: y0 + 27, "text-anchor": "middle", "font-size": 8.5, fill: "white", text: `gen ${h.gen}` }));
          }
          s.appendChild(svg("text", { x: x + (rowW - 4) / 2, y: y0 + p.h + 16, "text-anchor": "middle", "font-size": 9, fill: C.muted, text: String(r) }));
        }
      });
      figure.appendChild(s);
      stats.innerHTML = "";
      const outside = PROTOS.reduce((a, p, k) => a + S.rows[k].filter((h, r) => h && r >= liveCount(k)).length, 0);
      [["cartpole live", liveCount(0)], ["G1 live", liveCount(1)], ["Data bytes live", `${bytesLive()} units`], ["cartpole certificate", S.dense[0] ? "holds" : "cleared"], ["G1 certificate", S.dense[1] ? "holds" : "cleared"], ["live worlds a prefix kernel misses", outside]].forEach(([k, v]) => stats.appendChild(stat(k, v)));
      stats.lastChild.classList.toggle("gc-stat-bad", outside > 0);
    }
    root.appendChild(el("div", { class: "gc-toolbar" }, [
      button("Create cartpole", () => create(0), true), button("Create G1", () => create(1), true),
      button("Compact cartpoles", () => compact(0)), button("Compact G1s", () => compact(1)),
      button("Grow cartpole backing", () => grow(0)), button("Grow G1 backing", () => grow(1)),
      button("Look up a stale handle", lookupStale), button("Reset", reset),
    ]));
    root.appendChild(el("div", { class: "gc-hint", text: "Boxes are virtual slots, not physical pages. Click a live world to destroy it. Each box shows the world's identity and generation. One unit = one cartpole world's Data; a G1 world is 16 units; a granule is 16 units. Green: created this step. Grey: free and mapped. Pale: reserved, no physical pages. Orange outline: live but outside the prefix a count-driven kernel visits." }));
    root.appendChild(figure); root.appendChild(stats); root.appendChild(log.box);
    reset(); for (let i = 0; i < 6; i++) create(0); for (let i = 0; i < 3; i++) create(1);
    log.add("Six cartpoles and three G1s created while both certificates held: each prototype filled its lowest slots in order. Data bytes live = 6 + 48 = 54 units.");
  }

  /* ------------------------------------------------------------------ */
  /* 2. Lifecycle: one batch stepping through begin, admit, init, publish */
  /* ------------------------------------------------------------------ */
  function lifecycle(root) {
    const PH = ["IDLE", "VALIDATED", "ADMITTED", "IDLE"];
    const S = { phase: 0, seq: 1, lastSeq: 0, consumed: false, ack: [true, true, true, true], reqs: [], gens: { 1: 1, 2: 1 }, live: { 1: true, 2: true } };
    const log = logPanel(); const table = el("div", { class: "gc-table" }); const phaseBar = el("div", { class: "gc-phases" }); const stats = el("div", { class: "gc-stats" });
    function fresh() {
      S.reqs = [
        { op: "CREATE", id: "-", gen: "-", proto: 0, status: "", dest: "", note: "a new world" },
        { op: "DESTROY", id: 1, gen: S.gens[1], proto: "-", status: "", dest: "", note: "valid handle" },
        { op: "DESTROY", id: 1, gen: S.gens[1] - 1 >= 1 ? S.gens[1] - 1 : 0, proto: "-", status: "", dest: "", note: "stale handle for the same identity" },
        { op: "REPLACE", id: 2, gen: S.gens[2], proto: 0, status: "", dest: "", note: "valid handle, new row" },
      ];
    }
    function begin() {
      if (S.phase !== 0) { log.add("begin: PHASE_INVALID. The transaction is not idle; it was reset to IDLE.", "bad"); S.phase = 0; render(); return; }
      if (S.seq <= S.lastSeq) { S.consumed = false; log.add(`begin: sequence ${S.seq} was already consumed. Equal-sequence replay returns the earlier outcome and changes nothing. Idempotent.`, "good"); render(); return; }
      S.consumed = true; S.lastSeq = S.seq;
      S.reqs.forEach((q) => {
        if (q.op === "CREATE") q.status = "OK";
        else if (!S.live[q.id]) q.status = "NOT_ALIVE";
        else if (q.gen !== S.gens[q.id]) q.status = "STALE";
        else q.status = "OK";
      });
      S.phase = 1;
      log.add(`begin(seq ${S.seq}) → validated. Request 3 is STALE: it carries gen ${S.reqs[2].gen}, current gen is ${S.gens[1]}. Phase VALIDATED.`);
      render();
    }
    function admit() {
      if (S.phase !== 1) { log.add("admit requires VALIDATED.", "bad"); return; }
      // eligible conflicts: count only OK requests per identity
      const count = {}; S.reqs.forEach((q) => { if (q.status === "OK" && q.op !== "CREATE") count[q.id] = (count[q.id] || 0) + 1; });
      let row = 10;
      S.reqs.forEach((q) => {
        if (q.status !== "OK") return;
        if (q.op !== "CREATE" && count[q.id] > 1) { q.status = "CONFLICT"; return; }
        if (q.op === "CREATE" || q.op === "REPLACE") q.dest = `row ${row++}`;
      });
      S.phase = 2;
      log.add("admit → destinations assigned from the pre-batch free set. Only OK requests count toward conflicts, so the stale request 3 does not reject the valid request 2 on the same identity.", "good");
      render();
    }
    function initialize() {
      if (S.phase !== 2) { log.add("Initialization happens in ADMITTED.", "bad"); return; }
      const missing = S.reqs.filter((q, i) => q.dest && !S.ack[i]).length;
      log.add(`consumer kernel: wrote ${S.reqs.filter((q, i) => q.dest && S.ack[i]).length} destination row(s) and acknowledged them with sequence ${S.seq}.` + (missing ? ` ${missing} destination left unacknowledged.` : ""));
      render();
    }
    function publish() {
      if (S.phase !== 2) { log.add("publish requires ADMITTED.", "bad"); return; }
      let allOk = true;
      S.reqs.forEach((q, i) => {
        if (q.status !== "OK") { allOk = false; return; }
        if (q.dest && !S.ack[i]) { q.status = "INITIALIZATION_MISSING"; allOk = false; return; }
        if (q.op === "DESTROY") { S.live[q.id] = false; S.gens[q.id] += 1; }
        if (q.op === "REPLACE") { S.gens[q.id] += 1; }
        if (q.op === "CREATE") { S.gens[3] = 1; S.live[3] = true; q.id = 3; q.gen = 1; }
        q.status = "OK ✓";
      });
      S.phase = 0;
      log.add(`publish → committed. advance_allowed = ${allOk ? 1 : 0}.` + (allOk ? " Every request succeeded." : " At least one request failed, so dependent work must not advance; the other requests still took effect."), allOk ? "good" : "bad");
      render();
    }
    function toggleAck(i) { S.ack[i] = !S.ack[i]; render(); }
    function newSeq() { S.seq += 1; fresh(); S.phase = 0; log.add(`New commands with sequence ${S.seq}. The DESTROY requests now carry gen ${S.gens[1]} (valid) and gen ${S.gens[1] - 1} (stale).`); render(); }
    function reset() { S.phase = 0; S.seq = 1; S.lastSeq = 0; S.ack = [true, true, true, true]; S.gens = { 1: 1, 2: 1 }; S.live = { 1: true, 2: true }; fresh(); log.add("Four requests prepared under sequence 1."); render(); }

    function render() {
      phaseBar.innerHTML = "";
      ["IDLE", "begin", "VALIDATED", "admit", "ADMITTED", "initialize + ack", "publish"].forEach((name, i) => {
        const isPhase = i % 2 === 0 && i < 6;
        const active = (S.phase === 0 && i === 0) || (S.phase === 1 && i === 2) || (S.phase === 2 && i === 4);
        phaseBar.appendChild(el("div", { class: "gc-phase" + (isPhase ? " gc-phase-state" : " gc-phase-op") + (active ? " gc-phase-active" : ""), text: name }));
        if (i < 6) phaseBar.appendChild(el("div", { class: "gc-phase-arrow", text: "→" }));
      });
      table.innerHTML = "";
      const head = el("div", { class: "gc-row gc-row-head" }); ["#", "operation", "handle", "status", "destination", "acknowledge", ""].forEach((h) => head.appendChild(el("div", { text: h }))); table.appendChild(head);
      S.reqs.forEach((q, i) => {
        const r = el("div", { class: "gc-row" });
        r.appendChild(el("div", { text: String(i + 1) }));
        r.appendChild(el("div", { text: q.op }));
        r.appendChild(el("div", { text: q.op === "CREATE" && !String(q.id).match(/\d/) ? "—" : `(${q.id}, ${q.gen})` }));
        const st = el("div", { text: q.status || "—" });
        if (/STALE|CONFLICT|MISSING|NOT_ALIVE/.test(q.status)) st.classList.add("gc-bad"); else if (q.status) st.classList.add("gc-good");
        r.appendChild(st);
        r.appendChild(el("div", { text: q.dest || "—" }));
        const ack = el("div");
        if (q.op === "CREATE" || q.op === "REPLACE") {
          const cb = el("input", { type: "checkbox" }); cb.checked = S.ack[i]; cb.addEventListener("change", () => toggleAck(i)); ack.appendChild(cb);
        } else ack.textContent = "n/a";
        r.appendChild(ack);
        r.appendChild(el("div", { class: "gc-muted", text: q.note }));
        table.appendChild(r);
      });
      stats.innerHTML = "";
      [["sequence", S.seq], ["last consumed", S.lastSeq], ["id 1 generation", S.gens[1]], ["id 2 generation", S.gens[2]], ["phase", PH[S.phase]]].forEach(([k, v]) => stats.appendChild(stat(k, v)));
    }
    root.appendChild(el("div", { class: "gc-toolbar" }, [button("begin", begin, true), button("admit", admit, true), button("initialize", initialize, true), button("publish", publish, true), button("replay same sequence", begin), button("new sequence", newSeq), button("reset", reset)]));
    root.appendChild(el("div", { class: "gc-hint", text: "Step the batch through its stages. Uncheck an acknowledgement before publish to see INITIALIZATION_MISSING. Press begin again after publish to see idempotent replay." }));
    root.appendChild(phaseBar); root.appendChild(table); root.appendChild(stats); root.appendChild(log.box);
    reset();
  }

  /* ------------------------------------------------------------------ */
  /* 3. Graph replay: one captured graph, count slider, device updates    */
  /* ------------------------------------------------------------------ */
  function replay(root) {
    const CAP = 32, BLOCK = 8;
    const S = { live: 16, invalid: false, replays: 0 };
    const log = logPanel(); const figure = el("div", { class: "gc-figure" }); const stats = el("div", { class: "gc-stats" });
    const slider = el("input", { type: "range", min: 0, max: CAP, value: S.live, class: "gc-slider" });
    slider.addEventListener("input", () => { S.live = +slider.value; S.invalid = false; render(); });
    function doReplay() {
      S.replays += 1;
      const count = S.invalid ? CAP + 9 : S.live;
      if (S.invalid) log.add(`replay ${S.replays}: updater read count ${count} > maximum ${CAP} → node disabled, errors[0] = -1. The composition root must check errors before dependent work.`, "bad");
      else if (count === 0) log.add(`replay ${S.replays}: count 0 → SetEnabled(false). The node is a no-op this replay; about 0.3 µs of dispatch remains.`);
      else log.add(`replay ${S.replays}: updater wrote shape[0]=${count}, size=${count}, grid=${Math.ceil(count / BLOCK)} block(s), SetEnabled(true). One cudaGraphLaunch, no host readback.`, "good");
      render();
    }
    function pow2(n) { let p = 1; while (p < n) p *= 2; return p; }
    function render() {
      figure.innerHTML = "";
      const W = 720, x0 = 180, barW = 500, unit = barW / CAP;
      const s = svg("svg", { viewBox: `0 0 ${W} 190`, width: "100%" });
      // updater node
      s.appendChild(svg("rect", { x: 24, y: 40, width: 120, height: 48, rx: 8, fill: C.notReady, stroke: "#1f2937" }));
      s.appendChild(svg("text", { x: 84, y: 60, "text-anchor": "middle", "font-size": 12, fill: C.text, text: "updater node" }));
      s.appendChild(svg("text", { x: 84, y: 78, "text-anchor": "middle", "font-size": 12, fill: C.text, text: `reads count = ${S.invalid ? CAP + 9 : S.live}` }));
      s.appendChild(svg("path", { d: `M144 64 H${x0 - 6}`, stroke: "#1f2937", "stroke-width": 1.5 }));
      // kernel node, our design
      s.appendChild(svg("text", { x: x0, y: 30, "font-size": 12, fill: C.muted, text: `kernel node, captured at capacity ${CAP}; this replay runs:` }));
      s.appendChild(svg("rect", { x: x0, y: 40, width: barW, height: 48, rx: 6, fill: "none", stroke: C.freeStroke, "stroke-dasharray": "4 4" }));
      if (!S.invalid && S.live > 0) {
        for (let b = 0; b < Math.ceil(S.live / BLOCK); b++) {
          s.appendChild(svg("rect", { x: x0 + b * BLOCK * unit + 1, y: 42, width: BLOCK * unit - 2, height: 44, rx: 4, fill: C.live, opacity: 0.25 }));
        }
        s.appendChild(svg("rect", { x: x0, y: 40, width: S.live * unit, height: 48, rx: 6, fill: C.live }));
        s.appendChild(svg("text", { x: x0 + 8, y: 69, "font-size": 13, fill: "white", text: `${S.live} worlds, ${Math.ceil(S.live / BLOCK)} block(s) of ${BLOCK}` }));
      } else {
        s.appendChild(svg("text", { x: x0 + 8, y: 69, "font-size": 13, fill: S.invalid ? C.bad : C.muted, text: S.invalid ? "disabled: count exceeds the declared maximum (errors[0] = -1)" : "disabled: count is 0" }));
      }
      // padded-bucket comparison
      const bucket = S.live === 0 ? 0 : pow2(S.live);
      s.appendChild(svg("text", { x: x0, y: 120, "font-size": 12, fill: C.muted, text: `for comparison, a padded power-of-two graph would run:` }));
      s.appendChild(svg("rect", { x: x0, y: 130, width: barW, height: 36, rx: 6, fill: "none", stroke: C.freeStroke, "stroke-dasharray": "4 4" }));
      if (bucket > 0 && !S.invalid) {
        s.appendChild(svg("rect", { x: x0, y: 130, width: bucket * unit, height: 36, rx: 6, fill: C.outside, opacity: 0.8 }));
        s.appendChild(svg("rect", { x: x0, y: 130, width: S.live * unit, height: 36, rx: 6, fill: C.live, opacity: 0.6 }));
        s.appendChild(svg("text", { x: x0 + 8, y: 153, "font-size": 12, fill: "white", text: `${bucket} worlds: ${bucket - S.live} wasted (${Math.round(100 * (bucket - S.live) / Math.max(1, S.live))}% of useful work)` }));
      }
      figure.appendChild(s);
      stats.innerHTML = "";
      [["live count", S.live], ["worlds executed", S.invalid || S.live === 0 ? 0 : S.live], ["padded bucket would execute", S.invalid ? "—" : bucket], ["replays so far", S.replays], ["updater cost per replay", "about 2 µs (measured)"]].forEach(([k, v]) => stats.appendChild(stat(k, v)));
    }
    root.appendChild(el("div", { class: "gc-toolbar" }, [el("label", { class: "gc-label", text: "live world count on the device" }), slider, button("Replay", doReplay, true), button("Publish an invalid count", () => { S.invalid = true; render(); }), button("Reset", () => { S.live = 16; S.invalid = false; S.replays = 0; slider.value = 16; render(); })]));
    root.appendChild(el("div", { class: "gc-hint", text: "Drag the count. The graph is never re-captured; the updater node rewrites the kernel node's extent and grid at the start of each replay, or disables it." }));
    root.appendChild(figure); root.appendChild(stats); root.appendChild(log.box);
    render(); log.add("Graph captured once at capacity 32 and instantiated once. Move the slider, then press Replay.");
  }

  /* ------------------------------------------------------------------ */
  /* 4. Backing: reservation, granules, ready marker, joins, budget       */
  /* ------------------------------------------------------------------ */
  function backing(root) {
    const ROWS = 64, G = 16, BUDGET = 3; // granule = 16 rows; budget = 3 granules
    const S = { mappedGranules: 1, ready: 16, highWater: 1, target: 24, inMaintenance: false };
    const log = logPanel(); const figure = el("div", { class: "gc-figure" }); const stats = el("div", { class: "gc-stats" });
    const slider = el("input", { type: "range", min: 0, max: ROWS, value: S.target, class: "gc-slider" });
    slider.addEventListener("input", () => { S.target = +slider.value; render(); });
    const granulesFor = (rows) => Math.ceil(rows / G);
    function mapFresh() {
      const need = granulesFor(S.target);
      if (need <= S.mappedGranules) { log.add(`map_backing(${S.target}) → nothing to map: ${S.target} rows round up to ${need} granule(s), already mapped.`); return; }
      if (S.mappedGranules < S.highWater) { log.add(`map_backing(${S.target}) → the range [${S.mappedGranules * G}, ${S.highWater * G}) was mapped before. Historical addresses need joined maintenance; use resize_backing inside backing.maintenance.`, "bad"); return; }
      if (need > BUDGET) { log.add(`map(...) → MemoryError before any driver call: ${need} granules exceed the budget of ${BUDGET}. Nothing changed.`, "bad"); return; }
      S.mappedGranules = need; S.highWater = Math.max(S.highWater, need);
      log.add(`map_backing(${S.target}) → granules [${S.mappedGranules - (need - (S.mappedGranules))}…) mapped and access granted on the host. No reader join. Readiness not yet published: ready is still ${S.ready}.`, "good");
      render();
    }
    function publishReady() {
      const accessible = S.mappedGranules * G;
      const rows = Math.min(S.target, accessible);
      if (rows < S.ready) { log.add(`publish_ready(${rows}) rejected: readiness is monotone here; shrinking goes through resize_backing.`, "bad"); return; }
      if (S.target > accessible) log.add(`publish_ready(${S.target}) rejected: exceeds the accessible prefix ${accessible}. Publishing ${rows} instead.`, "bad");
      S.ready = rows;
      log.add(`publish_ready(${rows}) → device write ordered on the current stream. Initialize rows before admitting them.`, "good");
      render();
    }
    function shrink() {
      const need = granulesFor(S.target);
      if (need >= S.mappedGranules) { log.add(`resize_backing(${S.target}) → ${S.target} rows still need ${need} granule(s); nothing is unmapped. Granularity.`); return; }
      S.inMaintenance = true; render();
      log.add(`backing.maintenance: synchronizing every named stream, so no reader of rows ≥ ${need * G} is in flight…`);
      setTimeout(() => {
        S.ready = Math.min(S.ready, need * G); S.mappedGranules = need; S.inMaintenance = false;
        log.add(`resize_backing(${S.target}) → published ready=${S.ready} first, then unmapped granules ≥ ${need}. High-water mark stays at ${S.highWater}: regrowing here needs a join.`, "good");
        render();
      }, 900);
    }
    function reset() { S.mappedGranules = 1; S.ready = 16; S.highWater = 1; S.target = 24; slider.value = 24; S.inMaintenance = false; log.add("reserve 64 rows; map 1 granule; ready 16. Budget: 3 granules."); render(); }
    function render() {
      figure.innerHTML = "";
      const W = 720, x0 = 24, gw = 160;
      const s = svg("svg", { viewBox: `0 0 ${W} 150`, width: "100%" });
      s.appendChild(svg("text", { x: x0, y: 22, "font-size": 12, fill: C.muted, text: `reservation: ${ROWS} slots of virtual address, ${ROWS / G} granules of ${G} slots` }));
      for (let g = 0; g < ROWS / G; g++) {
        const x = x0 + g * gw;
        const mapped = g < S.mappedGranules, hist = !mapped && g < S.highWater;
        s.appendChild(svg("rect", { x, y: 36, width: gw - 6, height: 44, rx: 5, fill: mapped ? C.mapped : hist ? "#fde68a" : C.unmapped, stroke: mapped ? "#1f2937" : hist ? "#b45309" : "#d1d5db" }));
        s.appendChild(svg("text", { x: x + (gw - 6) / 2, y: 54, "text-anchor": "middle", "font-size": 12, fill: C.text, text: `granule ${g}` }));
        s.appendChild(svg("text", { x: x + (gw - 6) / 2, y: 71, "text-anchor": "middle", "font-size": 11, fill: C.muted, text: mapped ? "mapped" : hist ? "unmapped, was mapped before" : "never mapped" }));
      }
      const rx = x0 + (S.ready / ROWS) * (gw * 4 - 6);
      s.appendChild(svg("line", { x1: rx, y1: 30, x2: rx, y2: 90, stroke: C.ready, "stroke-width": 3 }));
      s.appendChild(svg("text", { x: rx, y: 104, "text-anchor": "middle", "font-size": 11, fill: C.ready, text: `ready = ${S.ready}` }));
      const tx = x0 + (S.target / ROWS) * (gw * 4 - 6);
      s.appendChild(svg("line", { x1: tx, y1: 30, x2: tx, y2: 90, stroke: C.outside, "stroke-width": 2, "stroke-dasharray": "3 3" }));
      s.appendChild(svg("text", { x: tx, y: 120, "text-anchor": "middle", "font-size": 11, fill: C.outside, text: `target = ${S.target} → ${granulesFor(S.target)} granule(s)` }));
      // budget bar
      s.appendChild(svg("text", { x: x0, y: 142, "font-size": 11, fill: C.muted, text: `budget: ${S.mappedGranules} of ${BUDGET} granules in use` }));
      for (let b = 0; b < BUDGET; b++) s.appendChild(svg("rect", { x: 300 + b * 30, y: 132, width: 24, height: 12, rx: 2, fill: b < S.mappedGranules ? C.mapped : C.free, stroke: C.freeStroke }));
      if (S.inMaintenance) s.appendChild(svg("text", { x: W - 24, y: 142, "text-anchor": "end", "font-size": 12, fill: C.bad, text: "maintenance scope: joining readers…" }));
      figure.appendChild(s);
      stats.innerHTML = "";
      [["mapped slots", S.mappedGranules * G], ["ready slots", S.ready], ["reserved slots", ROWS], ["high-water mark", S.highWater * G], ["fresh map needs a join?", S.mappedGranules < S.highWater ? "yes, historical" : "no"]].forEach(([k, v]) => stats.appendChild(stat(k, v)));
    }
    root.appendChild(el("div", { class: "gc-toolbar" }, [el("label", { class: "gc-label", text: "target slots" }), slider, button("map_backing", mapFresh, true), button("publish_ready", publishReady, true), button("resize_backing (shrink, joined)", shrink), button("Reset", reset)]));
    root.appendChild(el("div", { class: "gc-hint", text: "Drag the target. Mapping rounds to granules; growth into never-mapped granules needs no reader join; shrinking and regrowth over a previously mapped granule go through a joined maintenance scope." }));
    root.appendChild(figure); root.appendChild(stats); root.appendChild(log.box);
    reset();
  }

  /* ------------------------------------------------------------------ */
  /* 5. Memory: contiguous virtual reservations over a pool of granules   */
  /* ------------------------------------------------------------------ */
  function memory(root) {
    const GRANULE = 2; // MiB
    const STORES = [
      { name: "cartpole storage", slots: 1048576, stride: 16, granules: 8, color: C.live },
      { name: "G1 storage", slots: 65536, stride: 284, granules: 9, color: "#7c3aed" },
    ];
    const BUDGET = 12; // granule handles
    // physical handles: id -> {owner: storeIndex|null, vslot: granule index|null}; spare = owner null but allocated
    const S = { handles: [], nextHandle: 0, mapped: STORES.map(() => []) , joined: false };
    const log = logPanel(); const figure = el("div", { class: "gc-figure" }); const stats = el("div", { class: "gc-stats" });
    const retained = () => S.handles.length;
    const spare = () => S.handles.filter((h) => h.owner === null);
    function acquire() { const sp = spare(); if (sp.length) return sp[0]; if (retained() >= BUDGET) return null; const h = { id: S.nextHandle++, owner: null, vslot: null }; S.handles.push(h); return h; }
    function grow(k) {
      const st = STORES[k]; const next = S.mapped[k].length;
      if (next >= st.granules) { log.add(`${st.name}: every virtual granule is already mapped.`, "bad"); return; }
      const h = acquire();
      if (!h) { log.add(`map (${st.name}) → MemoryError before any driver call: ${retained()} handles retained, budget ${BUDGET}. Nothing changed.`, "bad"); render(); return; }
      const reused = S.handles.includes(h) && h.id < S.nextHandle - 1 && spare().includes(h);
      h.owner = k; h.vslot = next; S.mapped[k].push(h);
      log.add(`map (${st.name}) → virtual granule ${next} at base + ${next * GRANULE} MiB ← physical handle #${h.id}${reused ? " (reused from the spare pool)" : " (cuMemCreate)"}. Virtual address of every slot unchanged. No reader join: never-mapped range.`, "good");
      render();
    }
    function shrink(k) {
      const st = STORES[k]; if (!S.mapped[k].length) { log.add(`${st.name}: nothing mapped.`, "bad"); return; }
      S.joined = true; render();
      log.add(`backing.maintenance (${st.name}): joining every named stream before cuMemUnmap…`);
      setTimeout(() => { const h = S.mapped[k].pop(); h.owner = null; h.vslot = null; S.joined = false;
        log.add(`unmap (${st.name}) → virtual granule ${S.mapped[k].length} unmapped; handle #${h.id} returns to the spare pool, still counted against the budget until trim. The virtual range stays reserved; pointers stay valid.`, "good"); render(); }, 800);
    }
    function trim() { const sp = spare(); if (!sp.length) { log.add("trim → no spare handles to release.", "bad"); return; } S.handles = S.handles.filter((h) => h.owner !== null); log.add(`trim → cuMemRelease on ${sp.length} spare handle(s); budget use drops to ${retained()}.`, "good"); render(); }
    function reset() { S.handles = []; S.nextHandle = 0; S.mapped = STORES.map(() => []); S.joined = false; log.add("reserve → two contiguous virtual ranges, nothing mapped. Virtual space is free; the budget counts physical handles only."); for (let i = 0; i < 4; i++) grow(0); for (let i = 0; i < 3; i++) grow(1); }
    function render() {
      figure.innerHTML = "";
      const W = 760, x0 = 150, gw = 56; const s = svg("svg", { viewBox: `0 0 ${W} 300`, width: "100%" });
      s.appendChild(svg("text", { x: 16, y: 18, "font-size": 12, "font-weight": "600", fill: C.text, text: "virtual address space: one contiguous reservation per storage, fixed for its lifetime" }));
      STORES.forEach((st, k) => {
        const y = 36 + k * 64; const vbytes = st.slots * st.stride / 1048576;
        s.appendChild(svg("text", { x: 16, y: y + 16, "font-size": 11, fill: C.text, text: st.name }));
        s.appendChild(svg("text", { x: 16, y: y + 30, "font-size": 9.5, fill: C.muted, text: `${st.slots.toLocaleString()} slots × ${st.stride} B = ${vbytes.toFixed(0)} MiB` }));
        for (let g = 0; g < st.granules; g++) {
          const x = x0 + g * gw, m = S.mapped[k][g];
          s.appendChild(svg("rect", { x, y, width: gw - 4, height: 30, rx: 4, fill: m ? st.color : "#fafafa", stroke: m ? "#1f2937" : "#cbd5e1", "stroke-dasharray": m ? "" : "3 3" }));
          s.appendChild(svg("text", { x: x + (gw - 4) / 2, y: y + 19, "text-anchor": "middle", "font-size": 10, fill: m ? "white" : C.muted, text: m ? `#${m.id}` : `v${g}` }));
        }
        s.appendChild(svg("text", { x: x0 + st.granules * gw + 4, y: y + 19, "font-size": 10, fill: C.muted, text: `slot i at base + i × ${st.stride}` }));
      });
      // physical pool
      const py = 200;
      s.appendChild(svg("text", { x: 16, y: py - 14, "font-size": 12, "font-weight": "600", fill: C.text, text: `physical memory: ${GRANULE} MiB granule handles from a pool, budget ${BUDGET} handles = ${BUDGET * GRANULE} MiB` }));
      for (let i = 0; i < BUDGET; i++) {
        const x = x0 + i * gw, h = S.handles[i];
        const fill = !h ? "#ffffff" : h.owner === null ? "#fde68a" : STORES[h.owner].color;
        s.appendChild(svg("rect", { x, y: py, width: gw - 4, height: 30, rx: 4, fill, stroke: h ? "#1f2937" : "#cbd5e1", "stroke-dasharray": h ? "" : "3 3" }));
        s.appendChild(svg("text", { x: x + (gw - 4) / 2, y: py + 19, "text-anchor": "middle", "font-size": 10, fill: h && h.owner !== null ? "white" : C.muted, text: h ? `#${h.id}` : "free" }));
        if (h && h.owner !== null) {
          const vy = 36 + h.owner * 64 + 30, vx = x0 + h.vslot * gw + (gw - 4) / 2;
          s.appendChild(svg("path", { d: `M${x + (gw - 4) / 2} ${py} C ${x + (gw - 4) / 2} ${py - 40}, ${vx} ${vy + 40}, ${vx} ${vy}`, fill: "none", stroke: STORES[h.owner].color, "stroke-width": 1.4, opacity: 0.7 }));
        }
      }
      s.appendChild(svg("text", { x: 16, y: py + 52, "font-size": 10, fill: C.muted, text: "white dashed: not yet created · yellow: spare, created but unmapped, still counted · colored: mapped into the storage of that color" }));
      if (S.joined) s.appendChild(svg("text", { x: W - 16, y: py + 52, "text-anchor": "end", "font-size": 11, fill: C.bad, text: "maintenance: joining readers…" }));
      s.appendChild(svg("text", { x: 16, y: 290, "font-size": 10, fill: C.muted, text: "Physical handles are interchangeable: a handle freed by the G1 storage can back a cartpole granule later. Virtual granules never move." }));
      figure.appendChild(s);
      stats.innerHTML = "";
      const vtotal = STORES.reduce((a, st) => a + st.granules * GRANULE, 0), mapped = S.handles.filter((h) => h.owner !== null).length;
      [["virtual reserved", `${vtotal} MiB, costs nothing`], ["physical mapped", `${mapped * GRANULE} MiB`], ["spare (unmapped, retained)", `${spare().length * GRANULE} MiB`], ["budget in use", `${retained()} / ${BUDGET} handles`]].forEach(([k, v]) => stats.appendChild(stat(k, v)));
    }
    root.appendChild(el("div", { class: "gc-toolbar" }, [button("Grow cartpole", () => grow(0), true), button("Grow G1", () => grow(1), true), button("Shrink cartpole (joined)", () => shrink(0)), button("Shrink G1 (joined)", () => shrink(1)), button("trim spare handles", trim), button("Reset", reset)]));
    root.appendChild(el("div", { class: "gc-hint", text: "Top: contiguous virtual ranges, one per storage, sized for the maximum population. Bottom: the pool of physical granule handles the budget counts. Curves show which handle backs which virtual granule." }));
    root.appendChild(figure); root.appendChild(stats); root.appendChild(log.box);
    reset();
  }

  /* ------------------------------------------------------------------ */
  /* 6. Distribution: a memory budget, a target mix, and reset batches    */
  /* ------------------------------------------------------------------ */
  function distribution(root) {
    const P = [
      { name: "cartpole", bytes: 1, slots: 192, color: C.live },
      { name: "G1", bytes: 16, slots: 24, color: "#7c3aed" },
    ];
    const S = { budget: 128, desired: [48, 4], ending: 0.3, live: [48, 4], seq: 0, lastBatch: null };
    const log = logPanel(); const figure = el("div", { class: "gc-figure" }); const stats = el("div", { class: "gc-stats" }); const batchBox = el("div", { class: "gc-table" });
    const used = () => S.live[0] * P[0].bytes + S.live[1] * P[1].bytes;
    const targets = () => [Math.min(P[0].slots, S.desired[0]), Math.min(P[1].slots, S.desired[1])];
    const desiredUnits = () => S.desired[0] * P[0].bytes + S.desired[1] * P[1].bytes;
    const sl = (label, min, max, step, val, oninput) => { const i = el("input", { type: "range", min, max, step, value: val, class: "gc-slider" }); i.addEventListener("input", oninput); return [el("label", { class: "gc-label", text: label }), i]; };
    function reset() {
      S.seq += 1;
      const tgt = targets();
      // 1. episodes end
      const ended = S.live.map((n) => Math.round(n * S.ending));
      const batch = { seq: S.seq, ended, destroy: [0, 0], replace: [[0, 0], [0, 0]], create: [0, 0], rejectedBudget: [0, 0], rejectedSlots: [0, 0] };
      let live = S.live.slice();
      let mem = used();
      // ended worlds are freed first (destroy), their memory returns
      for (let k = 0; k < 2; k++) { live[k] -= ended[k]; mem -= ended[k] * P[k].bytes; }
      // 2. fill toward target: prefer REPLACE of an ended world (same identity) when the destination prototype needs worlds
      let pool = ended.slice(); // identities available for REPLACE, by origin prototype
      const need = [Math.max(0, tgt[0] - live[0]), Math.max(0, tgt[1] - live[1])];
      // replacements: same-prototype first, then cross-prototype
      for (const [from, to] of [[0, 0], [1, 1], [0, 1], [1, 0]]) {
        while (pool[from] > 0 && need[to] > 0) {
          if (live[to] >= P[to].slots) { batch.rejectedSlots[to] += 1; pool[from] -= 1; batch.destroy[from] += 1; continue; }
          if (mem + P[to].bytes > S.budget) { batch.rejectedBudget[to] += 1; pool[from] -= 1; batch.destroy[from] += 1; continue; }
          pool[from] -= 1; need[to] -= 1; live[to] += 1; mem += P[to].bytes; batch.replace[from][to] += 1;
        }
      }
      // identities not replaced are destroyed
      for (let k = 0; k < 2; k++) { batch.destroy[k] += pool[k]; pool[k] = 0; }
      // 3. creates for remaining need
      for (const to of [1, 0]) {
        while (need[to] > 0) {
          if (live[to] >= P[to].slots) { batch.rejectedSlots[to] += 1; need[to] -= 1; continue; }
          if (mem + P[to].bytes > S.budget) { batch.rejectedBudget[to] += 1; need[to] -= 1; continue; }
          need[to] -= 1; live[to] += 1; mem += P[to].bytes; batch.create[to] += 1;
        }
      }
      S.live = live; S.lastBatch = batch;
      const rep = batch.replace;
      log.add(`reset → batch ${S.seq}: ended ${ended[0]} cartpole / ${ended[1]} G1. REPLACE ${rep[0][0]} cartpole→cartpole, ${rep[1][1]} G1→G1, ${rep[0][1]} cartpole→G1, ${rep[1][0]} G1→cartpole. CREATE ${batch.create[0]} cartpole / ${batch.create[1]} G1. DESTROY ${batch.destroy[0]} / ${batch.destroy[1]}.` +
        ((batch.rejectedBudget[0] + batch.rejectedBudget[1]) ? ` ${batch.rejectedBudget[0] + batch.rejectedBudget[1]} request(s) rejected: budget.` : "") +
        ((batch.rejectedSlots[0] + batch.rejectedSlots[1]) ? ` ${batch.rejectedSlots[0] + batch.rejectedSlots[1]} rejected: NO_SLOTS, grow that prototype's admissible prefix.` : ""),
        (batch.rejectedBudget[0] + batch.rejectedBudget[1] + batch.rejectedSlots[0] + batch.rejectedSlots[1]) ? "bad" : "good");
      render();
    }
    function render() {
      figure.innerHTML = ""; const W = 760; const s = svg("svg", { viewBox: `0 0 ${W} 150`, width: "100%" });
      const x0 = 24, barW = W - 48, unit = barW / Math.max(S.budget, used());
      const tgt = targets();
      // memory bar
      s.appendChild(svg("text", { x: x0, y: 18, "font-size": 12, fill: C.text, "font-weight": "600", text: `memory in use: ${used()} of ${S.budget} units` }));
      s.appendChild(svg("rect", { x: x0, y: 28, width: barW, height: 26, rx: 5, fill: C.free, stroke: C.freeStroke }));
      const w0 = S.live[0] * P[0].bytes * unit, w1 = S.live[1] * P[1].bytes * unit;
      s.appendChild(svg("rect", { x: x0, y: 28, width: w0, height: 26, rx: 5, fill: P[0].color }));
      s.appendChild(svg("rect", { x: x0 + w0, y: 28, width: w1, height: 26, fill: P[1].color }));
      if (w0 > 60) s.appendChild(svg("text", { x: x0 + 8, y: 46, "font-size": 11, fill: "white", text: `${S.live[0]} cartpole = ${S.live[0] * P[0].bytes}` }));
      if (w1 > 60) s.appendChild(svg("text", { x: x0 + w0 + 8, y: 46, "font-size": 11, fill: "white", text: `${S.live[1]} G1 = ${S.live[1] * P[1].bytes}` }));
      const bx = x0 + S.budget * unit; s.appendChild(svg("line", { x1: bx, y1: 22, x2: bx, y2: 60, stroke: C.bad, "stroke-width": 2 })); s.appendChild(svg("text", { x: bx, y: 72, "text-anchor": "middle", "font-size": 10, fill: C.bad, text: "budget" }));
      // target bar
      const over = desiredUnits() - S.budget;
      s.appendChild(svg("text", { x: x0, y: 96, "font-size": 12, fill: over > 0 ? C.bad : C.text, "font-weight": "600", text: `desired: ${S.desired[0]} cartpole + ${S.desired[1]} G1 = ${desiredUnits()} units` + (over > 0 ? ` — exceeds the budget by ${over}; resets will reject the excess` : "") }));
      s.appendChild(svg("rect", { x: x0, y: 106, width: barW, height: 16, rx: 4, fill: C.free, stroke: C.freeStroke }));
      s.appendChild(svg("rect", { x: x0, y: 106, width: tgt[0] * P[0].bytes * unit, height: 16, rx: 4, fill: P[0].color, opacity: 0.5 }));
      s.appendChild(svg("rect", { x: x0 + tgt[0] * P[0].bytes * unit, y: 106, width: tgt[1] * P[1].bytes * unit, height: 16, fill: P[1].color, opacity: 0.5 }));
      s.appendChild(svg("text", { x: x0, y: 142, "font-size": 10, fill: C.muted, text: `slot limits: ${P[0].slots} cartpole, ${P[1].slots} G1. A reset ends ${Math.round(S.ending * 100)}% of episodes; ended worlds are replaced or destroyed, then creates fill toward the target within the budget.` }));
      figure.appendChild(s);
      stats.innerHTML = "";
      [["nworld cartpole (kernel count)", S.live[0]], ["nworld G1 (kernel count)", S.live[1]], ["memory used", `${used()} / ${S.budget}`], ["over budget", used() > S.budget ? `${used() - S.budget} units: only destroys until under` : "no"]].forEach(([k, v]) => stats.appendChild(stat(k, v)));
      stats.lastChild.classList.toggle("gc-stat-bad", used() > S.budget);
      batchBox.innerHTML = "";
      if (S.lastBatch) {
        const b = S.lastBatch; const head = el("div", { class: "gc-row gc-row-head gc-row-dist" }); ["batch", "episodes ended", "REPLACE same proto", "REPLACE cross proto", "CREATE", "DESTROY", "rejected"].forEach((h) => head.appendChild(el("div", { text: h }))); batchBox.appendChild(head);
        const r = el("div", { class: "gc-row gc-row-dist" });
        [String(b.seq), `${b.ended[0]} / ${b.ended[1]}`, `${b.replace[0][0]} / ${b.replace[1][1]}`, `${b.replace[0][1]} cart→G1, ${b.replace[1][0]} G1→cart`, `${b.create[0]} / ${b.create[1]}`, `${b.destroy[0]} / ${b.destroy[1]}`, `${b.rejectedBudget[0] + b.rejectedBudget[1]} budget, ${b.rejectedSlots[0] + b.rejectedSlots[1]} slots`].forEach((v, i) => { const d = el("div", { text: v }); if (i === 6 && v !== "0 budget, 0 slots") d.classList.add("gc-bad"); r.appendChild(d); });
        batchBox.appendChild(r);
      }
    }
    const [l1, s1] = sl("memory budget (units; 1 cartpole = 1, 1 G1 = 16)", 16, 256, 8, S.budget, (e) => { S.budget = +e.target.value; render(); });
    const [l2, s2] = sl("desired cartpole worlds", 0, P[0].slots, 1, S.desired[0], (e) => { S.desired[0] = +e.target.value; render(); });
    const [l4, s4] = sl("desired G1 worlds", 0, P[1].slots, 1, S.desired[1], (e) => { S.desired[1] = +e.target.value; render(); });
    const [l3, s3] = sl("episodes ending per reset", 0, 1, 0.05, S.ending, (e) => { S.ending = +e.target.value; render(); });
    root.appendChild(el("div", { class: "gc-toolbar gc-toolbar-col" }, [el("div", { class: "gc-ctrl" }, [l1, s1]), el("div", { class: "gc-ctrl" }, [l2, s2]), el("div", { class: "gc-ctrl" }, [l4, s4]), el("div", { class: "gc-ctrl" }, [l3, s3]), button("Reset (run one batch)", reset, true), button("Start over", () => { S.live = [48, 4]; S.seq = 0; S.lastBatch = null; log.add("48 cartpoles and 4 G1s live, 112 units in use."); render(); })]));
    root.appendChild(el("div", { class: "gc-hint", text: "Set a budget and the desired number of worlds of each prototype, then press Reset. Each reset is one directory batch: ended worlds are REPLACEd into the prototype the target needs, or DESTROYed; CREATEs fill the remainder while the budget and the slot limits allow. The two kernel counts the graph follows update with the live sets." }));
    root.appendChild(figure); root.appendChild(stats); root.appendChild(batchBox); root.appendChild(log.box);
    log.add("48 cartpoles and 4 G1s live, 112 units in use. Change the desired counts or lower the budget, then Reset."); render();
  }

  const widgets = { population, lifecycle, replay, backing, memory, distribution };
  function init() {
    document.querySelectorAll(".gc-widget").forEach((root) => {
      if (root.dataset.ready) return;
      const fn = widgets[root.dataset.widget];
      if (!fn) return;
      root.dataset.ready = "1";
      root.innerHTML = "";
      fn(root);
      const fallback = root.nextElementSibling;
      if (fallback && fallback.classList && fallback.classList.contains("gc-fallback")) fallback.style.display = "none";
    });
  }
  window.gcWidgetsInit = init;
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
