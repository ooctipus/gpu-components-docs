---
id: directory
title: directory
sidebar_position: 1
---

# `directory`

Identity and placement of worlds. All operands are explicit records. Costs use I = identity capacity, C = command capacity, S = total slots, P = prototypes.

| Operation | Effect | Cost |
|---|---|---|
| `allocate(slot_limits, *, id_capacity, command_capacity, device)` | Empty directory; no slots admissible | O(I + S + C + P) |
| `allocate_commands(capacity, *, device)` / `allocate_results(...)` | Caller-owned batch buffers | O(C) |
| `begin(directory, commands)` | Validate handles, prototypes, sequence; enter VALIDATED | O(I + C + P) |
| `admit(directory, commands)` | Assign ids and slots from the pre-batch free set; enter ADMITTED | O(C + P) |
| `publish(directory, commands, results)` | Commit acknowledged requests, advance generations, rebuild relations; return to IDLE | O(I + S + C + P) |
| `plan_compaction(directory)` | Plan minimal moves into the dense prefix; enter MOVING | O(S + P) |
| `publish_compaction(directory)` | Apply moves once every copy is acknowledged | O(S + P) |
| `publish_admissible_slots(directory, prefix_ends)` | Make `[0, end)` admissible per prototype; stream-ordered, no readback | O(S + P) |
| `withdraw_admissible_slots(directory, prefix_ends)` | Withdraw a free tail; rejects a live tail; joined | O(S + P) |
| `location(data, id, generation)`, `handle_at(data, prototype, slot)` | `wp.func` lookups for use in kernels | O(1) |
| `retain_graph`, `validate_buffers`, `memory_report`, `close` | Lifetime and accounting | |

## Records

`InstanceDirectory`, `InstanceDirectoryData` (read-only relations), `InstanceCommands`, `InstanceResults`, `InstanceBatchResult`, `InstanceTransaction`, `InstanceCompaction`.

## Enums

`InstanceOperation`: `NOOP`, `CREATE`, `REPLACE`, `DESTROY`.

`InstanceStatus`: `OK`, `INVALID`, `STALE`, `NOT_ALIVE`, `BAD_PROTOTYPE`, `CONFLICT`, `NO_IDS`, `NO_SLOTS`, `GENERATION_EXHAUSTED`, `BAD_COUNT`, `STALE_BATCH`, `INITIALIZATION_MISSING`, `COMPACTION_INVALID`, `PHASE_INVALID`.

`InstancePhase`: `IDLE`, `VALIDATED`, `ADMITTED`, `MOVING`, `COPIED`.
