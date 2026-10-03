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

# Two world prototypes: 128 cartpole slots and 8 G1 slots.
worlds = directory.allocate((128, 8), id_capacity=256, command_capacity=32)
CARTPOLE, G1 = 0, 1

# One storage per prototype, each with its own Data layout. The prototype's live count is its protected prefix.
cartpole = fields.allocate(
    128, worlds.data.live_count[CARTPOLE:CARTPOLE + 1],
    fields=(FieldSpec("qpos", (2,), wp.float32), FieldSpec("qvel", (2,), wp.float32)),
)
g1 = fields.allocate(
    8, worlds.data.live_count[G1:G1 + 1],
    fields=(FieldSpec("qpos", (36,), wp.float32), FieldSpec("qvel", (35,), wp.float32)),
)

# Initialize every slot before admitting worlds into it.
for state in (cartpole, g1):
    for name in ("qpos", "qvel"):
        fields.prepare_fill(state, state.arrays[name], 0.0)
        fields.fill(state, state.arrays[name], 0.0, count=state.ready_count)

# Allow the directory to hand out all slots of both prototypes.
directory.publish_admissible_slots(worlds, (128, 8))
```

This yields a directory with two empty prototypes, two storages with every slot initialized, and permission to admit. A G1 row is about sixteen times a cartpole row, 284 versus 16 bytes here, which is why the two prototypes have separate storages and separate counts but share one directory. Without backing, all slots are ready immediately. The [tutorial](tutorial.md) creates worlds, binds a graph to the live count, and grows storage without re-capturing.
