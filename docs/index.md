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

Take two kinds of world in one batch. A **cartpole** has two degrees of freedom: a slider and a hinge, `nq = 2`, `nv = 2`, two bodies. A **Unitree G1 humanoid** has a floating base and 29 actuated joints: `nq = 36`, `nv = 35`, about thirty bodies, with the contact and constraint work that comes with feet and hands. Per world, the G1's `Data` rows and its share of each kernel are roughly sixteen times the cartpole's. The exact ratio depends on the scene; the order of magnitude is what matters here.

In MuJoCo Warp each kind is its own `Model` with its own `Data` layout, so the batch is really two batches: eight cartpole worlds in one `Data`, eight G1 worlds in another, stepped by the same program. In this package's terms, cartpole and G1 are two **world prototypes**, each with its own partition of slots.

Now the episode in cartpole world 2 ends, then G1 world 5. The training loop wants a fresh G1, and later a ninth cartpole. Three questions appear that fixed arrays cannot answer:

- Which worlds of each prototype are still in use, and how does each kernel know to skip the rest without a host round trip?
- When a fresh G1 takes slot 5, how does anything still holding a reference to the old world 5 learn that it is gone?
- Freeing one G1 world returns sixteen cartpoles' worth of memory. Where is that accounted, and where does a ninth cartpole's memory come from without reallocating `Data` and re-recording the GPU step?

<div class="gc-widget" data-widget="population"></div>
<div class="gc-fallback">

![Two prototypes of worlds over several steps: episodes end, worlds are created, nothing is reallocated](/img/population.svg)

</div>

The figure is interactive: create cartpoles and G1s, click a world to destroy it, compact, grow the backing, and look up a stale handle. The byte meter counts a G1 as sixteen cartpoles. The log names the operation and the rule each action exercised.

This package answers the three questions on the device. The next page defines the words it uses, in Newton and MuJoCo Warp terms first.
