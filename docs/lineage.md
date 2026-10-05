---
id: lineage
title: Where the waits go
sidebar_position: 3
hide_table_of_contents: true
---

import WaitTimeline from '@site/src/components/WaitTimeline';

# Where the waits go

Follow one world resetting into a different scene. Add each mechanism to see what moves onto the GPU, which CPU waits disappear, and where the physical memory goes.

<WaitTimeline />

## What the animation represents

**One graph, independent branches.** Reset and count updates happen before the prototype physics branches split. The branches join before the replay finishes. They are not separate executable graphs or dedicated CUDA streams. Each branch still runs its physics substeps in order.

The earlier stages are teaching baselines, not a reconstruction of past benchmark runs. Mapping, permission setup and unmapping remain CPU driver calls. Overlap is possible where dependencies permit it; the animation does not predict duration, GPU occupancy or speedup.

## What runs today

Newton and GPU Components provide all six mechanisms. The current IsaacLab keyboard task uses fresh growth and **blocking shrink**: `mujoco_worlds_grow_backing` and `mujoco_worlds_resize_backing`. It has not selected the deferred shrink policy shown in step 6. The task also retains its reset-demand and status readbacks.

The application calls the memory service and supplies its reader streams. There is no automatic background mapping thread. Pooled memory stays inside the physical budget; a page cannot back two prototypes at once. Newton allows only one pending retirement batch and completes it before further growth.

See [virtual and physical memory](concepts/memory.md) for ownership rules and [Integration](integration.md) for the actual engine and task code.
