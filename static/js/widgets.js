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
      { name: "cartpole", cap: 16, admissible: 8, bytes: 1, color: C.live, grow: 8 },
      { name: "G1 humanoid", cap: 8, admissible: 4, bytes: 16, color: "#7c3aed", grow: 2 },
    ];
    const S = { gen: {}, nextId: 0, dense: [true, true], seq: 0, retired: [], rows: PROTOS.map((p) => Array(p.cap).fill(null)), adm: PROTOS.map((p) => p.admissible), note: "" };
    const figure = el("div", { class: "gc-figure" }); const stats = el("div", { class: "gc-stats" }); const note = el("div", { class: "gc-note" });
    const liveCount = (k) => S.rows[k].filter(Boolean).length;
    const freeSlots = (k) => { const out = []; for (let r = 0; r < S.adm[k]; r++) if (!S.rows[k][r]) out.push(r); return out; };
    const pick = (k, free) => (S.dense[k] ? free[0] : free[(S.seq * 7919 + free.length * 31) % free.length]);
    const bytesLive = () => PROTOS.reduce((a, p, k) => a + liveCount(k) * p.bytes, 0);
    const say = (m, bad) => { S.note = m; note.textContent = m; note.classList.toggle("gc-note-bad", !!bad); };
    function create(k) {
      const p = PROTOS[k], free = freeSlots(k);
      if (!free.length) { say(`${p.name}: no free admissible slot. Admit more slots first.`, true); render(); return; }
      const slot = pick(k, free), id = S.nextId++;
      S.gen[id] = 1; S.rows[k][slot] = { id, gen: 1, fresh: true };
      const wasDense = S.dense[k]; S.dense[k] = false; S.seq += 1;
      say(`CREATE ${p.name}: world ${id} at slot ${slot}.` + (wasDense ? " Lowest free slot, because the dense certificate held." : " Any free slot; the certificate was cleared by an earlier publication."));
      render();
    }
    function destroy(k, slot) {
      const h = S.rows[k][slot]; if (!h) return; const p = PROTOS[k];
      S.rows[k][slot] = null; S.gen[h.id] += 1; S.retired.push({ id: h.id, gen: h.gen, slot, k }); S.dense[k] = false; S.seq += 1;
      say(`DESTROY ${p.name} world ${h.id}: slot ${slot} is free again. Handle (${h.id}, ${h.gen}) is stale; the identity's generation is now ${S.gen[h.id]}.`);
      render();
    }
    function compact(k) {
      const p = PROTOS[k]; const live = S.rows[k].map((h, r) => (h ? { ...h, from: r } : null)).filter(Boolean);
      const moves = live.filter((h) => h.from >= live.length).length; const packed = Array(p.cap).fill(null);
      live.forEach((h, i) => (packed[i] = { id: h.id, gen: h.gen, fresh: false }));
      S.rows[k] = packed; S.dense[k] = true; S.seq += 1;
      say(`Compaction (${p.name}): ${moves} world(s) moved into the lowest slots. Identities and generations unchanged. Live slots are now [0, ${live.length}).`);
      render();
    }
    function admit(k) {
      const p = PROTOS[k]; if (S.adm[k] >= p.cap) { say(`${p.name}: all ${p.cap} slots are already admissible.`, true); return; }
      S.adm[k] = Math.min(p.cap, S.adm[k] + p.grow); say(`publish_admissible_slots (${p.name}): slots [0, ${S.adm[k]}) may now receive worlds.`); render();
    }
    function lookupStale() {
      if (!S.retired.length) { say("Destroy a world first, then look its old handle up.", true); return; }
      const h = S.retired[S.retired.length - 1];
      say(`location(${h.id}, ${h.gen}) → invalid. Identity ${h.id} is at generation ${S.gen[h.id]} now; slot ${h.slot} may hold a different world.`, true);
    }
    function reset() {
      S.rows = PROTOS.map((p) => Array(p.cap).fill(null)); S.adm = PROTOS.map((p) => p.admissible); S.gen = {}; S.nextId = 0; S.dense = [true, true]; S.seq = 0; S.retired = [];
      for (let i = 0; i < 6; i++) create(0); for (let i = 0; i < 3; i++) create(1);
      say("Two prototypes. Each row is that prototype's slots; a colored box is a live world with its identity and generation.");
      render();
    }
    function render() {
      figure.innerHTML = "";
      const W = 720, x0 = 130, rowW = 34; const s = svg("svg", { viewBox: `0 0 ${W} 170`, width: "100%" });
      PROTOS.forEach((p, k) => {
        const y0 = 28 + k * 72, live = liveCount(k);
        s.appendChild(svg("text", { x: 16, y: y0 + 16, "font-size": 12, fill: C.text, "font-weight": "600", text: p.name }));
        s.appendChild(svg("text", { x: 16, y: y0 + 31, "font-size": 9.5, fill: C.muted, text: `${p.cap} slots · ${p.bytes} unit${p.bytes > 1 ? "s" : ""}/world` }));
        s.appendChild(svg("text", { x: x0, y: y0 - 7, "font-size": 9.5, fill: C.muted, text: live ? `the step kernel runs over world indices 0 to ${live - 1} (nworld = live_count = ${live})` : "the step kernel runs over no worlds (live_count = 0)" }));
        s.appendChild(svg("rect", { x: x0, y: y0 - 4, width: Math.max(0, live * rowW - 4), height: 3, rx: 1.5, fill: p.color, opacity: 0.5 }));
        for (let r = 0; r < p.cap; r++) {
          const x = x0 + r * rowW, h = S.rows[k][r], admissible = r < S.adm[k];
          let fill = admissible ? C.free : "#ffffff", stroke = admissible ? C.freeStroke : "#d1d5db";
          if (h) { fill = h.fresh ? C.fresh : p.color; stroke = "#1f2937"; if (r >= live) stroke = C.outside; }
          const rect = svg("rect", { x, y: y0, width: rowW - 4, height: 34, rx: 5, fill, stroke, "stroke-width": h && r >= live ? 3 : 1, "stroke-dasharray": admissible || h ? "" : "3 3", class: h ? "gc-clickable" : "", onclick: () => destroy(k, r) });
          if (h) rect.appendChild(svg("title", { text: `${p.name} world ${h.id}, generation ${h.gen}. Click to destroy.` }));
          s.appendChild(rect);
          if (h) {
            s.appendChild(svg("text", { x: x + (rowW - 4) / 2, y: y0 + 14, "text-anchor": "middle", "font-size": 9.5, fill: "white", text: `id ${h.id}` }));
            s.appendChild(svg("text", { x: x + (rowW - 4) / 2, y: y0 + 27, "text-anchor": "middle", "font-size": 8.5, fill: "white", text: `gen ${h.gen}` }));
          }
          s.appendChild(svg("text", { x: x + (rowW - 4) / 2, y: y0 + 46, "text-anchor": "middle", "font-size": 9, fill: C.muted, text: String(r) }));
        }
        if (S.adm[k] < p.cap) s.appendChild(svg("text", { x: x0 + S.adm[k] * rowW, y: y0 + 58, "font-size": 9, fill: C.muted, text: `slots ≥ ${S.adm[k]} not yet admissible` }));
      });
      figure.appendChild(s);
      stats.innerHTML = "";
      const outside = PROTOS.reduce((a, p, k) => a + S.rows[k].filter((h, r) => h && r >= liveCount(k)).length, 0);
      [["cartpole live", liveCount(0)], ["G1 live", liveCount(1)], ["Data in use", `${bytesLive()} units`], ["live worlds the step kernel skips", outside]].forEach(([k, v]) => stats.appendChild(stat(k, v)));
      stats.lastChild.classList.toggle("gc-stat-bad", outside > 0);
    }
    root.appendChild(el("div", { class: "gc-toolbar" }, [
      button("Create cartpole", () => create(0), true), button("Create G1", () => create(1), true),
      button("Compact cartpoles", () => compact(0)), button("Compact G1s", () => compact(1)),
      button("Admit more cartpole slots", () => admit(0)), button("Admit more G1 slots", () => admit(1)),
      button("Look up a stale handle", lookupStale), button("Start over (figure only)", reset),
    ]));
    root.appendChild(el("div", { class: "gc-hint", text: "Each row is one prototype's slots, a single contiguous range. Colored boxes are live worlds; grey boxes are free; dashed boxes are not yet admissible. Click a live world to destroy it. Orange outline: a live world at an index the step kernel does not reach; compaction fixes that." }));
    root.appendChild(figure); root.appendChild(stats); root.appendChild(note);
    reset();
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
    const readout = el("span", { class: "gc-readout", text: `${S.live} of ${CAP}` });
    slider.addEventListener("input", () => { S.live = +slider.value; S.invalid = false; readout.textContent = `${S.live} of ${CAP}`; render(); });
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
    root.appendChild(el("div", { class: "gc-toolbar" }, [el("label", { class: "gc-label", text: "live world count on the device" }), slider, readout, button("Replay", doReplay, true), button("Publish an invalid count", () => { S.invalid = true; render(); }), button("Reset", () => { S.live = 16; S.invalid = false; S.replays = 0; slider.value = 16; readout.textContent = `16 of ${CAP}`; render(); })]));
    root.appendChild(el("div", { class: "gc-hint", text: "Drag the count. The graph is never re-captured; the updater node rewrites the kernel node's extent and grid at the start of each replay, or disables it." }));
    root.appendChild(figure); root.appendChild(stats); root.appendChild(log.box);
    render(); log.add("Graph captured once at capacity 32 and instantiated once. Move the slider, then press Replay.");
  }

  /* ------------------------------------------------------------------ */
  /* 4. Backing: reservation, pages, ready marker, joins, budget       */
  /* ------------------------------------------------------------------ */
  function backing(root) {
    const ROWS = 64, G = 16, BUDGET = 3; // page = 16 rows; budget = 3 pages
    const S = { mappedGranules: 1, ready: 16, highWater: 1, target: 24, inMaintenance: false };
    const log = logPanel(); const figure = el("div", { class: "gc-figure" }); const stats = el("div", { class: "gc-stats" });
    const slider = el("input", { type: "range", min: 0, max: ROWS, value: S.target, class: "gc-slider" });
    const readout = el("span", { class: "gc-readout", text: `${S.target} slots → ${Math.ceil(S.target / G)} page(s)` });
    slider.addEventListener("input", () => { S.target = +slider.value; readout.textContent = `${S.target} slots → ${Math.ceil(S.target / G)} page(s)`; render(); });
    const granulesFor = (rows) => Math.ceil(rows / G);
    function mapFresh() {
      const need = granulesFor(S.target);
      if (need <= S.mappedGranules) { log.add(`map_backing(${S.target}) → nothing to map: ${S.target} rows round up to ${need} page(s), already mapped.`); return; }
      if (S.mappedGranules < S.highWater) { log.add(`map_backing(${S.target}) → the range [${S.mappedGranules * G}, ${S.highWater * G}) was mapped before. Historical addresses need joined maintenance; use resize_backing inside backing.maintenance.`, "bad"); return; }
      if (need > BUDGET) { log.add(`map(...) → MemoryError before any driver call: ${need} pages exceed the budget of ${BUDGET}. Nothing changed.`, "bad"); return; }
      S.mappedGranules = need; S.highWater = Math.max(S.highWater, need);
      log.add(`map_backing(${S.target}) → pages [${S.mappedGranules - (need - (S.mappedGranules))}…) mapped and access granted on the host. No reader join. Readiness not yet published: ready is still ${S.ready}.`, "good");
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
      if (need >= S.mappedGranules) { log.add(`resize_backing(${S.target}) → ${S.target} rows still need ${need} page(s); nothing is unmapped. Granularity.`); return; }
      S.inMaintenance = true; render();
      log.add(`backing.maintenance: synchronizing every named stream, so no reader of rows ≥ ${need * G} is in flight…`);
      setTimeout(() => {
        S.ready = Math.min(S.ready, need * G); S.mappedGranules = need; S.inMaintenance = false;
        log.add(`resize_backing(${S.target}) → published ready=${S.ready} first, then unmapped pages ≥ ${need}. High-water mark stays at ${S.highWater}: regrowing here needs a join.`, "good");
        render();
      }, 900);
    }
    function reset() { S.mappedGranules = 1; S.ready = 16; S.highWater = 1; S.target = 24; slider.value = 24; readout.textContent = `24 slots → 2 page(s)`; S.inMaintenance = false; log.add("reserve 64 rows; map 1 page; ready 16. Budget: 3 pages."); render(); }
    function render() {
      figure.innerHTML = "";
      const W = 720, x0 = 24, gw = 160;
      const s = svg("svg", { viewBox: `0 0 ${W} 150`, width: "100%" });
      s.appendChild(svg("text", { x: x0, y: 22, "font-size": 12, fill: C.muted, text: `reservation: ${ROWS} slots of virtual address, ${ROWS / G} pages of ${G} slots` }));
      for (let g = 0; g < ROWS / G; g++) {
        const x = x0 + g * gw;
        const mapped = g < S.mappedGranules, hist = !mapped && g < S.highWater;
        s.appendChild(svg("rect", { x, y: 36, width: gw - 6, height: 44, rx: 5, fill: mapped ? C.mapped : hist ? "#fde68a" : C.unmapped, stroke: mapped ? "#1f2937" : hist ? "#b45309" : "#d1d5db" }));
        s.appendChild(svg("text", { x: x + (gw - 6) / 2, y: 54, "text-anchor": "middle", "font-size": 12, fill: C.text, text: `page ${g}` }));
        s.appendChild(svg("text", { x: x + (gw - 6) / 2, y: 71, "text-anchor": "middle", "font-size": 11, fill: C.muted, text: mapped ? "mapped" : hist ? "unmapped, was mapped before" : "never mapped" }));
      }
      const rx = x0 + (S.ready / ROWS) * (gw * 4 - 6);
      s.appendChild(svg("line", { x1: rx, y1: 30, x2: rx, y2: 90, stroke: C.ready, "stroke-width": 3 }));
      s.appendChild(svg("text", { x: rx, y: 104, "text-anchor": "middle", "font-size": 11, fill: C.ready, text: `ready = ${S.ready}` }));
      const tx = x0 + (S.target / ROWS) * (gw * 4 - 6);
      s.appendChild(svg("line", { x1: tx, y1: 30, x2: tx, y2: 90, stroke: C.outside, "stroke-width": 2, "stroke-dasharray": "3 3" }));
      s.appendChild(svg("text", { x: tx, y: 120, "text-anchor": "middle", "font-size": 11, fill: C.outside, text: `target = ${S.target} → ${granulesFor(S.target)} page(s)` }));
      // budget bar
      s.appendChild(svg("text", { x: x0, y: 142, "font-size": 11, fill: C.muted, text: `budget: ${S.mappedGranules} of ${BUDGET} pages in use` }));
      for (let b = 0; b < BUDGET; b++) s.appendChild(svg("rect", { x: 300 + b * 30, y: 132, width: 24, height: 12, rx: 2, fill: b < S.mappedGranules ? C.mapped : C.free, stroke: C.freeStroke }));
      if (S.inMaintenance) s.appendChild(svg("text", { x: W - 24, y: 142, "text-anchor": "end", "font-size": 12, fill: C.bad, text: "maintenance scope: joining readers…" }));
      figure.appendChild(s);
      stats.innerHTML = "";
      [["mapped slots", S.mappedGranules * G], ["ready slots", S.ready], ["reserved slots", ROWS], ["high-water mark", S.highWater * G], ["fresh map needs a join?", S.mappedGranules < S.highWater ? "yes, historical" : "no"]].forEach(([k, v]) => stats.appendChild(stat(k, v)));
    }
    root.appendChild(el("div", { class: "gc-toolbar" }, [el("label", { class: "gc-label", text: "target slots" }), slider, readout, button("map_backing", mapFresh, true), button("publish_ready", publishReady, true), button("resize_backing (shrink, joined)", shrink), button("Start over (figure only)", reset)]));
    root.appendChild(el("div", { class: "gc-hint", text: "Drag the target. Mapping rounds to pages; growth into never-mapped pages needs no reader join; shrinking and regrowth over a previously mapped page go through a joined maintenance scope." }));
    root.appendChild(figure); root.appendChild(stats); root.appendChild(log.box);
    reset();
  }

  /* ------------------------------------------------------------------ */
  /* 5. Memory: contiguous virtual reservations over a pool of pages   */
  /* ------------------------------------------------------------------ */
  function memory(root) {
    const GRANULE = 2; // MiB
    // Sizing rule: every storage reserves the whole budget, so planned maximum = budget ÷ stride.
    // Full MJWarp Data per world: cartpole about 1.5 KiB, G1 about 24 KiB, a 16:1 ratio.
    const BUDGET = 16; // page handles = 32 MiB; each storage reserves 32 MiB
    const STORES = [
      { name: "cartpole storage", stride: 1536, color: C.live },
      { name: "G1 storage", stride: 24576, color: "#7c3aed" },
    ].map((st) => ({ ...st, pages: BUDGET, slots: Math.floor((BUDGET * GRANULE * 1048576) / st.stride), plan: `planned max = 32 MiB ÷ ${st.stride} B` }));
    // physical handles: id -> {owner: storeIndex|null, vslot: page index|null}; spare = owner null but allocated
    const S = { handles: [], nextHandle: 0, mapped: STORES.map(() => []) , joined: false };
    const log = logPanel(); const figure = el("div", { class: "gc-figure" }); const stats = el("div", { class: "gc-stats" });
    const retained = () => S.handles.length;
    const spare = () => S.handles.filter((h) => h.owner === null);
    function acquire() { const sp = spare(); if (sp.length) return sp[0]; if (retained() >= BUDGET) return null; const h = { id: S.nextHandle++, owner: null, vslot: null }; S.handles.push(h); return h; }
    function grow(k) {
      const st = STORES[k]; const next = S.mapped[k].length;
      if (next >= st.pages) { log.add(`${st.name}: all ${st.pages} pages are mapped; this storage now holds the entire budget and all ${st.slots.toLocaleString()} planned slots are ready. Nothing is left for the other storage.`, "bad"); return; }
      const h = acquire();
      if (!h) { log.add(`map (${st.name}) → MemoryError before any driver call: ${retained()} handles retained, budget ${BUDGET}. Nothing changed.`, "bad"); render(); return; }
      const reused = S.handles.includes(h) && h.id < S.nextHandle - 1 && spare().includes(h);
      h.owner = k; h.vslot = next; S.mapped[k].push(h);
      log.add(`map (${st.name}) → virtual page ${next} at base + ${next * GRANULE} MiB ← physical handle #${h.id}${reused ? " (taken from the pool)" : " (new, cuMemCreate)"}. Virtual address of every slot unchanged. No reader join: never-mapped range.`, "good");
      render();
    }
    function shrink(k) {
      const st = STORES[k]; if (!S.mapped[k].length) { log.add(`${st.name}: nothing mapped.`, "bad"); return; }
      S.joined = true; render();
      log.add(`backing.maintenance (${st.name}): joining every named stream before cuMemUnmap…`);
      setTimeout(() => { const h = S.mapped[k].pop(); h.owner = null; h.vslot = null; S.joined = false;
        log.add(`unmap (${st.name}) → virtual page ${S.mapped[k].length} unmapped; handle #${h.id} goes to the pool: unmapped, owned by no prototype, still counted against the budget until trim. The virtual range stays reserved; pointers stay valid.`, "good"); render(); }, 800);
    }
    function trim() { const sp = spare(); if (!sp.length) { log.add("trim → no spare handles to release.", "bad"); return; } S.handles = S.handles.filter((h) => h.owner !== null); log.add(`trim → cuMemRelease on ${sp.length} spare handle(s); budget use drops to ${retained()}.`, "good"); render(); }
    function reset() { S.handles = []; S.nextHandle = 0; S.mapped = STORES.map(() => []); S.joined = false; for (let i = 0; i < BUDGET; i++) S.handles.push({ id: S.nextHandle++, owner: null, vslot: null }); log.add("reserve → two contiguous virtual ranges, nothing mapped. cuMemCreate × 16 → the whole budget is created once, at startup, and waits in the pool."); for (let i = 0; i < 4; i++) grow(0); for (let i = 0; i < 3; i++) grow(1); }
    let render = function () {
      figure.innerHTML = "";
      const W = 860, x0 = 170, gw = 42; const s = svg("svg", { viewBox: `0 0 ${W} 320`, width: "100%" });
      s.appendChild(svg("text", { x: 16, y: 18, "font-size": 12, "font-weight": "600", fill: C.text, text: "virtual: one contiguous reservation per storage, sized to the whole budget. Width is bytes: both bars are 32 MiB; the same width holds 16× fewer G1 worlds." }));
      STORES.forEach((st, k) => {
        const y = 36 + k * 76; const vbytes = st.slots * st.stride / 1048576;
        s.appendChild(svg("text", { x: 16, y: y + 10, "font-size": 11, fill: C.text, text: st.name }));
        s.appendChild(svg("text", { x: 16, y: y + 23, "font-size": 9, fill: C.muted, text: st.plan }));
        s.appendChild(svg("text", { x: 16, y: y + 35, "font-size": 9, fill: C.muted, text: `= ${st.slots.toLocaleString()} worlds, ${vbytes.toFixed(0)} MiB` }));
        for (let g = 0; g < st.pages; g++) {
          const x = x0 + g * gw, m = S.mapped[k][g];
          s.appendChild(svg("rect", { x, y, width: gw - 4, height: 30, rx: 4, fill: m ? st.color : "#fafafa", stroke: m ? "#1f2937" : "#cbd5e1", "stroke-dasharray": m ? "" : "3 3" }));
          s.appendChild(svg("text", { x: x + (gw - 4) / 2, y: y + 19, "text-anchor": "middle", "font-size": 10, fill: m ? "white" : C.muted, text: m ? `#${m.id}` : `v${g}` }));
        }
        s.appendChild(svg("text", { x: x0 + st.pages * gw + 4, y: y + 19, "font-size": 9.5, fill: C.muted, text: `slot i at base + i × ${st.stride}` }));
        // world-count ticks along the byte axis
        [0.25, 0.5, 0.75, 1].forEach((f) => {
          const tx = x0 + f * st.pages * gw - 2;
          s.appendChild(svg("line", { x1: tx, y1: y + 30, x2: tx, y2: y + 36, stroke: "#9ca3af" }));
          s.appendChild(svg("text", { x: tx, y: y + 46, "text-anchor": "end", "font-size": 8.5, fill: C.muted, text: `${Math.round(st.slots * f).toLocaleString()} worlds` }));
        });
      });
      // physical pool
      const py = 220;
      s.appendChild(svg("text", { x: 16, y: py - 14, "font-size": 12, "font-weight": "600", fill: C.text, text: `physical memory: ${GRANULE} MiB page handles from a pool, budget ${BUDGET} handles = ${BUDGET * GRANULE} MiB` }));
      for (let i = 0; i < BUDGET; i++) {
        const x = x0 + i * gw, h = S.handles[i];
        const fill = !h ? "#ffffff" : h.owner === null ? "#fde68a" : STORES[h.owner].color;
        s.appendChild(svg("rect", { x, y: py, width: gw - 4, height: 30, rx: 4, fill, stroke: h ? "#1f2937" : "#cbd5e1", "stroke-dasharray": h ? "" : "3 3" }));
        s.appendChild(svg("text", { x: x + (gw - 4) / 2, y: py + 19, "text-anchor": "middle", "font-size": 10, fill: h && h.owner !== null ? "white" : C.muted, text: h ? `#${h.id}` : "free" }));
        if (h && h.owner !== null) {
          const vy = 36 + h.owner * 76 + 30, vx = x0 + h.vslot * gw + (gw - 4) / 2;
          s.appendChild(svg("path", { d: `M${x + (gw - 4) / 2} ${py} C ${x + (gw - 4) / 2} ${py - 40}, ${vx} ${vy + 40}, ${vx} ${vy}`, fill: "none", stroke: STORES[h.owner].color, "stroke-width": 1.4, opacity: 0.7 }));
        }
      }
      s.appendChild(svg("text", { x: 16, y: py + 52, "font-size": 10, fill: C.muted, text: "yellow: in the pool, created at startup, unmapped, belongs to no prototype · colored: mapped into the storage of that color · white dashed: released by trim, must be created again" }));
      if (S.joined) s.appendChild(svg("text", { x: W - 16, y: py + 52, "text-anchor": "end", "font-size": 11, fill: C.bad, text: "maintenance: joining readers…" }));
      s.appendChild(svg("text", { x: 16, y: 310, "font-size": 10, fill: C.muted, text: "Each storage could hold the whole budget alone; together they reserve 64 MiB against 32 MiB of memory. Handles are interchangeable across storages; virtual pages never move." }));
      figure.appendChild(s);
      stats.innerHTML = "";
      const vtotal = STORES.reduce((a, st) => a + st.pages * GRANULE, 0), mapped = S.handles.filter((h) => h.owner !== null).length;
      [["virtual reserved", `${vtotal} MiB (costs nothing)`], ["physical mapped", `${mapped * GRANULE} MiB`], ["in the pool (unmapped, still counted)", `${spare().length * GRANULE} MiB`], ["budget in use", `${retained()} / ${BUDGET} handles`]].forEach(([k, v]) => stats.appendChild(stat(k, v)));
    };
    const growBtns = [button("Map cartpole pages (host, no join)", () => grow(0), true), button("Map G1 pages (host, no join)", () => grow(1), true)];
    root.appendChild(el("div", { class: "gc-toolbar" }, [growBtns[0], growBtns[1], button("Unmap cartpole tail (host, joins) → pool", () => shrink(0)), button("Unmap G1 tail (host, joins) → pool", () => shrink(1)), button("Trim pool (cuMemRelease)", trim), button("Start over (figure only)", reset)]));
    const origRender = render; render = function () { origRender(); STORES.forEach((st, k) => { const full = S.mapped[k].length >= st.pages; growBtns[k].disabled = full; growBtns[k].textContent = full ? `${st.name.split(" ")[0]}: reservation fully mapped` : `Map ${st.name.split(" ")[0]} pages (host, no join)`; }); };
    root.appendChild(el("div", { class: "gc-hint", text: "Top: contiguous virtual ranges, one per storage, sized for the maximum population. Bottom: the pool of page handles the budget counts. Curves show which handle backs which virtual page." }));
    root.appendChild(figure); root.appendChild(stats); root.appendChild(log.box);
    reset();
  }

  /* ------------------------------------------------------------------ */
  /* 6. Distribution: a memory budget, a target mix, and reset batches    */
  /* ------------------------------------------------------------------ */
  /* Scenes shared by the overview figures. "cartpole" is two prototypes of
     very different size; "franka" is the four world prototypes built from a
     banana and a Franka arm. Sizes are to scale with the worked examples. */
  const PALETTE = [C.live, "#7c3aed", "#0d9488", "#d97706"];
  const SCENES = {
    cartpole: {
      protos: [
        { name: "cartpole", bytes: 1, slots: 256 },
        { name: "G1", bytes: 16, slots: 16 },
      ],
      budget: { min: 16, max: 256, step: 8, init: 128 }, live: [48, 4], GU: 8, granuleNote: "page = 8 units",
      fmt: (v) => `${v} units`, unitNote: "units; 1 cartpole = 1, 1 G1 = 16",
      stack: { GU: 4, BUDGET: 6, mapped: [1, 3], init: [3, 2], sw: 27,
        protos: [{ bytes: 1, grow: 4 }, { bytes: 4, grow: 1 }],
        note: "G1 is drawn at 4× a cartpole, not 16×, so both fit on screen; page = 4 units" },
    },
    franka: {
      protos: [
        { name: "W0 banana+franka", bytes: 816, slots: 321 },
        { name: "W1 banana+2 franka", bytes: 1488, slots: 176 },
        { name: "W2 2 banana+franka", bytes: 944, slots: 277 },
        { name: "W3 franka", bytes: 688, slots: 381 },
      ],
      budget: { min: 16384, max: 262144, step: 8192, init: 65536 }, live: [4, 4, 4, 4], GU: 8192, granuleNote: "page drawn as 8 KiB so the figure fits; real pages are 2 MiB",
      fmt: (v) => `${Math.round(v / 1024)} KiB`, unitNote: "bytes; one world is 816, 1,488, 944 or 688 B",
      stack: { GU: 22, BUDGET: 5, mapped: [1, 1, 1, 1], init: [3, 2, 3, 4], sw: 30,
        protos: [{ bytes: 6, grow: 4 }, { bytes: 11, grow: 2 }, { bytes: 7, grow: 3 }, { bytes: 5, grow: 4 }],
        note: "worlds to scale, 816 : 1,488 : 944 : 688 B ≈ 6 : 11 : 7 : 5 units; page = 22 units" },
    },
  };
  const sceneOf = (root) => SCENES[root.dataset.scene] || SCENES.cartpole;
  const shortName = (p) => p.name.split(" ")[0];

  /* ------------------------------------------------------------------ */
  /* 6. Distribution: a budget, a split, and the batch each reset runs   */
  /* ------------------------------------------------------------------ */
  function distribution(root) {
    const SC = sceneOf(root), P = SC.protos.map((p, k) => ({ ...p, color: PALETTE[k] })), N = P.length, GU = SC.GU;
    const gFor = (worlds, k) => Math.ceil((worlds * P[k].bytes) / GU);
    const S = { budget: SC.budget.init, weights: P.map(() => 1 / N), ending: 0.3, live: SC.live.slice(), mapped: SC.live.map((n, k) => gFor(n, k)), pool: 0, seq: 0, steps: null };
    // warm pool: every budgeted handle is created at startup and waits in the pool until mapped
    const refill = () => { S.pool = Math.max(0, budgetG() - S.mapped.reduce((a, v) => a + v, 0)); };
    const figure = el("div", { class: "gc-figure" }); const stats = el("div", { class: "gc-stats" }); const stepBox = el("ol", { class: "gc-steps" });
    const used = () => S.live.reduce((a, n, k) => a + n * P[k].bytes, 0);
    const budgetG = () => Math.floor(S.budget / GU);
    const mappedG = () => S.mapped.reduce((a, v) => a + v, 0);
    refill();
    const ready = (k) => Math.min(P[k].slots, Math.floor((S.mapped[k] * GU) / P[k].bytes));
    // the budget is split in whole pages by weight; a target is what its pages hold
    const targetG = () => {
      const sum = S.weights.reduce((a, w) => a + w, 0) || 1, BG = budgetG();
      const g = P.map((p, k) => Math.min(gFor(p.slots, k), Math.floor((BG * S.weights[k]) / sum)));
      let left = BG - g.reduce((a, v) => a + v, 0);
      P.map((p, k) => k).sort((i, j) => S.weights[j] - S.weights[i] || P[i].bytes - P[j].bytes).forEach((k) => { const more = Math.min(gFor(P[k].slots, k) - g[k], left); g[k] += more; left -= more; });
      return g;
    };
    const targets = () => targetG().map((g, k) => Math.min(P[k].slots, Math.floor((g * GU) / P[k].bytes)));
    const desiredUnits = () => targets().reduce((a, n, k) => a + n * P[k].bytes, 0);
    const splitText = () => targets().map((n, k) => `${n} ${shortName(P[k])}`).join(" + ") + " worlds";
    const sl = (label, min, max, step, val, oninput, fmt) => {
      const i = el("input", { type: "range", min, max, step, value: val, class: "gc-slider" });
      const out = el("span", { class: "gc-readout", text: (fmt || String)(val) });
      i.addEventListener("input", (e) => { out.textContent = (fmt || String)(+e.target.value); oninput(e); });
      return [el("label", { class: "gc-label", text: label }), i, out];
    };
    const names = (arr, f) => arr.map((v, k) => (v ? `${f(v)} ${shortName(P[k])}` : null)).filter(Boolean).join(", ");
    function reset() {
      S.seq += 1;
      const steps = [], add = (where, text) => steps.push({ where, text });
      const tgt = targets();
      add("host", `targets from the budget and the weights: ${splitText()}.`);
      // 1. ended episodes: replace in place where the prototype still wants worlds, destroy the rest
      const ended = S.live.map((n) => Math.round(n * S.ending));
      let live = S.live.slice();
      const keep = ended.map((e, k) => Math.min(e, Math.max(0, tgt[k] - (live[k] - e))));
      const destroyed = ended.map((e, k) => e - keep[k]);
      live = live.map((n, k) => n - destroyed[k]);
      add("graph", `directory batch ${S.seq}: ${ended.reduce((a, v) => a + v, 0)} episodes ended. REPLACE in place ${names(keep, String) || "none"}; DESTROY ${names(destroyed, String) || "none"}. Slots and pages untouched.`);
      // 2. does any prototype need pages beyond its ready prefix?
      const want = targetG();
      const extra = want.map((g, k) => Math.max(0, g - S.mapped[k]));
      const needG = extra.reduce((a, v) => a + v, 0);
      if (needG === 0) {
        add("none", "physical layer untouched: every target fits inside its ready prefix. This is the steady state.");
      } else {
        let avail = S.pool + (budgetG() - mappedG() - S.pool);
        if (needG > avail) {
          // donors: prototypes mapped beyond what their target and their live worlds need
          const freeable = S.mapped.map((m, k) => Math.max(0, m - Math.max(want[k], gFor(live[k], k))));
          let short = needG - avail; const take = freeable.map(() => 0);
          P.map((p, k) => k).sort((i, j) => freeable[j] - freeable[i]).forEach((k) => { const t = Math.min(freeable[k], short); take[k] = t; short -= t; });
          const donors = take.map((t, k) => t ? k : -1).filter((k) => k >= 0);
          if (donors.length) {
            add("graph", `compaction on ${donors.map((k) => shortName(P[k])).join(", ")}: live worlds moved below slot ${donors.map((k) => Math.floor(((S.mapped[k] - take[k]) * GU) / P[k].bytes)).join(" / ")} so the tail pages are empty.`);
            add("join", `join every stream that may still read those tails. The graph pauses here; this is the only stall.`);
            donors.forEach((k) => { S.mapped[k] -= take[k]; S.pool += take[k]; });
            add("host", `resize_backing: unmap ${names(take, (v) => `${v} page(s) of`)}. ${S.pool} handle(s) now in the pool, still counted.`);
            avail += take.reduce((a, v) => a + v, 0);
          }
        }
        const got = extra.map(() => 0); let left = avail;
        P.map((p, k) => k).sort((i, j) => P[j].bytes - P[i].bytes).forEach((k) => { const g = Math.min(extra[k], left); got[k] = g; left -= g; });
        const gotTotal = got.reduce((a, v) => a + v, 0), fromPool = Math.min(S.pool, gotTotal); S.pool -= fromPool;
        got.forEach((g, k) => (S.mapped[k] += g));
        if (gotTotal) add("host", `map_backing + publish_ready: ${names(got, (v) => `${v} page(s) onto`)}${fromPool ? `, ${fromPool} taken from the pool` : ""}${gotTotal - fromPool ? `, ${gotTotal - fromPool} new (cuMemCreate)` : ""}. No join: fresh addresses. Ready prefixes now ${P.map((p, k) => `${ready(k)} ${shortName(p)}`).join(", ")}.`);
        const shortfall = extra.reduce((a, v, k) => a + v - got[k], 0);
        if (shortfall) { const holders = P.map((p, k) => k).filter((k) => S.mapped[k] > want[k]); add("none", `${names(extra.map((v, k) => v - got[k]), (v) => `${v} more page(s) for`)} wanted, but ${holders.map((k) => shortName(P[k])).join(", ")} still hold${holders.length === 1 ? "s" : ""} live worlds in them. Running episodes are never evicted; the shift completes over the next resets as they end.`); }
      }
      // 3. creates toward the target, bounded by ready prefix and budget
      const create = P.map(() => 0), rejBudget = P.map(() => 0), rejSlots = P.map(() => 0);
      let mem = live.reduce((a, n, k) => a + n * P[k].bytes, 0);
      P.map((p, k) => k).sort((i, j) => P[j].bytes - P[i].bytes).forEach((k) => {
        let need = Math.max(0, tgt[k] - live[k]);
        while (need > 0) {
          if (live[k] >= ready(k)) { rejSlots[k] += 1; need -= 1; continue; }
          if (mem + P[k].bytes > S.budget) { rejBudget[k] += 1; need -= 1; continue; }
          need -= 1; live[k] += 1; mem += P[k].bytes; create[k] += 1;
        }
      });
      const rb = rejBudget.reduce((a, v) => a + v, 0), rs = rejSlots.reduce((a, v) => a + v, 0);
      if (needG) S.seq += 1;
      if (create.some(Boolean) || rb || rs) add("graph", `directory batch ${S.seq}: CREATE ${names(create, String) || "none"} into free ready slots.` + (rb ? ` ${rb} rejected: budget.` : "") + (rs ? ` ${rs} rejected: NO_SLOTS, beyond the ready prefix.` : ""));
      add("graph", `publish: nworld = ${P.map((p, k) => `${live[k]} ${shortName(p)}`).join(", ")}. Kernels follow the new counts on the next replay.`);
      S.live = live; S.steps = steps; render();
    }
    function render() {
      figure.innerHTML = ""; const W = 760; const s = svg("svg", { viewBox: `0 0 ${W} 200`, width: "100%" });
      const x0 = 24, barW = W - 48, unit = barW / Math.max(S.budget, used());
      const tgt = targets();
      s.appendChild(svg("text", { x: x0, y: 18, "font-size": 12, fill: C.text, "font-weight": "600", text: `memory in use: ${SC.fmt(used())} of ${SC.fmt(S.budget)}` }));
      s.appendChild(svg("rect", { x: x0, y: 28, width: barW, height: 26, rx: 5, fill: C.free, stroke: C.freeStroke }));
      let x = x0;
      P.forEach((p, k) => { const w = S.live[k] * p.bytes * unit; s.appendChild(svg("rect", { x, y: 28, width: w, height: 26, fill: p.color })); if (w > 70) s.appendChild(svg("text", { x: x + 6, y: 46, "font-size": 11, fill: "white", text: `${S.live[k]} ${shortName(p)}` })); x += w; });
      const bx = x0 + S.budget * unit; s.appendChild(svg("line", { x1: bx, y1: 22, x2: bx, y2: 60, stroke: C.bad, "stroke-width": 2 })); s.appendChild(svg("text", { x: bx, y: 72, "text-anchor": "middle", "font-size": 10, fill: C.bad, text: "budget" }));
      s.appendChild(svg("text", { x: x0, y: 96, "font-size": 12, fill: C.text, "font-weight": "600", text: `target that fills the budget: ${splitText()}` + (desiredUnits() < S.budget ? ` (${SC.fmt(S.budget - desiredUnits())} unused: slot limits)` : "") }));
      s.appendChild(svg("rect", { x: x0, y: 106, width: barW, height: 16, rx: 4, fill: C.free, stroke: C.freeStroke }));
      x = x0; P.forEach((p, k) => { const w = tgt[k] * p.bytes * unit; s.appendChild(svg("rect", { x, y: 106, width: w, height: 16, fill: p.color, opacity: 0.5 })); x += w; });
      // physical layer: pages per prototype, pool, unused budget
      const BG = budgetG(), gw = barW / Math.max(BG, mappedG() + S.pool);
      s.appendChild(svg("text", { x: x0, y: 146, "font-size": 12, fill: C.text, "font-weight": "600", text: `physical: ${mappedG()} page(s) mapped, ${S.pool} in the pool (created at startup, unmapped), budget ${BG} (${SC.granuleNote})` }));
      x = x0;
      P.forEach((p, k) => { for (let g = 0; g < S.mapped[k]; g++) { s.appendChild(svg("rect", { x, y: 154, width: Math.max(1, gw - 2), height: 18, rx: 2, fill: p.color, stroke: "#1f2937" })); x += gw; } });
      for (let g = 0; g < S.pool; g++) { s.appendChild(svg("rect", { x, y: 154, width: Math.max(1, gw - 2), height: 18, rx: 2, fill: "#fde68a", stroke: "#1f2937" })); x += gw; }
      for (let g = mappedG() + S.pool; g < BG; g++) { s.appendChild(svg("rect", { x, y: 154, width: Math.max(1, gw - 2), height: 18, rx: 2, fill: "none", stroke: "#d1d5db", "stroke-dasharray": "3 3" })); x += gw; }
      s.appendChild(svg("text", { x: x0, y: 190, "font-size": 10, fill: C.muted, text: `ready prefixes: ${P.map((p, k) => `${ready(k)} ${shortName(p)}`).join(", ")} · reserved slots = largest budget ÷ bytes: ${P.map((p) => `${p.slots} ${shortName(p)}`).join(", ")} · a reset ends ${Math.round(S.ending * 100)}% of episodes` }));
      figure.appendChild(s);
      stats.innerHTML = "";
      P.forEach((p, k) => stats.appendChild(stat(`nworld ${shortName(p)} (kernel count)`, S.live[k])));
      stats.appendChild(stat("memory used", `${SC.fmt(used())} / ${SC.fmt(S.budget)}`));
      stepBox.innerHTML = "";
      if (S.steps) S.steps.forEach((st) => stepBox.appendChild(el("li", { class: "gc-step" }, [el("span", { class: `gc-tag gc-tag-${st.where}`, text: st.where === "none" ? "no-op" : st.where }), document.createTextNode(" " + st.text)])));
    }
    const ctrls = [];
    const [l1, s1_i, s1_o] = sl(`memory budget (${SC.unitNote})`, SC.budget.min, SC.budget.max, SC.budget.step, S.budget, (e) => { S.budget = +e.target.value; refill(); refreshReadouts(); render(); }, SC.fmt);
    ctrls.push(el("div", { class: "gc-ctrl" }, [l1, s1_i, s1_o]));
    const readouts = [];
    if (N === 2) {
      const [l2, s2_i, s2_o] = sl(`split of the budget: all ${shortName(P[0])} ← → all ${shortName(P[1])}`, 0, 1, 0.05, 0.5, (e) => { S.weights = [1 - e.target.value, +e.target.value]; render(); }, () => splitText());
      readouts.push(s2_o); ctrls.push(el("div", { class: "gc-ctrl" }, [l2, s2_i, s2_o]));
    } else {
      P.forEach((p, k) => { const [l, i, o] = sl(`weight of ${shortName(p)}`, 0, 1, 0.05, S.weights[k], (e) => { S.weights[k] = +e.target.value; refreshReadouts(); render(); }, () => `${targets()[k]} worlds`); readouts.push(o); ctrls.push(el("div", { class: "gc-ctrl" }, [l, i, o])); });
    }
    function refreshReadouts() { if (N === 2) readouts[0].textContent = splitText(); else readouts.forEach((o, k) => (o.textContent = `${targets()[k]} worlds`)); }
    const [l3, s3_i, s3_o] = sl("episodes ending per reset", 0, 1, 0.05, S.ending, (e) => { S.ending = +e.target.value; render(); }, (v) => `${Math.round(v * 100)}%`);
    ctrls.push(el("div", { class: "gc-ctrl" }, [l3, s3_i, s3_o]));
    ctrls.push(button("Reset (run one batch)", reset, true), button("Start over", () => { S.live = SC.live.slice(); S.mapped = SC.live.map((n, k) => gFor(n, k)); refill(); S.seq = 0; S.steps = null; render(); }));
    root.appendChild(el("div", { class: "gc-toolbar gc-toolbar-col" }, ctrls));
    root.appendChild(el("div", { class: "gc-hint", text: (N === 2 ? "Set a budget and how it is split between the two prototypes, then press Reset. " : "Set a budget and the weight of each world prototype, as in a clone plan, then press Reset. ") + "Every step the reset takes is listed below the figure, tagged with where it runs: inside the replayed graph, on the host between replays, or a join that stalls the graph. Move the split a long way to force the host steps; leave it alone to see the steady state touch nothing but the directory." }));
    root.appendChild(figure); root.appendChild(stats); root.appendChild(stepBox); render();
  }

  /* ------------------------------------------------------------------ */
  /* 7. Stack: occupancy, virtual addresses, physical pages, aligned   */
  /* ------------------------------------------------------------------ */
  function stack(root) {
    const SC = sceneOf(root), ST = SC.stack;
    const GU = ST.GU, BUDGET = ST.BUDGET;
    // every prototype reserves the whole budget: cap = budget ÷ bytes per world
    const P = ST.protos.map((p, k) => ({ ...p, cap: Math.floor((BUDGET * GU) / p.bytes), name: SC.protos[k].name, color: PALETTE[k] })), N = P.length;
    const S = { rows: [], mapped: [], pool: 0, gen: {}, nextId: 0, dense: [], seq: 0, retired: [] };
    const figure = el("div", { class: "gc-figure" }); const stats = el("div", { class: "gc-stats" }); const note = el("div", { class: "gc-note" });
    const say = (m, bad) => { note.textContent = m; note.classList.toggle("gc-note-bad", !!bad); };
    const live = (k) => S.rows[k].filter(Boolean).length;
    const readySlots = (k) => Math.min(P[k].cap, Math.floor((S.mapped[k] * GU) / P[k].bytes));
    const freeSlots = (k) => { const o = []; for (let r = 0; r < readySlots(k); r++) if (!S.rows[k][r]) o.push(r); return o; };
    const granulesMapped = () => S.mapped.reduce((a, v) => a + v, 0);
    const granulesUsed = () => granulesMapped() + S.pool;
    function create(k) {
      const p = P[k], free = freeSlots(k);
      if (!free.length) { say(`${p.name}: no free slot with pages behind it. Map more pages first.`, true); render(); return; }
      const slot = S.dense[k] ? free[0] : free[(S.seq * 7919 + free.length * 31) % free.length];
      const id = S.nextId++; S.gen[id] = 1; S.rows[k][slot] = { id, gen: 1 }; S.dense[k] = false; S.seq += 1;
      say(`CREATE ${p.name} world ${id} in slot ${slot}. Only the directory layer changed; the slot's address and its pages were already there.`); render();
    }
    function destroy(k, slot) {
      const h = S.rows[k][slot]; if (!h) return; S.rows[k][slot] = null; S.gen[h.id] += 1; S.retired.push({ id: h.id, gen: h.gen, slot, k }); S.dense[k] = false; S.seq += 1;
      say(`DESTROY ${P[k].name} world ${h.id}. Slot ${slot} is free; its address and pages are unchanged. Handle (${h.id}, ${h.gen}) is stale.`); render();
    }
    function compact(k) {
      const p = P[k], lv = S.rows[k].map((h, r) => (h ? { ...h, from: r } : null)).filter(Boolean);
      const moves = lv.filter((h) => h.from >= lv.length).length; const packed = Array(p.cap).fill(null); lv.forEach((h, i) => (packed[i] = { id: h.id, gen: h.gen }));
      S.rows[k] = packed; S.dense[k] = true; S.seq += 1;
      say(`Compaction (${p.name}): ${moves} world(s) copied into the lowest slots. Data moved between slots; addresses and pages did not move.`); render();
    }
    function map(k) {
      const p = P[k], need = Math.ceil((p.grow * p.bytes) / GU);
      if (readySlots(k) >= p.cap) { say(`${p.name}: the whole reservation is already mapped.`, true); return; }
      const fromPool = Math.min(S.pool, need), fresh = need - fromPool;
      if (granulesUsed() + fresh > BUDGET) { say(`map (${p.name}): MemoryError before any driver call; ${fresh} new handle(s) would exceed the budget of ${BUDGET} (${S.pool} in the pool is not enough). Unmap another prototype's tail first.`, true); render(); return; }
      S.pool -= fromPool; S.mapped[k] += need;
      say(`map_backing (${p.name}): ${need} page(s) mapped${fromPool ? `, ${fromPool} taken from the pool` : ""}${fresh ? `, ${fresh} new (cuMemCreate)` : ""}, then publish_ready. Host call between replays, no join. The virtual layer did not change; the physical layer grew.`); render();
    }
    function unmap(k) {
      const p = P[k], need = Math.ceil((p.grow * p.bytes) / GU);
      const newReady = Math.max(0, Math.floor(((S.mapped[k] - need) * GU) / p.bytes));
      if (S.mapped[k] - need < 0 || (live(k) > 0 && S.rows[k].slice(newReady).some(Boolean))) { say(`${p.name}: cannot unmap slots that hold live worlds. Destroy or compact first.`, true); return; }
      S.mapped[k] -= need; S.pool += need; say(`resize_backing (${p.name}), joined: streams joined, readiness lowered, then ${need} page(s) unmapped. Their page handles go to the pool: owned by no prototype, still counted against the budget. The virtual layer is unchanged; slots ≥ ${newReady} have no pages again.`); render();
    }
    function lookupStale() { if (!S.retired.length) { say("Destroy a world first.", true); return; } const h = S.retired[S.retired.length - 1]; say(`location(${h.id}, ${h.gen}) → invalid: identity ${h.id} is at generation ${S.gen[h.id]}.`, true); }
    function trim() { if (!S.pool) { say("trim: the pool is empty.", true); return; } const n = S.pool; S.pool = 0; say(`trim: cuMemRelease on ${n} pooled handle(s); the budget in use drops by ${n}.`); render(); }
    function reset() { S.rows = P.map((p) => Array(p.cap).fill(null)); S.mapped = ST.mapped.slice(); S.pool = BUDGET - ST.mapped.reduce((a, v) => a + v, 0); S.gen = {}; S.nextId = 0; S.dense = P.map(() => true); S.seq = 0; S.retired = []; ST.init.forEach((n, k) => { for (let i = 0; i < n; i++) create(k); }); say(`Three layers per prototype. Directory: which slots hold worlds. Virtual: one contiguous range of addresses, sized to the whole budget of ${BUDGET} pages. Physical: which pages are mapped under it; the rest of the budget was created at startup and waits in the pool.`); render(); }
    function render() {
      figure.innerHTML = "";
      const RH = 100, W = 860, x0 = 150, sw = ST.sw || 38; const s = svg("svg", { viewBox: `0 0 ${W} ${14 + N * RH + 28}`, width: "100%" });
      P.forEach((p, k) => {
        const y = 14 + k * RH, lv = live(k), ready = readySlots(k), sel = k === S.sel;
        if (sel) s.appendChild(svg("rect", { x: 6, y: y - 4, width: W - 12, height: RH - 4, rx: 6, fill: "none", stroke: p.color, "stroke-width": 1.5, "stroke-dasharray": "4 3" }));
        s.appendChild(svg("text", { x: 16, y: y + 9, "font-size": 11, "font-weight": "600", fill: C.text, text: `${p.name} · ${p.bytes} unit${p.bytes > 1 ? "s" : ""}/world · ${p.cap} slots = budget ÷ ${p.bytes}` }));
        s.appendChild(svg("text", { x: 16, y: y + 29, "font-size": 8.5, fill: C.muted, text: `directory · kernel 0..${Math.max(0, lv - 1)}` }));
        for (let r = 0; r < p.cap; r++) {
          const x = x0 + r * sw, h = S.rows[k][r];
          const rect = svg("rect", { x, y: y + 15, width: sw - 3, height: 22, rx: 3, fill: h ? p.color : "#ffffff", stroke: h ? (r >= lv ? C.outside : "#1f2937") : "#d1d5db", "stroke-width": h && r >= lv ? 2.5 : 1, class: h ? "gc-clickable" : "", onclick: () => destroy(k, r) });
          if (h) rect.appendChild(svg("title", { text: `world ${h.id}, generation ${h.gen}. Click to destroy.` }));
          s.appendChild(rect);
          if (h) s.appendChild(svg("text", { x: x + (sw - 3) / 2, y: y + 29, "text-anchor": "middle", "font-size": 8, fill: "white", text: `${h.id}·g${h.gen}` }));
        }
        s.appendChild(svg("text", { x: 16, y: y + 53, "font-size": 8.5, fill: C.muted, text: `virtual · base + i × ${p.bytes}` }));
        s.appendChild(svg("rect", { x: x0, y: y + 42, width: p.cap * sw - 3, height: 16, rx: 3, fill: "#f8fafc", stroke: "#1f2937" }));
        for (let r = 0; r < p.cap; r++) { if (r) s.appendChild(svg("line", { x1: x0 + r * sw - 1.5, y1: y + 42, x2: x0 + r * sw - 1.5, y2: y + 58, stroke: "#cbd5e1" })); s.appendChild(svg("text", { x: x0 + r * sw + (sw - 3) / 2, y: y + 53, "text-anchor": "middle", "font-size": 8, fill: C.muted, text: String(r) })); }
        const unitW = sw / p.bytes, gW = GU * unitW, totalG = BUDGET;
        s.appendChild(svg("text", { x: 16, y: y + 75, "font-size": 8.5, fill: C.muted, text: `physical · ${S.mapped[k]} of ${totalG} · ${ready} ready` }));
        for (let g = 0; g < totalG; g++) {
          const gx = x0 + g * gW, m = g < S.mapped[k], gw = Math.min(gW - 3, p.cap * sw - 3 - g * gW);
          s.appendChild(svg("rect", { x: gx, y: y + 64, width: Math.max(2, gw), height: 16, rx: 3, fill: m ? "#93c5fd" : "none", stroke: m ? "#1f2937" : "#d1d5db", "stroke-dasharray": m ? "" : "3 3" }));
          if (m && gw > 26) s.appendChild(svg("text", { x: gx + gw / 2, y: y + 75, "text-anchor": "middle", "font-size": 7.5, fill: "#111827", text: "2 MiB" }));
        }
        if (ready < p.cap) s.appendChild(svg("text", { x: x0 + ready * sw, y: y + 91, "font-size": 8, fill: C.muted, text: `← slots ${ready}..${p.cap - 1}: reserved, no pages` }));
      });
      const py = 14 + N * RH + 6;
      s.appendChild(svg("text", { x: 16, y: py + 11, "font-size": 8.5, fill: C.muted, text: `pool: ${S.pool} created at startup, unmapped` }));
      for (let g = 0; g < BUDGET; g++) {
        const gx = x0 + g * 26, state = g < granulesMapped() ? "mapped" : g < granulesUsed() ? "pool" : "free";
        s.appendChild(svg("rect", { x: gx, y: py, width: 22, height: 14, rx: 3, fill: state === "mapped" ? "#93c5fd" : state === "pool" ? "#fde68a" : "none", stroke: state === "free" ? "#d1d5db" : "#1f2937", "stroke-dasharray": state === "free" ? "3 3" : "" }));
      }
      s.appendChild(svg("text", { x: x0 + BUDGET * 26 + 8, y: py + 11, "font-size": 8.5, fill: C.muted, text: `budget ${BUDGET}: blue mapped · yellow pool · dashed released by trim` }));
      figure.appendChild(s);
      stats.innerHTML = "";
      const outside = P.reduce((a, p, k) => a + S.rows[k].filter((h, r) => h && r >= live(k)).length, 0);
      stats.appendChild(stat("live", P.map((p, k) => `${live(k)} ${shortName(p)}`).join(" · ")));
      stats.appendChild(stat("page handles", `${granulesMapped()} mapped · ${S.pool} pooled · ${granulesUsed()} of ${BUDGET} budget`));
      const o = stat("live worlds the kernel skips", outside); o.classList.toggle("gc-stat-bad", outside > 0); stats.appendChild(o);
      chips.forEach((c, k) => c.classList.toggle("gc-btn-primary", k === S.sel));
    }
    S.sel = 0;
    const tag = (where, text, title) => { const t = el("span", { class: `gc-tag gc-tag-${where}`, text }); if (title) t.setAttribute("title", title); return t; };
    const chips = P.map((p, k) => button(shortName(p), () => { S.sel = k; render(); }));
    root.appendChild(el("div", { class: "gc-toolbar" }, [el("span", { class: "gc-label", text: "prototype:" })].concat(chips)));
    const act = (where, label, fn, title) => { const b = button(label, () => fn(S.sel)); b.setAttribute("title", title); return el("span", { class: "gc-action" }, [tag(where, where, title), b]); };
    root.appendChild(el("div", { class: "gc-toolbar" }, [
      act("graph", "Create", create, "Directory batch inside the captured step; replayable. Click a live world to destroy it, the same kind of operation."),
      act("graph", "Compact", compact, "Directory moves inside the captured step; replayable. Data is copied between slots; addresses and pages do not move."),
      act("host", "Map pages", map, "Driver call on the CPU between replays; no GPU wait, cannot be captured. Takes from the pool first (cheap, cannot fail), else cuMemCreate."),
      act("join", "Unmap tail", unmap, "Joins every stream, then a driver call. The graph stalls while the CPU waits. Handles go to the pool."),
      act("host", "Trim pool", (k) => trim(), "cuMemRelease on pooled handles; no GPU wait. The next map must cuMemCreate again and may fail."),
      act("graph", "Stale lookup", (k) => lookupStale(), "Look up the most recently destroyed handle: the generation check fails."),
      button("Start over (figure only)", reset),
    ]));
    root.appendChild(el("div", { class: "gc-hint", text: `Pick a prototype, then an action; hover an action for what it does and where it runs. graph = inside the captured step, host = CPU driver call with no GPU wait, join = CPU waits for the GPU first. Each action changes exactly one layer; nothing ever changes the virtual layer. ${ST.note}.` }));
    root.appendChild(figure); root.appendChild(stats); root.appendChild(note); reset();
  }
  /* ------------------------------------------------------------------ */
  /* 8. Compare: three designs, one sequence of events                   */
  /* ------------------------------------------------------------------ */
  function compare(root) {
    const U = 11, CART = "#2563eb", G1 = "#7c3aed", ASLEEP = "#d1d5db", MAPPED = "#bfdbfe";
    // each scenario starts from the same start state; they are not a sequence
    const EVENTS = [
      "Start: 6 cartpoles and 2 G1s. A G1 world is 4 units, a cartpole 1.",
      "From the start, a cartpole is destroyed and not replaced.",
      "From the start, training wants 9 cartpoles.",
      "From the start, the mix shifts to 2 cartpoles and 4 G1s.",
    ];
    const S = { step: 0 };
    const figure = el("div", { class: "gc-cmp3" }); const title = el("div", { class: "gc-cmp3-title" });
    const cell = (s, x, y, w, h, fill, opts) => {
      const o = opts || {};
      s.appendChild(svg("rect", { x, y, width: Math.max(1, w - 1.5), height: h, rx: 2, fill, stroke: o.stroke || "#1f2937", "stroke-width": o.sw || 0.8, "stroke-dasharray": o.dash || "", opacity: o.opacity == null ? 1 : o.opacity }));
      if (o.label) s.appendChild(svg("text", { x: x + (w - 1.5) / 2, y: y + h / 2 + 3, "text-anchor": "middle", "font-size": 10, fill: o.labelFill || "white", text: o.label }));
    };
    const text = (s, x, y, t, size, fill, anchor) => s.appendChild(svg("text", { x, y, "font-size": size || 11, fill: fill || C.muted, "text-anchor": anchor || "start", text: t }));
    const bracket = (s, x, y, w, label) => { s.appendChild(svg("path", { d: `M${x} ${y + 4} v-4 h${w} v4`, fill: "none", stroke: "#111827", "stroke-width": 1 })); text(s, x + w / 2, y - 3, label, 10, "#111827", "middle"); };
    function panel(name, tagline, draw) {
      const card = el("div", { class: "gc-cmp3-card" });
      const counters = el("span", { class: "gc-cmp3-counters" });
      card.appendChild(el("div", { class: "gc-cmp3-head" }, [el("span", { class: "gc-cmp3-name", text: name }), el("span", { class: "gc-cmp3-tagline", text: tagline }), counters]));
      const sv = svg("svg", { viewBox: "0 0 640 96", width: "100%" }); card.appendChild(sv);
      const caption = el("div", { class: "gc-cmp3-caption" }); card.appendChild(caption);
      const r = draw(sv, S.step);
      caption.appendChild(el("span", { class: `gc-tag gc-tag-${r.tag}`, text: r.tag === "none" ? "no-op" : r.tag })); caption.appendChild(document.createTextNode(" " + r.text));
      [["re-recorded", r.rerecord], ["stalls", r.stalls], ["held", `${r.mem} units`]].forEach(([k, v]) => counters.appendChild(el("span", { class: "gc-cmp3-counter" + ((k !== "held" && v > 0) ? " gc-bad" : ""), text: `${k} ${v}` })));
      return card;
    }
    // A. one padded Data: 8 slots × 4 units
    function drawA(s, k) {
      const slots = [["c", "c", "c", "c", "c", "c", "g", "g"], ["c", "c", "c", "c", "c", null, "g", "g"], ["c", "c", "c", "c", "c", "c", "g", "g"], ["c", "c", "g", "g", "g", "g", null, null]][k];
      const x0 = 12, y = 20, w = 4 * U, h = 28;
      text(s, x0, 12, "one Data, every slot sized for a G1 (4 units)");
      slots.forEach((p, i) => cell(s, x0 + i * w, y, w, h, p === "c" ? CART : p === "g" ? G1 : ASLEEP, { label: p === "c" ? "cart" : p === "g" ? "G1" : "asleep", labelFill: p ? "white" : "#374151", dash: p ? "" : "3 2" }));
      if (k === 2) { for (let i = 0; i < 3; i++) cell(s, x0 + (8 + i) * w + 4, y, w, h, "none", { stroke: C.bad, sw: 1.2, dash: "3 2", label: "no room", labelFill: C.bad }); }
      bracket(s, x0, y + h + 20, 8 * w, "kernel runs all 8 slots, masked");
      text(s, x0 + 8 * w + 110, y + h / 2 + 4, "memory: 8 × 4 = 32 units, always");
      const out = [
        { tag: "none", text: "Every slot is padded to the largest world: 6 cartpole slots waste 3 units each already." },
        { tag: "waste", text: "Slot 5 is asleep. It keeps its 4 units and still runs through every kernel behind a mask." },
        { tag: "waste", text: "No free slot to wake: the 7th, 8th and 9th cartpole cannot exist. The allocation is the ceiling." },
        { tag: "waste", text: "G1s can take any slot because all are padded. Two slots asleep; memory still 32." },
      ][k];
      return { ...out, rerecord: 0, stalls: 0, mem: 32 };
    }
    // B. one exact Data per prototype, reallocated
    function drawB(s, k) {
      const st = [[6, 2, 0, null], [5, 2, 1, "cart"], [9, 2, 1, "cart"], [2, 4, 2, "both"]][k];
      const [nc, ng, re, which] = st, prev = k ? [6, 2] : null;
      const x0 = 12; text(s, x0, 12, "one Data per prototype, exactly nworld");
      const bar = (x, y, n, w, color, label, ghost) => { for (let i = 0; i < n; i++) cell(s, x + i * w, y, w, 22, color, { opacity: ghost ? 0.25 : 1, dash: ghost ? "2 2" : "" }); if (label) text(s, x + n * w + 8, y + 15, label, 10.5, ghost ? "#9ca3af" : C.muted); if (ghost) s.appendChild(svg("line", { x1: x, y1: y + 11, x2: x + n * w, y2: y + 11, stroke: C.bad, "stroke-width": 1.5 })); return x + n * w; };
      const realloc = which === "both" || which === "cart";
      let xe;
      if (realloc && prev) { xe = bar(x0, 20, prev[0], U, CART, "", true); text(s, xe + 6, 35, "→", 12, C.bad); bar(xe + 24, 20, nc, U, CART, `cartpole: old freed, new ${nc} worlds, ${nc} units`); }
      else bar(x0, 20, nc, U, CART, `cartpole Data: ${nc} worlds, ${nc} units`);
      if (which === "both") { xe = bar(x0, 54, prev[1], 4 * U, G1, "", true); text(s, xe + 6, 69, "→", 12, C.bad); bar(xe + 24, 54, ng, 4 * U, G1, `G1: old freed, new ${ng} worlds, ${ng * 4} units`); }
      else bar(x0, 54, ng, 4 * U, G1, `G1 Data: ${ng} worlds, ${ng * 4} units`);
      if (realloc) text(s, 380, 12, "allocate, copy, free, re-record the graph, host sync", 11, C.bad);
      const out = [
        { tag: "none", text: "Exact sizes: 6 + 8 = 14 units, and one captured graph per size." },
        { tag: "stall", text: "A smaller cartpole Data: allocate, copy 5 worlds, free the old one, re-record the graph, synchronize the host." },
        { tag: "stall", text: "A larger cartpole Data: allocate 9, copy 6, free, re-record, synchronize." },
        { tag: "stall", text: "Both prototypes change size: two reallocations, re-record, synchronize." },
      ][k];
      return { ...out, rerecord: re, stalls: re, mem: nc + ng * 4 };
    }
    // C. this package: reserved ranges, mapped pages, live cells
    function drawC(s, k) {
      // [cart live, cart mapped pages, g1 live, g1 mapped, pool, hole/moves flag]
      const st = [[6, 2, 2, 2, 2], [5, 2, 2, 2, 2], [9, 3, 2, 2, 1], [2, 1, 4, 4, 1]][k];
      const [lc, mc, lg, mg, pool] = st, x0 = 12, GW = 4 * U;
      text(s, x0, 12, "reserved ranges (dashed), mapped pages (blue), live worlds");
      const range = (y, label, mapped, live, w, color, h) => {
        cell(s, x0, y, 4 * GW, h + 6, "none", { stroke: "#9ca3af", dash: "3 3", sw: 0.8 });
        for (let g = 0; g < mapped; g++) cell(s, x0 + g * GW, y, GW, h + 6, MAPPED, { stroke: "#60a5fa", sw: 0.6 });
        for (let i = 0; i < live; i++) cell(s, x0 + 2 + i * w, y + 3, w, h, color);
        text(s, x0 + 4 * GW + 8, y + h / 2 + 7, label, 10.5);
      };
      range(20, `cartpole: ${lc} live, ${mc} page${mc > 1 ? "s" : ""} mapped`, mc, lc, U, CART, 16);
      range(48, `G1: ${lg} live, ${mg} page${mg > 1 ? "s" : ""} mapped`, mg, lg, GW, G1, 16);
      if (k === 1) { cell(s, x0 + 2 + 3 * U, 23, U, 16, "#ffffff", { stroke: "#1f2937" }); text(s, x0 + 4 * GW + 8 + 230, 33, "compaction: slot 5 → slot 3", 10, "#16a34a"); }
      // pool strip
      for (let g = 0; g < 6; g++) cell(s, x0 + g * 30, 78, 28, 12, g < mc + mg ? MAPPED : g < mc + mg + pool ? "#fde68a" : "none", { stroke: "#9ca3af", sw: 0.6 });
      text(s, x0 + 6 * 30 + 8, 88, `pool: ${pool} created at startup, unmapped · budget 6 pages`, 10);
      const out = [
        { tag: "none", text: "Each range is reserved for the whole budget; only 4 pages are mapped. One graph, recorded once." },
        { tag: "graph", text: "DESTROY leaves a hole; compaction copies the tail world down; count becomes 5. Pages stay mapped." },
        { tag: "host", text: "9 exceeds the 8 ready slots: map one page from the pool, publish readiness, CREATE 3. No GPU wait, no re-record." },
        { tag: "join", text: "Compact cartpoles to 2, join once, unmap 1 page to the pool, map 2 onto G1, publish. The one stall in the design." },
      ][k];
      return { ...out, rerecord: 0, stalls: k === 3 ? 1 : 0, mem: (mc + mg) * 4 };
    }
    function render() {
      figure.innerHTML = ""; title.textContent = EVENTS[S.step];
      figure.appendChild(panel("Padding + sleep", "one Data, every world sized for the largest prototype", drawA));
      figure.appendChild(panel("Homogeneous + resize", "one exact Data per prototype, reallocated at the Model level", drawB));
      const ours = panel("Homogeneous + virtual memory", "this package: one exact Data per prototype, pages mapped under the live worlds", drawC); ours.classList.add("gc-cmp3-ours"); figure.appendChild(ours);
    }
    const SHORT = ["Start", "A world is destroyed", "Need 9 cartpoles", "Mix shifts"];
    const tabs = EVENTS.map((e, i) => button(i ? `Start → ${SHORT[i]}` : SHORT[i], () => { S.step = i; render(); }));
    const origRender = render; render = function () { origRender(); tabs.forEach((t, i) => t.classList.toggle("gc-btn-primary", i === S.step)); };
    root.appendChild(el("div", { class: "gc-toolbar gc-steptabs" }, tabs));
    root.appendChild(title);
    root.appendChild(figure);
    root.appendChild(el("div", { class: "gc-hint", text: "Three scenarios, each starting from the same start state, played through three designs. The counters are the cost of that one scenario. graph = inside the captured step; host = CPU driver call, no GPU wait; join = the CPU waits for the GPU; waste and stall mark the costs the other designs pay." }));
    render();
  }

  /* ------------------------------------------------------------------ */
  /* 9. Walkthrough: one reset through the four modules                  */
  /* ------------------------------------------------------------------ */
  function walkthrough(root) {
    const CART = "#2563eb", G1 = "#7c3aed";
    // concrete starting state: 6 cartpoles (ids 0..5 in slots 0..5), 2 G1s (ids 6, 7 in slots 0, 1)
    const base = () => ({
      ids: [0, 1, 2, 3, 4, 5, 6, 7].map((id) => ({ id, gen: 1, proto: id < 6 ? "cartpole" : "G1", slot: id < 6 ? id : id - 6, state: "live" })),
      live: [6, 2], cart: Array(8).fill(null).map((_, i) => (i < 6 ? "state" : null)), g1: Array(4).fill(null).map((_, i) => (i < 2 ? "state" : null)),
      pending: [], ack: null, nodes: [6, 2], seq: 41, dense: true, moves: null,
    });
    const STEPS = [
      { lane: "Newton", tag: "host", call: "", text: "Before the reset: 6 cartpoles live in slots 0 to 5 of the cartpole storage, 2 G1s in slots 0 and 1 of the G1 storage. The graph's cartpole node runs 6 worlds, the G1 node 2. The objects every call below takes were made once at startup.",
        notes: [["32 MiB", "the memory budget: 16 page handles of 2 MiB"], ["21,845 and 1,365", "slot limits = budget ÷ stride: 32 MiB ÷ 1,536 B for cartpole, 32 MiB ÷ 24,576 B for G1. The same numbers size each prototype's storage"], ["65,536 identities", "a choice: at least 21,845 + 1,365 worlds can be live at once, rounded up with headroom"], ["4,096 commands", "a choice: the most requests one batch may carry"], ["directory.data.live_count", "made by directory.allocate: a device int32 array with one entry per prototype, [cartpole, G1], both zero at first. Only the directory writes it, at every publish"], ["live_count[0:1], live_count[1:2]", "one-element views onto that array, no copy. Each storage borrows its prototype's entry as protected_count, the floor a shrink may not cross; the graph binds the same entry to that prototype's nworld"]],
        values: "# at startup, once\nbacking   = backing.prepare(budget_bytes=32 * 2**20)\ndirectory = directory.allocate(slot_limits=(21845, 1365), id_capacity=65536, command_capacity=4096)\ncommands  = directory.allocate_commands(4096)\nresults   = directory.allocate_results(4096)\ncart      = fields.allocate(capacity=21845, protected_count=directory.data.live_count[0:1], fields=cartpole_schema, backing=backing)\ng1        = fields.allocate(capacity=1365,  protected_count=directory.data.live_count[1:2], fields=g1_schema,       backing=backing)", apply: () => {} },
      { lane: "Newton", tag: "graph", call: "build_reset_commands kernel", text: "Two causes, one batch. World 3's episode ended and the curriculum wants a G1 in its place: REPLACE, same identity at the next generation, destination prototype G1, so handle (3, 1) stops resolving. The loop also raised the cartpole target from 6 to 7: CREATE. Newton's own kernel writes both. Nothing in the package has run yet.",
        table: { title: "commands, after the kernel · sequence 42 · count 2", head: ["request", "operation", "instance_id", "generation", "prototype"], rows: [["0", "REPLACE", "3", "1", "1 = G1"], ["1", "CREATE", "-", "-", "0 = cartpole"]] },
        notes: [["ending an episode", "forces nothing. Newton picks: restart in place, no request; REPLACE, a new world under the same identity, here in another prototype; or DESTROY, if the population is shrinking"], ["same-prototype REPLACE", "would be restart in place plus a retired handle; nothing in memory or the counts would move"], ["sequence 42", "one higher than the last batch; replaying the same number returns the previous outcome"]],
        values: "@wp.kernel\ndef build_reset_commands(done, handle_id, handle_gen, next_prototype, c: InstanceCommands):\n    w = wp.tid()\n    if done[w]:\n        i = wp.atomic_add(c.count, 0, 1)      # claim request i\n        c.operation[i]   = REPLACE\n        c.instance_id[i] = handle_id[w]\n        c.generation[i]  = handle_gen[w]\n        c.prototype[i]   = next_prototype[w]  # the curriculum's choice for this slot", apply: (S) => { S.commands = 2; } },
      { lane: "Newton", tag: "host", call: "if live + creates > ready: map more pages first", text: "Is there room? 7 cartpoles against 5,461 ready slots and 3 G1s against 256, so no page work this reset. Had either answer been no, these host calls would run first, between replays.",
        notes: [["6,826", "the current 5,461 ready cartpole rows plus one more page of 1,365"], ["(6826, 256)", "the new admissible prefix per prototype"]],
        values: "# only when room is short; not this time\nfields.map_backing(cart, rows=6826)\nfields.publish_ready(cart, rows=6826)\ndirectory.publish_admissible_slots(directory, (6826, 256))", apply: () => {} },
      { lane: "directory", tag: "graph", call: "directory.begin(directory, commands)", text: "Reads the two requests. Checks that handle (3, 1) names a live world at its current generation and that sequence 42 is higher than the last one. The batch moves to VALIDATED.",
        table: { title: "directory.transaction, after begin · phase VALIDATED", head: ["request", "status"], rows: [["0", "OK: (3, 1) is live and current"], ["1", "OK"]] },
        values: "directory.begin(directory, commands)", apply: (S) => { S.seq = 42; S.ids[3].state = "checking"; } },
      { lane: "directory", tag: "graph", call: "directory.admit(directory, commands)", text: "Assigns destinations from the pre-batch free set. The REPLACE moves identity 3 to G1 slot 2, the first free G1 slot. The CREATE draws identity 8 and cartpole slot 6: live_count + ticket, because the cartpole prefix is dense. Cartpole slot 3 is still occupied in this snapshot, so nothing is placed there yet.",
        table: { title: "directory.transaction, after admit · phase ADMITTED", head: ["request", "status", "destination identity", "destination prototype", "destination slot"], rows: [["0", "OK", "3", "G1", "2"], ["1", "OK", "8", "cartpole", "6"]] },
        notes: [["snapshot admission", "destinations come only from slots free before the batch began; the slot a REPLACE vacates becomes free for the next batch"], ["identity 8", "the next free identity; identities are never reused while live"]],
        values: "directory.admit(directory, commands)", apply: (S) => { S.ids[3].state = "checking"; S.pending = [{ id: 3, gen: 2, proto: "G1", slot: 2 }, { id: 8, gen: 1, proto: "cartpole", slot: 6 }]; } },
      { lane: "fields", tag: "graph", call: "fields.fill(...) then acknowledge", text: "Newton's initializer reads the destinations and writes starting state into G1 row 2 and cartpole row 6, then acknowledges sequence 42 for both requests. An unacknowledged request is rejected at publish.",
        notes: [["G1 row 2, cartpole row 6", "the destination slots from admit; one fill per row per column, or Newton's own init kernel"], ["initialized_sequence", "the acknowledgement: writing the batch sequence says the row is fully initialized"]],
        values: "fields.fill(g1,   g1.fields[\"qpos\"].array,   initial_g1_qpos,   count=1, start=2)\nfields.fill(cart, cart.fields[\"qpos\"].array, initial_cart_qpos, count=1, start=6)\n# same for qvel and the other columns, then:\ndirectory.transaction.initialized_sequence[0:2] = 42", apply: (S) => { S.g1[2] = "fresh"; S.cart[6] = "fresh"; S.ack = 42; } },
      { lane: "directory", tag: "graph", call: "directory.publish(directory, commands, results)", text: "Commits the acknowledged requests. Identity 3 is now a G1 at generation 2 in G1 slot 2; cartpole slot 3 is a hole. Identity 8 is live in cartpole slot 6. live_count becomes [6, 3], and the cartpole prefix is no longer dense, so the dense-prefix certificate is cleared.",
        table: { title: "results, after publish · live_count = [6, 3] · cartpole certificate cleared", head: ["request", "status", "instance_id", "generation", "Newton's new handle"], rows: [["0", "OK", "3", "2", "(3, 2), a G1"], ["1", "OK", "8", "1", "(8, 1)"]] },
        notes: [["the hole", "cartpole slot 3 holds stale bytes and no world; the cartpole kernel bound to 6 would run slots 0 to 5 and miss slot 6"]],
        values: "directory.publish(directory, commands, results)", apply: (S) => { S.ids[3] = { id: 3, gen: 2, proto: "G1", slot: 2, state: "live" }; S.ids.push({ id: 8, gen: 1, proto: "cartpole", slot: 6, state: "live" }); S.pending = []; S.live = [6, 3]; S.cart[3] = null; S.g1[2] = "state"; S.dense = false; } },
      { lane: "directory", tag: "graph", call: "plan_compaction, fields.copy, publish_compaction", text: "Close the hole. The plan pairs the hole at cartpole slot 3 with the live tail world in slot 6. Newton copies that row down, then publication rewrites identity 8's placement to slot 3 and restores the certificate. The handle (8, 1) is unchanged.",
        table: { title: "directory.compaction plan", head: ["prototype", "from slot", "to slot", "identity"], rows: [["cartpole", "6", "3", "8"]] },
        notes: [["why copy", "the kernel runs slots 0 to live_count; a live world above that range would be skipped. Compaction makes occupancy match the count"]],
        values: "directory.plan_compaction(directory)\nfields.copy(cart, destination=3, source=6, count=1)   # every column of row 6 into row 3\ndirectory.publish_compaction(directory)", apply: (S) => { S.ids[8].slot = 3; S.cart[3] = "fresh"; S.cart[6] = null; S.dense = true; S.moves = 1; } },
      { lane: "graph", tag: "graph", call: "cudaGraphLaunch(step)", text: "Next replay. The updater node reads live_count on the device and sets the cartpole kernel node to 6 worlds and the G1 node to 3. No host readback, no re-record.",
        notes: [["nworld", "a CountParameter in each MJWarp Data, bound at capture time to that prototype's live count"], ["updater node", "the first node of the graph; it reads the counts and resizes the kernel nodes before they run"]],
        values: "# recorded once at startup:\nwp.launch(cartpole_step, dim=d_cart.nworld, ...)   # d_cart.nworld → directory.data.live_count[0]\nwp.launch(g1_step,       dim=d_g1.nworld,   ...)   # d_g1.nworld   → directory.data.live_count[1]\n# every step:\ncudaGraphLaunch(step)   # updater reads [6, 3]; cartpole_step runs 6 worlds, g1_step 3", apply: (S) => { S.nodes = [6, 3]; } },
      { lane: "backing", tag: "none", call: "", text: "Backing did not move this reset: the cartpole range keeps 4 pages mapped, the G1 range 3, 9 handles stay in the pool, 16 is the budget. It changes only when a prototype outgrows its ready prefix or the mix shifts far enough to need pages.",
        notes: [["mapped", "cartpole 4 pages, 8 MiB; G1 3 pages, 6 MiB"], ["pool", "9 handles created at startup, unmapped, counted"], ["budget", "16 handles, 32 MiB"]],
        values: "backing.memory_report(backing)", apply: () => {} },
    ];
    const S = { step: 0 };
    const stateAt = (k) => { const st = base(); for (let i = 1; i <= k; i++) STEPS[i].apply(st); return st; };
    const list = el("ol", { class: "gc-wt-steps" }); const right = el("div", { class: "gc-wt-state" });
    const items = STEPS.map((st, i) => { const li = el("li", { class: "gc-wt-step" }); li.appendChild(el("span", { class: `gc-tag gc-tag-${st.tag}`, text: st.lane })); li.appendChild(document.createTextNode(" ")); li.appendChild(el("span", { class: "gc-wt-steptext", text: st.call || (i ? "backing: nothing to do" : "Start: the objects") })); li.addEventListener("click", () => { S.step = i; render(); }); return li; });
    items.forEach((li) => list.appendChild(li));
    const panelBox = (name, active, children) => { const b = el("div", { class: "gc-wt-panel" + (active ? " gc-wt-active" : "") }); b.appendChild(el("div", { class: "gc-wt-panel-name", text: name })); children.forEach((c) => b.appendChild(c)); return b; };
    const strip = (cells, color) => { const w = el("div", { class: "gc-wt-strip" }); cells.forEach((v, i) => { const c = el("div", { class: "gc-wt-cell" + (v === "fresh" ? " gc-wt-fresh" : v ? " gc-wt-filled" : ""), text: v ? `${i}\nqpos\nqvel` : `${i}` }); if (v && v !== "fresh") { c.style.borderColor = color; } w.appendChild(c); }); return w; };
    function render() {
      const k = S.step, st = stateAt(k), lane = STEPS[k].lane;
      items.forEach((li, i) => li.classList.toggle("gc-wt-current", i === k));
      right.innerHTML = "";
      const d = el("div", { class: "gc-wt-desc" }); d.appendChild(el("span", { class: `gc-tag gc-tag-${STEPS[k].tag}`, text: STEPS[k].tag === "none" ? "no-op" : STEPS[k].tag })); d.appendChild(document.createTextNode(" " + STEPS[k].text)); right.appendChild(d);
      if (STEPS[k].table) { const t = STEPS[k].table, box = el("div", { class: "gc-wt-mini" }); box.appendChild(el("div", { class: "gc-wt-panel-name", text: t.title })); const tb = el("div", { class: "gc-wt-table" }); const hd = el("div", { class: "gc-wt-row gc-wt-head gc-wt-auto" }); t.head.forEach((h) => hd.appendChild(el("div", { text: h }))); tb.appendChild(hd); t.rows.forEach((r) => { const row = el("div", { class: "gc-wt-row gc-wt-auto" }); r.forEach((v) => row.appendChild(el("div", { text: v }))); tb.appendChild(row); }); box.appendChild(tb); right.appendChild(box); }
      if (STEPS[k].notes) { const dl = el("div", { class: "gc-wt-notes" }); STEPS[k].notes.forEach(([t, x]) => { dl.appendChild(el("div", { class: "gc-wt-note-term", text: t })); dl.appendChild(el("div", { class: "gc-wt-note-text", text: x })); }); right.appendChild(dl); }
      if (STEPS[k].values) right.appendChild(el("pre", { class: "gc-wt-values", text: STEPS[k].values }));
      // directory
      const tbl = el("div", { class: "gc-wt-table" });
      const head = el("div", { class: "gc-wt-row gc-wt-head" }); ["identity", "gen", "prototype", "slot", ""].forEach((h) => head.appendChild(el("div", { text: h }))); tbl.appendChild(head);
      st.ids.concat(st.pending.map((p) => ({ ...p, state: "pending" }))).forEach((r) => { const row = el("div", { class: "gc-wt-row" + (r.state === "checking" ? " gc-wt-hl" : r.state === "pending" ? " gc-wt-pending" : "") }); [String(r.id), String(r.gen), r.proto, String(r.slot), r.state === "pending" ? "admitted, not yet live" : r.state === "checking" ? "in this batch" : ""].forEach((v) => row.appendChild(el("div", { text: v }))); tbl.appendChild(row); });
      const counts = el("div", { class: "gc-wt-line", text: `live_count = [${st.live[0]} cartpole, ${st.live[1]} G1] · batch sequence ${st.seq}${st.ack ? ` · acknowledged ${st.ack}` : ""} · cartpole prefix ${st.dense ? "dense" : "has a hole: certificate cleared"}` });
      right.appendChild(panelBox("directory: who is where", lane === "directory", [tbl, counts]));
      right.appendChild(panelBox("fields: one packed row per slot. cartpole: 5,461 ready rows = 4 pages × 2 MiB ÷ 1,536 B, 8 drawn · G1: 256 ready rows = 3 × 2 MiB ÷ 24,576 B, 4 drawn", lane === "fields", [strip(st.cart, CART), el("div", { style: "height:6px" }), strip(st.g1, G1)]));
      const pair = el("div", { class: "gc-wt-pair" });
      pair.appendChild(panelBox("backing: pages under the ranges", lane === "backing", [el("div", { class: "gc-wt-line", text: "cartpole range: 21,845 rows reserved, 4 pages mapped → 5,461 ready · G1 range: 1,365 reserved, 3 pages → 256 ready · pool 9 · budget 16" })]));
      const nodes = el("div", { class: "gc-wt-nodes" });
      [["cartpole_step", st.nodes[0], CART], ["g1_step", st.nodes[1], G1]].forEach(([n, c, col]) => { const b = el("div", { class: "gc-wt-node" }); b.style.borderColor = col; b.appendChild(el("div", { class: "gc-wt-node-name", text: n })); b.appendChild(el("div", { class: "gc-wt-node-n", text: `runs ${c} worlds` })); b.appendChild(el("div", { class: "gc-muted", text: `← live_count[${n === "g1_step" ? 1 : 0}]` })); nodes.appendChild(b); });
      pair.appendChild(panelBox("graph: kernel nodes bound to counts", lane === "graph", [nodes]));
      right.appendChild(pair);
    }
    root.appendChild(el("div", { class: "gc-wt" }, [list, right]));
    root.appendChild(el("div", { class: "gc-hint", text: "Click a step. The panel whose state changes is outlined. Newton owns the decisions, the directory owns who is where, fields owns the bytes of each row, backing owns the pages under them, graph owns the kernel nodes that follow the counts." }));
    render();
  }

  const widgets = { population, lifecycle, replay, backing, memory, distribution, stack, compare, walkthrough };
  function init() {
    document.querySelectorAll(".gc-widget").forEach((root) => {
      if (root.dataset.ready && root.childElementCount > 0) return;
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
