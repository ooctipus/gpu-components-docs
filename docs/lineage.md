---
id: lineage
title: Where the waits go
sidebar_position: 3
---

# Where the waits go

Stable addresses let us reuse the graph. GPU counts let it process a changing population. Neither makes memory maintenance free. The same safety rule applies to both shrink paths: no reader may access memory after it is unmapped.

<div class="gc-widget" data-widget="ladder"></div>

## Two different shrink paths

**Joined resize** waits for the supplied readers on the CPU, then changes backing and publishes readiness. It is simple and remains available.

**Deferred retirement** submits the withdrawal in GPU stream order and returns. Earlier readers finish while the CPU can submit other work. Reclaim polls completion and unmaps only when safe. This removes the explicit CPU reader wait; driver calls still take time and can affect concurrent work.

The current IsaacLab keyboard reset path calls `mujoco_worlds_grow_backing` for growth and blocking `mujoco_worlds_resize_backing` when shrinking. Newton and GPU Components also support deferred retirement; the task must explicitly choose it.

## What is not automatic

A background mapping thread is not part of these APIs. The composition owner still calls the memory service and names the reader streams. A warm pool is an application policy, not an automatic allocation of the whole budget at startup. Mapping one physical page into two prototype reservations is also not supported.

At a full budget, a receiver cannot reuse donor memory before the donor's old readers complete and its pages are returned. More overlap helps only when there is independent work or spare backing available. See [virtual and physical memory](concepts/memory.md) for the actual ownership rules and [Integration](integration.md) for the engine and task boundaries.
