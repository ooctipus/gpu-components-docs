---
id: fields
title: fields
sidebar_position: 2
---

# `fields`

Typed Data storage, fills, copies, indexed transfers and readiness.

| Operation | Effect |
|---|---|
| `allocate(capacity, protected_count, *, fields, backing, initial_ready_count)` | Typed slots; packed fields share one reservation, dense fields are separate arrays |
| `prepare_fill(storage, array, value)`, `fill(storage, array, value, *, count, start)` | Typed fill of slots `[start, count)`; the pattern is prepared before capture |
| `copy(storage, dst, src, *, count)`, `zero(storage, *, count, start)` | Prefix copy between disjoint fields; zero a slot suffix |
| `prepare_transfer(src, dst, field_names)`, `transfer(plan, src_idx, dst_idx, count)` | Indexed gather with on-device validation before any write |
| `map_backing(storage, rows)`, `publish_ready(storage, rows)`, `can_map_backing_without_join(...)` | Fresh-suffix growth can avoid a reader join; readiness published separately |
| `resize_backing(storage, rows, *, streams, protected_count_host)` | Joined grow or shrink with readiness publication |
| `prepare_retirement(storage)` | Prepare one reusable withdrawal record and private completion event |
| `withdraw_backing(retirement, rows, *, streams, prerequisite)` | Order a checked smaller ready prefix after prior readers; keep pages mapped |
| `reclaim_backing(retirement)` | Poll completion; unmap the suffix after acceptance, or return `False` while pending |
| `cancel_retirement(retirement)` | Poll and retain mappings; accepted smaller readiness stays in force |
| `validate_captured_operation`, `validate_memory_operations` | Check captured fills and copies against storage and count sources |
| `contiguous`, `byte_offset`, `span_bytes`, `pack`, `validate_layout`, `bind`, `validate_array`, `validate_disjoint_arrays` | Layout arithmetic and byte binding; no allocation |
| `lookup`, `retain_graph`, `retain_transfer_graph`, `memory_report`, `transfer_memory_report`, `close` | Lifetime and accounting |

## Records

`FieldSpec`, `FieldStorage`, `FieldView`, `FieldRetirement`, `FieldTransferPlan`, `StridedLayout`.

## Notes

`protected_count` is a contiguous int32 device array of shape `(1,)` that the storage borrows. In Newton it is the live world count. It constrains shrinking only; every operation receives its own count.

`ready_count` is published by the storage and read by kernels and by the graph updater. Contact and CCD storages in Newton expose it as the source for `naconmax` and `naccdmax`.

Withdrawal requires all reader streams, no concurrent submission while ordering the cut, and future access bounded by the accepted prefix. Host `ready_rows` is updated when reclaim or cancel observes completion. Pending retirement blocks other capacity mutations. Cancellation is refused after reclamation has begun; partial unmap errors retain remaining ownership for retry. Close joins outstanding readers before releasing retirement resources.
