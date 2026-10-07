export const brief = {
  conclusion: "Keep addresses stable. Make work counts explicit. Let Warp own how its graphs execute.",
  summary: "Two Warp features would simplify this integration: virtual arrays with explicit backing operations, and GPU counts that control captured work. Newton still decides which worlds exist and when their state is ready.",
  pins: [
    ["Warp", "52da84604e541b77cc0433b86385de5edb620abc", "ooctipus/warp"],
    ["GPU Components", "6cc307cd5066dbd434dc6e7fc1b21b6327e2100f", "ooctipus/gpu-components"],
    ["Newton", "44714f493e4f703b207b1bf77b7277a83d042e54", "ooctipus/newton"],
    ["MJWarp", "34e044b58f1292121e0a906a5e76d96993097341", "ooctipus/mujoco_warp"]
  ],
  ownership: [
    ["MJWarp / numerical solver", "Equations, state layout and reset defaults", "Does not choose a memory budget or manage world identities."],
    ["Newton", "Prototype selection, world identities, admission, reset and stream ordering", "Supplies valid counts and orders initialization before use."],
    ["GPU Components / storage owner", "Numeric layout, shared backing budget, placement and retirement mechanisms", "Does not interpret Warp’s kernel argument bytes."],
    ["Warp", "Arrays and aliases, captured operations, count lowering, executable lifetime", "Does not decide which keyboard a world should use."]
  ],
  findings: [
    { title: "Move executable lowering into Warp", priority: "First change", text: "GPU Components currently imports private launch_bounds_t, distinguishes Warp 1.17 and 1.19 encodings, and reads kernel.adj.kernel_dim. It also assigns graph.graph_exec during executable preparation. Warp should expose a supported count-binding operation and own the native implementation.", file: "https://github.com/ooctipus/gpu-components/blob/6cc307cd5066dbd434dc6e7fc1b21b6327e2100f/src/gpu_components/graph.py#L332" },
    { title: "Expose virtual array allocation", priority: "Memory", text: "Pointer-backed arrays and custom allocators already make external VMM possible. A virtual=True allocation would let Warp own the reservation directly. Backing operations must support shared budgets, stable addresses and retirement after readers finish. Array shape and strides already describe the layout.", file: "https://github.com/ooctipus/gpu-components/blob/6cc307cd5066dbd434dc6e7fc1b21b6327e2100f/src/gpu_components/fields.py#L480" },
    { title: "Use Warp’s native CUDA capability boundary", priority: "Cleanup", text: "Some custom capture queries load the CUDA driver directly from Python while other queries use Warp’s native runtime. Route them through one native capability and error-handling boundary. Do not create a second CUDA loader or another graph manager.", file: "https://github.com/ooctipus/warp/blob/52da84604e541b77cc0433b86385de5edb620abc/warp/_src/context.py#L13954" },
    { title: "Make native Newton counts explicit", priority: "Newton follow-on", text: "Today’s growable bridge uses MJWarp Model/Data. Ordinary Newton State derives body_count from array length and clears entire arrays. A capacity-shaped VMM array would make unused or unmapped rows look live. Packed per-world columns also cannot always be flattened into ordinary Newton State without changing strides.", file: "https://github.com/ooctipus/newton/blob/44714f493e4f703b207b1bf77b7277a83d042e54/newton/_src/sim/state.py#L164" }
  ],
  concepts: [
    ["Reserved", "8 slots", "The array descriptor and address range. Finite; fixed for this graph’s lifetime."],
    ["Mapped", "4 slots", "Physical bytes have backing and access permission. Values may still need initialization."],
    ["Ready", "3 slots", "The storage owner certifies that this prefix is accessible. Episode initialization is a separate obligation."],
    ["Live", "2 worlds", "The directory says these worlds exist. New episodes still need their reset contract."],
    ["Work count", "2 worlds here", "The extent of this operation. Other stages have independent contact or CCD counts."]
  ],
  countRules: [
    "One symbolic identity, one source and one update point per executable initially. Equal maxima do not make two counts identical.",
    "Proposed stronger semantics: snapshot each source into retained device storage, then update every occurrence from that snapshot. Today’s updater instead requires sources to remain stable while it reads them.",
    "Preparation verifies update → consumer completion edges, including conditional bodies. The caller orders all producers before the snapshot; Python call order alone is not a proof.",
    "Invalid counts or failed updates suppress dependent work and publication and expose a status. Checking count ≤ capacity does not establish count ≤ ready or safe indirect indexing.",
    "Initially reject multiple update epochs for one identity, unsupported dynamic operations, graph mutation after preparation and concurrent replay sharing mutable updater state.",
    "Array shape and strides remain fixed descriptors. A bounded fill or copy is explicit; zero_() does not silently change to mean only live worlds."
  ],
  steps: [
    { title: "Before reset", smallLive: 3, smallReady: 4, largeLive: 2, largeReady: 2, page: "small", text: "Five worlds are live. World 2 uses a 6-key keyboard. Both prototypes already have prepared physics programs. Four of five physical blocks are mapped." },
    { title: "Retire one world; withdraw its tail", smallLive: 2, smallReady: 2, largeLive: 2, largeReady: 2, page: "closing", text: "World 2 ends. Newton publishes fewer small worlds and orders withdrawal so future small-world work stops at slot 2. Block B1 remains mapped while earlier readers finish." },
    { title: "Wait by polling; keep other work running", smallLive: 2, smallReady: 2, largeLive: 2, largeReady: 2, page: "closing", text: "The host may submit independent work and poll completion events. No explicit CPU reader wait is required here. This is a dependency illustration, not a claim that driver work causes zero GPU stalls." },
    { title: "Unmap after the readers complete", smallLive: 2, smallReady: 2, largeLive: 2, largeReady: 2, page: "pool", text: "The host unmaps B1 from the small reservation and returns it to the shared pool. Both virtual address ranges remain reserved. Unmapping still has a cost." },
    { title: "Map the large-world slot", smallLive: 2, smallReady: 2, largeLive: 2, largeReady: 2, page: "large-unready", text: "The host maps B1 at large slot 2 and sets access permissions. That slot has backing but is not yet ready. It is a different virtual address from the old small-world slot." },
    { title: "Initialize the new episode", smallLive: 2, smallReady: 2, largeLive: 2, largeReady: 3, page: "large", text: "GPU work writes the required initial state. Once preparation and ordering permit it, readiness reaches 3. The new world is not published live before initialization completes." },
    { title: "Publish and update the graph counts", smallLive: 2, smallReady: 2, largeLive: 3, largeReady: 3, page: "large", text: "World 2 is now a new 108-key episode in large slot 2. The same prepared graph processes 2 small and 3 large worlds. Prototype array bases stayed fixed; this world’s storage address changed." }
  ],
  sources: [
    ["Warp allocator hooks", "https://nvidia.github.io/warp/latest/user_guide/execution_and_performance/memory_management.html#custom-allocators", "Existing hooks are a starting point for custom memory backing."],
    ["Warp device-array launch dimensions · issue #742", "https://github.com/NVIDIA/warp/issues/742", "The dynamic-work request is separate from memory allocation."],
    ["CUDA VMM API", "https://docs.nvidia.com/cuda/cuda-driver-api/cuda_driver_api/group__CUDA__VA.html", "Reservation, physical allocation, mapping and access are distinct."],
    ["NVIDIA CUDA Python VMM design", "https://github.com/NVIDIA/cuda-python/blob/main/cuda_core/cuda/core/_cpp/rt/VMM_DESIGN.md", "Separates reservation, physical and mapping ownership. Its new-buffer growth can relocate, so it is not automatically graph-stable."],
    ["Warp array API", "https://nvidia.github.io/warp/latest/api_reference/_generated/warp.array.html", "External pointer and descriptor support exists; the inspected API has no virtual=True parameter."]
  ],
  plan: [
    ["1 · Agree on the two contracts", "Storage ownership and count-driven execution", "Finite capacity, aliases, readiness responsibility, read point, failure and concurrent replay semantics are written down."],
    ["2 · Move count lowering under Warp Graph", "Remove downstream private ABI decoding", "The same kernel runs with distinct equal-bound counts; zero→positive replay, bounded copy/fill and conditional/parallel ordering pass."],
    ["3 · Add virtual array allocation", "virtual=True with explicit backing operations", "Reservation and backing have separate lifetimes; aliases retain the owner; shared budgets and safe retirement are supported. Warp owns the reservation created by its virtual array allocation."],
    ["4 · Qualify native Newton on one more solver", "Separate live extents from descriptor size", "State/Control, bulk writes, index lookup and layout are audited before promising general solver support."]
  ]
};

