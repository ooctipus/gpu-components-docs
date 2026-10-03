---
id: quickstart
title: Quickstart
sidebar_position: 4
---

# Quickstart

```python
import warp as wp
from gpu_components import directory, fields
from gpu_components.field_data import FieldSpec

wp.init()

# One world prototype with 128 slots.
worlds = directory.allocate((128,), id_capacity=256, command_capacity=32)

# Two Data arrays for that prototype. The live world count doubles as the protected prefix.
state = fields.allocate(
    128,
    worlds.data.live_count[0:1],
    fields=(FieldSpec("qpos", (4,), wp.float32), FieldSpec("qvel", (4,), wp.float32)),
)

# Initialize every slot before admitting worlds into it.
for name in ("qpos", "qvel"):
    fields.prepare_fill(state, state.arrays[name], 0.0)
    fields.fill(state, state.arrays[name], 0.0, count=state.ready_count)

# Allow the directory to hand out slots 0..127.
directory.publish_admissible_slots(worlds, (128,))
```

This yields a directory with no live worlds, storage with every slot initialized, and permission to admit. Without backing, all slots are ready immediately. The [tutorial](tutorial.md) creates worlds, binds a graph to the live count, and grows storage without re-capturing.
