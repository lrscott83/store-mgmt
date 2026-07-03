# Design: Management → Stores Parity (Stage 4)

## Technical Approach

Collapse React's invented list+lifecycle flow to Angular's single-form model. All three
`management/stores*` URLs render ONE route component (`edit-store.tsx`) that resolves
`storeId = params.id ?? user.selectedStoreId ?? ''` and switches title/mode on its truthiness —
mirroring Angular `edit-store.component.ts:53` + `getHeader()` (`:62-63`). The super-admin
lifecycle list stays SOLE at `/admin/stores`, rewritten as a Card grid with confirm dialogs.
Management becomes HTTP-only: the `BaseRepository<Store>` cache and degraded banner are deleted.

## Architecture Decisions

### Decision: One route module for three paths
**Choice**: Register all three `route()` paths against the SAME file `management/stores/routes/edit-store.tsx`, each with a distinct explicit `id` (RR7 requires unique route ids when a module is reused).
**Alternatives**: (a) single optional-param route `management/stores/:id?` — rejected, cannot express the literal `edit/:id` and `create` segments so URL parity breaks; (b) keep 3 thin files delegating to a shared hook — rejected as needless indirection.
**Rationale**: Preserves exact Angular URLs while guaranteeing one component/one behavior.

### Decision: Mode from resolved id, not from route
**Choice**: `isEditMode = Boolean(storeId)` where `storeId` falls back to `selectedStoreId`. `/create` yields create mode ONLY when no store is selected.
**Rationale**: Byte-for-byte Angular parity (`params.id || currentUser.selectedStoreId`). A store admin hitting `/create` correctly edits their own store.

### Decision: Reuse `confirmDialog` (blocking-alert.ts) for Approve/Disapprove
**Choice**: The SweetAlert2-equivalent already exists (`shared/lib/blocking-alert.ts:40 confirmDialog`). Wire it in `admin/stores` before approve/disapprove; `await`, act only if it resolves `true`.
**Alternatives**: build a new modal primitive — rejected, the audit-mandated SweetAlert2 shape is already implemented and test-mockable.
**Rationale**: Matches Angular `store-list.component.ts:132-166,169-203` (icon `question`, Yes/No, `#3456ff`/`#dc3545`).

### Decision: Activate/Deactivate never render; strict isSuperAdmin gating kept
**Choice**: Remove `onActivate`/`onDeactivate` from the list component entirely (Angular dead-codes them, `store-list.component.html:40-50`). Keep React's `isSuperAdmin` `isActive` gating (do NOT copy Angular's `isOwnerAdmin` template bug). Keep soft `getMe()`+`updateUser` (not `document.location.reload()`).
**Rationale**: fix-bugs-not-preserve; both baked into the proposal.

## Data Flow

