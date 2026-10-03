---
id: index
slug: /
title: Overview
sidebar_position: 1
---

# GPU Components

Device-resident bookkeeping for batch simulations whose set of worlds changes at runtime: a world directory, growable typed storage, virtual-memory backing, and CUDA graph replay driven by GPU-side counts.

## Example

A MuJoCo Warp batch is one `Model` and one `Data`; every `Data` array has a leading world axis, and one kernel steps all `nworld` worlds. Consider two world prototypes in one program:

| Prototype | Degrees of freedom | `Data` per world |
|---|---|---|
| cartpole | 2 | 1× |
| G1 humanoid | 35 | about 16× |

Episodes end at different times, replacements arrive, and the training loop later asks for more worlds than were allocated. Three things must then happen without a host round trip, a reallocation, or a re-capture:

1. Each prototype's kernels run over its live worlds only.
2. A reference to a destroyed world is detectably stale.
3. Memory freed by one world is accounted and reusable, including across prototypes.

<div class="gc-widget" data-widget="population"></div>
<div class="gc-fallback">

![Two prototypes of worlds: episodes end, worlds are created, nothing is reallocated](/img/population.svg)

</div>

## Resets under a memory budget

Choose a budget and a desired mix of prototypes, then run resets. Each reset is one directory batch; the figure shows which worlds are replaced, which are destroyed, which are created, and what the budget or the slot limits reject.

<div class="gc-widget" data-widget="distribution"></div>

## Where to start

- [Vocabulary](vocabulary.md): the terms, in Newton and MuJoCo Warp notation.
- [Four parts](structure.md): which module owns which job.
- [Tutorial](tutorial.md): from an empty directory to a graph that follows a changing count, verified on hardware.
- [API](api/directory.md): one page per module.
