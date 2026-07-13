# usage-tracker Capability Specification

**Capability**: usage-tracker — daily-usage tracking + retention cleanup
**Origin**: SDD change `usage-tracker-parity` (Slice 5, LAST of Fase 1 — auth cluster)
**Status**: Active
**Last Updated**: 2026-07-13

## Purpose
Define React `store-usage-tracker.ts` / `use-store-usage-tracker.ts`'s `cleanOldData` behavior so it mirrors Angular `StoreUsageTrackerService.cleanOldData` exactly: guard-inside-method authentication check, inclusive cutoff-date filtering, conditional write-back, and unconditional invocation once on mount with `daysToKeep=30`. Source of truth: `frontend/src/app/_services/usage-tracker/store-usage-tracker.service.ts:119-136` and `frontend/src/app/app.component.ts:53`. All 3 idiom decisions RATIFIED as mirror-Angular (obs #998); no open mark-and-ask.

## Capability Scope

### In Scope
- `cleanOldData(userId, selectedStoreId, daysToKeep)` exported from `store-usage-tracker.ts`, signature mirroring sibling `registerStoreActivity(userId, selectedStoreId)`.
- Auth guard (`isTrackingContextValid`) evaluated INSIDE `cleanOldData`, not at the call-site.
- Inclusive (`>=`) cutoff-date filter of `activeDays`, conditional write-back only when filtered length differs from original.
- Unconditional invocation of `cleanOldData(userId, selectedStoreId, 30)` once on mount, via a dedicated second `useEffect` inside `useStoreUsageTracker()`.

### Out of Scope (Non-Requirements)
- Rest of the tracker (already 1:1: `isTrackingContextValid`, `registerStoreActivity`, `flushUsage`, `startTracking`/`stopTracking` via pathname effect) — confirmed clean, not touched by this slice.
- Slices 1-4 of the Fase 1 auth cluster (storage keys, auth-http register, auth logout/getUserByToken, authorization-service expiry/role gates).
- Offline no-cache authLoader asymmetry (Slice 3, deferred with consensus, unrelated).
- Slice 4 storeId param micro-slice deferral.
- `help`/`tutorial` route guard gap (separate guards/routes-parity slice).
- `root.tsx` structural changes — the hook is already mounted there; no root-level change required by this slice.

## Requirements

### Requirement: cleanOldData Export and Signature
`store-usage-tracker.ts` MUST export `cleanOldData(userId: string, selectedStoreId: string, daysToKeep: number)`, mirroring the parameter-passing convention of the sibling `registerStoreActivity(userId, selectedStoreId)` (no dependency-injection lookup inside the function; caller supplies identity).

#### Scenario: Function exists with correct signature
- GIVEN the `store-usage-tracker.ts` module
- WHEN `cleanOldData` is imported
- THEN it is a function accepting `(userId, selectedStoreId, daysToKeep)` in that order

### Requirement: Auth Guard Lives Inside the Method
`cleanOldData` MUST no-op (return without reading or writing storage) when `isTrackingContextValid(userId, selectedStoreId)` is `false`. The guard MUST be evaluated inside `cleanOldData` itself, not pre-checked at any call-site, mirroring Angular's `if (!this.isUserAuthenticated()) return;` placement.

#### Scenario: Invalid tracking context no-ops
- GIVEN `userId` or `selectedStoreId` fails `isTrackingContextValid` (e.g. matches the empty-GUID sentinel)
- WHEN `cleanOldData(userId, selectedStoreId, daysToKeep)` is invoked
- THEN the function returns without reading or writing localStorage
- AND no error is thrown

#### Scenario: Valid tracking context proceeds
- GIVEN `userId` and `selectedStoreId` both pass `isTrackingContextValid`
- WHEN `cleanOldData(userId, selectedStoreId, daysToKeep)` is invoked
- THEN the function proceeds to read usage data and evaluate the prune algorithm

### Requirement: Inclusive Cutoff-Date Prune Algorithm
`cleanOldData` MUST compute `cutoffDate` as today minus `daysToKeep` days, and MUST keep only `activeDays` entries where `new Date(day.day) >= cutoffDate` (inclusive comparison). Storage key (`lizoft.store-daily-usage-{userId}`) and entry shape (`DailyUsage { day: 'YYYY-MM-DD', saved: boolean }`) MUST remain unchanged — no migration.

#### Scenario: Entry exactly at cutoff is kept
- GIVEN an `activeDays` entry whose `day` equals the computed `cutoffDate` (same calendar day)
- WHEN `cleanOldData` runs
- THEN that entry is retained in the filtered result (inclusive `>=`, not exclusive `>`)

#### Scenario: Entry older than cutoff is pruned
- GIVEN an `activeDays` entry whose `day` is strictly before the computed `cutoffDate`
- WHEN `cleanOldData` runs
- THEN that entry is removed from the filtered result

#### Scenario: Entry newer than cutoff is kept
- GIVEN an `activeDays` entry whose `day` is after the computed `cutoffDate`
- WHEN `cleanOldData` runs
- THEN that entry is retained

### Requirement: Conditional Write-Back Only
`cleanOldData` MUST write the filtered `activeDays` back to storage ONLY when the filtered array's length differs from the original array's length. When no entries are pruned, no storage write MUST occur.

