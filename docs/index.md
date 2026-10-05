---
id: index
slug: /
title: Overview
sidebar_position: 1
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# GPU Components

Device-resident bookkeeping for batch simulations whose set of worlds changes at runtime: a world directory, growable typed storage, virtual-memory backing, and CUDA graph replay driven by GPU-side counts.

## Example

Two scenes. Pick one; the figures below follow the same choice. The byte sizes and 2 MiB pages are illustrative, not measurements of a complete Newton simulation. One range per prototype keeps the drawing readable; the real integration has separate world, contact, CCD and temporary storage.

<Tabs groupId="scene" queryString="scene">
<TabItem value="cartpole" label="cartpole and G1" default>

<div className="gc-scene">
<div className="gc-scene-row"><span className="gc-scene-label">asset prototypes</span><span className="gc-chip gc-chip-cartpole">cartpole</span> <span className="gc-chip gc-chip-g1">G1</span></div>
<div className="gc-scene-row gc-scene-worlds"><span className="gc-scene-label">world prototypes</span><div className="gc-world-list"><div className="gc-world gc-world-0"><div className="gc-world-name">cartpole</div><div className="gc-world-chips"><span className="gc-chip gc-chip-cartpole">cartpole</span></div><div className="gc-world-meta">[0] · 1,536 B/world</div></div><div className="gc-world gc-world-1"><div className="gc-world-name">G1</div><div className="gc-world-chips"><span className="gc-chip gc-chip-g1">G1</span></div><div className="gc-world-meta">[1] · 24,576 B/world</div></div></div></div>
</div>

The directory sees prototype indices and slots. Storage sees typed fields and their byte layout. Neither needs to know what a cartpole or G1 is. In this drawing a G1 world uses sixteen times the bytes of a cartpole.

The drawing uses a 32 MiB physical budget and reserves 32 MiB of addresses for each prototype. This lets either use the budget alone; both cannot fill their reservations together. For illustration, the pool starts with all 16 handles already created. The package does not do that automatically: it creates handles when mapping needs them and reuses handles returned to the pool. Driver calls can still fail with a warm pool.

| Prototype | Stride, bytes per world | Reserved | Planned maximum | Mapped | Ready slots | Live |
|---|---|---|---|---|---|---|
| cartpole | 1,536 B | 32 MiB | 21,845 | 4 pages | 5,461 | 4 |
| G1 | 24,576 B | 32 MiB | 1,365 | 3 pages | 256 | 4 |

Slot *i* is at `base + i × stride` for the life of the storage. The 2 ranges reserve 64 MiB against 32 MiB of memory: addresses are promised, memory is budgeted.
</TabItem>
<TabItem value="franka" label="banana and Franka">

<div className="gc-scene">
<div className="gc-scene-row"><span className="gc-scene-label">asset prototypes</span><span className="gc-chip gc-chip-banana">banana</span> <span className="gc-chip gc-chip-franka">franka</span></div>
<div className="gc-scene-row gc-scene-worlds"><span className="gc-scene-label">world prototypes</span><div className="gc-world-list"><div className="gc-world gc-world-0"><div className="gc-world-name">W0</div><div className="gc-world-chips"><span className="gc-chip gc-chip-banana">banana</span> <span className="gc-chip gc-chip-franka">franka</span></div><div className="gc-world-meta">[0, 1] · 816 B/world</div></div><div className="gc-world gc-world-1"><div className="gc-world-name">W1</div><div className="gc-world-chips"><span className="gc-chip gc-chip-banana">banana</span> <span className="gc-chip gc-chip-franka">franka</span> <span className="gc-chip gc-chip-franka">franka</span></div><div className="gc-world-meta">[0, 1, 1] · 1,488 B/world</div></div><div className="gc-world gc-world-2"><div className="gc-world-name">W2</div><div className="gc-world-chips"><span className="gc-chip gc-chip-banana">banana</span> <span className="gc-chip gc-chip-banana">banana</span> <span className="gc-chip gc-chip-franka">franka</span></div><div className="gc-world-meta">[0, 0, 1] · 944 B/world</div></div><div className="gc-world gc-world-3"><div className="gc-world-name">W3</div><div className="gc-world-chips"><span className="gc-chip gc-chip-franka">franka</span></div><div className="gc-world-meta">[1] · 688 B/world</div></div></div></div>
</div>

These four scene layouts have different bytes per world. The directory maps a world handle to a prototype and a slot; storage translates the slot into addresses.

