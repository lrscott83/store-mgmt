# SUPERSEDED

This file used the earlier per-service (category-first) slicing, which bundled repository
extraction and service return-shape reconciliation into one slice. The re-sliced design
("Slicing — LAYER-FIRST", user-ratified 2026-07-08, design.md) splits this into a
repository/DI foundation phase (SYNC, cross-cutting) followed by per-service async return-shape
slices. Replaced by **`tasks-phase1-repo-di.md`** (Phase 1: WU1-4) for the repository/DI work; the
service return-shape reconciliation for `ProductCategoryOfflineService` (formerly this file's
WU C-D) is now Phase 2, step 5 (outlined, not yet detailed) in `tasks-phase1-repo-di.md`'s "Phase 2
(deferred)" section. Do not use this file for implementation.
