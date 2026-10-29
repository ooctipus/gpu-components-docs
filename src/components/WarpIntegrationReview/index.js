import React, {useEffect, useId, useRef, useState} from 'react';
import CodeBlock from '@theme/CodeBlock';
import {brief, examples, warpSource} from './content';
import DynamicCount from './DynamicCount';
import LandedInWarp from './LandedInWarp';
import styles from './styles.module.css';

function Tabs({label, items, selected, onSelect, children}) {
  const id = useId();
  const buttons = useRef([]);
  function navigate(event, index) {
    const next = {ArrowRight: (index + 1) % items.length, ArrowLeft: (index + items.length - 1) % items.length,
      Home: 0, End: items.length - 1}[event.key];
    if (next === undefined) return;
    event.preventDefault();
    onSelect(items[next].id);
    buttons.current[next]?.focus();
  }
  return <>
    <div className={styles.tabs} role="tablist" aria-label={label}>
      {items.map((item, index) => <button key={item.id} type="button" role="tab"
        id={`${id}-tab-${item.id}`} aria-controls={`${id}-panel-${item.id}`}
        aria-selected={selected === item.id} tabIndex={selected === item.id ? 0 : -1}
        ref={node => { buttons.current[index] = node; }}
        onKeyDown={event => navigate(event, index)} onClick={() => onSelect(item.id)}>{item.label}</button>)}
    </div>
    {items.map(item => <section key={item.id} role="tabpanel" id={`${id}-panel-${item.id}`}
      aria-labelledby={`${id}-tab-${item.id}`} hidden={selected !== item.id} tabIndex={0}
      className={styles.panel}>{selected === item.id ? children(item.id) : null}</section>)}
  </>;
}

function DataTable({headers, rows}) {
  return <div className={styles.table}><table>
    <thead><tr>{headers.map(header => <th key={header} scope="col">{header}</th>)}</tr></thead>
    <tbody>{rows.map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j}>{cell}</td>)}</tr>)}</tbody>
  </table></div>;
}

function CountExplanation({onCompare}) {
  const [value, setValue] = useState(100);
  return <>
    <h2>What is <code>wp.CountParameter</code>?</h2>
    <p>It names an integer whose value will come from the GPU when the graph runs. Python knows its maximum; the current value lives in a separate GPU array.</p>
    <p className={styles.status}>Implemented in our Warp fork. Proposed for Warp main.</p>
    <div className={styles.twoColumns}>
      <section className={styles.column}>
        <h3>The definition inside Warp</h3>
        <CodeBlock language="python">{`from dataclasses import dataclass

@dataclass(frozen=True, eq=False)
class CountParameter:
    maximum: int

    def __post_init__(self):
        if type(self.maximum) is not int or self.maximum < 0:
            raise ValueError("maximum must be a nonnegative int")`}</CodeBlock>
        <p>The data is just <code>maximum</code>. The Python object itself provides identity. Two objects with <code>maximum=1024</code> can represent two independent counts.</p>
        <p className={styles.note}>Simplified from the fork. The full class also rejects <code>int(n)</code>, <code>bool(n)</code>, arithmetic and comparisons so the placeholder cannot silently become a fixed number.</p>
        <a href={`${warpSource}/warp/_src/types.py#L54`}>Actual CountParameter definition in the merged fork</a>
      </section>
      <section className={styles.column}>
        <h3>How the application uses it</h3>
        <CodeBlock language="python">{`import warp as wp

wp.init()
device = "cuda:0"

# An ordinary GPU array containing today's value.
live_count = wp.array([100],
                      dtype=wp.int32, device=device)

# A Python placeholder. This allocates no GPU memory.
n = wp.CountParameter(maximum=1024)
capacity = wp.upper_bound(n)  # Python int: 1024

# A launch shape can refer to this placeholder.
launch_shape = (n, 80)

# Inside recorded capture, before its consumers:
with wp.ScopedCapture(
    device=device, record_launches=True
) as capture:
    wp.capture_update_counts((n,), (live_count,))
    # Launch kernels using n here.`}</CodeBlock>
        <p><code>n</code> does not contain 100 or point to <code>live_count</code>. The binding connects them. Reusing the same <code>n</code> tells Warp which operations must use the same count.</p>
        <p className={styles.note}>PR1 implements explicit <code>capture_update_counts(counts, sources)</code> bindings. There is no capture-level source declaration. This excerpt shows the binding location; the launch-size example includes a consumer.</p>
      </section>
    </div>
    <div className={styles.countDemo}>
      <h3>Change the GPU value. Keep n and q unchanged.</h3>
      <div className={styles.controls} role="group" aria-label="Illustrated live count">
        <span><code>live_count[0]</code>:</span>
        {[0, 100, 240, 1024].map(count => <button key={count} type="button" aria-pressed={value === count}
          onClick={() => setValue(count)}>{count}</button>)}
      </div>
      <div className={styles.countStates} aria-live="polite" aria-atomic="true">
        <div><h4>Python · n</h4><CodeBlock language="python">maximum = 1024</CodeBlock><p>Same object, same maximum.</p></div>
        <div><h4>GPU · source value</h4><CodeBlock language="python">{`live_count[0] = ${value}`}</CodeBlock><p>This changes between replays.</p></div>
        <div><h4>Graph · resolved launch</h4><CodeBlock language="python">{`dim = (${value}, 80)`}</CodeBlock><p>{value === 0 ? 'No advance work this replay.' : `${value.toLocaleString()} rows of q are processed.`}</p></div>
      </div>
      <p className={styles.note}><code>q.shape</code> stays <code>(1024, 80)</code>. Changing the count neither allocates nor maps memory. This illustration does not run CUDA.</p>
    </div>
    <h3>What Warp must do with this object</h3>
    <p>Warp also needs to recognize the placeholder wherever it is used and connect those uses to the executable.</p>
    <DataTable headers={['Part of Warp', 'What it does', 'Status']} rows={[
      ['Python type', 'Stores maximum and preserves the parameter’s identity.', 'In our fork'],
      ['Launch recording', 'For dim=(n, 80), remembers that axis 0 uses this n. A scalar kernel argument can use the same n. Captures integer maxima initially.', 'In our fork'],
      ['Binding and replay', 'Binds n to live_count. At the update point, reads its value and updates every recorded use before the dependent kernels run.', 'Implemented inside Warp in PR1'],
      ['Preparation check', 'Refuses to replay a graph whose count bindings are incomplete.', 'In our fork'],
    ]} />
    <p>A numerical kernel still receives ordinary integers and arrays. It does not receive a <code>CountParameter</code> object.</p>
    <button className={styles.button} type="button" onClick={onCompare}>Compare the implementations →</button>
  </>;
}

