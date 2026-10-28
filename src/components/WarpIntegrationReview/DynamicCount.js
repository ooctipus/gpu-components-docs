import React, {useState} from 'react';
import CodeBlock from '@theme/CodeBlock';
import styles from './dynamicCount.module.css';

const source = 'https://github.com/dylanturpin/warp-octi/blob/ab467d988125a3545a8bfcae0152dd137e6f0b8e';
const fields = [
  {name: 'node_handle', kind: 'Recorded target', phase: 'Capture', value: 'update node U', why: 'Identifies the updater node so capture completion can attach the finished table to it.', minimum: 'The operation needs a target. This handle names the updater; target consumer handles live in the prepared table.'},
  {name: 'bindings', kind: 'Explicit input', phase: 'Capture → replay', value: '((n, live_count),)', why: 'Pairs each symbolic identity with its device source and retains both. The maximum stays on n.', minimum: 'Essential relationship. Separate counts and sources collections would duplicate this paired relationship.'},
  {name: 'errors', kind: 'Diagnostics', phase: 'Preparation → replay', value: 'one int32 per bound launch', why: 'Reports success, an invalid count, or a CUDA update error for each consumer. A later GPU kernel may inspect these words.', minimum: 'Extra relative to a bare CUDA update; required by PR1’s error-reporting contract. Supplying your own buffer is optional; reporting is not.'},
  {name: 'table', kind: 'Prepared device data', phase: 'Preparation → replay', value: 'offsets + launch records + scalar records', why: 'Lets the GPU updater find each target, source, bound and argument offset without consulting Python during replay.', minimum: 'Derived from recorded launches and bindings, then retained on the graph. This is an execution representation, not a second configuration owner.'},
  {name: 'bound_launches', kind: 'Inspection index', phase: 'Preparation → graph release', value: '(launch A, launch B, …)', why: 'Maps errors[i] to the corresponding canonical CapturedLaunch. These are references to existing records, not copies of their metadata.', minimum: 'Extra relative to CUDA execution. It supports inspection and stable diagnostic ordering; CUDA does not read this Python tuple.'},
];
const phases = [
  {title: '1 · Describe', host: 'Create n, allocate arrays and write kernels.', gpu: 'Store live_count and application data.', detail: 'CountParameter stores one maximum. It allocates no GPU memory and has no current value. The application owns readiness and storage.', nodes: ['n: maximum = 8', 'live_count: 3', 'q: 8 rows']},
  {title: '2 · Capture', host: 'Record the updater, then ordinary launches.', gpu: 'CUDA records nodes; captured kernels do not run yet.', detail: 'Warp preserves where n occurs before lowering it to its maximum. CUDA records real dependency edges. The updater initially has no populated binding table.', nodes: ['producer P', 'updater U', 'consumer A / B']},
  {title: '3 · Prepare', host: 'At capture_end: validate, build the table, bind nodes.', gpu: 'Receive the table and initialize error words.', detail: 'Warp verifies completion ordering, obtains device-updatable consumer handles and parameter offsets, uploads the table, and synchronizes. Failure invalidates the graph. No other capture may remain active on this device.', nodes: ['launch records + bindings', 'device table', 'prepared Graph']},
  {title: '4 · Replay', host: 'Call capture_launch(graph).', gpu: 'Read live counts → patch consumers → run work.', detail: 'The first launch lazily instantiates the CUDA executable. Later launches reuse it. The count update needs no host readback; callers must order source writes and keep sources stable while the updater reads them.', nodes: ['P writes 3', 'U patches A and B', 'A and B consume 3']},
];

