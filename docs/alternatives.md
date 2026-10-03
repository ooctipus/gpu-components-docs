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
4. ~~**Compact heterogeneous**~~, ruled out: per-world offsets fix the population at build time, so the distribution cannot shift

<div class="gc-widget" data-widget="compare"></div>

The tags are the ones used throughout these pages. **graph** runs inside the captured step and replays. **host** is a CPU driver call that does not wait for the GPU. **join** is the one place the CPU waits for the GPU before continuing. **waste** and **stall** mark the costs the other two designs pay.
