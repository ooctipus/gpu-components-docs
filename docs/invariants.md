---
id: invariants
title: Invariants
sidebar_position: 7
---

# Invariants

The tests check these and the docstrings refer to them. A change that violates one needs a stated reason.

| Invariant | Statement |
|---|---|
| Inverse pair | For a live handle, `handle_at(location(h)) = h`; for an occupied location, `location(handle_at(l)) = l` |
| Placement independence | Compaction changes placement and preserves identity and generation |
| Generation | Each publication of an identity advances its generation unless terminal; a terminal identity is retired and never reissued |
| Snapshot admission | Destinations come only from slots and identities free before the batch; no in-batch reuse |
| Eligible conflict | Only requests that validated OK conflict; two valid requests on one identity both reject |
| Acknowledged publication | A request publishes only after its destination is acknowledged; otherwise `INITIALIZATION_MISSING` |
| Idempotent replay | Equal sequence returns the prior outcome; a lower sequence denies advancement |
| Dense prefix | After `publish_compaction`, live slots of a prototype are exactly `[0, live_count)` |
| Conservation | live + free + unavailable = slot limit per prototype; mapped + spare = retained ≤ budget |
| Readiness order | ready ≤ mapped; readiness is published only after mapping and access succeed |
| Join asymmetry | Mapping never-mapped addresses needs no reader join; unmapping, remapping a historical address, overwriting or retiring needs every reader joined |
| Validate before emit | Under capture, validation precedes emission; after any possible partial emission the capture is invalid |
| Updater dependency | Every bound kernel node has a full-completion dependency path from the updater |
| Retained failure | A failed cleanup keeps surviving native resources in the ledger for retry |
