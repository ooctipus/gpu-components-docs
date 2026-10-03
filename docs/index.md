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

Two scenes. Pick one; the figures below follow the same choice.

<Tabs groupId="scene" queryString="scene">
<TabItem value="cartpole" label="cartpole and G1" default>

<div className="gc-scene">
<div className="gc-scene-row"><span className="gc-scene-label">asset prototypes</span><span className="gc-chip gc-chip-cartpole">cartpole</span> <span className="gc-chip gc-chip-g1">G1</span></div>
<div className="gc-scene-row gc-scene-worlds"><span className="gc-scene-label">world prototypes</span><div className="gc-world-list"><div className="gc-world gc-world-0"><div className="gc-world-name">cartpole</div><div className="gc-world-chips"><span className="gc-chip gc-chip-cartpole">cartpole</span></div><div className="gc-world-meta">[0] · 1,536 B/world</div></div><div className="gc-world gc-world-1"><div className="gc-world-name">G1</div><div className="gc-world-chips"><span className="gc-chip gc-chip-g1">G1</span></div><div className="gc-world-meta">[1] · 24,576 B/world</div></div></div></div>
</div>

To this package a world prototype is a stride, the bytes one world occupies, and nothing else; a G1 world costs sixteen cartpole worlds.

The memory budget is 16 page handles of 2 MiB, 32 MiB. Every prototype reserves virtual space for the whole budget, so its planned maximum is budget ÷ stride: the most worlds of it there could ever be. Reservation costs no memory, so planning lower gains nothing and planning higher could never be filled. All the budget's handles are created once at startup and wait in the pool, so a later map never allocates and cannot fail.

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

To this package a world prototype is a stride, the bytes one world occupies, and nothing else; Newton's world id picks the prototype, the slot is the position inside it.

The memory budget is 5 page handles of 2 MiB, 10 MiB. Every prototype reserves virtual space for the whole budget, so its planned maximum is budget ÷ stride: the most worlds of it there could ever be. Reservation costs no memory, so planning lower gains nothing and planning higher could never be filled. All the budget's handles are created once at startup and wait in the pool, so a later map never allocates and cannot fail.

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
| **reserve** | address-space reservation, `cuMemAddressReserve` | one contiguous virtual range per prototype, sized to the budget; slot *i* at `base + i × stride`, fixed for life |
| **page**, **page handle** | page, page frame | 2 MiB of real memory; interchangeable across prototypes, owned by one at a time |
| **map** | commit, `cuMemMap` | put a handle under part of a range; a CPU driver call, no GPU wait, never inside a graph |
| **ready prefix** | committed region | the slots with pages behind them whose count has been published; kernels and the directory never go past it |
| **pool** | free list | handles created at startup but not mapped anywhere; owned by no prototype, counted against the budget, the source of every later map |
| **join** | RCU grace period, stream synchronize | the CPU waits for the GPU before unmapping; the one operation that stalls |
| **compaction** | moving garbage collection | copy live worlds down into holes so the live set is a dense prefix again |
| **world handle**, **directory** | generational index, handle table | `(identity, generation)` naming one world, and the device-resident map from it to prototype and slot |

The full list, with the Newton and MuJoCo Warp terms, is on the [vocabulary page](vocabulary.md).

## Three layers

Per prototype, three layers: the directory layer says which slots hold worlds, the virtual layer is one fixed range of addresses, the physical layer says which pages are mapped under it. Each action changes exactly one layer.

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
- [Vocabulary](vocabulary.md): the terms, in Newton and MuJoCo Warp notation.
- [Four parts](structure.md): which module owns which job.
- [Tutorial](tutorial.md): from an empty directory to a graph that follows a changing count, verified on hardware.
- [API](api/directory.md): one page per module.