function CodeExamples() {
  const [selected, setSelected] = useState('count');
  return <Tabs label="Warp integration examples" selected={selected} onSelect={setSelected}
    items={[{id: 'count', label: 'Dynamic count: Definition'}, ...examples]}>
    {id => {
      if (id === 'count') return <CountExplanation onCompare={() => setSelected('launch')} />;
      const example = examples.find(item => item.id === id);
      return <>
        <h2>{example.title}</h2>
        <p>{example.intro}</p>
        <div className={styles.comparison}>
          {['fixed', 'before', 'after'].map(key => <section key={key} className={styles.codeColumn}>
            <p className={styles.status}>{example[`${key}Status`]}</p>
            <h3>{example[`${key}Title`]}</h3>
            <CodeBlock language="python">{example[key]}</CodeBlock>
            <p>{example[`${key}Note`]}</p>
          </section>)}
        </div>
        <div className={styles.callout}><strong>What changes</strong><p>{example.result}</p></div>
        <details className={styles.details}>
          <summary>Setup assumptions and implementation limits</summary>
          <p>{example.assumption}</p><p>{example.caution}</p>
          <p className={styles.note}>Source-checked excerpts, not complete applications. The middle column preserves the historical GPU Components implementation; the merged fork uses Warp’s own binder.</p>
        </details>
        {id === 'launch' && <details className={styles.details}><summary>PR1 count semantics</summary>
          <ol>{brief.countRules.map(rule => <li key={rule}>{rule}</li>)}</ol>
        </details>}
      </>;
    }}
  </Tabs>;
}

