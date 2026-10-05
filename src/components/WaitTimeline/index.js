import React, {useEffect, useId, useMemo, useRef, useState} from 'react';
import {SCENES, STAGES, makeSchedule} from './schedule';
import styles from './styles.module.css';

const clamp = x => Math.max(0, Math.min(1, x));
const active = (event, time) => event.start <= time && time < event.end;

// The drawings identify scene topology. Their motion illustrates execution, not simulated dynamics.
function SceneDrawing({prototype, phase = 0, moving = false}) {
  const angle = moving ? Math.sin(phase) * 12 : -9;
  const arm = (x, scale = 1) => <g transform={`translate(${x},0) scale(${scale})`}>
    <g transform={`rotate(${moving ? angle / 3 : 0},21,47)`}>
    <path d="M12 47h17m-8-2V34L9 24l10-15 15 10" />
    <circle cx="21" cy="34" r="3" /><circle cx="9" cy="24" r="3" />
    <circle cx="19" cy="9" r="3" /><path d="M34 15v8m-3-8h6" />
    </g>
  </g>;
  return <svg viewBox="0 0 88 56" className={styles.sceneDrawing} aria-hidden="true">
    <g fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      {prototype.shape === 'cartpole' && <>
        <path d="M8 48h70" /><rect x="29" y="34" width="27" height="10" rx="3" />
        <circle cx="34" cy="46" r="2.5" /><circle cx="51" cy="46" r="2.5" />
        <g transform={`rotate(${angle},42,34)`}><path d="M42 34V7" /><circle cx="42" cy="7" r="3" /></g>
      </>}
      {prototype.shape === 'g1' && <>
        <rect x="36" y="5" width="14" height="10" rx="4" /><path d="M33 20h20l-3 17H36Z" />
        <path d={`M34 22L25 ${30 + angle / 3}l-3 9M52 22l9 ${8 - angle / 3} 3 10M38 37l-6 12h-7M48 37l8 12h8`} />
        <circle cx="37" cy="38" r="2" /><circle cx="49" cy="38" r="2" />
      </>}
      {prototype.shape === 'assembly' && <>
        {(prototype.parts || [1, 1])[1] > 0 && arm(29, 0.88)}
        {(prototype.parts || [1, 1])[1] > 1 && arm(53, 0.75)}
        {Array.from({length: (prototype.parts || [1, 1])[0]}, (_, i) => <path key={i}
          transform={`translate(${i * 12},${i * -8})`}
          d="M8 26q3 18 18 10Q15 38 11 25Z" className={styles.banana} />)}
        <path d="M6 49h75" />
      </>}
      {prototype.shape === 'keyboard' && <>
        <rect x="5" y="12" width="78" height="33" rx="4" />
        {Array.from({length: prototype.keys}, (_, i) => {
          const columns = prototype.keys === 6 ? 6 : prototype.keys === 36 ? 12 : 18;
          const w = 68 / columns, h = 25 / Math.ceil(prototype.keys / columns);
          return <rect key={i} x={10 + (i % columns) * w} y={16 + Math.floor(i / columns) * h}
            width={w - 1} height={h - 1} rx="0.5"
            fill={moving && i === Math.floor(phase * 2) % prototype.keys ? 'currentColor' : 'none'} strokeWidth="0.7" />;
        })}
      </>}
    </g>
  </svg>;
}

