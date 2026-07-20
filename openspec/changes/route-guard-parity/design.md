# Design: route-guard-parity

## Technical Approach

Two isolated, client-only routing fixes in `apps/web-store-pos/app`, mirroring Angular's LIVE guards. No data/schema/API impact. Both changes are confined to `auth/routes/loaders.ts` + `routes.ts` (+ one tiny new layout module + tests). `isUserAuthorized` and `sidebar.tsx` stay byte-for-byte unchanged.

## CRITICAL Code Finding (proposal missed this)

`adminFeatureLoader` (loaders.ts:70) and `resellerFeatureLoader` (loaders.ts:89) internally DELEGATE to `featureLoader(...)`. So adding the owner-admin bypass INSIDE `featureLoader` would LEAK the bypass into the admin/reseller feature loaders — letting an owner-admin reach `management/*` and `admin/owners*` WITHOUT a featureId, which BREAKS `AdminAuthGuard`/`ReSellerAuthGuard` parity (Angular requires the featureId there). The design must add the bypass to the plain path only, without leaking through the delegation chain.

## Architecture Decisions

### Decision 1 — Owner/super-admin bypass via extracted non-bypass gate

**Choice**: In `loaders.ts`, extract the CURRENT `featureLoader` body (auth + `isUserAuthorized`, NO bypass) into a private `featureGate(featureIds, storeIdParam?)`. Then `featureLoader` = auth check → `if (user.isSuperAdmin || user.isOwnerAdmin) return null;` (mirrors Angular `auth-guard.ts:44`, returns BEFORE feature/storeId/expiry logic) → else `featureGate(...)`. Retarget `adminFeatureLoader`/`resellerFeatureLoader`'s internal call from `featureLoader(...)` to `featureGate(...)` (one identifier each — behavior provably identical to today).

**Alternatives considered**:
| Option | Tradeoff | Verdict |
|---|---|---|
| Bypass inline in `featureLoader`, admin/reseller untouched | Bypass LEAKS into admin/reseller → parity break | Rejected |
| New `plainFeatureLoader` for the 22 plain routes; keep `featureLoader` non-bypass | admin/reseller byte-unchanged, but touches 22 route files; contradicts proposal's affected-files (loaders.ts+routes.ts only) | Rejected |
| Bypass in shared `isUserAuthorized` | Breaks sidebar parity (owner-admin sees every menu item) | Rejected (hard constraint) |
| Add `isRouteAuthorized` predicate | Extra exported symbol; no testability gain (featureLoader is already unit-tested as a factory) | Rejected |

**Rationale**: `featureGate` extraction confines ALL guard logic to `loaders.ts`, keeps the 22 plain-route modules AND `isUserAuthorized`/`sidebar.tsx` untouched, and keeps admin/reseller/superAdmin BEHAVIOR unchanged. The 1-token delegation retarget is REQUIRED to keep their behavior unchanged (prevents the leak). It also 1:1 mirrors Angular's two-layer structure (AuthGuard bypass layer over `isUserAuthorize`).

Side effect (intended, more-correct parity): an EXPIRED super/owner-admin now passes the plain guard (bypass precedes the expiry check), matching Angular `auth-guard.ts:44` which allows before any expiry check.

### Decision 2 — Public help/tutorial via a no-auth chrome layout

**Choice**: Create `shared/components/public-app-layout.tsx` = `export { default } from './app-layout';` (re-exports the AppLayout chrome ONLY, NOT its `clientLoader = authLoader`). In `routes.ts`, REMOVE `help/tutorial` from the authLoader-gated `app-layout` children and add a sibling top-level branch: `layout('shared/components/public-app-layout.tsx', { id: 'public-app-layout' }, [ route('help/tutorial', 'help/routes/tutorial.tsx') ])`.

**Alternatives considered**:
| Option | Tradeoff | Verdict |
|---|---|---|
| Hoist tutorial to a top-level standalone route (no chrome) | Loses sidebar/navbar; diverges from Angular `ClientLayoutComponent` | Rejected |
| Override child loader inside gated app-layout | RR7 always runs the parent layout loader; not exemptable | Impossible |

**Rationale**: Angular nests `help/tutorial` INSIDE `ClientLayoutComponent` (chrome) with NO `canActivate` (app-routing.module.ts:89-97) — i.e. chrome + public. Re-exporting AppLayout gives identical chrome with no auth. Verified null-user-safe: `navbar.tsx` uses `user?.login`/`user?.fullName`; `sidebar.tsx` short-circuits `if (!user) return false` (empty menu). RR7 needs distinct files/ids — the re-export file + `id` satisfy that.

Minor tradeoff: navigating between a gated route and the public tutorial now remounts the layout (sidebar collapse state resets). Cosmetic only.

## Data Flow

    plain route  → featureLoader → auth? → super||owner? →NULL(allow)
                                        └ else → featureGate → isUserAuthorized
    admin route  → adminLoader → featureGate → isUserAuthorized   (NO bypass)
    sidebar      → isUserAuthorized (unchanged, no bypass)
    help/tutorial→ public-app-layout (no authLoader) → TutorialPage

## File Changes

| File | Action | Description |
|---|---|---|
| `auth/routes/loaders.ts` | Modify | Extract `featureGate`; add super/owner bypass to `featureLoader`; retarget admin+reseller feature loaders to `featureGate` |
| `shared/components/public-app-layout.tsx` | Create | Re-export AppLayout chrome without `clientLoader` |
| `routes.ts` | Modify | Move `help/tutorial` out of gated app-layout into public layout branch |
| `shared/lib/auth/authorization-service.ts` | UNCHANGED | Hard constraint (shared with sidebar) |
| `shared/components/sidebar.tsx` | UNCHANGED | Regression target |
| `auth/routes/__tests__/loaders.test.ts` | Modify | Add bypass + leak-regression tests |
| `help/routes/__tests__/tutorial.test.tsx` | Modify | Replace obsolete `authLoader`-gate test with public-access test |
| `shared/lib/auth/__tests__/authorization-service.test.ts` | Modify | Assert owner-admin-no-feature stays `false` (sidebar regression) |

## Testing Strategy (strict TDD)

| Layer | Test | Assert |
|---|---|---|
| Unit | `featureLoader` owner-admin, `featureIds:[]` | returns `null` (NEW bypass) |
| Unit | `featureLoader` reseller w/o feature | still `denyAccess` (`/login`) |
| Unit | `featureLoader` store-user w/o feature | still `/login` |
| Unit | `adminFeatureLoader` owner-admin w/o feature | still `/login` (LEAK-REGRESSION — the critical one) |
| Unit | `resellerFeatureLoader` reseller w/o feature | still `/login` (unchanged) |
| Unit | `isUserAuthorized` owner-admin w/o feature | `false` (sidebar parity intact) |
| Unit | `public-app-layout` module | `clientLoader === undefined` (proves public) |
| Component | `TutorialPage` with null auth | renders content, no redirect |

## Migration / Rollout

No migration. Rollback = revert the two files + delete the new layout module.

## Open Questions

- [ ] None blocking. Layout remount on tutorial navigation accepted as cosmetic.
