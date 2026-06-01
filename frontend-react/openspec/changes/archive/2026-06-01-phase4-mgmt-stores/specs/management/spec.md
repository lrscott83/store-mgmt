# Spec: phase4-mgmt-stores (Stores sub-domain)

**Change:** phase4-mgmt-stores
**Phase:** Spec
**Status:** Done
**Date:** 2026-05-31
**Mode:** Hybrid (engram + openspec file)

---

## Scope Statement

Implement the Stores sub-domain of the Management slice in the React 19 POS PWA. Three routes
(`/management/stores`, `/management/stores/create`, `/management/stores/edit/:id`) are registered
and guarded by a new `adminFeatureLoader([EFeatures.Stores])` composed from the existing
`adminLoader` (role) and `featureLoader` (feature 73). Access requires an authenticated user who is
super-admin or owner-admin AND has `EFeatures.Stores` assigned.

A container/presentational split mirrors the profile/sync precedent. Containers own loaders, HTTP
calls, online/offline gating, and navigation. `StoreList` and `StoreForm` (shared create/edit) are
presentational. A new `storeHttpService` wraps all backend contracts over the shared `apiClient`.
Store create/edit includes a module picker (catalog fetched from `GET /modules/ToStore`).

Offline policy: list reads from a `BaseRepository<Store>` localStorage cache when the network is
unavailable; all writes (create, update, lifecycle actions) are blocked with an error when offline.
No offline queue exists for this change.

All user-visible copy is in Spanish via react-intl with `STORES.*` and `MANAGEMENT.*` keys in
`es.ts`. No backend changes are required. Users and Configurations sub-slices are out of scope.

---

## Requirements

81 requirements organized across 17 domains: ACCESS (6), ROUTE (4), HTTP (11), LIST (6), CREATE (6),
EDIT (8), PRES (10), OWNER (3), MODULE (5), OFFLINE (5), I18N (4), ERR (6), TEST (7).

**Key highlights:**
- ACCESS-1: New `adminFeatureLoader` factory composing adminLoader + featureLoader
- HTTP-1 to HTTP-11: storeHttpService with list/get/create/update/lifecycle methods + module catalog
- LIST-1 to LIST-6: StoreListPage container with online/offline cache strategy
- CREATE-1 to CREATE-6: StoreCreatePage with module catalog + role-conditional fields
- EDIT-1 to EDIT-8: StoreEditPage with store/module merge + price overrides
- PRES-1 to PRES-10: StoreList + StoreForm + ModulePicker (pure presentational)
- MODULE-1 to MODULE-5: priceIncluded auto-lock, merge logic, running total
- OFFLINE-1 to OFFLINE-5: Write-through cache, offline read, blocked writes
- I18N-1 to I18N-4: 27+ STORES.* keys, all copy from react-intl
- TEST-1 to TEST-7: Smoke tests, unit tests, IntlProvider wrapping, offline mocking

Full requirement text available in openspec/specs/management/spec.md.

---

## Acceptance Scenarios

28 acceptance scenarios (S-ACCESS-1 through S-ERR-2):
- S-ACCESS-1–4: Authentication and authorization flows
- S-LIST-1–6: List container online/offline/lifecycle scenarios
- S-CREATE-1–5: Create form with offline gating, priceIncluded, non-admin ownerId forcing
- S-EDIT-1–8: Edit form with prefill, module merge, role-conditional fields
- S-MODULE-1–2: Module picker total price, priceIncluded auto-selection
- S-OWNER-1: Owner picker HTTP population
- S-I18N-1: All copy from i18n keys
- S-ERR-1–2: Catalog failure blocks submit, no unhandled rejections

---

## Constraints and Non-Requirements

- No backend changes (all contracts exist)
- No offline write queue (writes blocked, decision #204)
- No domain type changes (Store/Module from domain unchanged)
- No owner management UI (read-only picker only)
- No users or configurations sub-slices (separate SDD changes)
- Post-create → `/management/stores` (not users route, deferred to phase4-mgmt-users)
- Server-side validation authoritative
- adminLoader + featureLoader NOT modified (composed only)

---

## Where

**Full spec:** frontend-react/openspec/specs/management/spec.md (main source of truth)
**Change artifacts:** frontend-react/openspec/changes/archive/2026-06-01-phase4-mgmt-stores/
**Engram reference:** sdd/phase4-mgmt-stores/spec (#207)
