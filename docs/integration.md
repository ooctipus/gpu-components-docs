---
id: integration
title: Integration, from reset to physics
sidebar_label: Integration
sidebar_position: 7
---

import ResetExample from '@site/src/components/ResetExample';
import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Integration, from reset to physics

**When an environment resets into a different scene, three things change: its physics state, where that state is stored, and how many worlds each physics batch processes.**

We prepare each scene in advance. The rest of these docs use Cartpole and G1, or scenes built from bananas and Frankas. Each prepared scene is a *world prototype*. Worlds using the same prototype share a batch of physics arrays.

This page follows one reset using those same examples, then shows the [physics changes](#physics-code), [Newton's setup](#newton-setup) and [IsaacLab MDP code](#isaaclab-mdp). The scene diagrams explain the relationships; the code excerpts come from the working keyboard integration at the [published commits below](#source-snapshot).

## Follow one reset

Three environments, A, B and C, use the first scene. D uses the second. B resets into the second scene. Choose the same example as on the other pages, then compare before and after:

<Tabs groupId="scene" queryString="scene">
<TabItem value="cartpole" label="cartpole and G1" default>

<ResetExample scene="cartpole" />

</TabItem>
<TabItem value="franka" label="banana and Franka">

<ResetExample scene="franka" />

</TabItem>
</Tabs>

The physics arrays keep their starting virtual addresses. **B's new state lives in a different array; its address does change.** C may also move within the first array to fill the hole. C keeps its positions and velocities; B receives a fresh episode state.

This is why the task remembers an environment's world handle, rather than an array row. A handle is an integer identity plus a generation number. The generation changes when that world is replaced, so an old handle cannot accidentally read the new episode. A GPU lookup finds the current prototype and row.

Here is who does what:

- **IsaacLab** chooses B's new scene, computes its reset state, and produces actions, observations and rewards.
- **Newton** checks that there is room, initializes B's new world, preserves continuing worlds, and runs physics.
- **MJWarp** computes contacts, forces and motion for each batch.
- **GPU Components** manages the GPU memory and the lookup from a world handle to its current row.
- **Custom Warp** lets the recorded GPU operations use changing batch counts.

A *CUDA graph* is the recorded sequence of GPU operations. Here, the sequence stays recorded while the counts change from 3 and 1 worlds to 2 and 2.

## MJWarp and Warp: temporary arrays and world counts {#physics-code}

Two parts need to change for a physics step to run with a changing number of worlds: how it obtains temporary arrays, and how it decides how much work to launch.

### Reuse temporary arrays

*Scratch* means temporary working memory, such as an intermediate matrix used while solving a step. A numerical stage asks for an array where it needs it:

```python title="Ordinary allocation"
qDeriv = wp.empty((d.nworld, m.nC), dtype=float)
```

The shape means one row per world, with `m.nC` values in each row. The chosen model determines that row width. The integrated version adds a name so that setup can allocate the array in advance:

```python title="Current MJWarp forward.py"
from gpu_components.scratch import scratch_array

qDeriv = scratch_array(d.scratch, "implicit.qDeriv", (d.nworld, m.nC), float)
```

`scratch_array` belongs to GPU Components. During setup it records the requested name, shape and type. When Newton records the final physics step, it returns the array already assigned to that name. Replaying the graph uses that same array; Python does not run the request again.

For ordinary execution, `d.scratch` is `None` and the helper calls `wp.empty`. This choice is implemented once inside the helper. Stages do not need their own `if workspace is None` branches.

### Use the current count on each replay

The velocity update computes `velocity += timestep * acceleration`. Its launch has one thread per world and velocity coordinate (`m.nv`):

```python title="Current MJWarp forward.py"
wp.launch(
    _next_velocity, dim=(d.nworld, m.nv),
    inputs=[m.opt.timestep, d.qvel, qacc, 1.0], outputs=[d.qvel],
)
```

For an ordinary step, `d.nworld` is an integer. For a recorded, changing-size step, Newton passes `workspace.execution_data`, where `nworld` is a custom Warp `CountParameter`. It names a changeable count and states its maximum. GPU Components connects it to the GPU integer holding the current world count.

In the example above, the first scene's launch processes three worlds before reset and two afterward. An update operation reads the count and changes the recorded launch size before physics runs. This does not record a new graph.

Array shapes still describe their maximum reserved size. Copying the entire array would therefore be wrong. The custom Warp `extent` argument says how much to copy:

```python title="Current MJWarp forward.py"
wp.copy(d.qacc_warmstart, d.qacc, extent=(d.nworld, *d.qacc_warmstart.shape[1:]))
```

This saves the current worlds' accelerations for use in the next step. It leaves the remaining reserved rows alone. The original Data object keeps its integer capacities; the separate `execution_data` object supplies the changeable counts to the step.

## Newton: prepare the arrays and record the step {#newton-setup}

Newton's `MuJoCoWorlds` connects the pieces. For each prototype, it starts with a model and a one-world Data template, then:

1. **Finds the temporary arrays.** Record a step to collect its `scratch_array` requests, then discard that recording without running it.
2. **Allocates storage.** Put persistent physics fields and temporary fields in the appropriate world, contact or collision-work arrays.
3. **Connects the arrays to the step.** Match each scratch name to its allocated array and check the shapes, types and memory ownership.
4. **Records the final program.** Record reset work and physics, connect the changing counts to the recorded operations, then prepare the graph for replay.

Discovery happens at startup, not at each reset. The task first warms the kernels with an ordinary `mjw.step(model, warm)`.

<details>
<summary>The actual setup APIs, in order</summary>

These are shortened excerpts from Newton's `worlds.py`; field enumeration and memory allocation are omitted.

```python
# 1. Find scratch requests. The three count objects describe worlds,
#    contact-buffer entries, and CCD work-buffer entries.
registry, counts = mjw.discover_step_scratch(
    model, template,
    world_capacity=world_capacity,
    contact_capacity=contact_capacity,
    ccd_capacity=ccd_capacity,
)

# 2. Add scratch to the field lists used for allocation.
for count, specs in zip(counts, (world_fields, contact_fields, ccd_fields), strict=True):
    specs.extend(
        replace(spec, name="scratch." + spec.name)
        for spec in scratch_ops.column_specs(registry, count)
    )

# Allocate the arrays here. `columns` maps each scratch name to its array.

# 3. Connect all arrays before recording the final step.
scratch_ops.prepare(registry, columns)
bindings = mjw.StepBindings(
    world_storage, contact_storage, ccd_storage,
    fixed_arrays=plain_arrays,
)
workspace = mjw.make_step_workspace(
    model, data, bindings=bindings,
    scratch=registry, count_parameters=counts,
)
```

`workspace` holds references to the model, Data, counts and storage. It checks that these still match when recording. It does not allocate a second set of temporary arrays. The numerical call is still `mjw.step(model, workspace.execution_data)`.

The setup keeps the same three count objects throughout. A world count and a collision count remain different even if both happen to have a maximum of 4096. After capture, `bind_step_program` connects the recorded operations to their counts and verifies that count updates precede physics. Newton then instantiates and uploads the graph.

</details>

### Why are there three counts?

A physics step has several kinds of work. One count cannot describe all of them:

- **Worlds:** the number of live worlds in this prototype's batch. In the example, 3 becomes 2.
- **Contact-buffer entries:** how much contact-buffer space is safe to access. This can exceed the number of contacts produced in a step.
- **CCD work-buffer entries:** space for convex collision detection.

In code, world operations use `world_storage.protected_count`, which points to the directory's live count. Contact and CCD operations use their storage's `ready_count`, the number of usable rows. Actual contact totals have separate counters, such as `data.nacon`.

### What gets copied at reset?

For **B's new episode**, Newton copies the prototype's default physics state and applies the task's reset values. It makes the new world visible to later operations only after initialization succeeds. The code calls this *publication*.

For **continuing C**, Newton copies its existing physics state if it needs to move C to fill a hole. The code calls this *compaction*.

**Temporary scratch is not copied in either case.** Each numerical stage clears, copies or overwrites its temporary values before using them. Sharing storage with physics state does not make a temporary part of the episode state. The supported physics features still need checks that they write those values before reading them.

## When does GPU memory grow or shrink?

The example assumes there is already room for B in the second batch. When there is not, Newton must first make more memory usable. Reserving virtual addresses alone does not provide physical GPU memory.

`grow_backing` maps physical memory into more of the reserved address range. When all requested growth uses previously unmapped ranges, it avoids waiting on the CPU for existing readers; GPU stream ordering protects later use. The mapping and permission calls still take CPU time.

`resize_backing` can shrink storage. **In this published version, shrinking waits for conflicting GPU work before it unmaps memory.** The caller must account for every stream using that memory and prevent new work from racing with the change. Event-based deferred reclamation and a background mapping thread are not included in this branch.

Memory changes happen outside graph replay. The array's virtual starting address stays fixed, allowing the recorded operations to keep using it. This does not make memory unlimited: creating worlds still requires enough usable storage within the configured budget.

## IsaacLab: write the task terms {#isaaclab-mdp}

The working task in this branch uses a robot and keyboards of different sizes. The replacement works like the scene changes above. IsaacLab still owns the MDP: actions, observations, rewards, terminations and resets. The task-local selection API connects those terms to the current physics arrays.

### Choose the joints once

The configuration selects the robot's six joint coordinates and velocities:

```python title="so101_env_cfg.py — selected terms"
ROBOT_Q = NewtonSelectorCfg(JOINT_COORD, path=".*/Robot/joints/.*", count_per_world=6)
ROBOT_QD = NewtonSelectorCfg(JOINT_DOF, path=".*/Robot/joints/.*", count_per_world=6)

joint_pos = ObsTerm(func=mdp.joint_pos, params={"joints": ROBOT_Q})
joint_vel = ObsTerm(func=mdp.joint_vel, params={"joints": ROBOT_QD})
action = NewtonRelativeJointPositionActionCfg(
    asset_name=None, joints=ROBOT_Q, dofs=ROBOT_QD, scale=0.02,
)
abnormal_robot = DoneTerm(func=mdp.joint_vel_out_of_limit, params={"joints": ROBOT_QD})
```

Path matching happens once, before the managers are constructed. `selection_paths.py` converts the paths into numeric joint indices for each prototype. Physics reads and writes use those indices; they do not search strings at every step.

### Read observations and write actions

The observation functions are small:

```python title="mdp/observations.py"
def joint_pos(env, joints):
    return joints.read_state("joint_q")


def joint_vel(env, joints):
    return joints.read_state("joint_qd")
```

For each environment, the selection finds its current world and reads the selected joints. The same function works after a reset changes the prototype or compaction moves the state to a different row.

The action term uses the same lookup when writing control targets. These lines are inside its Warp kernel; `action` has already been scaled:

```python title="mdp/actions.py — target writes"
position = scalar_field_read(q, world, slot)
target = position
if scalar_field_active(qd, world, slot):
    target = position + action[world, slot]

scalar_field_write(target_q, world, slot, target)
scalar_field_write(target_qd, world, slot, 0.0)
scalar_field_write(force, world, slot, 0.0)
```

Here `world` is the task's environment index and `slot` is a selected joint. Neither is a cached physical array row. The field helpers perform that translation.

<details>
<summary>More MDP code: relative poses and joint-limit termination</summary>

For a term that combines several fields, pass them directly to a Warp kernel. This key-position observation selects one robot root and the keys, then computes their relative positions:

```python title="mdp/observations.py — key positions"
def key_positions_b(env, keys, root):
    require_same_world_domain(keys, root)
    require_count_per_world(root, 1)
    roots = root.pose_field("state", "body_q")
    key_poses = keys.pose_field("state", "body_q")
    positions = wp.empty(keys.dense_shape, dtype=wp.vec3, device=key_poses.sources.device)
    wp.launch(
        _relative_key_positions, keys.dense_shape,
        inputs=[roots, key_poses], outputs=[positions], device=positions.device,
    )
    return wp.to_torch(positions).flatten(1)
```

The kernel calls `pose_field_active` and `pose_field_read`, and writes zero for missing keys. The checks above require both selections to describe the same environments and exactly one root per environment.

The velocity-limit termination clears one output per environment, then runs:

```python title="mdp/terminations.py"
@wp.kernel
def _selected_velocity_limit_violation(velocity: Any, limits: Any, out: wp.array[int]):
    world, slot = wp.tid()
    if scalar_field_active(velocity, world, slot):
        if wp.abs(scalar_field_read(velocity, world, slot)) > scalar_field_read(limits, world, slot):
            wp.atomic_max(out, world, 1)
```

Several joints can flag the same environment, so the write is atomic. The manager returns the per-environment result as `wp.to_torch(self._out).bool()`.

</details>

### Keep missing keys out of the task

A 6-key world has six physical keys. The policy still receives 108 key positions, with the missing entries marked inactive. Key selections use `count_per_world=None, policy_width=108`; the selection map uses `-1` for a missing key.

Observations, target sampling and rewards must respect this mask. `dense_active()` provides it for tensor code; the field helpers check it inside Warp kernels. A body sleeping in the physics solver is still present in the episode and remains observable. A missing key is not.

### Request the reset

```python title="Existing task API"
# Equally sized device int64 tensors: environments to reset and their new variant IDs.
env.reset_keyboard(env_ids, variant_ids)
```

The reset saves final observations when requested, prepares the new poses and velocities, and sends replacement requests to Newton. Newton initializes the new worlds before the task resumes. The task then stores the returned handles and reads the new state on the next observation.

For periodic redistribution, `request_variants` records the desired keyboards and `stage_variant_changes` chooses which requests to apply at the boundary. Requesting a variant does not immediately move a live world.

<details>
<summary>How the reset reaches Newton</summary>

The typing command finishes a complete reset snapshot and calls:

```python
self._env.restore_reset_snapshot(ids, variants, payload)
```

That reaches `KeyboardWorlds.reset_from_snapshot`. Its `_submit` method builds requests, makes enough memory available, runs the recorded reset operations, checks their results, and updates the environment handles. New typing targets can be staged for IK during this process; ordinary task execution resumes only after the physical reset succeeds.

These are the request-building kernels. One new sequence number identifies the reset batch. The request count is assigned afresh:

```python title="keyboard_worlds.py"
@wp.kernel
def _begin_batch(commands: InstanceCommands, count: int):
    commands.sequence[0] += wp.uint64(1)
    commands.count[0] = count


@wp.kernel
def _reset_commands(
    commands: InstanceCommands,
    env_indices: wp.array[int],
    variants: wp.array[wp.int64],
    handles: wp.array[int],
    generations: wp.array[wp.uint64],
    create: int,
):
    request = wp.tid()
    env_index = env_indices[request]
    commands.operation[request] = int(InstanceOperation.REPLACE)
    commands.instance_id[request] = handles[env_index]
    commands.generation[request] = generations[env_index]
    commands.prototype[request] = int(variants[request])
    if create != 0:
        commands.operation[request] = int(InstanceOperation.CREATE)
```

The current generation ensures that the request refers to the world the task actually owns. If reset publication fails, the task stops rather than reading partially initialized state. `warp_on_torch_stream` orders the task's Torch and Warp work across these operations.

</details>

## Code to review {#source-snapshot}

These links describe the implementation on `codex/scratch-domain-fold`, not the newer design proposals:

- [IsaacLab: keyboard task](https://github.com/ooctipus/IsaacLab/tree/797565c9c9da7a8b3ca9a74b33d8a2f7e402ee52/source/isaaclab_tasks/isaaclab_tasks/contrib/keyboard) — configuration, selections, MDP terms and reset requests.
- [Newton: worlds.py](https://github.com/ooctipus/newton/blob/e66ed52db533b8a65635e4a61f79e4f8733d151f/newton/_src/solvers/mujoco/worlds.py) — prototype storage, reset ordering and graph construction.
- [MJWarp: forward.py](https://github.com/ooctipus/mujoco_warp/blob/be0072dd0f0bf43e9459757a854aa5957de971d6/mujoco_warp/_src/forward.py), [workspace.py](https://github.com/ooctipus/mujoco_warp/blob/be0072dd0f0bf43e9459757a854aa5957de971d6/mujoco_warp/_src/workspace.py), [step_program.py](https://github.com/ooctipus/mujoco_warp/blob/be0072dd0f0bf43e9459757a854aa5957de971d6/mujoco_warp/_src/step_program.py) — physics, scratch discovery and connection to the graph.
- [GPU Components: scratch.py](https://github.com/ooctipus/gpu-components/blob/338fa9b34f25ca60bc4a3713d79b1115baf68372/src/gpu_components/scratch.py) and [package source](https://github.com/ooctipus/gpu-components/tree/338fa9b34f25ca60bc4a3713d79b1115baf68372/src/gpu_components) — scratch requests, memory, world lookup and graph updates. This repository is private.
- [Custom Warp](https://github.com/ooctipus/warp/tree/c48d4e3bd0dc7e1efd5284cd36c558dc95436fda) — count parameters, bounded copies and capture records.

This integration uses the custom Warp branch and CUDA memory-pool support. The prepared MJWarp step currently supports the validated keyboard configuration: the Newton solver, implicit-fast integrator and MJWarp's own collision path. Other configurations are checked and may be rejected. Adding an unseen topology or changing the model layout requires new preparation.
