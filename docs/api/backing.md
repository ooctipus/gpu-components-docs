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
| `maintenance(backing, *, streams, events)` | Context manager: synchronize readers, then permit unmap, remap, trim, close |
| `acquire_reference`, `release_reference`, `release_reservation` | Keep a reservation alive while views or graphs refer to it |
| `trim(backing, *, keep_bytes)`, `mapped_ranges(...)`, `memory_report(...)`, `close(...)` | Pool and accounting |

## Records

`MemoryBacking`, `VirtualReservation`.

## Notes

A page is one unit of the driver's allocation granularity, 2 MiB on current hardware. All offsets and sizes are page aligned. Physical handles are pooled and reused across reservations; `trim` releases spares above a retained reserve.

Mapping a never-mapped range needs no reader join. Unmapping, or remapping any address below the reservation's historical high-water mark, requires an active maintenance scope. Mapping history survives rollback.