#### Scenario: No entries pruned skips write
- GIVEN all `activeDays` entries pass the cutoff filter (filtered length equals original length)
- WHEN `cleanOldData` runs
- THEN no write to storage occurs

#### Scenario: Entries pruned triggers write
- GIVEN at least one `activeDays` entry fails the cutoff filter (filtered length differs from original length)
- WHEN `cleanOldData` runs
- THEN the filtered `activeDays` is written back to storage under the unchanged key/shape

### Requirement: Unconditional Invocation on Mount
`useStoreUsageTracker()` MUST invoke `cleanOldData(userId, selectedStoreId, 30)` unconditionally once on mount, via a dedicated `useEffect` (separate from the existing pathname-tracking effect), mirroring Angular's unconditional `cleanOldData(30)` call at `app.component.ts:53` (first statement of `ngOnInit`, executed regardless of authentication state at that instant — the guard lives inside `cleanOldData`, not at this call-site).

#### Scenario: Hook invokes cleanOldData once on mount
- GIVEN `useStoreUsageTracker()` is mounted (e.g. via `root.tsx`'s `App()`)
- WHEN the component mounts
- THEN `cleanOldData(userId, selectedStoreId, 30)` is called exactly once, unconditionally (not gated by a pre-check at the call-site)

#### Scenario: root.tsx requires no structural change
- GIVEN `root.tsx` already mounts `useStoreUsageTracker()`
- WHEN this slice ships
- THEN no change to `root.tsx` is required — the new effect is fully contained inside the hook

## Verification Criteria
1. `store-usage-tracker.ts` exports `cleanOldData(userId, selectedStoreId, daysToKeep)` with that exact parameter order.
2. `isTrackingContextValid(userId, selectedStoreId)` guard is evaluated INSIDE `cleanOldData`, not at any call-site.
3. When the tracking context is invalid, `cleanOldData` returns without reading or writing storage, and throws no error.
4. Cutoff date is computed as today minus `daysToKeep` days.
5. An `activeDays` entry with `day` exactly equal to the cutoff date is KEPT (inclusive `>=`).
6. An `activeDays` entry with `day` strictly before the cutoff date is PRUNED.
7. An `activeDays` entry with `day` after the cutoff date is KEPT.
8. No storage write occurs when the filtered length equals the original length.
9. A storage write occurs (with the filtered array) when the filtered length differs from the original length.
10. Storage key (`lizoft.store-daily-usage-{userId}`) and `DailyUsage` shape are unchanged by this slice.
11. `useStoreUsageTracker()` invokes `cleanOldData(userId, selectedStoreId, 30)` exactly once on mount, via a dedicated effect distinct from the pathname-tracking effect.
12. The mount invocation is unconditional (no pre-check gating the call before `cleanOldData` itself runs).
13. `root.tsx` requires no change — the hook is already mounted there.
14. No other file in the usage-tracker module (`isTrackingContextValid`, `registerStoreActivity`, `flushUsage`, pathname-tracking effect) is modified by this slice.
15. Test suite (strict TDD) is green: guard no-op, prune of old entries, inclusive boundary retention, and conditional-write behavior are all covered.

## Related Specifications

- **auth-authorization** (Slice 4 — session-scoped authorization checks; completed)
- **auth-session** (Slice 3 — logout/getUserByToken; completed)
- **auth-http** (Slice 2 — HTTP registration and login contract; completed)
- **storage-service** (Slice 1 — offline storage parity; completed)

## Implementation Status

- **cleanOldData export and signature**: ✓ Done (commit 927f60d, exports `cleanOldStoreUsage` per D1 naming convention)
- **Auth guard inside method**: ✓ Done (commit 927f60d, `isTrackingContextValid` first line)
- **Inclusive cutoff-date prune algorithm**: ✓ Done (commit 927f60d, `new Date(day.day) >= cutoffDate`)
- **Conditional write-back only**: ✓ Done (commit 927f60d, no-op write when `filtered.length === original.length`)
- **Unconditional mount invocation**: ✓ Done (commit 927f60d, dedicated `useEffect(..., [])` in hook)
- **Tests**: ✓ Done (21 focused tests green, 1596/1596 full suite passing, tsc clean, build successful)
- **Verification**: ✓ Done (all 15 Verification Criteria confirmed, verify PASS, Slice 5/5 CLOSES Fase 1)

## Notes

- This specification captures Slice 5 of Fase 1 auth cluster (LAST slice) and CLOSES the entire auth cluster.
- All 3 parity idiom decisions ratified as mirror-Angular (obs #998); no open decisions remain.
- Sourced from Angular `store-usage-tracker.service.ts:119-136` and `app.component.ts:53` only; no live API validation performed.
- Related capabilities: All prior Fase 1 slices (1-4) shipped and verified; this slice completes the cluster.
- Single-commit delivery: all tasks shipped together in commit 927f60d on feat/frontend-parity-audit (no PRs, no chaining).
- D1 naming: export is `cleanOldStoreUsage` (not bare `cleanOldData`) to mirror sibling `registerStoreActivity` module-scoped naming convention.
- D2 mount-once behavior: `[]` dependency array (NOT `[userId, selectedStoreId]`) to mirror Angular's single ngOnInit invocation with no mid-session re-runs.
- D3 auth freshness: read via `useAuthStore.getState()` inside the effect to ensure post-commit freshness and avoid stale closures.
