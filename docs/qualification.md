---
id: qualification
title: Qualification
sidebar_position: 9
---

# Qualification

```bash
uv sync
CUDA_VISIBLE_DEVICES='' uv run pytest -q          # CPU: directory kernels run on Warp CPU; fields and graph use fakes
uv run tools/qualify_stock.py dist/*.whl .venv-stock --cuda   # shared contracts on released Warp 1.17, GPU 1
```

The CPU suite covers host bookkeeping and the directory's relations. It does not execute the field slot kernels or the native bridge; those need a CUDA device. The stock qualification installs the built wheel against released Warp with no fork and fails if any shared test is skipped. Features that depend on the custom Warp capture branch, count operands and recorded memory extents, have their own test suites and are not claimed on released Warp.

The [tutorial](tutorial.md) was run end to end on an RTX 5090 with released Warp 1.17.0 and CUDA driver 13.0: batch creation, ten queued replays with zero updater errors, in-graph growth to 24 worlds, fresh mapping to 131072 slots, a joined shrink, four destroys, a four-move compaction, and teardown.

Requirements: Linux, and a CUDA 12.4 or newer driver for device-updatable graph nodes. The bridge compiles with `nvcc` on first use into Warp's kernel cache. `GPU_COMPONENTS_CUDA_GRAPH_LIBRARY` selects a prebuilt library instead.
