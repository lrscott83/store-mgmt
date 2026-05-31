# Design: phase4-sync — Synchronization (Export / Import)

**Change:** phase4-sync
**Phase:** Design
**Status:** Done (REVISED — Angular interop DROPPED)
**Date:** 2026-05-31
**Mode:** Hybrid (engram + openspec file)

---

## Summary

Greenfield `app/sync/` slice with two service classes (DataSerializerService + DataSynchronizerService), two route containers (export/import), two presentational forms, and full WebCrypto AES-GCM encryption. All 6 entities serialized into a single `sync-data.json` envelope (fflate ZIP + PBKDF2 key derivation + 210k iterations).

Export/import are React-only (no Angular interop). Merge is non-destructive upsert by id, with categories processed before products (referential integrity). All 402 tests pass (baseline 353), tsc clean, build success with both sync routes in bundle.

Warnings resolved: W-1 (spec SYNC-3 reconciled to single-envelope); W-2 (act() warnings fixed); S-1 (zip member test added).
