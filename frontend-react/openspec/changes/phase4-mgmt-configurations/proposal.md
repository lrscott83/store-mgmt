# Proposal: phase4-mgmt-configurations

Sub-domain 3 of 3 of the Management slice (phase4-management) — the **LAST** change in the slice.
This change covers **Configurations only**. Stores and Users already shipped (archived).

Shared exploration: engram `sdd/phase4-mgmt-configurations/explore` (#233) / `openspec/changes/phase4-mgmt-configurations/explore.md`.
Resolved decisions: engram `phase4-mgmt-configurations: greenfield, expose 2 platform SystemConfiguration values` (#237).
Precedent: archived `phase4-mgmt-stores` and `phase4-mgmt-users` proposal/spec/design (mirror their architecture exactly).

> **IMPORTANT — this is NOT a migration like Stores/Users. It is GREENFIELD and contract-first.**
> The Angular `ConfigurationsComponent` is an empty CLI stub (`<p>configurations works!</p>`). There is no legacy
> code to port, no `ConfigurationsController` in the backend, and no `StoreConfiguration` model. The only
> configurable data in the entire system is **2 platform-level values** in the backend `SystemConfiguration`
> entity (`TestingPeriodInMonths`, `ReSellerPercentDiscountPrice`), today read-only (repository getters only,
> no update method, no API).

---

## Intent

### Problem
The React migration (`frontend-react/`) declares a `MENU.CONFIGURATIONS` entry, but `/management/configurations`
is a ghost link: no route, no slice, no HTTP service, no UI exists. Unlike Stores and Users — which already had a
fully implemented Angular feature and live backend contracts to migrate against — Configurations has **nothing**:
the Angular component is a CLI stub and no backend endpoint exists. The only thing worth surfacing is the two
platform-level `SystemConfiguration` values, which are currently locked inside the backend (read-only repository
getters, never exposed via an API).

### Why now
Configurations is the third and final sub-domain of the Management slice (order locked in #204:
stores → users → configurations). Stores and Users have both shipped and been archived. Completing Configurations
closes out the Management slice and removes the last dead menu entry. The user decided (#237) to make
`/management/configurations` a real, editable settings page that exposes the 2 platform `SystemConfiguration`
values rather than leaving a stub or deferring.

### Success looks like
- `/management/configurations` renders in React and is reachable only by an authenticated user who is admin AND
  has `EFeatures.Configurations = 74`.
- The page lists the platform `SystemConfiguration` values as editable name/value rows and can save changes
  back via a single `PUT`.
- The slice is built fully and tested against a **mocked contract** (container/presentational split, Axios
  `apiClient`, `useOnlineStatus`, route loader, `BaseRepository` cache), mirroring the Stores/Users slices exactly.
- Offline: the list reads from a localStorage cache (degraded read); writes are blocked with a clear error.

> **ACCEPTED CAVEAT — NOT FUNCTIONAL END-TO-END UNTIL BACKEND EXISTS.**
> This change is **frontend-react only, contract-first**. The backend `ConfigurationsController` and the
> repository update method do NOT exist yet and are OUT of scope (delivered separately later, see #237). Until
> that backend endpoint is implemented, the live page will fail its network calls and fall back to degraded/empty
> state. This is a known, accepted condition: the React slice is built and verified against the mocked contract
> defined here, and will become functional once the backend catches up. This is explicitly the SAME contract-first
> posture the team has accepted before; it does not block this change.

---

## Scope

### In scope (frontend-react ONLY)
- Route: `/management/configurations` (single settings page — the PRD defines only ONE route; no create/edit
  sub-routes).
- New `app/management/configurations/` slice: one route container (side effects), one presentational form
  component (`ConfigurationsForm` — renders the list of editable name/value rows), `configurationHttpService`
  over `apiClient`.
- List: `GET /v1/configurations` → `SystemConfiguration[]`. Renders one editable row per entry.
- Save: `PUT /v1/configurations` with the updated array (or `{ id, value }` pairs) → boolean. Platform-global,
  **NOT store-scoped** (no `selectedStoreId`).
- Domain: add a `SystemConfiguration` model to `@store-mgmt/domain` and export it. Generic name/value shape, NOT
  a typed per-field struct, so new backend keys appear automatically.
- Offline: list reads from `BaseRepository<SystemConfiguration>` cache (degraded mode); writes blocked via
  `useOnlineStatus`.
- i18n keys under `CONFIGURATIONS.*` (and shared `MANAGEMENT.*` where reused) in `es.ts`.
- Register the single configurations route in `app/routes.ts`.
- Tests for all three layers, written against the mocked contract.

### Out of scope (explicit)
- **Backend work** — the `ConfigurationsController` (GET list + PUT update) and the repository update method
  (`SystemConfiguration` is read-only today) are OUT of scope and delivered separately later (#237). The React
  slice is built and tested against the mocked contract only.
- **Store-scoped configurations** — these 2 values are platform/reseller-level, NOT per-store. No
  `selectedStoreId` in the contract.
- **Create / edit sub-routes** — PRD defines a single page; no `/create` or `/:id/edit`.
- **Typed per-field form** — the contract is a generic name/value list, deliberately not a typed struct.
- Offline write queue / sync of pending edits (block, do not queue — same as Stores/Users).
- New `adminFeatureLoader` factory — `adminFeatureLoader([EFeatures.Configurations])` already exists; reuse, no
  new factory.

---

## Approach (locked — mirrors Stores/Users slices exactly)

**Three-layer slice, container/presentational split:**

1. **Route container** (`app/management/configurations/routes/configurations.tsx`) owns side effects: loader,
   data fetching, online/offline gating, submit handling. Single module (one route, no create/edit split).
2. **Presentational component** (`app/management/configurations/components/configurations-form.tsx`):
   `ConfigurationsForm` renders the list of `SystemConfiguration` entries as editable name/value rows (name as a
   read-only label, value as an editable input) and emits the updated set on submit. No HTTP, no router.
3. **HTTP service** (`app/management/configurations/lib/services/configuration-http-service.ts`): thin functions
   over the shared Axios `apiClient`. One function per backend contract (list + update).

**Access control:** the route's loader = `adminFeatureLoader([EFeatures.Configurations])` — already live from the
Stores change. No loader changes.

**Online/offline:** `useOnlineStatus` in the container. List attempts network; on failure/offline falls back to
`BaseRepository<SystemConfiguration>('configurations', [])` cache (no date fields) and renders degraded. Successful
reads write through to cache. The save action is disabled and surfaces an error when offline (no queue).

**Generic list, not a typed struct:** the form iterates over `SystemConfiguration[]` and renders one editable row
per entry. No hardcoded field names — when the backend adds a new key it appears automatically. This is the key
design decision (#237) that keeps the page future-proof against new platform settings.

**Contract-first / mocked:** because no backend endpoint exists yet, all three layers are implemented and tested
against the mocked contract defined below. The service test asserts the request/response shape; the container and
form tests mock the service.

---

## Defined Endpoint Contract (contract-first — backend does NOT exist yet)

All paths are relative to `${apiUrl}/${apiVersion}` (e.g. `/v1`). Responses use the `BaseResponseModel<T>`
envelope: `{ data, succeeded, message, actionCode, errors }`, consistent with Stores/Users.

| Operation | Method + Path | Request body | Response | Notes |
|-----------|---------------|--------------|----------|-------|
| List configurations | `GET /configurations` | — | `BaseResponseModel<SystemConfiguration[]>` | platform-global, NOT store-scoped |
| Update configurations | `PUT /configurations` | `SystemConfiguration[]` (or `{ id, value }[]`) | `BaseResponseModel<boolean>` | send updated values; design phase locks array vs id/value pairs |

**Model shape (NEW in `@store-mgmt/domain`, faithful to the backend `Name`/`Value` entity):**
```ts
export interface SystemConfiguration {
  id: number;
  name: string;
  value: string;
}
```
Added to `frontend-react/packages/domain/src/models/store.ts` and exported via the package barrel. Generic
name/value list — NOT a typed per-field struct.

Backend reference (for the later, out-of-scope backend change):
- `backend/src/Domain/Entities/SystemConfigurations/SystemConfiguration.cs` (`Name: string`, `Value: string`, int id).
- `SystemConfigurationType` enum: `TestingPeriodInMonths = 1`, `ReSellerPercentDiscountPrice = 2`.
- `ISystemConfigurationRepository` — today only getters; needs an update method (out of scope here).

`EFeatures.Configurations = 74` — confirmed in `@store-mgmt/domain` enums, reused as-is.

---

## Capabilities

> Contract with sdd-spec. Existing capability: `management` (`openspec/specs/management/spec.md`).

### New Capabilities
None.

### Modified Capabilities
- `management`: add Configurations sub-domain requirements — single configurations route,
  `configurationHttpService` contracts (list + update), one `ConfigurationsForm` presentational component
  rendering a generic editable name/value list, platform-global (non-store-scoped) read + save, offline
  read-cache + write-block, `adminFeatureLoader([Configurations])` gating, new `SystemConfiguration` domain model,
  `CONFIGURATIONS.*` i18n. NOTE: functional only once the (out-of-scope) backend endpoint exists.

---

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `app/management/configurations/routes/configurations.tsx` | New | route container + tests |
| `app/management/configurations/components/configurations-form.tsx` | New | `ConfigurationsForm` (editable name/value list) + tests |
| `app/management/configurations/lib/services/configuration-http-service.ts` | New | thin functions over `apiClient` + tests |
| `packages/domain/src/models/store.ts` | Modified | add `SystemConfiguration` interface |
| `packages/domain` barrel export | Modified | export `SystemConfiguration` |
| `app/routes.ts` | Modified | register 1 configurations route |
| `app/shared/lib/i18n/es.ts` | Modified | add `CONFIGURATIONS.*` namespace (~10-15 keys) |
| `app/auth/routes/loaders.ts` | No change | `adminFeatureLoader` reused as-is |
| backend (`ConfigurationsController` + repo update) | OUT of scope | delivered separately later (#237) |

### Reused directly (no change)
`apiClient`, `useAuthStore` (role flags), `useOnlineStatus`, `adminFeatureLoader`, `BaseRepository<T>` +
`StorageKeys`, `EFeatures.Configurations`, existing `MENU.CONFIGURATIONS` menu entry + `MENU.CONFIGURATIONS` i18n.

---

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Backend endpoint does not exist — page not functional end-to-end | High (known) | ACCEPTED (#237): contract-first, build + test against mock; backend delivered separately. Documented as a caveat, not a defect |
| Real backend contract differs from the mocked shape | Med | Keep the contract minimal/generic (id/name/value); lock array-vs-pairs at design; isolate in `configurationHttpService` so only one file changes when backend lands |
| Generic name/value list yields poor UX for the 2 known keys (no labels/types) | Low | Acceptable for v1; `name` shown as label; future keys appear automatically; typed rendering deferred |
| Exposing platform/reseller settings under "store management" is semantically odd | Low | User accepted (#237); gating via `EFeatures.Configurations = 74` restricts access |
| PR size (1 route + 1 form + service + domain model + i18n + tests) | Low | Smallest of the three Management slices; well under 400 lines |

---

## Rollback Plan

The slice is additive and isolated under `app/management/configurations/`. To revert: remove the single route entry
from `app/routes.ts`, delete `app/management/configurations/`, remove the `CONFIGURATIONS.*` i18n keys from `es.ts`,
and remove the `SystemConfiguration` interface + export from `@store-mgmt/domain`. No shared loaders or existing
slices are modified, so removal cannot regress Stores, Users, or other features.

---

## Dependencies

- Stores slice shipped (archived) — provides the live `adminFeatureLoader`.
- `EFeatures.Configurations = 74` and `MENU.CONFIGURATIONS` already exist in React.
- **Backend `/v1/configurations` GET + PUT — DOES NOT EXIST.** Required for end-to-end functionality but OUT of
  scope here; delivered separately later (#237). This change proceeds contract-first against a mock.

---

## Success Criteria

- [ ] `/management/configurations` renders and is gated by `adminFeatureLoader([EFeatures.Configurations])`.
- [ ] The page lists `SystemConfiguration[]` (from the mocked `GET /v1/configurations`) as editable name/value rows.
- [ ] Save posts the updated values via `PUT /v1/configurations` (verified against the mocked contract).
- [ ] The list is generic — adding a new backend key would render a new row with no code change.
- [ ] `SystemConfiguration` model added to `@store-mgmt/domain` and exported.
- [ ] Offline: list reads cache (degraded), save blocked with a clear error.
- [ ] `CONFIGURATIONS.*` i18n namespace added; single route registered in `app/routes.ts`.
- [ ] Full test suite passes; build clean; architecture mirrors the Stores/Users slices.
- [ ] Proposal documents the accepted "NOT functional until backend exists" caveat.
