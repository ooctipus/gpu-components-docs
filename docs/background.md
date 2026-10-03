---
id: background
title: Background
sidebar_position: 8
---

# Background

The mechanisms here are established ones applied to GPU simulation. The directory is a slab allocator per prototype with versioned references; the version counter is the construction IBM System/370 used in compare-and-swap to prevent reuse errors, and the one NFS file handles use. The inverse table is an inverted page table over a dense id space. The batch protocol is snapshot isolation with sequence numbers as high-water marks. Backing follows the reserve-then-commit model of operating system virtual memory, with the budget as the commit charge. Readiness publication and the maintenance join correspond to RCU publication and grace periods. Compaction is stream compaction.

The GPU-resident control plane comes from the batch-simulation lineage: Madrona keeps entities as an identity plus a generation and allocates and frees them on the device, and its renderer linkage keeps a GPU-memory instance table sorted by world for the renderer. This package keeps that placement of the control plane and adds the transaction protocol, the never-wrapping generation, the byte budget and the count-driven graph.

LLM serving systems address a related problem, and this package adopts their memory practices: map pages before they are needed without waiting for readers, keep freed memory mapped as headroom, and reclaim based on completion events rather than by blocking. It does not adopt their CPU-side scheduler, because a physics step is a fraction of a millisecond and a host scheduler does not fit inside it. It also does not adopt padded-bucket graphs, because that approach exists for kernels that cannot be resized, and Warp kernels can be.
