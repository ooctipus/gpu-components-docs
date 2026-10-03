---
id: memory
title: Virtual and physical memory
sidebar_position: 2
---

# Virtual and physical memory

Three layers are easy to confuse when a batch's worlds come and go. Each is handled in a different place, and only one of them changes at launch time.

| Layer | What varies | Who resolves it | When |
|---|---|---|---|
| **Occupancy**: which slots hold a live world | slots 0, 1, 3, 4, 6, 9 may be live while 2, 5, 7, 8 are free | the directory, and either compaction or an indirect index inside the kernel | at reset and compaction |
| **Virtual address**: where slot *i* is | nothing; slot *i* is always `base + i × stride` | fixed at allocation | never |
| **Physical pages**: which 2 MiB granule backs each part of the range | granules are pooled and not contiguous | the GPU memory management unit, through page tables set by `cuMemMap` | on every memory access, in hardware |

A kernel launched over indices 0 to `live_count − 1` reads slots 0 to `live_count − 1`. It does not know which slots are live, and nothing translates its indices at launch; the only launch-time change is the count itself. If a live world sits at slot 9 while `live_count` is 6, the kernel skips it. Compaction moves the data so the live worlds occupy the lowest slots; alternatively a kernel can read `live_slots[i]` to find its slot, which is a per-element indirection in the kernel body. Virtual-to-physical translation is a separate matter entirely: the kernel only ever sees virtual addresses, and the hardware resolves them to whichever granule is mapped there.

The rest of this page is about the second and third layers.

**Virtual address space** is reserved once per `FieldStorage`, as one contiguous range of `capacity × row_stride` bytes rounded up to the driver granule. It never moves and never grows. Slot *i* of a field is always at `base + i × row_stride`, from the first allocation until close. This is what makes growth compatible with captured graphs: a kernel node captured with a pointer into the storage keeps a valid pointer as the population grows, because the pointer was into the reservation, not into whatever happened to be mapped. On current GPUs a process can reserve on the order of 2^47 bytes, so reserving the maximum `nworld` a prototype may ever reach costs nothing physical.

**Physical memory** is a pool of granule handles, 2 MiB each on current drivers, created with `cuMemCreate` and mapped into virtual granules with `cuMemMap`. Handles are discrete and interchangeable. A handle freed when the G1 storage shrinks can later back a cartpole granule. The physical pages behind one storage need not be contiguous and usually are not. The byte budget counts handles, mapped or spare, and nothing else.

```mermaid
flowchart TB
    subgraph V["virtual: contiguous per storage, fixed"]
        direction LR
        v0["v0"] --- v1["v1"] --- v2["v2"] --- v3["v3 (not mapped)"]
    end
    subgraph P["physical: pooled 2 MiB handles, budget-counted"]
        direction LR
        h7["#7"] ~~~ h2["#2"] ~~~ h9["#9"] ~~~ h4["#4 spare"]
    end
    h7 --> v0
    h2 --> v1
    h9 --> v2
```

<div class="gc-widget" data-widget="memory"></div>

The figure keeps the two layers apart. Grow a storage and a handle is drawn from the pool, created if the pool has none and the budget allows, and mapped into the next virtual granule. Shrink one and its last handle returns to the spare pool, still counted until `trim` releases it. The virtual bars never change.

## What follows from the split

| Fact | Consequence |
|---|---|
| Virtual range is fixed | Field arrays, bound views and captured kernel nodes hold stable pointers across growth and shrink |
| Mapping is per granule | Readiness rounds to granules; a 4096-slot cartpole storage at 16 bytes per slot is one granule and is entirely ready at once |
| Handles are pooled | Oscillating populations reuse handles without touching the driver; `trim` is the only release |
| Budget counts handles | A G1 storage at 284 bytes per slot consumes a granule every 7,384 slots; a cartpole storage every 131,072. The same budget holds about sixteen times fewer G1 worlds |
| Virtual is cheap | Reserve for the maximum; there is no reason to size a reservation to the current population |

## What the package does not do

It does not move a reservation. If a storage needs more slots than were reserved, that is a new storage, not a resize; the design treats reservation as a decision made once. It does not share a physical handle between two virtual ranges, so there is no aliasing of one page from two storages. And it does not make a mapped page accessible by itself: `cuMemSetAccess` is a separate step, and the ledger records whether each granule's access was granted, so a failure between map and access is rolled back rather than published.