export default function DynamicCount() {
  const [value, setValue] = useState(3);
  const [perspective, setPerspective] = useState('caller');
  const [phase, setPhase] = useState(1);
  const [fieldIndex, setFieldIndex] = useState(1);
  const invalid = value < 0 || value > 8;
  const active = invalid ? 0 : value;
  const field = fields[fieldIndex];
  const currentPhase = phases[phase];
  return <article className={styles.guide}>
    <header className={styles.intro}>
      <p className={styles.eyebrow}>A visual guide · Warp PR1</p>
      <h2>One graph. A different amount of work.</h2>
      <p>A GPU calculation produces a count. Warp connects that number to recorded launches. CUDA runs the same graph with updated work sizes and integer arguments.</p>
      <p className={styles.note}>Implemented in <a href="https://github.com/ooctipus/warp/pull/1">PR1</a> at <code>ab467d98</code>, on the custom <code>mem_fragmentation</code> foundation. This is not an API in Warp main. The controls below illustrate the contract; they do not execute CUDA.</p>
    </header>

    <section className={styles.section} aria-labelledby="dc-count-title">
      <div className={styles.sectionHeading}><span>01</span><div><h3 id="dc-count-title">Change the work, keep the storage</h3><p>Imagine eight allocated rows. Three are currently live.</p></div></div>
      <div className={styles.controls} role="group" aria-label="Simulated GPU count">
        <span><code>live_count[0]</code></span>
        {[-1, 0, 3, 8, 9].map(n => <button type="button" key={n} aria-pressed={value === n} onClick={() => setValue(n)}>{n}{n < 0 || n > 8 ? ' · invalid' : ''}</button>)}
      </div>
      <div className={styles.countLayout}>
        <div className={styles.identity}><span className={styles.eyebrow}>Python identity · unchanged</span><strong>n</strong><code>maximum = 8</code><span>Names the count; does not store {value}.</span></div>
        <div className={styles.storage}><div className={styles.rowLabel}><strong>q · fixed capacity</strong><span>8 rows × 80 columns</span></div>
          <div className={styles.rows} aria-label={`${active} of 8 rows processed; storage remains 8 rows`}>
            {Array.from({length: 8}, (_, i) => <div key={i} className={i < active ? styles.activeRow : styles.spareRow}><b>{i}</b><span>{i < active ? 'work' : 'spare'}</span></div>)}
          </div>
          <p className={styles.note}>“Spare” means untouched by the illustrated dimension-bound launch. This example uses fully backed arrays; a count does not map memory or certify initialization.</p>
        </div>
      </div>
      <div className={styles.results} aria-live="polite" aria-atomic="true">
        <div><span>Dimension consumer A</span><strong>{invalid ? 'Disabled' : value === 0 ? 'Disabled · zero work' : `${value} × 80 elements`}</strong><code>dim=(n, 80)</code></div>
        <div><span>Scalar-only consumer B</span><strong>{invalid ? 'Disabled' : `Runs · argument n = ${value}`}</strong><code>dim=80, inputs=[q, n, mean]</code></div>
        <div className={invalid ? styles.errorResult : ''}><span>Error word per consumer</span><strong>{invalid ? '−1 · out of range' : '0 · update succeeded'}</strong><span>{invalid ? 'Next valid replay can recover.' : 'Zero is valid, including for scalar arguments.'}</span></div>
      </div>
      <p className={styles.note}>Grid size is the number of CUDA thread blocks, not the logical array shape. Warp computes it from the logical work size and launch settings. A zero scalar alone does not disable a kernel.</p>
    </section>

    <section className={styles.section} aria-labelledby="dc-roles-title">
      <div className={styles.sectionHeading}><span>02</span><div><h3 id="dc-roles-title">Three perspectives on the same operation</h3><p>CUDA is the GPU programming platform. Its host APIs build graphs; its device APIs let GPU code update supported nodes.</p></div></div>
      <div className={styles.roles}>
        {[
          ['caller', 'Caller', 'Meaning and readiness', 'Choose the live work count, initialize state, and order writes before reads.'],
          ['warp', 'Warp', 'Meaning → executable details', 'Compile kernels, record count uses, prepare updates and retain resources.'],
          ['cuda', 'CUDA', 'Graph nodes and execution', 'Provide node handles, parameter updates, scheduling and completion edges.'],
        ].map(([id, title, subtitle, text], index) => <React.Fragment key={id}>
          {index > 0 && <span className={styles.arrow} aria-hidden="true">→</span>}
          <button type="button" className={styles.role} aria-pressed={perspective === id} onClick={() => setPerspective(id)}><span className={styles.eyebrow}>{title}</span><strong>{subtitle}</strong><span>{text}</span></button>
        </React.Fragment>)}
      </div>
      <div className={styles.perspective} aria-live="polite">
        {perspective === 'caller' && <><h4>The caller supplies intent</h4><p>Newton decides which worlds exist. Other applications might count contacts, particles, or queued jobs. They provide a source array and use the same <code>n</code> wherever the same count is needed.</p><div className={styles.chips}><code>maximum</code><code>GPU source</code><code>update point</code><code>ordinary wp.launch</code></div><p>The caller must establish valid storage, initialization and producer ordering. A valid count alone proves none of these.</p></>}
        {perspective === 'warp' && <><h4>Warp translates and owns the lifetime</h4><p>Warp knows that <code>n</code> in a launch dimension changes its hidden bounds, while <code>n</code> in an int32 argument changes a parameter. It uses the CUDA parameter layout and its own shared launch math to prepare a device table.</p><div className={styles.chips}><code>CountParameter</code><code>CapturedLaunch</code><code>Graph</code><code>native CUDA bridge</code><code>GPU updater kernel</code></div><p>Conditional and count helpers share one compiler/cache and one loaded helper module per CUDA context.</p></>}
        {perspective === 'cuda' && <><h4>CUDA sees executable machinery</h4><p>A kernel is a function executed by many GPU threads. A graph node is one recorded operation. A handle identifies a node; a dependency edge orders it. CUDA has no concept of a Newton world or a Python <code>CountParameter</code>.</p><div className={styles.chips}><code>kernel nodes</code><code>device-updatable handles</code><code>parameter byte offsets</code><code>grid dimensions</code><code>completion edges</code></div><p>Warp’s native bridge calls host CUDA APIs during preparation. Warp’s updater is GPU code that calls CUDA device APIs during replay.</p></>}
      </div>
      <figure className={styles.boundary}>
        <div className={styles.lane}><b>Host · CPU</b><span>Python caller</span><i aria-hidden="true">→</i><span>Warp Python + native runtime</span><i aria-hidden="true">→</i><span>CUDA graph API</span></div>
        <div className={styles.crossing}><span>prepare graph &amp; table ↓</span><span>submit executable ↓</span></div>
        <div className={styles.lane}><b>Device · GPU</b><span>Source-producing kernel</span><i aria-hidden="true">→</i><span>Warp updater + CUDA device API</span><i aria-hidden="true">→</i><span>Numerical kernels</span></div>
        <figcaption>Warp spans both sides. “Interfacing with CUDA” includes host calls and GPU code; it does not mean Python executes once for every GPU thread.</figcaption>
      </figure>
    </section>

    <section className={styles.section} aria-labelledby="dc-phases-title">
      <div className={styles.sectionHeading}><span>03</span><div><h3 id="dc-phases-title">What happens once, and what repeats?</h3><p>Capture describes work. Preparation connects it. Replay executes it.</p></div></div>
      <div className={styles.phaseButtons} role="group" aria-label="Graph lifecycle phase">
        {phases.map((p, i) => <button type="button" key={p.title} aria-pressed={phase === i} onClick={() => setPhase(i)}>{p.title}<small>{i === 3 ? 'every replay' : 'once per capture'}</small></button>)}
      </div>
      <div className={styles.phaseDetail} aria-live="polite">
        <div className={styles.phaseLanes}><div><b>Host</b><span>{currentPhase.host}</span></div><div><b>Device / CUDA</b><span>{currentPhase.gpu}</span></div></div>
        <div className={styles.flow}>{currentPhase.nodes.map((node, i) => <React.Fragment key={node}>{i > 0 && <span aria-hidden="true">→</span>}<code>{node}</code></React.Fragment>)}</div>
        <p>{currentPhase.detail}</p>
      </div>
      <div className={styles.codePair}><div><h4>The application declares the relationship</h4><CodeBlock language="python">{`n = wp.CountParameter(maximum=1024)

with wp.ScopedCapture(
    device=device, record_launches=True
) as capture:
    wp.capture_update_counts((n,), (live_count,))
    wp.launch(advance, dim=(n, 80), inputs=[q],
              device=device)
    wp.launch(column_mean, dim=80,
              inputs=[q, n, mean], device=device)

wp.capture_launch(capture.graph)`}</CodeBlock><p className={styles.note}>Excerpt: allocate arrays and define/load kernels first, on the selected device. Bindings are declared at the explicit update point.</p></div>
        <div><h4>The graph carries the relationship forward</h4><div className={styles.fanout}><div className={styles.node}><b>live_count</b><span>one int32 in GPU memory</span></div><span aria-hidden="true">↓ reads</span><div className={styles.node}><b>Update point U</b><span>one binding: n ↔ live_count</span></div><span aria-hidden="true">↓ patches both consumers</span><div className={styles.branch}><div className={styles.node}><b>A · advance</b><code>bounds + grid</code></div><div className={styles.node}><b>B · column_mean</b><code>int32 argument</code></div></div></div></div>
      </div>
    </section>

    <section className={styles.section} aria-labelledby="dc-patch-title">
      <div className={styles.sectionHeading}><span>04</span><div><h3 id="dc-patch-title">What actually changes inside a launch?</h3><p>CUDA receives numbers and addresses. Warp preserves the meaning needed to update the right bytes.</p></div></div>
      <figure className={styles.packetFigure}>
        <div className={styles.packetRow}><b>A · launch size</b><div className={styles.packet}><span className={styles.patch}><b>Hidden bounds</b><code>(n, 80) → (3, 80)</code></span><span><b>q descriptor</b><code>pointer · shape · strides</code></span></div><div className={styles.patch}><b>CUDA grid</b><span>recomputed by shared Warp launch math</span></div></div>
        <div className={styles.packetRow}><b>B · scalar argument</b><div className={styles.packet}><span><b>Hidden bounds</b><code>80 · fixed</code></span><span><b>q descriptor</b><code>unchanged</code></span><span className={styles.patch}><b>n argument</b><code>int32: 3</code></span><span><b>mean</b><code>unchanged</code></span></div></div>
        <figcaption>Highlighted regions are updated for an illustrative value of 3. Parameter offsets identify byte locations in a packed argument list; they are not application-chosen argument numbers. Widths are schematic.</figcaption>
      </figure>
      <div className={styles.apiList}><div><code>cudaGraphKernelNodeSetParam</code><span>Write bounds or scalar argument bytes.</span></div><div><code>cudaGraphKernelNodeSetGridDim</code><span>Change the grid of thread blocks.</span></div><div><code>cudaGraphKernelNodeSetEnabled</code><span>Disable zero-dimensional or invalid-count work; re-enable valid work.</span></div></div>
      <p>At minimum, this update needs a <strong>target node</strong>, a <strong>new value</strong>, the <strong>location and size of the change</strong>, and <strong>ordering before execution</strong>. Warp adds count bounds, occurrence tracking and resource lifetime so the operation is usable safely from Python.</p>
    </section>

    <section className={styles.section} aria-labelledby="dc-fields-title">
      <div className={styles.sectionHeading}><span>05</span><div><h3 id="dc-fields-title">Minimum information versus retained fields</h3><p>There is no single “five fields” answer for the entire feature. Each layer owns different facts.</p></div></div>
      <div className={styles.ownershipStack}>
        <div><b>CountParameter</b><code>maximum</code><span>One stored field. The object itself supplies identity; no source pointer or live value.</span></div>
        <div><b>Canonical launch record</b><code>kernel · operands · occurrences · node</code><span>Existing capture infrastructure owns which launch uses n and where.</span></div>
        <div><b>Graph’s _CountUpdate</b><code>five fields below</code><span>Owns the explicit bindings and prepared replay resources.</span></div>
        <div><b>Native device table</b><code>target · source · bound · byte offset · launch settings</code><span>Derived data the GPU can read; not Python objects or a second application configuration.</span></div>
      </div>
      <div className={styles.fieldExplorer}>
        <div className={styles.fieldButtons} role="group" aria-label="Count update fields">{fields.map((f, i) => <button type="button" key={f.name} aria-pressed={i === fieldIndex} onClick={() => setFieldIndex(i)}><code>{f.name}</code><small>{f.kind}</small></button>)}</div>
        <div className={styles.fieldDetail} aria-live="polite"><p className={styles.eyebrow}>{field.kind} · {field.phase}</p><h4><code>{field.name}</code></h4><code className={styles.fieldValue}>{field.value}</code><p>{field.why}</p><p><strong>Does it have to exist?</strong> {field.minimum}</p></div>
      </div>
      <details className={styles.details}><summary>See the actual five-field Python record</summary><CodeBlock language="python">{`@dataclasses.dataclass(eq=False)
class _CountUpdate:
    node_handle: int
    bindings: tuple[tuple[CountParameter, warp.array], ...]
    errors: warp.array | None = None
    table: warp.array | None = None
    bound_launches: tuple[CapturedLaunch, ...] = ()`}</CodeBlock><a href={`${source}/warp/_src/context.py#L6597`}>Pinned implementation</a></details>
      <details className={styles.details}><summary>What is inside the GPU table?</summary><div className={styles.tableLayout}><span>Launch offsets</span><span>Launch A header + scalar records</span><span>Launch B header + scalar records</span></div><p>Each header stores <code>node</code>, <code>axis_source</code>, <code>axis_maximum</code>, <code>rank</code>, <code>coord_mult</code>, <code>block_dim</code>, <code>max_blocks</code>, <code>grid_stride</code>, <code>bounds_offset</code> and <code>scalar_count</code>. These tell the updater which node to patch and how to preserve the launch’s layout and scheduling settings.</p><p>Every scalar occurrence adds <code>source</code>, <code>offset</code> and <code>maximum</code>. The number of scalar entries is variable; PR1 has no fixed four-scalar cap. The header’s four axis slots match Warp’s existing four-dimensional launch limit.</p><a href={`${source}/warp/native/warp.cu#L3974`}>Pinned native representation</a></details>
      <div className={styles.omitted}><strong>Fields we do not need to add</strong><p>A second graph handle on every update (the owning Graph already has it); a stored record index (returned from list position); separate counts/sources copies (already paired); another launch ledger (records are canonical); a separate user-errors field (the same errors field retains either buffer).</p></div>
    </section>

    <section className={styles.section} aria-labelledby="dc-contract-title">
      <div className={styles.sectionHeading}><span>06</span><div><h3 id="dc-contract-title">The interaction is an ordering contract</h3><p>A count can be numerically valid while the data it names is not ready.</p></div></div>
      <div className={styles.ordering}><div><b>Caller</b><strong>Initialize data<br />write count</strong></div><span aria-hidden="true">→</span><div><b>Warp updater</b><strong>Read count<br />patch launches</strong></div><span aria-hidden="true">→</span><div><b>Consumers</b><strong>Read initialized data<br />perform work</strong></div></div>
      <p>Arrows mean CUDA completion dependencies. Warp checks updater-to-consumer ordering, including supported conditional bodies. The caller establishes producer ordering. Python statement order across independent streams is insufficient.</p>
      <div className={styles.contracts}><div><h4>No automatic snapshot</h4><p>PR1 may read a source more than once while updating its occurrences. Keep the source stable until the updater completes. A separate retained snapshot is a possible extension, not part of this contract.</p></div><div><h4>No automatic error propagation</h4><p>An out-of-range count disables its bound launches and sets their errors to −1. Unrelated downstream work is not automatically canceled. The caller must gate publication or inspect the error buffer when needed.</p></div></div>
      <div className={styles.stageExample}><strong>Multiple stages are supported</strong><div className={styles.flow}><code>produce n</code><span>→</span><code>update n</code><span>→</span><code>use n / produce m</code><span>→</span><code>update m</code><span>→</span><code>use m</code></div><p className={styles.note}>Each identity has one root update point. One launch cannot mix identities owned by different update points. Reusing n across independent consumers is supported when they all depend on its update point.</p></div>
    </section>

    <section className={styles.section} aria-labelledby="dc-scope-title">
      <div className={styles.sectionHeading}><span>07</span><div><h3 id="dc-scope-title">What PR1 covers, and what remains</h3><p>A scoped CUDA feature with a useful long-term ownership boundary.</p></div></div>
      <div className={styles.scope}><div><h4>Implemented in this fork</h4><ul><li>Explicit bindings and ordinary forward launches.</li><li>Dimension and int32 scalar occurrences, including repeated uses.</li><li>Zero → positive recovery; per-launch error reporting.</li><li>Consumers in supported callback-based conditional bodies.</li><li>Prefix fills/copies through the base branch’s recorded memory-operation kernels.</li></ul></div><div><h4>Requires further work</h4><ul><li>Update points inside conditional or while bodies.</li><li>Embedding an already prepared count graph in another capture.</li><li>CPU/APIC, serialization and deferred capture integration.</li><li>Backward, deterministic and clustered recorded launches.</li><li>Upstream agreement on the API and its capture prerequisites.</li></ul></div></div>
      <p className={styles.note}>Requires CUDA Toolkit and driver 12.4+, int32 count sources on the capture device, and Warp-owned recorded capture. Sources and optional error buffers are allocated before capture. Error buffers must be disjoint from sources and each other.</p>
      <p>Warp’s <a href="https://github.com/NVIDIA/warp/issues/1659">deferred graph proposal</a> uses its APIC operation stream. Long term, count uses and update points should integrate with that representation, with CUDA handles created during native graph construction. That is an integration direction, not support already delivered by PR1.</p>
      <footer className={styles.references}><strong>Read the source</strong><a href={`${source}/warp/_src/types.py#L54`}>Count identity</a><a href={`${source}/warp/_src/context.py#L13980`}>Public binding API</a><a href={`${source}/warp/_src/context.py#L14216`}>Preparation</a><a href={`${source}/warp/native/launch.h`}>Shared launch math</a><a href="https://docs.nvidia.com/cuda/archive/12.9.0/cuda-runtime-api/group__CUDART__GRAPH.html">CUDA graph APIs</a></footer>
    </section>
  </article>;
}
