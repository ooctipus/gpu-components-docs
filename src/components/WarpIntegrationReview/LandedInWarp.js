import React from 'react';
import CodeBlock from '@theme/CodeBlock';
import {warpSource} from './content';
import styles from './styles.module.css';

export default function LandedInWarp() {
  return <article>
    <h2>What our Warp fork adds to main</h2>
    <p><strong>Warp can record the facts needed to prepare a graph, let GPU counts change its work, and discover temporary storage before choosing its backing.</strong> Numerical code still uses ordinary Warp arrays and launches. Newton owns worlds and resets; GPU Components owns storage policy.</p>
    <p className={styles.note}>As of October 29, 2026: landed in <a href="https://github.com/ooctipus/warp/commit/e1089a344bc245d9ea22da687a402224b72b20b9">mem_fragmentation · e1089a34</a>, including PRs <a href="https://github.com/ooctipus/warp/pull/1">#1</a> and <a href="https://github.com/ooctipus/warp/pull/4">#4</a>. “Landed” means our fork, not NVIDIA Warp main. <a href="https://github.com/ooctipus/warp/compare/0c1ed78f7b4ee397534e5bd1cea632af618d900f...e1089a344bc245d9ea22da687a402224b72b20b9">Full fork delta</a>: 51 files from the common ancestor <code>0c1ed78f</code>. Upstream main was checked at <a href="https://github.com/NVIDIA/warp/commit/104afd1f4b1f81ff87a8ee6be56c46807d8e3451">104afd1f</a>; its seven newer commits are not incorporated in this fork snapshot.</p>

    <div className={styles.twoColumns}>
      <section className={styles.prototype}>
        <h3>Execution: how much work runs?</h3>
        <p>GPU count → Warp updater → CUDA kernel nodes</p>
        <p>Change launch bounds and integer arguments on replay. Array addresses, shapes and graph topology stay fixed.</p>
      </section>
      <section className={styles.prototype}>
        <h3>Storage: where do temporaries live?</h3>
        <p>Discover requests → caller chooses arrays → capture again</p>
        <p>Substitute final arrays before recording their pointers and strides. Reuse needs a proven completion order.</p>
      </section>
    </div>

    <h3>1. Exact capture records</h3>
    <p><code>record_launches=True</code> retains the emitted kernel node, launch settings, frozen argument bytes and resource owners on the existing <code>Graph</code>. Conditional records identify the actual containing if/while body. These facts let preparation reason about what CUDA will execute without reconstructing it from mutable Python objects. Invalid or incomplete recording blocks replay. <a href={`${warpSource}/warp/_src/context.py#L6517`}>Implementation</a>.</p>
    <details className={styles.details}><summary>Recording and inspection API</summary>
      <ul>
        <li><code>CapturedLaunch</code>, <code>capture_get_launches</code>: immutable launch facts; <code>capture_launch_count</code>: the current number, including during capture.</li>
        <li><code>CapturedConditionalBody</code>, <code>capture_get_conditional_bodies</code>: parent graph, conditional node and body graph identities.</li>
        <li><code>capture_invalidate</code>: permanently reject an unsafe graph. These getters expose facts; they do not prepare storage or counts.</li>
      </ul>
    </details>

    <h3>2. GPU counts control captured work</h3>
    <p><code>CountParameter(maximum)</code> names a bounded integer; <code>upper_bound(n)</code> returns its static maximum. <code>capture_update_counts</code> binds it to a one-element GPU int32 array at an explicit point in the graph. Warp prepares the targets at capture completion; a GPU updater changes launch dimensions and int32 scalar arguments on each replay. Repeated scalar uses have no fixed four-entry cap.</p>
    <CodeBlock language="python">{`# n, live_count, q and the kernel are prepared before capture.
with wp.ScopedCapture(device="cuda:0", record_launches=True) as capture:
    wp.capture_update_counts((n,), (live_count,))
    wp.launch(advance, dim=(n, 80), inputs=[q], device="cuda:0")
wp.capture_launch(capture.graph)`}</CodeBlock>
    <p>A zero dimension skips that launch; a scalar zero still reaches its kernel. An invalid value disables its bound launches and reports an error. <code>capture_get_count_update_errors</code> and <code>capture_get_count_bound_launches</code> pair error words with targets. The caller orders producers before the updater, keeps sources stable during its reads, and handles errors before publishing results. This does not establish memory readiness. <a href="#dynamic-count">Visual explanation and full restrictions</a>; <a href={`${warpSource}/warp/_src/context.py#L13969`}>binding contract</a>.</p>

    <h3>3. Explicit extents for fills and copies</h3>
    <p>With <code>record_memory_operations=True</code> and launch recording, <code>q.zero_(extent=(n, 80))</code>, <code>q.fill_(value, extent=(n, 80))</code> and <code>wp.copy(dst, src, extent=(n, 80))</code> touch the declared prefix. An int32 fill value can also be a count. Omitting the extent still means the full array. Two generic kernels preserve typed value bytes, including NaN representations and signed zero, without a fixed 128-byte element cap.</p>
    <p><code>CapturedFill</code>, <code>CapturedCopy</code> and <code>capture_get_memory_operations</code> preserve original operands and extents. Supported arrays have contiguous inner dimensions and nonoverlapping positive row strides; partial-offset copies, overlapping copy payloads, indexed arrays and autodiff arrays are rejected. <a href={`${warpSource}/warp/_src/capture_memory.py`}>Memory lowering</a>.</p>

    <h3>4. Typed allocation discovery and substitution · experimental</h3>
    <p><code>record_allocations=True</code> observes each ordinary <code>wp.empty</code> request with its shape, type, stride requirement and conditional location. CUDA discovery reserves virtual addresses without materializing the arrays’ payload; the discovery graph cannot run. The caller supplies one final array per occurrence through <code>allocation_bindings</code> and captures again. Each allocation returns its supplied array before any view or launch descriptor is formed.</p>
    <p><code>CapturedAllocation</code> and <code>capture_get_allocations</code> expose the requests. <code>capture_discovery_memory</code> separates requested bytes, rounded address reservations and materialized typed payload; it is not a total GPU-memory meter. Only a leading symbolic dimension with fixed inner dimensions is supported. Symbolic <code>zeros</code> also requires memory recording; <code>empty_like</code>, symbolic <code>full</code> and direct allocating <code>array(shape=...)</code> are rejected in this experiment. CPU discovery uses real storage. <a href={`${warpSource}/warp/_src/capture_allocation.py`}>Implementation and restrictions</a>.</p>

    <h3>5. Temporary lifetime proofs · experimental</h3>
    <p><code>capture_transient(callback, assume_nonescaping=True)</code> declares that temporaries stay inside a callback and reads are initialized on every activation. <code>CapturedTransientRegion</code> and <code>capture_get_transient_regions</code> retain its allocation and native-node facts. <code>capture_allocation_order(graph, pairs)</code> proves whether all uses of one allocation finish before all uses of another. It adds no dependency and chooses no packing policy.</p>
    <p>Finer reuse within a region additionally needs <code>assume_no_indirect_access=True</code> and complete recorded-operand coverage. Unknown native work, incomparable branches and unsupported aliases refuse the proof; mutually exclusive branches do not automatically share memory. Discovery and final graphs are revalidated before overlapping bindings are admitted. These explicit caller promises are not automatic escape analysis. <a href={`${warpSource}/warp/_src/capture_allocation.py#L329`}>Ordering proof</a>.</p>

    <h3>6. Shared mechanisms inside Warp</h3>
    <ul>
      <li><strong>One owner:</strong> <code>Graph</code> retains canonical records, frozen descriptors, compiled executable revisions, sources and prepared tables. No separate preparation registry or downstream count binder.</li>
      <li><strong>One layout path:</strong> ordinary launches, the GPU updater and APIC share bounds layout through <code>launch.h</code>; ordinary launches and the updater share grid calculation. APIC and recording share struct-field traversal; ordinary and discovery arrays share capacity/stride calculations.</li>
      <li><strong>One CUDA boundary:</strong> graph queries use Warp’s native driver loader. Conditional and count helpers share compilation/cache ownership. Count binding and allocation reuse share conditional ancestry and full-completion dependency checks; early programmatic edges are insufficient.</li>
      <li><strong>Exact suspension:</strong> <code>capture_pause(preserve_frontier=True)</code> retains the current dependency frontier and edge metadata in native capture state. Resuming discovery does not accidentally join independent siblings. Default pause/resume behavior is unchanged.</li>
    </ul>
    <p><a href={`${warpSource}/warp/native/launch.h`}>Launch definitions</a> · <a href={`${warpSource}/warp/_src/codegen.py#L985`}>struct traversal</a> · <a href={`${warpSource}/warp/_src/context.py#L14724`}>pause contract</a>. PR4 removed <code>capture_require_preparation</code>, <code>capture_complete_preparation</code>, <code>capture_region_precedes</code> and <code>capture_allocation_bytes</code>; use the count binder, allocation-order query and allocation/discovery facts above.</p>

    <h3>7. Independent fixes and overhead reductions</h3>
    <ul>
      <li><strong>Tile solvers:</strong> pass actual leading dimensions—the distance between rows or columns—to cuSolverDx for padded/strided Cholesky and triangular solves. New owning results, including diagonal-add outputs, use dense storage instead of inheriting a borrowed view’s strides. <a href={`${warpSource}/warp/_src/builtins.py#L19232`}>Source</a>.</li>
      <li><strong>Nested indexing:</strong> evaluate each index as a value before later expressions can mutate its source; chained array/struct accesses keep their intended target. <a href={`${warpSource}/warp/_src/codegen.py#L4914`}>Source</a>.</li>
      <li><strong>Stream aliases:</strong> retain native registration, capture bookkeeping and cached resources until the last Warp wrapper releases the CUDA stream. Dropping a borrowed wrapper cannot invalidate a surviving owner. <a href={`${warpSource}/changelog/+cuda-stream-alias-lifetime.fixed.md`}>Change</a>.</li>
      <li><strong>Resource release:</strong> remove ownership cycles so recorded resources and discovery reservations can be released when their final owners disappear, without waiting for cyclic garbage collection. <a href={`${warpSource}/changelog/+capture-resource-release.fixed.md`}>Change</a>.</li>
      <li><strong>Host packing:</strong> reduce repeated array-view descriptor work and pack kernel argument addresses directly into the pointer array. Validation and allocation ownership remain intact; no general throughput claim follows. <a href={`${warpSource}/changelog/+array-view-packing.changed.md`}>Views</a> · <a href={`${warpSource}/changelog/+cuda-argument-packing.changed.md`}>arguments</a>.</li>
    </ul>

    <details className={styles.details}><summary>Where the implementation lives</summary>
      <ul>
        <li><code>context.py</code>: Python capture lifecycle, Graph ownership, records and preparation; <code>types.py</code>: count identity, array layouts and validation.</li>
        <li><code>capture_memory.py</code>: fill/copy lowering; <code>capture_allocation.py</code>: discovery, substitution and lifetime admission.</li>
        <li><code>warp.h</code>: the exported C interface; Python calls it through ctypes into <code>warp.so</code>/<code>warp.dll</code>. <code>warp.cu</code>: CUDA host operations and embedded GPU helper code. <code>warp.cpp</code>: shared/CPU runtime and non-CUDA stubs.</li>
        <li><code>launch.h</code>: shared launch layout/math. <code>apic.cpp</code>/<code>apic.cu</code>: existing API Capture replay and serialization; they reuse the layout, but dynamic-count replay is not implemented there.</li>
        <li><code>codegen.py</code>: shared struct traversal and index evaluation; <code>builtins.py</code>, <code>build.py</code> and <code>mathdx.cpp</code>: solver layout and compilation.</li>
        <li>Tests, architecture gates, API exports/stubs, reference entries, runtime guidance and changelogs accompany these changes. They are supporting coverage, not extra runtime subsystems.</li>
      </ul>
    </details>

    <div className={styles.callout}>
      <strong>What remains outside this fork’s contract</strong>
      <p>No general <code>virtual=True</code> array/backing API, automatic memory-budget management, readiness inference, reset policy or arbitrary pointer-escape analysis. Count recording requires supported forward CUDA launches and Toolkit/driver 12.4+; CPU/APIC, serialization, backward, deterministic/clustered launches and prebuilt graph insertion are outside that path. Update points must be at the root, and one launch cannot combine counts from different update points. Shared mutable count state is not a concurrent-replay guarantee.</p>
    </div>
    <p className={styles.note}>Evidence for this exact merged source tree: 675 Warp tests run (5 skipped), GPU Components 217 tests plus 315 subtests, Newton 66, MJWarp 8. SO101: 3,561/3,795 successful episodes (93.83%), 76 heterogeneous worlds, 1,000 steps with dynamic resets on one prepared graph. Qualified on RTX 5090 / CUDA Toolkit 13.1; this does not establish upstream release readiness. <a href="https://github.com/ooctipus/warp/pull/4">Validation details</a>.</p>
    <p className={styles.note}>Downstream source callers already work with this cleanup. Distribution is separate: the private SO101 package still bundles Warp <code>3806983b</code> and needs a rebuilt wheel plus updated manifest/lockfile to receive PR4. The checkpoint does not change.</p>
  </article>;
}