function CapturedGraph({schedule, time, playing}) {
  const {scene, stage, events, milestones} = schedule;
  const count = scene.prototypes.length, height = count * 48 + 36, middle = height / 2 + 9;
  const isGPUCount = stage >= 3, isGPUReset = stage >= 2;
  const resetActive = events.some(e => ['placement', 'initialize', 'publish-replacement', 'compact'].includes(e.id) && active(e, time));
  const countsActive = events.some(e => /gpu-counts|read-counts|set-sizes|check-ready/.test(e.id) && active(e, time));
  const donor = scene.prototypes.findIndex(p => p.role === 'donor'), receiver = scene.prototypes.findIndex(p => p.role === 'receiver');
  const newEpisode = time >= milestones.replace;
  const badgeY = 30 + (newEpisode ? receiver : donor) * 48;
  return <div className={styles.graphSection}>
    <div className={styles.sectionHeading}>
      <strong>{isGPUCount ? 'One prepared graph' : stage === 0 ? 'Rebuild after addresses change' : 'Stable addresses; counts still come from the CPU'}</strong>
      <span>{isGPUCount ? 'Shared reset → shared counts → independent physics branches → join' : 'Teaching baseline: host work separates GPU submissions'}</span>
    </div>
    <div className={styles.diagramScroll} tabIndex="0" aria-label="Captured graph diagram; scroll horizontally on narrow screens">
      <svg viewBox={`0 0 790 ${height}`} className={styles.graph} role="img"
        aria-label={isGPUCount ? 'One graph containing shared reset and count nodes, then independent prototype physics branches, then a join.' : 'CPU-managed reset or counts feed the prototype physics branches.'}>
        <rect className={styles.graphBoundary} x={isGPUCount ? 2 : 304} y="2" width={isGPUCount ? 786 : 484} height={height - 4} rx="12" />
        <text x={isGPUCount ? 18 : 320} y="22" className={styles.graphCaption}>{isGPUCount ? 'CAPTURE ONCE · REPLAY' : 'GPU PHYSICS'}</text>
        <path className={styles.graphWire} d={`M124 ${middle}H159M269 ${middle}H324M730 51V${height - 33}`} />
        <rect className={styles.controlNode} data-gpu={isGPUReset} data-active={resetActive} x="14" y={middle - 22} width="110" height="44" rx="6" />
        <text x="69" y={middle - 3} textAnchor="middle" className={styles.nodeText}>Reset + place</text>
        <text x="69" y={middle + 13} textAnchor="middle" className={styles.nodeMeta}>{isGPUReset ? 'GPU' : 'CPU plans'}</text>
        <rect className={styles.controlNode} data-gpu={isGPUCount} data-active={countsActive} x="159" y={middle - 22} width="110" height="44" rx="6" />
        <text x="214" y={middle - 3} textAnchor="middle" className={styles.nodeText}>Work counts</text>
        <text x="214" y={middle + 13} textAnchor="middle" className={styles.nodeMeta}>{isGPUCount ? 'GPU' : 'CPU readback'}</text>
        <path className={styles.graphWire} d={`M324 51V${height - 33}`} />
        {scene.prototypes.map((p, k) => {
          const y = 30 + k * 48;
          const running = events.some(e => e.lane === k + 2 && active(e, time));
          const worlds = time >= milestones.replace ? p.after : p.before;
          return <g key={p.id}>
            <path className={styles.graphWire} d={`M324 ${y + 21}H347M711 ${y + 21}H730`} />
            <rect x="347" y={y} width="364" height="42" rx="6" className={styles.prototypeNode} data-active={running} />
            <foreignObject x="355" y={y - 2} width="68" height="46">
              <SceneDrawing prototype={p} moving={running} phase={time * 2 + k} />
            </foreignObject>
            <text x="430" y={y + 18} className={styles.nodeText}>{p.name}</text>
            <text x="430" y={y + 33} className={styles.nodeMeta}>physics branch {k + 1}</text>
            <text x="690" y={y + 25} textAnchor="end" className={styles.worldCount}>{worlds} {worlds === 1 ? 'world' : 'worlds'}</text>
          </g>;
        })}
        <g className={styles.worldBadge} style={{transform: `translate(575px, ${badgeY + 11}px)`}}
          data-animate={playing} data-episode={newEpisode ? 'new' : 'old'}>
          <rect width="43" height="22" rx="4" />
          <text x="21.5" y="15" textAnchor="middle">{newEpisode ? 'B · new' : 'B'}</text>
        </g>
        <path className={styles.graphWire} d={`M730 ${middle}H761`} />
        <circle cx="766" cy={middle} r="5" className={styles.joinNode} />
      </svg>
    </div>
    <p className={styles.graphNote}>Branches have no physics dependency on each other. CUDA decides whether they run at the same time.</p>
  </div>;
}