function MemoryDemo() {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const last = brief.steps.length - 1;
  useEffect(() => {
    if (!playing) return undefined;
    if (index === last) { setPlaying(false); return undefined; }
    const timer = setTimeout(() => setIndex(index + 1), 3200);
    return () => clearTimeout(timer);
  }, [playing, index, last]);
  const s = brief.steps[index];
  const b1 = s.page === 'small' || s.page === 'closing' ? 'Small slots 2–3' : s.page === 'pool' ? 'Pool' : 'Large slot 2';
  return <>
    <h2>One world resets from 6 to 108 keys</h2>
    <p>Exactly one world resets. Toy packing: one block fits two small worlds or one large world; this is not the keyboard’s measured byte ratio.</p>
    <div className={styles.controls}>
      <button type="button" onClick={() => { if (index === last) setIndex(0); setPlaying(!playing); }}>{playing ? 'Pause' : 'Play'}</button>
      <button type="button" disabled={index === 0} onClick={() => { setPlaying(false); setIndex(index - 1); }}>Previous</button>
      <button type="button" disabled={index === last} onClick={() => { setPlaying(false); setIndex(index + 1); }}>Next</button>
      <span role="status">{index + 1} / {brief.steps.length} · {s.title}</span>
    </div>
    <div className={styles.twoColumns}>
      {[['6-key prototype', s.smallLive, s.smallReady], ['108-key prototype', s.largeLive, s.largeReady]].map(([name, live, ready]) => <section key={name} className={styles.prototype}>
        <h3>{name}</h3><p>{live} live · {ready} ready · 8 reserved</p>
        <div className={styles.slots}>
          {Array.from({length: 8}, (_, i) => <div key={i} className={i < live ? styles.liveSlot : i < ready ? styles.readySlot : styles.reservedSlot}
            title={`Slot ${i}: ${i < live ? 'live' : i < ready ? 'ready spare' : 'not ready'}`}
            aria-label={`Slot ${i}: ${i < live ? 'live' : i < ready ? 'ready spare' : 'not ready'}`}>{i}</div>)}
        </div>
        <p className={styles.note}>Array base and descriptor stay fixed.</p>
      </section>)}
    </div>
    <DataTable headers={['Physical block', 'Maps to', 'State']} rows={[
      ['B0', 'Small slots 0–1', 'Mapped'],
      ['B1', b1, s.page === 'closing' ? 'Withdrawn; old readers may still use it' : s.page === 'pool' ? 'Unmapped' : s.page === 'large-unready' ? 'Mapped; initialization pending' : 'Mapped'],
      ['B2 / B3', 'Large slots 0 / 1', 'Mapped'], ['B4', 'Pool', 'Unmapped reserve'],
    ]} />
    <div className={styles.callout} aria-live="polite"><p>{s.text}</p></div>
    <h3>One prepared graph</h3>
    <div className={styles.graph}>
      <div>Admission → count update</div>
      <div className={styles.branches}><div>Small branch · {s.smallLive} worlds</div><div>Large branch · {s.largeLive} worlds</div></div>
      <div>→ join → consumers</div>
    </div>
    <p className={styles.note}>The branches can overlap when dependencies and hardware permit. Their independence does not guarantee simultaneous execution. Memory service is host work outside capture.</p>
  </>;
}

function Recommendation() {
  return <>
    <h2>What to propose upstream</h2>
    <p>GPU counts have landed in the fork. General virtual-array backing is still a proposal; allocation discovery only reserves temporary addresses for a nonreplayable preparation pass.</p>
    <DataTable headers={['Capability', 'Why we need it', 'Recommendation']} rows={[
      ['Virtual array allocation', 'Reserve stable addresses and manage physical backing separately.', 'Adopt virtual=True as the simple entry point; define backing and shared-budget operations alongside it.'],
      ['GPU-count-driven graphs', 'A pointer staying fixed does not update launch bounds, scalar arguments or memory-operation lengths.', 'Warp owns binding, lowering, preparation and executable lifetime.'],
    ]} />
    <h2>Proposed ownership</h2><DataTable headers={['Owner', 'Owns', 'Boundary']} rows={brief.ownership} />
    <h2>Where <code>virtual=True</code> fits</h2>
    <p>In the proposal, <code>virtual=True</code> would make Warp own an array’s reservation; mapping, shared budgets and retirement would have explicit operations. This syntax is not implemented. <code>CountParameter</code> already independently controls how much work runs.</p>
    <DataTable headers={['Different quantities', 'Illustrative value', 'Meaning']} rows={brief.concepts} />
    <p className={styles.note}>These prefix values illustrate one moment, not a universal equality. Readiness may shrink while extra pages remain mapped. Indirect accesses need separate bounds guarantees.</p>
  </>;
}

