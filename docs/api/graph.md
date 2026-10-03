---
id: graph
title: graph
sidebar_position: 4
---

# `graph`

Binding captured kernel nodes to device-resident counts.

| Operation | Effect |
|---|---|
| `prepare_updates(enable_count, *, enable_count_maximum, binding_capacity)` | Allocate an update table before capture; compiles the CUDA bridge once into a cache |
| `record_update(updates)` | Record the updater node; must precede every bound kernel |
| `launch(updates, kernel, dim, *, inputs, outputs, extent_axis, extent_source, parameters, tiled, ...)` | Stock-Warp path: validate, launch at capacity, return a binding |
| `adopt_launches(updates, graph, launches, *, count_sources, fixed, ...)` | Custom-Warp path: bind recorded `CountParameter` occurrences to device counts |
| `bind(updates, graph, bindings)` | Mark nodes device-updatable; irreversible; preparation remains pending |
| `instantiate_and_upload(updates, graph)` | Single instantiation, one upload, one synchronize; releases obligations |
| `capture_parallel(branches)` | Fork independent capture branches and join them |
| `current_capture`, `retain`, `invalidate`, `register_last_kernel_node`, `memory_report` | Capture ownership and the low-level fallback |

## Records

`GraphUpdateTable`, `GraphKernelBinding`, `KernelParameterBinding`.

## Notes

`adopt_launches` with `count_sources` is the canonical path when the custom Warp branch is available: MJWarp calls plain `wp.launch(kernel, dim=d.nworld, ...)`, Warp records the occurrence, Newton binds `d.nworld` to the live count. `graph.launch` is the path on released Warp. `register_last_kernel_node` is the low-level fallback for callers that own emission.

Device updates are reset by every upload or launch, so the updater must run on each replay. Host `cuGraphKernelNodeGetParams` never shows device updates. A graph containing device-updatable nodes cannot be inserted as a prebuilt child graph and cannot be instantiated twice.
