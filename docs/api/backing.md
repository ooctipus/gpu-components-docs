---
id: backing
title: backing
sidebar_position: 3
---

# `backing`

Virtual reservations, physical pages and a byte budget. Standard library and `libcuda` only.

| Operation | Effect |
|---|---|
| `prepare(budget_bytes, *, device_ordinal, expected_uuid)` | Bind the current CUDA context and an empty byte ledger |
| `reserve(backing, nbytes)` | Virtual address only; no budget consumed |
| `map(backing, reservation, offset, nbytes)`, `unmap(...)` | Page-aligned physical mapping with budget check and rollback |
| `can_map_without_join(...)` | True if the range lies beyond every address ever mapped |
| `maintenance(backing, *, streams, events, wait=True)` | Wait for dependencies; with `wait=False`, poll recorded events and yield `None` while incomplete |
| `record_event(backing, event, *, stream)`, `wait_event(backing, stream, event)` | Checked driver submissions; borrow handles without a CPU join |
| `acquire_reference`, `release_reference`, `release_reservation` | Keep a reservation alive while views or graphs refer to it |
| `trim(backing, *, keep_bytes)`, `mapped_ranges(...)`, `memory_report(...)`, `close(...)` | Pool and accounting |

## Records

`MemoryBacking`, `VirtualReservation`.

## Notes

A page is one unit of the allocation granularity queried from CUDA; the figures use 2 MiB as an example. All offsets and sizes are page aligned. `prepare` creates no physical handles. Mapping takes handles from the pool first and creates more within budget if needed. `trim` releases spares above a retained reserve inside authorized maintenance.

Mapping a never-mapped range needs no reader join. Unmapping, or remapping any address below the reservation's historical high-water mark, requires an active maintenance scope. Mapping history survives rollback.

Nonblocking maintenance requires privately retained, recorded completion events and exclusion of future conflicting access. It introduces no CPU reader wait. Driver unmap, map and access calls still cost time; an event being complete does not make their cost zero.
