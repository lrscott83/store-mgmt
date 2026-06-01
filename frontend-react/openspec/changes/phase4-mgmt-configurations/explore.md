## Exploration: phase4-mgmt-configurations (Configurations sub-domain, 3 of 3 Management slice)

**Change:** phase4-mgmt-configurations
**Phase:** Explore
**Status:** Done
**Date:** 2026-06-01
**Mode:** Hybrid (engram id 233 + this file)
**Branch:** feat/phase4-mgmt-configurations (stacked on feat/phase4-mgmt-users)

### Current State

**React (frontend-react/):**
- `menu-config.ts` already declares `MENU.CONFIGURATIONS → /management/configurations` with `featureIds: [EFeatures.Configurations = 74]`.
- `es.ts` has `MENU.CONFIGURATIONS: 'Configuraciones'` but NO `CONFIGURATIONS.*` namespace.
- `EFeatures.Configurations = 74` declared in `@store-mgmt/domain/enums/index.ts`.
- `app/routes.ts`: NO route registered for `management/configurations` — ghost link.
- NO `app/management/configurations/` directory exists.
- NO `StoreConfiguration` interface anywhere in `@store-mgmt/domain`.
- `adminFeatureLoader` and `BaseRepository<T>` are live and reusable directly.

**Angular legacy (frontend/):**
- `ConfigurationsComponent`: empty class, template `<p>configurations works!</p>` — a stub with zero business logic.
- No `ConfigurationService` / `configuration.service.ts` exists.
- Help dialogs are also stubs.
- **Verdict: zero legacy to port. Greenfield feature.**

**Backend (backend/src/):**
- NO `ConfigurationsController` in `SMCA.WebApi/Controllers/v1/`.
- `SystemConfiguration` entity exists (`Name/Value`, keyed by int) but is INTERNAL infrastructure only (`TestingPeriodInMonths`, `ReSellerPercentDiscountPrice`) — never API-exposed.
- NO `StoreConfigurationDto`, no application-layer commands/queries for store config.
- **Verdict: no backend endpoint exists. A `/v1/storeconfigurations` controller would have to be built.**

### Affected Areas
- `app/routes.ts` — add 1 route `management/configurations`
- `app/shared/lib/i18n/es.ts` — add `CONFIGURATIONS.*` namespace (~15-18 keys)
- NEW `app/management/configurations/` — container, presentational form, http service, tests
- `packages/domain/src/models/` — add `StoreConfiguration` interface + export
- Backend `ConfigurationsController.cs` — blocking dependency (OUT of React scope)

### Open Questions (BLOCKING — cannot default safely)
| # | Question | Impact | Note |
|---|----------|--------|------|
| OQ-C1 | No backend endpoint exists — build first or scaffold against agreed contract? | BLOCKING | Nothing to verify against, unlike Stores/Users |
| OQ-C2 | What store-level config keys/fields does the page manage? | BLOCKING | No PRD field list, no Angular form |
| OQ-C3 | Data model: typed struct vs generic `{key,value}` list? | BLOCKING | Affects domain model + form |
| OQ-C4 | Single GET+PUT or grouped endpoints? | Medium | Default: single store-scoped GET/PUT |
| OQ-C5 | Single route or sub-routes? | Low | Single route (PRD defines only one) |
| OQ-C6 | Full implementation now or placeholder until backend? | Medium | Depends on C1 resolution |

### PRD vs Reality Contradiction
The PRD describes an API-backed ConfigurationService with "backend-driven dynamic keys", but NO backend API, NO data model, and NO Angular implementation exist. This is NOT a migration — it is net-new development with a missing backend dependency.

### Approaches
| Approach | Description | Effort | Risk |
|----------|-------------|--------|------|
| A — Defer | Block until backend API exists | None | Ghost link stays |
| B — Scaffold stub | Register route + "coming soon" placeholder, no HTTP | Low | No functionality |
| C — Contract-first | Define model + GET/PUT contract now, build frontend fully, backend follows | Medium | Needs contract decision |
| D — Generic dynamic | `[{key,value,label,type}]` backend-driven | High | Overengineered |

### Recommendation
Approach C (contract-first) IF the team can define the config fields + endpoint contract. Otherwise Approach B (scaffold stub) to remove the ghost link without building on guesses. NOT a safe-default situation — needs a human decision on C1/C2/C3.

### Reused Assets (no changes)
adminFeatureLoader([EFeatures.Configurations=74]), apiClient, useAuthStore, useOnlineStatus, BaseRepository<T>, StorageKeys — all live.

### Ready for Proposal
Conditional — blocked on OQ-C1/C2/C3 (contract, fields, model). Architecture pattern is fully clear (mirrors Stores/Users); the blocker is information, not implementation.