function Timeline({schedule, time, axisEnd, selected, onSelect, onSeek}) {
  const container = useRef(null), [width, setWidth] = useState(790);
  const id = useId().replace(/:/g, ''), {events, end, scene, stage, milestones} = schedule;
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(790, entry.contentRect.width)));
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  const left = 146, right = width - 20, top = 101, row = 51, height = top + (scene.prototypes.length + 2) * row + 25;
  const x = t => left + (right - left) * t / axisEnd, y = lane => top + lane * row;
  const lanes = ['CPU', 'Shared GPU work', ...scene.prototypes.map(p => p.name)];
  const focus = events.find(e => e.id === selected);
  const parents = focus ? (focus.waitFor || focus.deps).map(d => events.find(e => e.id === d)).filter(Boolean) : [];
  const dependencyTime = focus?.kind === 'wait' ? focus.end : focus?.start;
  const calloutNames = {allocate: 'Allocate', 'pool-take': 'Pool', map: 'Map + access', unmap: 'Unmap',
    'join-growth': 'CPU waits', 'join-headroom': 'CPU waits', 'join-shrink': 'CPU waits',
    'record-new-addresses': 'Re-record', 'read-placement': 'Read rows', 'reset-read-counts': 'Read counts'};
  const labelEnds = [-Infinity, -Infinity, -Infinity];
  const callouts = events.filter(e => calloutNames[e.id]).sort((a, b) => a.start - b.start).flatMap(e => {
    const label = calloutNames[e.id], labelWidth = label.length * 5.8, center = x((e.start + e.end) / 2);
    const lane = labelEnds.findIndex(end => end + 7 < center - labelWidth / 2);
    if (lane < 0) return [];
    labelEnds[lane] = center + labelWidth / 2;
    return [{event: e, label, center, labelY: 51 + lane * 14}];
  });
  const cpu = events.filter(e => e.lane === 0).sort((a, b) => a.start - b.start);
  const freeCPU = cpu.slice(1).flatMap((e, i) => e.start - cpu[i].end > axisEnd * 0.06 ? [(cpu[i].end + e.start) / 2] : []);
  const frames = stage >= 3 ? [
    {start: events.find(e => e.id === 'placement')?.start ?? milestones.replace, end: milestones.resetDone, label: 'Reset replay'},
    ...(milestones.nextStep !== milestones.resetStep ? [{start: events.find(e => e.id === 'prefix-commands' || e.id === 'next-commands').start,
      end: milestones.nextDone, label: milestones.nextStep < milestones.resetStep ? 'Prefix replay' : 'Next replay'}] : []),
  ] : [];
  return <div ref={container} className={styles.timelineScroll} tabIndex="0" aria-label="Execution timeline; scroll horizontally on narrow screens">
    <svg width={width} height={height} className={styles.timeline} role="group" aria-label="CPU work and captured GPU branches on one schematic time axis. Hatched bars are CPU waits; arrows are dependencies.">
      <defs>
        <pattern id={`${id}wait`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(40)">
          <rect width="6" height="6" className={styles.waitBase} /><line x1="0" x2="0" y1="0" y2="6" className={styles.waitStripe} strokeWidth="2" />
        </pattern>
        <marker id={`${id}arrow`} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto">
          <path d="M0 0L8 4L0 8" className={styles.arrowHead} />
        </marker>
      </defs>
      <text x={left} y="15" className={styles.axisLabel}>Earlier</text>
      <text x={right} y="15" textAnchor="end" className={styles.axisLabel}>Same schematic clock for all seven stages</text>
      {frames.filter(f => Number.isFinite(f.start) && f.end > f.start).map(f => <g key={f.label}>
        <rect x={x(f.start) - 3} y={y(1) - 21} width={Math.max(8, x(f.end) - x(f.start) + 6)} height={row * (lanes.length - 1) - 4}
          rx="6" className={styles.replayFrame} />
        <text x={x(f.start)} y={height - 2} className={styles.frameLabel}>{f.label}</text>
      </g>)}
      {lanes.map((label, lane) => <g key={label}>
        <line x1="0" y1={y(lane) + 31} x2={right} y2={y(lane) + 31} className={styles.rowRule} />
        <text x="5" y={y(lane) + 4} className={lane < 2 ? styles.laneHeading : styles.laneLabel}>{label}</text>
        {lane >= 2 && <text x="5" y={y(lane) + 20} className={styles.laneSubtitle}>GPU branch {lane - 1}</text>}
      </g>)}
      <line x1={x(milestones.request)} x2={x(milestones.request)} y1="24" y2={height - 24} className={styles.requestLine} />
      <text x={x(milestones.request) + 5} y="34" className={styles.resetLabel}>Reset requested</text>
      {callouts.map(({event, label, center, labelY}) => <g key={event.id} className={styles.callout} onClick={() => onSelect(event.id)}>
        <line x1={center} x2={center} y1={labelY + 3} y2={y(0) - 15} />
        <text x={center} y={labelY} textAnchor="middle">{label}</text>
      </g>)}
      {stage >= 3 && <text x={x((events.find(e => e.id === 'placement').start + milestones.resetStep) / 2)} y={y(1) - 21}
        textAnchor="middle" className={styles.controlLabel}>Reset + counts</text>}
      {freeCPU.map(t => <text key={t} x={x(t)} y={y(0) + 6} textAnchor="middle" className={styles.freeLabel}>CPU available</text>)}
      {events.filter(e => e.end > e.start).map(e => {
        const w = x(e.end) - x(e.start), fraction = clamp((time - e.start) / (e.end - e.start));
        const isSelected = e.id === selected, fill = e.kind === 'wait' ? `url(#${id}wait)` : undefined;
        const short = e.label.replace('CPU ', '').replace('GPU ', '');
        return <g key={e.id} className={styles.operation} data-kind={e.kind} data-selected={isSelected}
          onClick={() => onSelect(e.id)} role="button" tabIndex="0" aria-label={`${e.label}. ${e.detail}`}
          onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(e.id); } }}>
          <title>{e.label}: {e.detail}</title>
          <rect x={x(e.start)} y={y(e.lane) - 13} width={Math.max(3, w)} height="29" rx="4" className={styles.operationBase} style={{fill}} />
          {fraction > 0 && <rect x={x(e.start)} y={y(e.lane) - 13} width={Math.max(0, w * fraction)} height="29" rx="4" className={styles.operationProgress} style={{fill}} />}
          {w >= short.length * 6 + 10 && <text x={x(e.start) + w / 2} y={y(e.lane) + 6} textAnchor="middle" className={styles.operationLabel}>{short}</text>}
          {isSelected && <rect x={x(e.start) - 2} y={y(e.lane) - 15} width={w + 4} height="33" rx="5" className={styles.operationOutline} />}
        </g>;
      })}
      {parents.map(parent => <path key={parent.id} className={styles.dependency}
        d={`M${x(parent.end)} ${y(parent.lane) + 17}C${x(parent.end) + 8} ${y(focus.lane) + 25},${x(dependencyTime) - 8} ${y(parent.lane) + 25},${x(dependencyTime)} ${y(focus.lane) - 15}`}
        markerEnd={`url(#${id}arrow)`} />)}
      <g className={styles.playhead} aria-hidden="true">
        <line x1={x(time)} x2={x(time)} y1="39" y2={height - 25} />
        <circle cx={x(time)} cy="40" r="3" />
      </g>
      <rect x={left} y="17" width={right - left} height="23" fill="transparent" onClick={event => {
        const rect = event.currentTarget.ownerSVGElement.getBoundingClientRect();
        onSeek(Math.min(end, clamp((event.clientX - rect.left - left) / (right - left)) * axisEnd));
      }} className={styles.timeHit} />
    </svg>
  </div>;
}

