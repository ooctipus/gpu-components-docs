---
id: handles
title: Handle and location
sidebar_position: 1
---

# Handle and location

Two pairs describe a world, and the directory translates between them.

- **Handle** `(identity, generation)`: the world's name. Never changes while the world lives; never matches again once it is gone.
- **Location** `(prototype, slot)`: where its bytes are, the prototype index and the slot inside that prototype's partition. Compaction can change a live world's location. REPLACE ends that lifetime and publishes a new one.
- **Lookups**, one in each direction. Failure returns `valid = False` with sentinel values.

  ```text
  location(data, identity, generation)  →  (prototype, slot, valid)
  handle_at(data, prototype, slot)      →  (identity, generation, valid)
  ```

The scene below is the one from the [Four parts](../structure.md) walkthrough: identities 0 to 5 in cartpole slots 0 to 5, identities 6 and 7 in G1 slots 0 and 1, all at generation 1.

<div class="gc-widget" data-widget="handles"></div>

Three rules make this safe to cache.

- **A lookup checks both tables.** `location(data, id, generation)` reads the forward table, compares the generation, then confirms the inverse table at that slot names the same identity. Any mismatch returns `valid = False`, never another world's state. `handle_at(data, prototype, slot)` goes the other way. Both are `wp.func`s, so a kernel holding a handle finds its world index without a host round trip.
- **Compaction moves slots, not handles.** After `publish_compaction` every live handle resolves to its new slot with the same identity and generation. Code that cached `(8, 1)` keeps working; code that cached "slot 6" does not, which is why slots are never the thing to hold.
- **Identities can be reused; handles cannot.** Publication advances the generation except for a terminal DESTROY at the maximum value. A dead identity below that maximum can be reused by a later batch; a terminal identity is permanently retired. No generation wraps or gets reissued for another lifetime.

The IsaacLab task keeps the environment-to-handle mapping. Newton and GPU Components operate on numeric handles and locations; they do not need learning environment ids.