function ReviewEvidence() {
  return <>
    <h2>Review evidence</h2>
    <p>The findings and pins below preserve the October 7, 2026 review as historical evidence, followed by PR1’s October 28 validation. For current status and PR4’s results, see <a href="#landed-in-warp">Landed in Warp</a>. The Dynamic count guide follows merged commit <code>e1089a34</code>; virtual-array syntax remains a proposal.</p>
    <div className={styles.callout}><strong>What changed after that review</strong><p>PR1 moves count binding and replay updates into Warp, shares launch math and helper-module ownership, rejects failed preparation and source/error overlap, and removes the fixed scalar-occurrence cap. The companion GPU Components and Newton changes remove the downstream binder and manual adoption.</p><p>Recorded validation at that commit: 472 Warp tests, 66 Newton tests, and 3,458 successful SO101 episodes out of 3,715 (93.08%) across 76 heterogeneous worlds. Dynamic resets retained one prepared graph. This is one qualified RTX 5090 / CUDA 12.9 setup, not an upstream platform matrix.</p><a href="https://github.com/ooctipus/warp/pull/1">PR1 implementation and validation</a></div>
    {brief.findings.map(finding => <section key={finding.title} className={styles.finding}>
      <p className={styles.status}>{finding.priority}</p><h3>{finding.title}</h3><p>{finding.text}</p>
      <a href={finding.file}>Inspect the reviewed implementation</a>
    </section>)}
    <h3>Historical source snapshot · October 7</h3>
    <DataTable headers={['Repository', 'Reviewed commit']} rows={brief.pins.map(([name, sha, repo]) =>
      [name, <a key={sha} href={`https://github.com/${repo}/commit/${sha}`}>{sha.slice(0, 12)}</a>])} />
    <p className={styles.note}>Warp’s custom delta was checked against upstream <code>500272ef1c27</code>. The fork includes independent bug fixes; it should not be proposed as one indivisible VMM patch. Some repository links require access.</p>
    <h3>Primary references</h3>
    {brief.sources.map(([name, url, why]) => <p key={url}><a href={url}>{name}</a><br /><span className={styles.note}>{why}</span></p>)}
  </>;
}

function ApiDecisions() {
  return <>
    <h2>What Warp needs to provide</h2>
    <p>VMM itself works with externally owned pointer-backed arrays. PR1 now keeps count identities, capture records, binding and executable updates inside Warp. The separate <code>virtual=True</code> proposal concerns array reservation and explicit backing operations; it is not required to use dynamic counts with ordinary arrays.</p>
    <DataTable headers={['Order', 'Deliverable', 'Acceptance']} rows={brief.plan} />
    <h3>Remaining API decisions</h3>
    <ol>
      <li>For <code>virtual=True</code>, which operations map backing, share a physical-memory budget and retire pages safely while keeping array addresses stable?</li>
      <li>For upstream count support, agree on PR1’s explicit read points and restrictions, its minimal capture prerequisites, and how count operations will integrate with APIC and deferred graph construction. Snapshot semantics are not implemented.</li>
    </ol>
    <h3>What not to promise</h3>
    <p>Unlimited address growth; arbitrary new topology without preparation; allocation-free or stall-free mapping; transparent support for every Newton solver; concurrent replay of shared mutable graph state.</p>
    <h3>Validation beyond the current integration</h3>
    <p>Count tests cover zero→positive counts, independent equal-bound identities, conditional and parallel consumers, retained sources, invalid counts and failed preparation. Backing readiness and reused memory require separate storage tests. Broader GPU/driver coverage and additional Newton solver qualification remain separate from PR1’s demonstrated path.</p>
  </>;
}

const sections = [
  {id: 'landed-in-warp', label: 'Landed in Warp'},
  {id: 'recommendation', label: 'Recommendation'}, {id: 'dynamic-count', label: 'Dynamic count'}, {id: 'one-reset', label: 'One reset'},
  {id: 'examples', label: 'Before / after'}, {id: 'review-evidence', label: 'Review evidence'},
  {id: 'api-decisions', label: 'API decisions'},
];

export default function WarpIntegrationReview() {
  const [selected, setSelected] = useState('landed-in-warp');
  useEffect(() => {
    const readHash = () => {
      const hash = window.location.hash.slice(1);
      if (sections.some(section => section.id === hash)) setSelected(hash);
    };
    readHash();
    window.addEventListener('hashchange', readHash);
    return () => window.removeEventListener('hashchange', readHash);
  }, []);
  function select(id) {
    setSelected(id);
    window.history.replaceState(null, '', `#${id}`);
  }
  return <div className={styles.review}>
    {!['dynamic-count', 'landed-in-warp'].includes(selected) && <><p className={styles.lead}>{brief.conclusion}</p><p>{brief.summary}</p></>}
    <Tabs label="Warp integration review" items={sections} selected={selected} onSelect={select}>
      {id => ({'landed-in-warp': <LandedInWarp />, recommendation: <Recommendation />, 'dynamic-count': <DynamicCount />, 'one-reset': <MemoryDemo />, examples: <CodeExamples />,
        'review-evidence': <ReviewEvidence />, 'api-decisions': <ApiDecisions />})[id]}
    </Tabs>
    <p className={styles.footer}>Fork behavior is pinned to a source revision; proposals and historical evidence are labeled separately. Illustrations do not execute CUDA or establish performance.</p>
  </div>;
}