function Backing({schedule, time, tight}) {
  const {milestones: m, stage, scene} = schedule;
  const donor = scene.prototypes.find(p => p.role === 'donor');
  const receiver = scene.prototypes.find(p => p.role === 'receiver');
  const unmapped = m.unmapped != null && time >= m.unmapped;
  const withdrawalStart = schedule.events.find(e => e.id === 'queue-shrink' || e.id === 'queue-headroom')?.start;
  const closing = withdrawalStart != null && time >= withdrawalStart && !unmapped;
  const mapped = time >= m.mapped;
  const pooled = stage >= 5;
  const taking = m.mapStart != null ? clamp((time - m.mapStart) / (m.mapped - m.mapStart)) : 0;
  const retiring = unmapped ? clamp((time - m.unmapped) / 0.7) : 0;
  const donorX = tight && unmapped && pooled ? 355 + (629 - 355) * taking : 107 + (355 - 107) * retiring;
  const donorReleased = m.released != null && time >= m.released;
  const blockExists = (!tight && pooled) || (m.allocated != null && time >= m.allocated);
  const movingX = 355 + (629 - 355) * taking;
  return <div className={styles.memorySection}>
    <div className={styles.sectionHeading}><strong>{stage ? 'Fixed addresses. Changing backing.' : 'New buffers. New addresses.'}</strong><span>{stage ? 'Virtual addresses stay fixed' : 'Baseline: growing buffers changes their addresses'}</span></div>
    <div className={styles.diagramScroll} tabIndex="0" aria-label="Physical backing diagram; scroll horizontally on narrow screens">
      <svg viewBox="0 0 790 144" className={styles.memoryDiagram} role="img" aria-label="Physical blocks move between donor, pool and receiver. A retiring block stays mapped until Unmap finishes.">
        <path d="M182 77H355H629" className={styles.memoryRoute} />
        <rect x="8" y="33" width="246" height="74" rx="8" className={styles.addressBox} />
        <rect x="528" y="33" width="254" height="74" rx="8" className={styles.addressBox} />
        <text x="20" y="23" className={styles.nodeText}>{donor.name}</text>
        <text x="540" y="23" className={styles.nodeText}>{receiver.name}</text>
        <text x="20" y="50" className={styles.addressText}>{stage ? '0x4000 · reserved address range' : '0x4000 · existing buffer'}</text>
        <text x="540" y="50" className={styles.addressText}>{stage ? '0x9000 · reserved address range' : mapped ? '0xC000 · replacement buffer' : '0x9000 · existing buffer'}</text>
        {[39, 107, 561, 629].map(x => <rect key={x} x={x} y="62" width="52" height="28" rx="5" className={styles.emptyBlock} />)}
        <rect x="39" y="62" width="52" height="28" rx="5" className={styles.backedBlock} /><text x="65" y="81" className={styles.blockText}>P0</text>
        <rect x="561" y="62" width="52" height="28" rx="5" className={styles.backedBlock} /><text x="587" y="81" className={styles.blockText}>P2</text>
        <text x="381" y="43" textAnchor="middle" className={styles.nodeText}>{pooled ? 'Shared pool' : 'Physical backing'}</text>
        <rect x="340" y="55" width="83" height="43" rx="7" className={styles.poolBox} />
        {!donorReleased && <g transform={`translate(${donorX},62)`} data-page="P1"
          data-owner={!unmapped ? 'donor' : tight && pooled && mapped ? 'receiver' : 'unmapped'}>
          <rect width="52" height="28" rx="5" className={closing ? styles.closingBlock : unmapped && (!tight || !mapped) ? styles.pooledBlock : styles.backedBlock} />
          <text x="26" y="19" className={styles.blockText}>P1</text>
        </g>}
        {blockExists && <g transform={`translate(${movingX},62)`} data-page="P3" data-owner={mapped ? 'receiver' : 'unmapped'}>
          <rect width="52" height="28" rx="5" className={mapped ? styles.backedBlock : styles.pooledBlock} />
          <text x="26" y="19" className={styles.blockText}>P3</text>
        </g>}
        <text x="20" y="126" className={styles.memoryLabel}>{donorReleased ? 'P1 released · no longer allocated' : closing ? 'Closing · still mapped' : unmapped ? (tight && mapped ? 'P1 now backs the receiver' : 'P1 unmapped; ready to reuse') : tight ? 'P1 is already-empty headroom' : time >= m.compact ? 'Reset left the tail empty' : 'P1 contains live world data'}</text>
        <text x="540" y="126" className={styles.memoryLabel}>{time >= m.ready ? 'Ready for new worlds' : mapped ? 'Mapped · GPU readiness not yet published' : 'New rows cannot be used yet'}</text>
        {!tight && !blockExists && <text x="381" y="117" textAnchor="middle" className={styles.memoryLabel}>Allocation still needed</text>}
      </svg>
    </div>
  </div>;
}

