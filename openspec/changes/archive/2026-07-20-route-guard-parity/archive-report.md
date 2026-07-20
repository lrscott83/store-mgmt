# Archive Report — route-guard-parity (2026-07-20)

**Change**: route-guard-parity
**Mode**: Hybrid (Engram + openspec)
**Implementation commit**: 6db963a
**Verify verdict**: PASS (0 CRITICAL, 0 WARNING, 0 SUGGESTION)
**Adversarial code-only parity review**: PASS (vs Angular source, per orchestrator instruction; no separate Engram record — result reported inline by the orchestrator launching this archive)

## Engram Source Observations (traceability)

| Artifact | Observation ID | Topic key |
|---|---|---|
| Proposal | #1299 | `sdd/route-guard-parity/proposal` |
| Spec (delta) | #1300 | `sdd/route-guard-parity/spec` |
| Design | #1302 | `sdd/route-guard-parity/design` |
| Tasks | #1303 | `sdd/route-guard-parity/tasks` |
| Apply progress | #1306 | `sdd/route-guard-parity/apply-progress` |
| Verify report | #1307 | `sdd/route-guard-parity/verify-report` |

## Spec Sync

`openspec/specs/route-guard-authorization/spec.md` did not exist prior to this change. The
delta spec graduates to the canonical spec for the new `route-guard-authorization`
capability:

- Title normalized: "route-guard-authorization Capability Specification" →
  "Route Guard Authorization Specification" (Title Case convention, matches
  `sidebar-navigation`/`order-service` canonical specs).
- `## Requirements` and `## Non-Requirements (Explicit Exclusions)` headings were
  already canonical-style in the delta (no `## ADDED Requirements` prefix to strip) —
  carried over verbatim.
- All 4 requirements / 11 scenarios carried over verbatim (Owner-Admin/Super-Admin
  Bypass on Plain featureLoader, Sidebar Authorization Unaffected, Other Guard
  Loaders Unchanged, help/tutorial Is a Public Route).

## Delivered

Two isolated client-routing fixes in `frontend-react/apps/web-store-pos/app`:

1. `auth/routes/loaders.ts` — extracted non-bypass `featureGate` core; `featureLoader`
   now grants `isSuperAdmin || isOwnerAdmin` unconditional bypass before delegating to
   `featureGate`; `adminFeatureLoader`/`resellerFeatureLoader` retargeted to call
   `featureGate` directly (prevents bypass leak into admin/reseller guards).
2. `shared/components/public-app-layout.tsx` (new) — re-exports `AppLayout` chrome
   without `clientLoader`, so `help/tutorial` (moved in `routes.ts`) is reachable
   without authentication, matching Angular's un-guarded route.

`isUserAuthorized` (`shared/lib/auth/authorization-service.ts`) and `sidebar.tsx` are
byte-for-byte unchanged, confirmed via `git diff`.

Implementation commit `6db963a`. 22/22 tasks complete (6 RED, 6 GREEN across 2 parts +
3 final gate checks). Full suite 1836/1836 green, `tsc --noEmit` clean, production
build succeeds (confirmed a distinct `public-app-layout` chunk, proving the new
layout is wired into the route tree).

## Archive Contents

- proposal.md ✅
- specs/route-guard-authorization/spec.md ✅ (delta, as authored)
- design.md ✅
- tasks.md ✅ (22/22 complete)
- verify-report.md ✅ (PASS — reconstructed verbatim from Engram observation #1307;
  no verify-report.md existed on disk pre-archive, verify was Engram-only)
- archive-report.md ✅ (this file)

## Known Non-Blocking Follow-ups

None. Verify report recorded 0 CRITICAL / 0 WARNING / 0 SUGGESTION. Both ratified
deferred items (storeId-param sourcing ADR-2, offline/no-cache authLoader asymmetry)
remain untouched and out of scope for this change, as documented in the
Non-Requirements section of the canonical spec.

## SDD Cycle Complete

The change has been fully planned, implemented, verified (both `sdd-verify` and an
adversarial code-only parity review), and archived.

## Filesystem Note (orchestrator action required)

Per instruction, this archive sub-agent did NOT delete the source
`openspec/changes/route-guard-parity/` folder and did NOT run `git commit`. All 4
source artifacts (proposal.md, design.md, specs/route-guard-authorization/spec.md,
tasks.md) plus a reconstructed verify-report.md were **copied** (via Write) into
`openspec/changes/archive/2026-07-20-route-guard-parity/`, alongside this
archive-report.md. The canonical spec was also written to
`openspec/specs/route-guard-authorization/spec.md`.

The orchestrator MUST:
1. `git rm -r openspec/changes/route-guard-parity/` (delete the original, now-duplicated source folder).
2. `git add openspec/changes/archive/2026-07-20-route-guard-parity/ openspec/specs/route-guard-authorization/spec.md`.
3. Commit the archive as its own commit (docs(sdd): archive route-guard-parity ...).
