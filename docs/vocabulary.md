---
id: vocabulary
title: Vocabulary
sidebar_position: 2
---

# Vocabulary

The package is generic: it manages *instances* in *slots* with *fields*. In the Newton integration the instances are worlds, contacts, and collision candidates. This document uses worlds throughout, and uses Newton and MuJoCo Warp names wherever one exists. Each term is defined once here.

## Simulation terms, as Newton and MuJoCo Warp use them

| Newton / MJWarp term | Meaning | Name inside this package |
|---|---|---|
| **Model** | the static description of a scene: bodies, joints, geoms, actuators; `mjw.Model` | not represented; belongs to the engine |
| **Data** | the time-varying state of all worlds: `d.qpos`, `d.qvel`, contacts; every array has a leading world axis | the **fields** of a storage |
| **world** | one independent copy of the Model's state, stepping in the batch; index along the leading axis of every Data array | an **instance** occupying a **slot** |
| **`nworld`** | number of worlds in the batch; in MJWarp a Python integer, in the dynamic integration a `CountParameter` bound to a device scalar | a **count**: `live_count` or `protected_count` |
| **world prototype** | a Model and its Data layout that many worlds share; cartpole and G1 are two prototypes, and Newton's dynamic worlds keep one per distinct scene variant, for example 19 keyboard variants | a **prototype**: one partition of slots whose instances share the same fields |
| **asset prototype** | the description of one asset, a URDF or MJCF file plus its meshes; the G1 world prototype is assembled from the G1 asset prototype plus a ground plane | not represented; the package never sees assets |
| **environment** (IsaacLab) | the learning-side view of one world: observations, rewards, resets | not represented; the engine maps environments to handles |
| **capture, graph, replay** | recording the GPU step once and launching the recording each step; `wp.ScopedCapture`, `wp.capture_launch` | the **graph** module binds nodes of that recording to counts |
| **reset** | ending an episode and preparing the next; in dynamic worlds, destroying or replacing a world | a **batch** of `DESTROY`, `REPLACE` and `CREATE` requests |

## Terms this package adds

| Term | Meaning | In the cartpole example |
|---|---|---|
| **identity** | a number naming one world for its whole life, never reused for another live world | world id 7 |
| **generation** | a counter attached to an identity that increases every time the identity is published; a reference carries the generation it saw | id 7, generation 3 |
| **handle** | identity plus generation; the stable reference callers keep. Newton maps an environment id to a handle | `(7, 3)` |
| **slot** or **row** | one position in a prototype's partition; the world index inside that prototype's Data arrays. A cartpole slot and a G1 slot are different sizes, because their Data rows are | `d_cartpole.qpos[2, :]` is cartpole slot 2 |
| **location** | prototype plus slot; where a world's state is right now | cartpole prototype, slot 2 |
| **live** | an identity that currently occupies a slot | worlds 0, 1, 3, 4, 6, 7 after two episodes end |
| **free** | a slot with no world that the directory may hand out | slots 2 and 5 |
| **admissible** | a slot the directory has been told it may use at all; slots above the admissible prefix are off limits even when free | slots 0 to 7 after `publish_admissible_slots` |
| **reserved** | virtual address space set aside for a slot, with no physical memory behind it | slots 8 to 4095 of a 4096-slot reservation |
| **mapped** | a slot whose bytes have physical pages behind them | slots 0 to 7 |
| **ready** | a mapped slot that has been published as safe for kernels to touch | slots 0 to 7 |
| **protected** | a prefix of slots that may not be unmapped; in Newton this is the live world count | slots 0 to 7 while any is live |
| **count** | a number of slots to process, held in device memory so no host readback is needed | `live_count = 6` |
| **publish** | make a device-side fact visible to later work: a new live set, a new ready prefix, a new admissible prefix | `publish` after a batch; `publish_ready` after mapping |
| **join** | wait for every stream that might still be reading something before changing it | before unmapping slots 8 to 15 |
| **batch** | a group of create, replace and destroy requests handled together under one sequence number | "destroy worlds 2 and 5, create one" |
| **compaction** | moving live worlds into the lowest slots so a kernel can run over the prefix `[0, live_count)` | moving world 7 from slot 7 into slot 2 |

## Two words to keep apart

**World prototype** and **asset prototype** are different levels. An asset prototype is the G1's MJCF. A world prototype is a complete scene variant, built from asset prototypes, with its own Model and Data layout: the G1 standing on a plane is one world prototype; the G1 on stairs would be another, even though the asset is the same. The directory partitions slots by world prototype. Nothing in this package refers to assets.

**World index** and **identity** are different things. The world index is where a world's state is stored right now and can change under compaction. The identity names the world and never changes. Kernels iterate world indices; callers hold identities.
