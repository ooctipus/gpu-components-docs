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
  /* 1. Population: directory rows, handles, readiness, prefix coverage  */
  /* ------------------------------------------------------------------ */
  function population(root) {
    const CAP = 16, GRANULE = 8;
    const S = { rows: Array(CAP).fill(null), gen: {}, nextId: 0, ready: 8, dense: true, seq: 0, retired: [] };
    const log = logPanel();
    const figure = el("div", { class: "gc-figure" });
    const stats = el("div", { class: "gc-stats" });

    function liveCount() { return S.rows.filter(Boolean).length; }
    function freeRows() { const out = []; for (let r = 0; r < S.ready; r++) if (!S.rows[r]) out.push(r); return out; }
    function pick(free) {
      if (S.dense) return free[0];
      // sparse mode: the rebuilt free list has no promised order; model it as arbitrary.
      const i = (S.seq * 7919 + free.length * 31) % free.length;
      return free[i];
    }
    function publish(kind) {
      S.seq += 1;
      if (kind !== "noop") { S.dense = false; }
    }
    function create() {
      const free = freeRows();
      if (!free.length) { log.add(`admit: NO_SLOTS. No free admissible row below ready=${S.ready}. Grow first.`, "bad"); render(); return; }
      const row = pick(free);
      const id = S.nextId++;
      S.gen[id] = (S.gen[id] || 0) + 1;
      S.rows[row] = { id, gen: S.gen[id], fresh: true };
      const wasDense = S.dense;
      publish("create");
      log.add(`CREATE → id ${id} gen ${S.gen[id]} at row ${row}. live_count=${liveCount()}.` +
        (wasDense ? " Dense certificate held, so the lowest free row was chosen; any publication clears it." : " Sparse mode: a free row in no promised order."));
      render();
    }
    function destroy(row) {
      const h = S.rows[row];
      if (!h) return;
      S.rows[row] = null;
      S.gen[h.id] += 1;
      S.retired.push({ id: h.id, gen: h.gen, row });
      publish("destroy");
      log.add(`DESTROY (${h.id}, ${h.gen}) at row ${row}. Row freed; generation advanced to ${S.gen[h.id]}, so handle (${h.id}, ${h.gen}) is stale forever. live_count=${liveCount()}.`);
      render();
    }
    function replace() {
      const liveRows = S.rows.map((h, r) => (h ? r : -1)).filter((r) => r >= 0);
      if (!liveRows.length) { log.add("REPLACE needs a live handle.", "bad"); return; }
      const free = freeRows();
      if (!free.length) { log.add("admit: NO_SLOTS for the replacement destination.", "bad"); return; }
      const src = liveRows[(S.seq * 13) % liveRows.length];
      const h = S.rows[src];
      const dst = pick(free);
      S.rows[src] = null; S.gen[h.id] += 1;
      S.rows[dst] = { id: h.id, gen: S.gen[h.id], fresh: true };
      S.retired.push({ id: h.id, gen: h.gen, row: src });
      publish("replace");
      log.add(`REPLACE (${h.id}, ${h.gen}) → same id, gen ${S.gen[h.id]}, new row ${dst}. Destination came from the pre-batch free set; row ${src} is freed. Snapshot admission.`);
      render();
    }
    function compact() {
      const live = S.rows.map((h, r) => (h ? { ...h, from: r } : null)).filter(Boolean);
      const moves = live.filter((h) => h.from >= live.length).length;
      const packed = Array(CAP).fill(null);
      live.forEach((h, i) => (packed[i] = { id: h.id, gen: h.gen, fresh: false }));
      S.rows = packed; S.dense = true; S.seq += 1;
      log.add(`plan_compaction → ${moves} move(s); copies acknowledged; publish_compaction. Live rows are now [0, ${live.length}). Handles unchanged. Dense certificate restored.`, "good");
      render();
    }
    function grow() {
      if (S.ready >= CAP) { log.add("Reserved capacity reached.", "bad"); return; }
      const before = S.ready;
      S.ready = Math.min(CAP, S.ready + GRANULE);
      log.add(`map_backing → granule mapped, rows [${before}, ${S.ready}) backed. publish_ready(${S.ready}) after initialization. No reader join: nothing could address these rows yet.`, "good");
      render();
    }
    function lookupStale() {
      if (!S.retired.length) { log.add("No retired handles yet. Destroy or replace something first.", "bad"); return; }
      const h = S.retired[S.retired.length - 1];
      log.add(`location(${h.id}, ${h.gen}) → invalid: current generation of id ${h.id} is ${S.gen[h.id]}. The old row ${h.row} may now hold another instance, and the stale handle cannot reach it.`, "bad");
    }
    function reset() {
      S.rows = Array(CAP).fill(null); S.gen = {}; S.nextId = 0; S.ready = 8; S.dense = true; S.seq = 0; S.retired = [];
      log.add("allocate → empty directory, 8 of 16 rows ready, dense certificate holds.");
      render();
    }

    function render() {
      figure.innerHTML = "";
      const W = 720, rowW = 40, x0 = 24, y0 = 56;
      const s = svg("svg", { viewBox: `0 0 ${W} 140`, width: "100%" });
      const live = liveCount();
      // prefix coverage bar
      s.appendChild(svg("text", { x: x0, y: 20, "font-size": 12, fill: C.muted, text: `prefix kernel bound to live_count visits rows [0, ${live})` }));
      s.appendChild(svg("rect", { x: x0, y: 28, width: Math.max(0, live * rowW - 4), height: 10, rx: 3, fill: C.live, opacity: 0.35 }));
      // ready marker
      s.appendChild(svg("line", { x1: x0 + S.ready * rowW - 2, y1: 24, x2: x0 + S.ready * rowW - 2, y2: 112, stroke: C.bad, "stroke-width": 2, "stroke-dasharray": "4 3" }));
      s.appendChild(svg("text", { x: x0 + S.ready * rowW + 2, y: 122, "font-size": 11, fill: C.bad, text: `ready = ${S.ready}` }));
      for (let r = 0; r < CAP; r++) {
        const x = x0 + r * rowW, h = S.rows[r];
        let fill = C.free, stroke = C.freeStroke;
        if (r >= S.ready) { fill = C.unmapped; stroke = "#d1d5db"; }
        if (h) { fill = h.fresh ? C.fresh : C.live; stroke = "#1f2937"; if (r >= live) stroke = C.outside; }
        const rect = svg("rect", { x, y: y0, width: rowW - 4, height: 40, rx: 5, fill, stroke, "stroke-width": h && r >= live ? 3 : 1, class: h ? "gc-clickable" : "", onclick: () => destroy(r) });
        if (h) rect.appendChild(svg("title", { text: `id ${h.id} gen ${h.gen}. Click to destroy.` }));
        s.appendChild(rect);
        if (h) {
          s.appendChild(svg("text", { x: x + (rowW - 4) / 2, y: y0 + 17, "text-anchor": "middle", "font-size": 11, fill: "white", text: `${h.id}` }));
          s.appendChild(svg("text", { x: x + (rowW - 4) / 2, y: y0 + 31, "text-anchor": "middle", "font-size": 10, fill: "white", text: `g${h.gen}` }));
        }
        s.appendChild(svg("text", { x: x + (rowW - 4) / 2, y: y0 + 54, "text-anchor": "middle", "font-size": 10, fill: C.muted, text: String(r) }));
      }
      figure.appendChild(s);
      const outside = S.rows.filter((h, r) => h && r >= live).length;
      stats.innerHTML = "";
      [["live_count", live], ["ready rows", S.ready], ["reserved rows", CAP], ["dense certificate", S.dense ? "holds" : "cleared"], ["live rows a prefix kernel misses", outside]].forEach(([k, v]) => stats.appendChild(stat(k, v)));
      stats.lastChild.classList.toggle("gc-stat-bad", outside > 0);
    }

    root.appendChild(el("div", { class: "gc-toolbar" }, [
      button("Create", create, true), button("Replace one", replace), button("Compact", compact), button("Grow (+8 rows)", grow), button("Look up a stale handle", lookupStale), button("Reset", reset),
    ]));
    root.appendChild(el("div", { class: "gc-hint", text: "Click a live row to destroy it. Blue: live. Green: created this step. Grey: free. Pale: reserved but not ready. Orange outline: live but outside the prefix a count-driven kernel visits." }));
    root.appendChild(figure); root.appendChild(stats); root.appendChild(log.box);
    reset(); for (let i = 0; i < 6; i++) create(); log.add("Six instances created while the certificate held: they filled rows 0..5 in order.");
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
        { op: "CREATE", id: "-", gen: "-", proto: 0, status: "", dest: "", note: "a new instance" },
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
        s.appendChild(svg("text", { x: x0 + 8, y: 69, "font-size": 13, fill: "white", text: `${S.live} rows, ${Math.ceil(S.live / BLOCK)} block(s) of ${BLOCK}` }));
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
        s.appendChild(svg("text", { x: x0 + 8, y: 153, "font-size": 12, fill: "white", text: `${bucket} rows: ${bucket - S.live} wasted (${Math.round(100 * (bucket - S.live) / Math.max(1, S.live))}% of useful work)` }));
      }
      figure.appendChild(s);
      stats.innerHTML = "";
      [["live count", S.live], ["rows executed", S.invalid || S.live === 0 ? 0 : S.live], ["padded bucket would execute", S.invalid ? "—" : bucket], ["replays so far", S.replays], ["updater cost per replay", "about 2 µs (measured)"]].forEach(([k, v]) => stats.appendChild(stat(k, v)));
    }
    root.appendChild(el("div", { class: "gc-toolbar" }, [el("label", { class: "gc-label", text: "live count on the device" }), slider, button("Replay", doReplay, true), button("Publish an invalid count", () => { S.invalid = true; render(); }), button("Reset", () => { S.live = 16; S.invalid = false; S.replays = 0; slider.value = 16; render(); })]));
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
      s.appendChild(svg("text", { x: x0, y: 22, "font-size": 12, fill: C.muted, text: `reservation: ${ROWS} rows of virtual address, ${ROWS / G} granules of ${G} rows` }));
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
      [["mapped rows", S.mappedGranules * G], ["ready rows", S.ready], ["reserved rows", ROWS], ["high-water mark", S.highWater * G], ["fresh map needs a join?", S.mappedGranules < S.highWater ? "yes, historical" : "no"]].forEach(([k, v]) => stats.appendChild(stat(k, v)));
    }
    root.appendChild(el("div", { class: "gc-toolbar" }, [el("label", { class: "gc-label", text: "target rows" }), slider, button("map_backing", mapFresh, true), button("publish_ready", publishReady, true), button("resize_backing (shrink, joined)", shrink), button("Reset", reset)]));
    root.appendChild(el("div", { class: "gc-hint", text: "Drag the target. Mapping rounds to granules; growth into never-mapped granules needs no reader join; shrinking and regrowth over a previously mapped granule go through a joined maintenance scope." }));
    root.appendChild(figure); root.appendChild(stats); root.appendChild(log.box);
    reset();
  }

  const widgets = { population, lifecycle, replay, backing };
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
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
  if (window.document$ && window.document$.subscribe) window.document$.subscribe(init);
})();
