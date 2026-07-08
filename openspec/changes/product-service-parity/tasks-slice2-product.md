# SUPERSEDED

This file used the earlier per-service (category-first) slicing, which bundled repository
extension and service return-shape reconciliation into one slice, and depended on
`tasks-slice1-category.md` (also superseded). The re-sliced design ("Slicing — LAYER-FIRST",
user-ratified 2026-07-08, design.md) splits this into a repository/DI foundation phase (SYNC,
cross-cutting) followed by per-service async return-shape slices. Replaced by
**`tasks-phase1-repo-di.md`** (Phase 1: WU1-4) for the `ProductRepository` extension + DI
repointing work (formerly this file's WU E + part of WU H); the service return-shape
reconciliation for `ProductOfflineService`/`ProductOnlineService` (formerly this file's WU F-H) is
now Phase 2, steps 6-8 (outlined, not yet detailed) in `tasks-phase1-repo-di.md`'s "Phase 2
(deferred)" section. Do not use this file for implementation.