export const examples = [
  {
    id: "launch", label: "Dynamic count: Launch size", title: "Advance only the live rows",
    intro: "All three process 100 rows. The fixed version allocates exactly 100; the growable versions allocate room for 1,024 and take the live count from the GPU.",
    assumption: "The fixed example allocates 100 rows. The other two allocate 1,024 rows and set live_count to 100. Kernels are loaded before capture. In a real task, Newton supplies the count after admission and initialization; all count producers must precede consumers.",
    fixedTitle: "Fixed size",
    fixedStatus: "Warp main · 100 rows",
    fixed: `import warp as wp

@wp.kernel
def advance(q: wp.array2d[float]):
    i, j = wp.tid()
    q[i, j] += 0.01

wp.init()
device = "cuda:0"
nworld = 100
q = wp.zeros((nworld, 80),
             dtype=wp.float32, device=device)
wp.load_module(device=device)

with wp.ScopedCapture(device=device) as capture:
    wp.launch(advance, dim=(nworld, 80),
              inputs=[q], device=device)

wp.capture_launch(capture.graph)`,
    fixedNote: "The graph records 100 rows. Changing the Python variable nworld later would change neither q nor the captured launch.",
    beforeTitle: "Warp main + GPU Components",
    beforeStatus: "Newton / MJWarp composition · explicit bindings",
    before: `import warp as wp
from gpu_components import graph as gpc_graph

@wp.kernel
def advance(q: wp.array2d[float]):
    i, j = wp.tid()
    q[i, j] += 0.01

wp.init()
device = "cuda:0"
capacity = 1024
q = wp.zeros((capacity, 80),
             dtype=wp.float32, device=device)
live_count = wp.array([100],
                      dtype=wp.int32, device=device)
wp.load_module(device=device)

updates = gpc_graph.prepare_updates(
    live_count, enable_count_maximum=capacity,
    binding_capacity=1)

with wp.ScopedCapture(device=device) as capture:
    gpc_graph.record_update(updates)
    binding = gpc_graph.launch(
        updates, advance, dim=(capacity, 80),
        extent_axis=0, inputs=[q], device=device)

gpc_graph.retain(capture.graph, q)
gpc_graph.bind(updates, capture.graph, [binding])
gpc_graph.instantiate_and_upload(updates, capture.graph)
wp.capture_launch(capture.graph)`,
    beforeNote: "extent_axis=0 explicitly tells GPU Components which launch dimension to update.",
    afterTitle: "With Warp support · update the launch",
    afterStatus: "Proposed API · not implemented upstream",
    after: `import warp as wp

@wp.kernel
def advance(q: wp.array2d[float]):
    i, j = wp.tid()
    q[i, j] += 0.01

wp.init()
device = "cuda:0"
capacity = 1024
q = wp.zeros((capacity, 80),
             dtype=wp.float32, device=device)
live_count = wp.array([100],
                      dtype=wp.int32, device=device)
wp.load_module(device=device)

n = wp.CountParameter(maximum=capacity)
# PROPOSED count binding and update API:
with wp.ScopedCapture(
    device=device,
    count_sources=((n, live_count),)) as capture:
    wp.capture_update_counts((n,))
    wp.launch(advance, dim=(n, 80),
              inputs=[q], device=device)

wp.capture_launch(capture.graph)`,
    afterNote: "dim=(n, 80) tells Warp where the changing count is used. count_sources connects n to its GPU value.",
    result: "Fixed: capture the integer 100. GPU Components: explicitly bind axis 0 to live_count. Proposed Warp: use n in the launch and bind n to live_count.",
    caution: "The middle column needs no CountParameter or fork capture records. It uses GPU Components’ CUDA bridge and version-checked Warp launch ABI. Updater and consumers share one native graph here. Crossing a conditional boundary needs additional containment records; staying within the same body does not. Existing MJWarp launch sites must explicitly participate in this path.",
  },
  {
    id: "argument", label: "Dynamic count: Kernel argument", title: "Use the same count inside the calculation",
    intro: "Compute the mean of each of q’s 80 columns over 100 live rows. There are always 80 output values, so the launch size stays 80. Here the changing count is a kernel argument.",
    assumption: "Each example allocates q, mean and live_count. The serial sum per column is chosen to make the count argument easy to see, not as a fast reduction algorithm.",
    fixedTitle: "Fixed size",
    fixedStatus: "Warp main · fixed integer argument",
    fixed: `import warp as wp

@wp.kernel
def column_mean(q: wp.array2d[float], n: int,
                mean: wp.array[float]):
    j = wp.tid()
    total = float(0.0)
    for i in range(n):
        total += q[i, j]
    mean[j] = 0.0
    if n > 0:
        mean[j] = total / float(n)

wp.init()
device = "cuda:0"
nworld = 100
q = wp.zeros((nworld, 80),
             dtype=wp.float32, device=device)
mean = wp.empty(80, dtype=wp.float32, device=device)
wp.load_module(device=device)

with wp.ScopedCapture(device=device) as capture:
    wp.launch(column_mean, dim=80,
              inputs=[q, nworld, mean], device=device)

wp.capture_launch(capture.graph)`,
    fixedNote: "The ordinary integer 100 becomes a captured kernel argument.",
    beforeTitle: "Warp main + GPU Components",
    beforeStatus: "Newton / MJWarp composition · argument binding",
    before: `import warp as wp
from gpu_components import graph as gpc_graph
from gpu_components.graph_data import KernelParameterBinding

@wp.kernel
def column_mean(q: wp.array2d[float], n: int,
                mean: wp.array[float]):
    j = wp.tid()
    total = float(0.0)
    for i in range(n):
        total += q[i, j]
    mean[j] = 0.0
    if n > 0:
        mean[j] = total / float(n)

wp.init()
device = "cuda:0"
capacity = 1024
q = wp.zeros((capacity, 80),
             dtype=wp.float32, device=device)
live_count = wp.array([100],
                      dtype=wp.int32, device=device)
mean = wp.empty(80, dtype=wp.float32, device=device)
wp.load_module(device=device)
# Run even when n == 0, so mean is written to zero.
enabled = wp.ones(1, dtype=wp.int32, device=device)
updates = gpc_graph.prepare_updates(
    enabled, enable_count_maximum=1, binding_capacity=1)

with wp.ScopedCapture(device=device) as capture:
    gpc_graph.record_update(updates)
    binding = gpc_graph.launch(
        updates, column_mean, dim=80,
        inputs=[q, capacity, mean],
        parameters=(KernelParameterBinding(
            2, live_count, capacity),),
        device=device)

gpc_graph.retain(capture.graph, q, mean)
gpc_graph.bind(updates, capture.graph, [binding])
gpc_graph.instantiate_and_upload(updates, capture.graph)
wp.capture_launch(capture.graph)`,
    beforeNote: "All three pass an ordinary int to the same numerical kernel. GPU Components explicitly binds argument 2 to live_count; index 0 belongs to Warp’s hidden launch-bounds argument. That indexing knowledge lives outside Warp today.",
    afterTitle: "With Warp support · pass an integer",
    afterStatus: "Proposed automatic binding",
    after: `import warp as wp

@wp.kernel
def column_mean(q: wp.array2d[float], n: int,
                mean: wp.array[float]):
    j = wp.tid()
    total = float(0.0)
    for i in range(n):
        total += q[i, j]
    mean[j] = 0.0
    if n > 0:
        mean[j] = total / float(n)

wp.init()
device = "cuda:0"
capacity = 1024
q = wp.zeros((capacity, 80),
             dtype=wp.float32, device=device)
live_count = wp.array([100],
                      dtype=wp.int32, device=device)
mean = wp.empty(80, dtype=wp.float32, device=device)
wp.load_module(device=device)

n = wp.CountParameter(maximum=capacity)
# PROPOSED capture API:
with wp.ScopedCapture(
    device=device,
    count_sources=((n, live_count),)) as capture:
    wp.capture_update_counts((n,))
    wp.launch(column_mean, dim=80,
              inputs=[q, n, mean], device=device)

wp.capture_launch(capture.graph)`,
    afterNote: "The kernel still receives an ordinary int. Warp would bind it from n without a numeric argument-position declaration in the composition code. With n = 0, this fixed 80-thread launch must still run and write zero means.",
    result: "A changing count can control a loop or a scalar argument even when the launch size is fixed. This example makes no speedup claim.",
    caution: "CountParameter as a scalar argument exists in our fork. Automatic source binding and the explicit capture_update_counts call shown on the right are proposed."
  },
  {
    id: "memory", label: "Dynamic count: Zero and copy", title: "Touch the live prefix, leave the rest alone",
    intro: "Clear 100 live rows, then copy them into saved. The fixed arrays have exactly 100 rows; the growable arrays have spare rows that must stay untouched.",
    assumption: "The fixed arrays have 100 rows; the other versions allocate 1,024 rows each. live_count stays 100 across both operations. VMM-backed versions must also ensure that every accessed row is mapped.",
    fixedTitle: "Fixed size",
    fixedStatus: "Warp main · whole-array operations",
    fixed: `import warp as wp

wp.init()
device = "cuda:0"
nworld = 100
q = wp.zeros((nworld, 80),
             dtype=wp.float32, device=device)
saved = wp.ones((nworld, 80),
                dtype=wp.float32, device=device)

with wp.ScopedCapture(device=device) as capture:
    q.zero_()
    wp.copy(saved, q)

wp.capture_launch(capture.graph)`,
    fixedNote: "All 100 rows belong to the operation. There is no spare prefix to leave untouched.",
    beforeTitle: "Warp main + GPU Components",
    beforeStatus: "Newton / MJWarp composition · two bounded launches",
    before: `import warp as wp
from gpu_components import graph as gpc_graph

@wp.kernel
def zero(q: wp.array2d[float]):
    i, j = wp.tid()
    q[i, j] = 0.0

@wp.kernel
def copy(src: wp.array2d[float], dst: wp.array2d[float]):
    i, j = wp.tid()
    dst[i, j] = src[i, j]

wp.init()
device = "cuda:0"
capacity = 1024
q = wp.zeros((capacity, 80),
             dtype=wp.float32, device=device)
live_count = wp.array([100],
                      dtype=wp.int32, device=device)
saved = wp.ones((capacity, 80),
                dtype=wp.float32, device=device)
wp.load_module(device=device)

updates = gpc_graph.prepare_updates(
    live_count, enable_count_maximum=capacity,
    binding_capacity=2)
with wp.ScopedCapture(device=device) as capture:
    gpc_graph.record_update(updates)
    clear = gpc_graph.launch(
        updates, zero, dim=(capacity, 80),
        extent_axis=0, inputs=[q], device=device)
    save = gpc_graph.launch(
        updates, copy, dim=(capacity, 80),
        extent_axis=0, inputs=[q, saved], device=device)

gpc_graph.retain(capture.graph, q, saved)
gpc_graph.bind(updates, capture.graph, [clear, save])
gpc_graph.instantiate_and_upload(updates, capture.graph)
wp.capture_launch(capture.graph)`,
    beforeNote: "GPU Components updates both launches to the live prefix. The integration supplies the two simple kernels and their bindings; the kernels themselves contain no GPU Components concepts.",
    afterTitle: "With Warp support · declare the extent",
    afterStatus: "extent exists in our fork; binding is proposed",
    after: `import warp as wp

wp.init()
device = "cuda:0"
capacity = 1024
q = wp.zeros((capacity, 80),
             dtype=wp.float32, device=device)
live_count = wp.array([100],
                      dtype=wp.int32, device=device)
saved = wp.ones((capacity, 80),
                dtype=wp.float32, device=device)

n = wp.CountParameter(maximum=capacity)
# PROPOSED capture API:
with wp.ScopedCapture(
    device=device,
    count_sources=((n, live_count),)) as capture:
    wp.capture_update_counts((n,))

    q.zero_(extent=(n, 80))
    wp.copy(saved, q, extent=(n, 80))

wp.capture_launch(capture.graph)`,
    afterNote: "Warp lowers these explicit prefix operations to bounded kernels. It must preserve the arrays’ strides and retain their owners through replay.",
    result: "The extent is the intended work, not the allocation size or the number of mapped rows. q.zero_() without extent still means the entire array.",
    caution: "These bounded operations are not ordinary full-size CUDA memcpy or memset nodes whose lengths change automatically. The fork implements count-aware kernels."
  },
  {
    id: "virtual", label: "Virtual memory: Array reservation", title: "Adopt virtual=True for virtual array allocation",
    intro: "The virtual=True suggestion fits here: ask Warp to create an array with stable addresses and separately managed physical backing. The reserve-only behavior below is our proposed contract, not an implemented Warp API.",
    assumption: "The ordinary array is fully backed. The other two examples reserve q without mapping its payload. GPU Components still allocates small count and bookkeeping arrays. Its 64 MiB limit is a budget ceiling, not an upfront physical allocation.",
    fixedTitle: "Fixed allocation",
    fixedStatus: "Warp main · physically backed array",
    fixed: `import warp as wp

wp.init()
device = "cuda:0"
capacity = 1024

q = wp.empty((capacity, 80),
             dtype=wp.float32, device=device)`,
    fixedNote: "Warp allocates backing for all rows. The values are uninitialized.",
    beforeTitle: "Warp main + GPU Components",
    beforeStatus: "Existing reservation and budget operations",
    before: `import warp as wp
from gpu_components import backing, fields
from gpu_components.field_data import FieldSpec

wp.init()
capacity = 1024

with wp.ScopedDevice("cuda:0"):
    memory = backing.prepare(64 * 1024**2)
    protected_count = wp.zeros(1, dtype=wp.int32)
    storage = fields.allocate(
        capacity, protected_count,
        fields=(FieldSpec("q", (80,), wp.float32),),
        backing=memory, initial_ready_count=0)
    q = storage.arrays["q"]

# q has a descriptor and address range.
# Its payload has no mapped pages yet.`,
    beforeNote: "GPU Components owns the reservation and backing budget. protected_count limits shrinking; it does not create live worlds.",
    afterTitle: "With Warp support · virtual=True",
    afterStatus: "Proposed spelling and reserve-only behavior",
    after: `import warp as wp

wp.init()
device = "cuda:0"
capacity = 1024

# PROPOSED: reserve addresses, map payload separately.
q = wp.empty((capacity, 80),
             dtype=wp.float32, device=device,
             virtual=True)

# q.shape is (1024, 80).
# Warp owns the virtual reservation.
# Its payload has no mapped pages yet.`,
    afterNote: "Warp creates and owns the virtual array. Its existing shape, dtype and strides describe the layout.",
    result: "Before a virtual array is used, physical backing must be mapped and the accessed values initialized. The mapping, shared-budget and retirement APIs still need agreement; virtual=True is the allocation entry point.",
    caution: "Pages are mapped in device granules, so a small array may be fully backed even for a small requested prefix. A changing work count is separate: CountParameter controls launch sizes and arguments; it neither maps pages nor owns storage."
  }
];