export default function WaitTimeline() {
  const [sceneId, setScene] = useState('robots'), [stage, setStage] = useState(6), [tight, setTight] = useState(false);
  const [time, setTime] = useState(0), [playing, setPlaying] = useState(false), [selected, setSelected] = useState(null);
  const [reduced, setReduced] = useState(false), playhead = useRef(0);
  const schedule = useMemo(() => makeSchedule(stage, sceneId, tight), [stage, sceneId, tight]);
  const axisEnd = useMemo(() => Math.max(...STAGES.map((_, i) => makeSchedule(i, sceneId, tight).end)), [sceneId, tight]);
  const {events, end, scene, milestones: m} = schedule;
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => { setReduced(query.matches); if (query.matches) setPlaying(false); };
    update(); query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  useEffect(() => { playhead.current = time; }, [time]);
  useEffect(() => {
    if (!playing) return undefined;
    let handle, previous;
    const frame = timestamp => {
      if (previous != null) playhead.current = Math.min(end, playhead.current + Math.min(80, timestamp - previous) * axisEnd / 24000);
      previous = timestamp;
      setTime(playhead.current);
      if (playhead.current >= end) setPlaying(false); else handle = requestAnimationFrame(frame);
    };
    handle = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(handle);
  }, [playing, end, axisEnd]);
  const restart = (animate = false) => { setTime(0); playhead.current = 0; setSelected(null); setPlaying(animate && !reduced); };
  const seek = value => { setPlaying(false); setTime(value); playhead.current = value; setSelected(null); };
  const inspect = id => { setSelected(id); setPlaying(false); };
  const now = events.filter(e => active(e, time));
  const current = events.find(e => e.id === selected) || now.find(e => e.lane === 0) || now.find(e => e.lane === 1) || now[0];
  const donor = scene.prototypes.find(p => p.role === 'donor'), receiver = scene.prototypes.find(p => p.role === 'receiver');
  const moments = [0, m.request, m.mapped, m.replace, m.withdraw, m.unmapped, end].filter(Number.isFinite).sort((a, b) => a - b);
  const nextMoment = () => seek(moments.find(t => t > time + 0.01) ?? end);
  return <figure className={styles.explainer} aria-label="How six mechanisms change a reset and memory maintenance">
    <div className={styles.settings}>
      <label>Scene <select aria-label="Scene" value={sceneId} onChange={e => { setScene(e.target.value); restart(); }}>
        {SCENES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
      </select></label>
      <label>Backing <select aria-label="Backing" value={tight ? 'full' : 'spare'} onChange={e => { setTight(e.target.value === 'full'); restart(); }}>
        <option value="spare">Spare budget</option><option value="full">Full budget · use donor headroom</option>
      </select></label>
    </div>
    <div className={styles.stages} role="group" aria-label="Add mechanisms cumulatively">
      {STAGES.map((s, index) => <button key={s.name} type="button" aria-pressed={stage === index} data-enabled={index <= stage}
        onClick={() => { setStage(index); restart(); }} title={s.name}>
        <span className={styles.stageNumber}>{index}</span><span>{s.short}</span>
      </button>)}
    </div>
    <div className={styles.stageStory} role="status">
      <div><span className={styles.eyebrow}>{stage === 0 ? 'Starting point' : `Add ${stage} of 6 · earlier additions remain on`}</span>
        <h2>{STAGES[stage].name}</h2></div>
      <p>{STAGES[stage].removed}<span className={styles.still}>{STAGES[stage].remaining}</span>
        {stage === 6 && <span className={styles.policyNote}>Supported by Newton. The keyboard task still selects blocking shrink.</span>}</p>
    </div>
    <CapturedGraph schedule={schedule} time={time} playing={playing} />
    <div className={styles.playback}>
      <button type="button" className={styles.playButton} onClick={() => {
        if (reduced) { nextMoment(); return; }
        if (time >= end) restart(true); else setPlaying(v => !v);
      }}>{reduced ? 'Next event' : playing ? 'Pause' : time >= end ? 'Replay reset' : 'Play reset'}</button>
      <button type="button" className={styles.quietButton} onClick={() => restart()}>Restart</button>
      {!reduced && <button type="button" className={styles.quietButton} onClick={nextMoment}>Next event</button>}
      <label className={styles.scrubber}><span className={styles.srOnly}>Animation position</span>
        <input aria-label="Animation position" aria-valuetext={time >= end ? 'Replay complete' : current?.label || 'Start'} type="range" min="0" max={end} step="0.05" value={time} onChange={e => seek(Number(e.target.value))} />
      </label>
    </div>
    <div className={styles.resetStory}>
      <span className={styles.resetBadge}>RESET</span>
      <span>World B: <strong>{donor.name}</strong><span className={styles.flowArrow}> → </span><strong>{receiver.name}</strong></span>
      <span className={styles.episodeState}>{time < m.request ? 'Request not sent' : time < m.replace ? 'Replacement pending' : 'New episode published'}</span>
    </div>
    <div className={styles.legend} aria-label="Timeline legend">
      <span><i data-kind="gpu" />GPU work</span><span><i data-kind="host" />CPU work</span>
      <span><i data-kind="wait" />CPU waits</span><span><i data-kind="driver" />Driver call</span>
      <span><b>↳</b>Dependency</span>
    </div>
    <Timeline schedule={schedule} time={time} axisEnd={axisEnd}
      selected={selected || (current?.kind === 'wait' || ['withdraw', 'unmap'].includes(current?.id) ? current.id : null)} onSelect={inspect} onSeek={seek} />
    <div className={styles.eventDetail} role="status" aria-live="polite" aria-atomic="true">
      <strong>{current?.label || 'Replay complete'}</strong>
      <span>{current?.detail || 'The replacement is live. Future work uses its new prototype; retained pages still count against the shared budget.'}</span>
      {selected && <button type="button" onClick={() => setSelected(null)} aria-label="Follow the playhead again">Follow playhead</button>}
    </div>
    <Backing schedule={schedule} time={time} tight={tight} />
    <figcaption className={styles.caption}>
      <strong>Illustrated dependencies, not a measured speedup.</strong> Bar lengths, page sizes and poses are schematic. Click an operation to inspect its prerequisites.
      {tight && <span>The donor page is empty before this reset. A live source world cannot be discarded to fund its replacement.</span>}
    </figcaption>
  </figure>;
}
