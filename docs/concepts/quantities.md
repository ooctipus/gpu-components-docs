---
id: quantities
title: Seven distinct quantities
sidebar_position: 3
---

# Seven distinct quantities

Take the illustrative cartpole storage from the [Four parts](../structure.md) walkthrough: 6 live worlds, 4 pages mapped, 21,845 slots reserved. These numbers answer different questions: which rows exist, which are accessible, and which should a kernel process? Confusing them can cause a kernel to touch unmapped memory or read an uninitialized world.

The figure grows the storage by one page, creates a thousand worlds, replays, then shrinks back in two phases. Each step moves the markers in red and no others.

<div class="gc-widget" data-widget="quantities"></div>

Three of the markers are the same number in Newton and still worth telling apart, because different code reads them at different times:

- **live** is what the directory published at the end of the last batch.
- **protected** is the same device scalar, seen from the storage's side as the floor a shrink may not cross. The storage borrows it; it never writes it.
- **execution** is the count consumed by the updater before the dependent kernels. The figure pauses between publication and that update to show the distinction. Newton places the update after reset publication in the same replay. A previous execution count is not permission to access a withdrawn tail.

**Admissible** is the directory's permission to place a world. **Ready** certifies accessible storage, not initialized values. **Mapped** records the physical backing. **Reserved** is the address range, fixed until release. Growth maps and grants access, then publishes readiness and admission. Initialization must complete before publishing a live world.

Deferred shrink first lowers admission and readiness in GPU stream order. The pages remain mapped until earlier readers complete; reclaim polls their completion and then unmaps. It introduces no CPU reader wait, but the unmap calls still take host time. The separate `resize_backing` path uses blocking maintenance. All future readers must obey the accepted smaller prefix.
