---
id: alternatives
title: Alternatives
sidebar_position: 2
---

# Alternatives

Four ways to lay out a batch whose set of worlds changes. The first three are played through three scenarios below, each starting from the same state; the counters are the cost of that one scenario.

1. **Padding + sleep**
2. **Homogeneous per prototype + resize at the Model level**
3. **Homogeneous per prototype + virtual memory**, this package
4. **A packed heterogeneous layout** with per-world offsets. This is another possible design, but would require the solver kernels to support different topologies within a batch; it is not the route illustrated here.

<div class="gc-widget" data-widget="compare"></div>

**Graph** means captured GPU work. **Host** means CPU work, including driver calls; it does not mean free or guaranteed overlap. **Join** marks an explicit CPU wait for GPU completion. The virtual-memory column shows a deferred-retirement scenario; joined resize remains available. The displayed counts are schematic operations, not measured timings or a claim that every padded or resizing implementation behaves this way.
