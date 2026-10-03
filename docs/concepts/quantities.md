---
id: quantities
title: Seven distinct quantities
sidebar_position: 2
---

# Seven distinct quantities

The following quantities are tracked separately and written by different operations. Treating one as another is the usual source of errors in dynamic GPU memory.

```
world index →  0        live       admissible   ready        mapped       reserved
               |----------|-----------|------------|------------|------------|
               |  live    |  free     | not yet    | mapped,    | virtual    |
               |  worlds  |  slots the| admissible | not yet    | addresses  |
               |          |  directory| (needs     | published  | without    |
               |          |  may hand | publish_   | as ready   | physical   |
               |          |  out      | admissible)| (headroom) | pages      |
               |----------|-----------|------------|------------|------------|
                          ↑ protected_count: slots that must not be unmapped
               ↑ execution count: the slots a kernel iterates in this replay
```

| Quantity | Module | Written by | In Newton |
|---|---|---|---|
| reserved | backing | `reserve` | the maximum `nworld` a prototype may ever reach |
| mapped | backing | `map`, `unmap` | pages behind the worlds in use |
| ready | fields | `publish_ready`, `resize_backing` | `ready_count`, the source for contact and CCD capacities |
| protected | consumer | a device int32 that the storage borrows | the live world count |
| admissible | directory | `publish_admissible_slots`, `withdraw_admissible_slots` | slots the reset path may fill |
| live | directory | `publish`, `publish_compaction` | `live_count`, the `nworld` the step kernels follow |
| execution count | consumer | any device int32 bound to a graph node | the `CountParameter` bound to each MJWarp launch |

<div class="gc-widget" data-widget="backing"></div>
<div class="gc-fallback">

![Granules are mapped one at a time and the ready marker follows each successful mapping](/img/backing.svg)

</div>

Mapping bytes does not make slots ready. Readiness does not make slots live. Liveness does not initialize them. Each transition is an explicit operation. This is what allows storage to grow while a captured graph is replaying.