The drawing uses a 10 MiB physical budget and reserves 10 MiB of addresses for each prototype. The five handles start already created in this example. This warm pool is an example policy, not the package default. Reserving addresses consumes no payload memory, but directory metadata and scan costs still grow with slot capacity.

| Prototype | Stride, bytes per world | Reserved | Planned maximum | Mapped | Ready slots | Live |
|---|---|---|---|---|---|---|
| W0 | 816 B | 10 MiB | 12,850 | 1 page | 2,570 | 4 |
| W1 | 1,488 B | 10 MiB | 7,046 | 1 page | 1,409 | 4 |
| W2 | 944 B | 10 MiB | 11,107 | 1 page | 2,221 | 4 |
| W3 | 688 B | 10 MiB | 15,240 | 1 page | 3,048 | 4 |

Slot *i* is at `base + i × stride` for the life of the storage. The 4 ranges reserve 40 MiB against 10 MiB of memory: addresses are promised, memory is budgeted.
</TabItem>
</Tabs>

## Eight words the figures use

| Word | Established name | Meaning here |
|---|---|---|
| **reserve** | address-space reservation, `cuMemAddressReserve` | one fixed virtual range per storage; slot *i* at `base + i × stride` for its lifetime |
| **page**, **page handle** | physical allocation unit | 2 MiB in these examples; actual granularity comes from CUDA; mapped into one storage at a time |
| **map** | `cuMemMap` and `cuMemSetAccess` | host calls supplying backing and access permission; fresh addresses need no reader join, historical reuse does |
| **ready prefix** | committed region | the slots with pages behind them whose count has been published; kernels and the directory never go past it |
| **pool** | free list | retained unmapped handles, still counted against the budget and available for reuse |
| **join**, **grace period** | reader completion | old readers must finish before reclaim; joined resize waits on the CPU, deferred reclaim polls events |
| **compaction** | moving garbage collection | copy live worlds down into holes so the live set is a dense prefix again |
| **world handle**, **directory** | generational index, handle table | `(identity, generation)` naming one world, and the device-resident map from it to prototype and slot |

The full list, with the Newton and MuJoCo Warp terms, is on the [vocabulary page](vocabulary.md).

## Three layers

The directory says which slots hold worlds. The virtual range fixes each slot's address. Physical mappings supply memory under those addresses. Create initializes data and publishes a location; compaction copies data and changes locations. Neither requires changing mappings when capacity is already ready. Stale lookup only reads.

The figure shows deferred retirement: **Withdraw tail** lowers permission to use the tail but keeps its pages; **Reclaim** returns the pages after old readers complete. These are separate from the blocking resize API. **Host** means a CPU operation, not a promise of zero latency or no synchronization. Fresh mapping needs no explicit reader wait; historical remapping and joined maintenance do. The virtual ranges stay fixed for their lifetime, through all actions shown.

<Tabs groupId="scene" queryString="scene">
<TabItem value="cartpole" label="cartpole and G1" default>

<div class="gc-widget" data-widget="stack" data-scene="cartpole"></div>

</TabItem>
<TabItem value="franka" label="banana and Franka">

<div class="gc-widget" data-widget="stack" data-scene="franka"></div>

</TabItem>
</Tabs>

## Resets under a memory budget

Choose a memory budget and how to split it between the prototypes, then run resets. Each reset is one directory batch; the figure shows which worlds are replaced, which are destroyed, which are created, and what the budget or the slot limits reject.

<Tabs groupId="scene" queryString="scene">
<TabItem value="cartpole" label="cartpole and G1" default>

<div class="gc-widget" data-widget="distribution" data-scene="cartpole"></div>

</TabItem>
<TabItem value="franka" label="banana and Franka">

<div class="gc-widget" data-widget="distribution" data-scene="franka"></div>

</TabItem>
</Tabs>

## Where to start

- [Alternatives](alternatives.md): padded Data, reallocated Data, and this package, through the same events.
- [Where the waits go](lineage.md): what fresh mapping and deferred retirement remove, and which costs remain.
- [Vocabulary](vocabulary.md): the terms, in Newton and MuJoCo Warp notation.
- [Four parts](structure.md): which module owns which job.
- [Tutorial](tutorial.md): from an empty directory to a graph that follows a changing count, verified on hardware.
- [Integration reference](integration.md): the pieces in Warp, MuJoCo Warp, Newton and IsaacLab that touch this package, and what binds to what.
- [API](api/directory.md): one page per module.