```
/management/stores            ┐
/management/stores/create     ├─→ edit-store.tsx (one module, 3 route ids)
/management/stores/edit/:id   ┘        │
   storeId = params.id ?? user.selectedStoreId
   storeId? ─ yes → getStore + EDIT_TITLE → updateStore → getMe/updateUser → /management/stores
           ─ no  → CREATE_TITLE          → createStore  → /management/users/create/
   catalog: listModulesToStore (+ listOwners if admin)   [HTTP only, no cache]

/admin/stores (superAdminLoader) → StoreCardList (Card grid)
   Approve/Disapprove → confirmDialog(...) → if true → http → reload list
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `app/routes.ts` (64-66) | Modify | Three `management/stores*` paths → `edit-store.tsx` with distinct `id`s |
| `app/management/stores/routes/edit-store.tsx` | Create | Unified create/edit; merges old create+edit logic; id fallback + title switch; HTTP-only |
| `app/management/stores/routes/store-list.tsx` | Delete | List page has no Angular equivalent for this audience |
| `app/management/stores/routes/store-create.tsx` | Delete | Folded into `edit-store.tsx` |
| `app/management/stores/routes/store-edit.tsx` | Delete | Folded into `edit-store.tsx` |
| `app/management/stores/components/store-list.tsx` | Delete | Table+lifecycle; replaced by admin card grid |
| `app/admin/stores/components/store-card-list.tsx` | Create | Card-grid list (shared Card/Button/icons); Approve/Disapprove only; no Activate/Deactivate |
| `app/admin/stores/routes/store-list.tsx` | Modify | Import new card list; wrap approve/disapprove in `confirmDialog` |
| `app/management/stores/components/store-form.tsx` | Modify | L5 chrome (Button/Card/InfoBox); drop `isOnline`/OFFLINE_NOTICE; field-name-aware validation |
| `app/shared/lib/i18n/es.ts` | Modify | L6 keys (below) |
| `app/management/stores/routes/__tests__/store-routes.test.tsx` | Modify | Rewrite for unified component (title switch, id fallback, no table) |
| `app/management/stores/components/__tests__/store-list.test.tsx` | Delete | Component removed |
| `app/admin/stores/routes/__tests__/store-list.test.tsx` | Modify | Assert card grid + confirm-before-approve/disapprove |
| `app/admin/stores/components/__tests__/store-card-list.test.tsx` | Create | Card grid render + action gating |

## i18n Changes (`es.ts`)

| Key | Old → New |
|-----|-----------|
| `STORES.CREATE_TITLE` | `Nueva tienda` → `Crear una tienda` |
| `STORES.EDIT_TITLE` | `Editar tienda` → `Editar la tienda` |
| `STORES.APPROVED` | `Aprobada` → `Aceptado` |
| `STORES.APPROVE` | `Aprobar` → `Aceptar` |
| `STORES.IS_ACTIVE` | `Activa` → `Activo` |
| `STORES.ERROR` | `...Intentá de nuevo.` → `...Intente de nuevo.` |
| `STORES.LIFECYCLE_ERROR` | `...Intentá de nuevo.` → `...Intente de nuevo.` |
| `STORES.OFFLINE_NOTICE`, `STORES.DEGRADED_NOTICE` | Remove (offline layer gone) |
| `STORES.OWNER_REQUIRED` (new) | `El propietario es obligatorio.` |
| `STORES.PAYMENT_START_DATE_REQUIRED` (new) | `La fecha de inicio de pago es obligatoria.` |
| `STORES.APPROVE_CONFIRM_TITLE` (new) | `Confirmación para aprobar` |
| `STORES.APPROVE_CONFIRM_MESSAGE` (new) | `¿Está seguro que desea aprobar esta tienda?` |
| `STORES.DISAPPROVE_CONFIRM_TITLE` (new) | `Confirmación para desaprobar` |
| `STORES.DISAPPROVE_CONFIRM_MESSAGE` (new) | `¿Está seguro que desea desaprobar esta tienda?` |

Confirm buttons reuse existing `GENERAL.YES` (`Si`) / `GENERAL.NO` (`No`).

## L5 Components

Reuse existing, already used by Expenses: `shared/components/ui/{button,card,info-box}.tsx` and
`ui/icons.tsx` (`PlusIcon`/`EditIcon` = Material add/edit). Admin grid uses `Card`; FAB/primary
actions use `Button`; form errors use `InfoBox`. All confirmed present.

## Testing Strategy (Strict TDD — vitest)

| Layer | What | Approach |
|-------|------|----------|
| Route | 3 URLs → one form; title switch; id = param ?? selectedStoreId; no table | Rewrite `store-routes.test.tsx`; mock `storeHttpService`, `useAuthStore` |
| Component | Card grid renders; Approve/Disapprove call `confirmDialog` then http on `true`, skip on `false`; Activate/Deactivate absent | Mock `blocking-alert.confirmDialog`; new `store-card-list.test.tsx` |
| Form | field-name-aware required msgs; no offline notice | Extend `store-form.test.tsx` |
| Regression | grep no `BaseRepository<Store>`, no voseo `Intentá`/`Conectate` in stores scope | assertion + manual |

## Migration / Rollout

No data migration. Deleting `BaseRepository<Store>` for stores is safe — only callers are the two
deleted management route files (verified: no other importer). Conventional commits on
`feat/frontend-parity-audit`, work-unit boundaries: (1) structure collapse, (2) admin confirms,
(3) L5, (4) L6.

## Open Questions
None — structural decision is LOCKED per proposal.
