---
id: index
slug: /
title: A small example
sidebar_position: 1
---

# GPU Components

GPU-resident world directory, growable typed storage, virtual-memory backing, and count-driven CUDA graph replay for simulations whose set of worlds changes at runtime.

## A small example

In MuJoCo Warp, a batch of simulations is one `Model` and one `Data`. Every array in `Data` has a leading world axis: `d.qpos` has shape `(nworld, nq)`, `d.qvel` has shape `(nworld, nv)`. One kernel updates all `nworld` worlds per step. Newton builds such a batch by replicating a scene, and reinforcement learning drives it one step at a time.

Take eight cartpole worlds, `nworld = 8`. The batch is fast because the kernel never asks which worlds matter.

Now the episode in world 2 ends, and a step later the episode in world 5 ends. The training loop then wants a fresh cartpole, and later it will want nine worlds instead of eight. Three questions appear that fixed arrays cannot answer:

- Which worlds are still in use, and how does a kernel know to skip the rest without a host round trip?
- When a fresh cartpole takes world index 2, how does anything still holding a reference to the old world 2 learn that it is gone?
- Where does a ninth world come from without reallocating `Data` and re-recording the GPU step?

<div class="gc-widget" data-widget="population"></div>
<div class="gc-fallback">

![Eight worlds over four steps: two episodes end, one world is created, nothing is reallocated](/img/population.svg)

</div>

The figure is interactive: create worlds, click one to destroy it, compact, grow the backing, and look up a stale handle. The log names the operation and the rule each action exercised.

This package answers the three questions on the device. The next page defines the words it uses, in Newton and MuJoCo Warp terms first.
