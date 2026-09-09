# E2E: módulos por plan del store en auth, roster y ciclo de vida (plan-gated modules) - Plan

- Estado: propuesto (2026-09-08)
- Alcance: **solo tests E2E NUEVOS** en `backend/src/SMCA.WebApi.E2ETests/` (regla no-negociable del repo: no tocar producción ni E2E existentes; si un E2E existente falla, parar y preguntar).
- Skill: `api-endpoint-tests` (QA workflow, 4 categorías: Happy Path / Edge Cases / Error Handling / Integration-contract).
- Requisito de cobertura: 100% de los casos Happy/Edge/Wrong-path de la matriz abajo.

## Contexto — cómo funcionan los módulos por store HOY (verificado en código)

La asignación real de módulos/features a un store NO se deriva todavía de `StorePlanModule` (el "gating por StorePlan" queda como iteración futura, per plan backend 2026-09-08). Hoy el runtime usa la cadena:

```
StoreModules (per-store) ──> FilterForBilling(billing.Status) ──> storeModuleIds ──> features visibles
```

- **`POST /api/v1/auth/register`** (`RegisterCommand`): asigna TODOS los módulos `AvailableToStore` ({2,3,4,5,6,7,8,9,10,11,12,13,14}) vía `CreateStoreService.CreateStoreAsync`, fija `StorePlanId = Pago (2)` y `PaymentStartDate = hoy` (trial). No recibe `moduleIds` en el body.
- **`POST /api/v1/stores`** (`CreateStoreCommand`): recibe `moduleIds` explícitos; plan Pago por default; `PaymentStartDate = hoy` incondicional (clock de trial).
- **`GET /api/v1/auth/me`** (`GetMeQuery`): `storeModules` activos del store → `FilterForBilling` → `StoreModuleIds` + `FeatureIds` + `Roles` en el DTO. `PlanType` viene de `BillingService` ("Paid" si módulo pagado activo && PaymentStartDate != null; "Free" si no).
- **`GET /api/v1/store-users/{storeId}/offline-roster`** (`ExportOfflineRosterQuery`): misma cadena `FilterForBilling` → `StoreModuleIds`/`FeatureIds`/`Roles` por usuario del roster. Expiración: Paid → NextDueDate+5d; Free/NoAplica → TTL default 35d (config `OfflineRosterTtlDays`).
- **`POST /api/v1/stores/{id}/toggle-plan`** (`ToggleStorePlanCommand`): Free→Paid activa TODOS los módulos pagados del catálogo (insert o reactivación con precios del catálogo) + StoreRoleFeatures; Paid→Free soft-deleta (IsActive=false) módulos pagados y desactiva sus StoreRoleFeatures. No toca StorePlanId.
- **`PUT /api/v1/stores/{id}`** (`UpdateStoreCommand`): con `moduleIds` ≠ null, reemplaza el set completo (soft-delete insert/reactiva + regenera StoreRoleFeatures); DG-7 plan lock: OwnerAdmin no puede CAMBIAR el set de una tienda con módulos pagados activos (same-set sí puede). `PaymentStartDate` explícito solo SuperAdmin.
- **`DELETE /api/v1/Owners/{id}`** (`DeleteOwnerCommand`): hard delete en orden: ReSellerOwner → UserRoles → User.StoreUsages → por store [StoreUsers → StoreModules → StoreRoleFeatures → Store.StoreUsages → Store] → Owner → User → Tenant (si ≠ DefaultTenant). **No borra**: `StorePayments`, `InventoryEntries`, `Orders`, `RefreshTokens` del usuario (todas FK Restrict a Store/User).
- **`HasPermissionAttribute`** (gating runtime de cada endpoint con `[HasPermission]`): no-SuperAdmin → módulos activos → `FilterForBilling` → `storeModuleIds` → chequea feature. **Es el runtime gate real**: si el módulo no está (o Vencido lo excluye), el endpoint devuelve 403.

### Invariantes de catálogo (ModuleEntityTypeConfiguration.HasData)

| Módulo | id | PriceIncluded (free) | Precio |
|---|---|---|---|
| Sales 2, Inventory 3, Synchronization 4, Management 7 | — | **true** | 0 |
| Reports 5, Statistics 6, Expenses 8, Billing 9, Histories 10, Credits 11 | — | false | 2000 (75% desc) |
| Warehouses 13 | 13 | false | 5 (50% desc → 2.5) |
| WholesaleSales 12 | 12 | false | 2 (100% desc → 0) |
| MultiStores 14 | 14 | false | 5 (50% desc → 2.5) |

Features: Sales={20,21,22,23}, Inventory={30,31,32,33,34,35,36,37}, Synchronization={40,41,42}, Reports={50}, Statistics={60}, Management={70,72,73,74}, Expenses={80}, Billing={90,91}, Histories={100,101,102,103}, Credits={110}, WholesaleSales={39}, MultiStores={38}.

## Endpoints bajo test (app: SMCA.WebApi)

| # | Endpoint | Handler | Qué debe cubrir |
|---|---|---|---|
| E1 | `GET /api/v1/auth/me` | `GetMeQuery` | `StoreModuleIds`/`FeatureIds`/`Roles` reflejan módulos activos filtrados por billing; `PlanType` Paid/Free; trial; wrong paths (401, user/store/owner inactive). |
| E2 | `GET /api/v1/store-users/{storeId}/offline-roster` | `ExportOfflineRosterQuery` | Roster refleja `FilterForBilling` por plan/status: `StoreModuleIds`, `FeatureIds`, `Roles`, `IsInTrial`, `PaymentDueDate`, `PaymentStatus`; expiry Paid vs Free; wrong paths (403, 400 inactive store/owner, 400 foreign store OwnerAdmin). |
| E3 | `POST /api/v1/stores` | `CreateStoreCommand` | Store nuevo con plan Pago: `StorePlanId=2`, PaymentStartDate=hoy (trial), StoreModules exactos del request, StoreRoleFeatures generadas, `moduleIds` wrong (vacío/999999, duplicado de nombre, owner desconocido, 401). |
| E3b | `POST /api/v1/auth/register` | `RegisterCommand` | Store auto-creado con TODOS los módulos disponibles (incl. pagados 12/13/14), plan Pago, `SelectedStoreId` seteado. |
| E4 | `POST /api/v1/stores/{id}/toggle-plan` | `ToggleStorePlanCommand` | Free→Paid y Paid→Free dejan el set de módulos correcto + features; idempotencia; wrong paths (403 OwnerAdmin, 400 inactive/unknown, 400 ReSeller no dueño, 401). |
| E5 | `PUT /api/v1/stores/{id}` | `UpdateStoreCommand` | Cambio de plan vía reemplazo de moduleIds: soft-delete de los retirados (IsActive=false) + desactivación de features; reactivación sin duplicados; DG-7 lock; PaymentStartDate auto/explicit; wrong paths de validación. |
| E6 | `DELETE /api/v1/Owners/{id}` | `DeleteOwnerCommand` | Hard delete limpia TODAS las referencias: StoreUsers, StoreModules, StoreRoleFeatures, StoreUsages (user y store), ReSellerOwner, UserRoles, Store, Owner, User, Tenant no-default. Y referencias NO cubiertas (documentar, ver Impactos). |

## Matriz de cobertura (4 categorías × 6 endpoints)

> Fuente de verdad de esta sección: los handlers citados, leídos completos. Cada fila = un test. Las convenciones son las de la suite existente: `[Collection("e2e")]`, `WebAppFixture` + PostgreSQL real (`smca_test`), `DbTestHelpers.SeedSuperAdminAsync/SeedUserWithRoleAsync/AuthedClient`, `BillingSeed.SeedFreeStoreAsync/SeedPaidStoreAsync/SeedPaidStoreWithReSellerAsync`, `StoreSeed`, assertions FluentAssertions, reads con `IgnoreQueryFilters` (tenant filters).

### E1 — GET /api/v1/auth/me

**Happy Path**
1. `Me_owner_admin_sees_only_own_store_active_modules_and_features` — free store (Management 7): `StoreModuleIds == [7]`, `FeatureIds ⊆ {70,72,73,74}`, `Roles` agrupadas por módulo, `PlanType == "Free"`, `IsInTrial == false` (PaymentStartDate null).
2. `Me_paid_store_plan_pago_modules_and_features` — paid store (Management + Statistics): `StoreModuleIds == [7,6]`, `FeatureIds` incluye 60 (Statistics) + management, `PlanType == "Paid"`, `IsInTrial == true` (PaymentStartDate reciente < trialMonths).
3. `Me_after_free_to_paid_toggle_modules_reappear` — free store → toggle-plan → GET me: módulos pagados del catálogo completos, PlanType Paid, Features correspondientes.
4. `Me_after_paid_to_free_toggle_modules_disappear` — paid store → toggle → GET me: solo módulos free (7), PlanType Free, features de módulos pagados ausentes.

**Edge Cases**
5. `Me_store_with_softdeleted_paid_module_treated_as_absent` — seed paid store, soft-delete (IsActive=false) manual del módulo pagado vía DB → me: PlanType Free, módulo ausente. (Prueba que el filtro es IsActive && FilterForBilling, no solo billing status.)
6. `Me_inactive_storeuser_not_in_roles` — StoreUser inactivo no aparece en `Roles` (query `GetStoreRoleFeaturesByUserIdAsync` filtra por activos).
7. `Me_superuser_sees_full_module_list` — SuperAdmin con SelectedStoreId en store con todos los módulos: `StoreModuleIds` == todos los AvailableToStore.

**Error Handling**
8. `Me_without_token_returns_401` — [Authorize] sin bearer.
9. `Me_deleted_user_returns_404_UserNotFound` — usuario borrado físicamente, token minteado: 404 `User.NotFound`.
10. `Me_inactive_user_returns_404_and_blacklists_token` — usuario IsActive=false: 404 + token blacklisteado (segunda llamada ya no pasa validación de vida… usar token viejo no blacklisted para verificar contenido del error).
11. `Me_inactive_store_returns_404_Store_Inactive` — store IsActive=false (seed + deactivate via DbTestHelpers/StoreSeed.DeactivateStoreAsync): 404 `Store.Inactive`.
12. `Me_inactive_owner_returns_404_Owner_Inactive` — owner IsActive=false: 404 `Owner.Inactive`.

### E2 — GET /api/v1/store-users/{storeId}/offline-roster

**Happy Path**
1. `Roster_paid_store_modules_and_features_match_me` — paid store: `StoreModuleIds == me.StoreModuleIds`, `FeatureIds` de cada usuario == me del mismo usuario, `IsInTrial`, `PaymentDueDate`, `PaymentStatus == "AlDia"`, `PlanType` implícito en PaymentStatus/expiry. (El test existente `OwnerAdmin_export_roster_matches_me_output_for_user` ya cubre una variante — el nuevo se enfoca en la dimensión módulos-por-plan con módulos 12/13/14.)
2. `Roster_free_store_only_free_modules` — free store: `StoreModuleIds == [7]` (módulos free del seed), features solo de Management.
3. `Roster_after_plan_change_reflects_new_module_set` — paid → toggle a free → roster: módulos pagados ausentes; toggle de vuelta → presentes (idempotencia de reactivación).

**Edge Cases**
4. `Roster_vencido_store_exports_only_free_modules` — paid store vencido (PaymentStartDate antiguo + sin pagos): `StoreModuleIds` solo PriceIncluded (7), features solo Management. (Ya existe `OwnerAdmin_export_vencidoStore_exportsOnlyPriceIncludedModules` — el NUEVO valida además `FeatureIds`/`Roles` por usuario y módulos 12/13/14 excluidos.)
5. `Roster_warehouse_wholesale_multistores_in_paid_roster` — paid store con módulos 12/13/14 activos (seed directo): `StoreModuleIds ⊇ {12,13,14}`, `FeatureIds ⊇ {38,39}` (+ 36/37).
6. `Roster_expiry_paid_store_five_days_after_due` — paid store con NextDueDate conocido: `ExpiresAt == NextDueDate+5d` (cubierto existente `PaidStore_roster_and_JWT_expire_five_days_after_next_due_date`; nuevo NUEVO: idéntica construcción con módulos del plan, no solo expiry).
7. `Roster_expiry_free_store_default_35_days` — free store: TTL 35d default. (Existente cubre; nuevo solo si agrega aserción de módulos.)

**Error Handling**
8. `Roster_without_token_returns_401`.
9. `Roster_plain_store_user_returns_403` — [HasPermission(UsersAdmin)].
10. `Roster_owner_admin_foreign_store_returns_400` — store de otro owner.
11. `Roster_inactive_store_returns_400`.
12. `Roster_inactive_owner_returns_400`.
13. `Roster_unknown_store_returns_400_UserNotFound` — storeId random: handler early-exits con 400 (getstore returns null, billing NoAplica)… según handler: store null → sigue y roster vacío con usuarios [] (seed SuperAdmin_empty_store ya cubre). Confirmar comportamiento en E1/E2 según handler.

### E3 — POST /api/v1/stores

**Happy Path**
1. `Create_store_gets_pago_plan_modules_and_features` — SuperAdmin crea store con moduleIds {7,6,13}: DB: `StorePlanId == 2`, `PaymentStartDate == hoy`, StoreModules activos exactos {7,6,13} con precios snapshot del catálogo (13 → Price=5, PercentDiscount=50), StoreRoleFeatures activas para OwnerAdmin + StoreUser de los features de esos módulos, FeaturesOK vía me/plan GET.
2. `Create_store_with_all_paid_modules_including_new_12_14` — moduleIds {2,3,4,5,6,7,8,9,10,11,12,13,14}: todos activos, features 38/39/36/37 presentes, `StorePlanId == 2`.
3. `Create_store_default_payment_start_date_is_today_trial` — PaymentStartDate == hoy → IsInTrial true en me (si billable > 0).

**Edge Cases**
4. `Create_store_module_ids_duplicates_are_idempotent` — moduleIds con duplicados {7,7,6}: mismo resultado que sin duplicar (handler distinct no explícito… verificar: `GetModulesByIdsAsync` + loop con TryGetValue → un StoreModule por módulo: sin duplicados en DB). Assert: StoreModules únicos.
5. `Create_store_free_only_modules_keeps_plan_pago_null_trial` — moduleIds solo free {2,3,4,7}: PlanType Free (hasPaidModule false), PaymentStartDate == hoy igualmente (clock incondicional), PlanId 2.

**Error Handling**
6. `Create_store_empty_module_ids_returns_400` — code `ModuleIds`.
7. `Create_store_unknown_module_999999_returns_400` — code `ModuleIds`.
8. `Create_store_unknown_owner_returns_400` — code `OwnerId`.
9. `Create_store_duplicate_name_returns_400`.
10. `Create_store_without_token_returns_401`.
11. `Create_store_owner_admin_role_forbidden` — OwnerAdmin/ReSeller/StoreUser: 403 (StoreCreateAuthorizationGapTests existente cubre roles; nuevo test no duplica, solo referencia).

### E3b — POST /api/v1/auth/register

**Happy Path**
1. `Register_creates_store_with_pago_plan_and_all_available_modules` — POST register válido: DB: `StorePlanId == 2`, `PaymentStartDate == hoy`, StoreModules == TODOS AvailableToStore ({2..14}), StoreRoleFeatures de todos los features disponibles. (Extiende `AuthRegisterDataAssertionsTests.Register_assigns_all_available_modules_including_paid` — el nuevo agrega PlanId + módulos 12/13/14 explícitos.)

**Edge Cases**
2. `Register_store_with_paid_modules_includes_12_13_14` — assert explícito módulos nuevos 12/13/14 y features 38/39/36/37 en me tras login del nuevo owner.
3. `Register_warehouse_module_13_effective_price_snapshot` — StoreModule 13: Price=5, PercentDiscount=50 (post Update-Warehouses-Price).

**Error Handling**
4. `Register_duplicate_login_returns_400` (existente AuthRegisterDuplicateTests — no duplicar).
5. `Register_validation_errors` (existente — no duplicar).

### E4 — POST /api/v1/stores/{id}/toggle-plan

**Happy**
1. `Toggle_free_to_paid_activates_all_paid_catalog_modules_and_features` — free → paid: TODOS los módulos pagados del catálogo (incl. 12/13/14) activos con precios de catálogo; StoreRoleFeatures reactivadas/creadas; PaymentStartDate == hoy. (Existente `SuperAdmin_toggles_free_store_to_paid` cubre el flujo — nuevo añade aserciones de módulos nuevos 12/13/14 + snapshot de precios 13=5/50%.)
2. `Toggle_paid_to_free_softdeletes_paid_modules_and_deactivates_features` — paid → free: módulos pagados IsActive=false, features IsActive=false, free 7 activo, PaymentStartDate null.
3. `Toggle_round_trip_no_duplicate_store_modules_or_features` — ida y vuelta: sin filas duplicadas (PK StoreId+ModuleId; features únicas por (Store,Role,Feature)).

**Edge**
4. `Toggle_same_plan_idempotent_returns_true_no_changes` — toggle a Paid→Paid (paid store, target free… por diseño toggle invierte siempre; idempotencia real: segundo toggle vuelve al plan original — cubierto por round-trip; este test documenta que no hay no-op path real).

**Error**
5. `Toggle_owner_admin_returns_403` (existente).
6. `Toggle_unknown_store_returns_400` (existente).
7. `Toggle_inactive_store_returns_400` (existente).
8. `Toggle_reseller_not_owner_returns_400` (existente).
9. `Toggle_without_token_returns_401` (existente).
10. `Toggle_with_store_payments_present_succeeds` — paid store CON StorePayment registrado → toggle a free: OK (pagos no bloquean, quedan huérfanos por diseño).

### E5 — PUT /api/v1/stores/{id}

**Happy**
1. `Update_module_set_downgrade_keeps_correct_modules` — paid store {7,6,13} → SuperAdmin PUT moduleIds {7,6}: 13 soft-deleted, features de 13 desactivadas (36/37 off), 6 sigue activo, PaymentStartDate intacto. GET me del owner: módulos correctos.
2. `Update_module_set_upgrade_adds_new_modules_with_features` — {7} → {7,13,12}: 13/12 activos con precios de catálogo, features 36/37/39 creadas/activadas, PaymentStartDate sigue (ya tenía módulo pagado 6… ajustar seed: store free {7} → añadir pagados dispara auto-activation si PaymentStartDate null).
3. `Update_module_ids_null_leaves_modules_untouched` — data-only rename: StoreModules/IsActive intactos (StorePlanTests existente cubre; no duplicar).

**Edge**
4. `Update_reactivate_softdeleted_module_no_duplicates` — módulo retirado y re-agregado: reactiva la fila existente (no insert duplicado — PK previene), features reactivadas (StoreModuleLifecycleTests ya tiene variantes; nuevo lo prueba con módulos 12/13/14).
5. `Update_same_module_set_by_owner_admin_on_paid_store_allowed` — same-set no dispara DG-7.
6. `Update_auto_activation_on_first_paid_module` — store sin PaymentStartDate + añadir módulo pagado → PaymentStartDate == hoy.

**Error**
7. `Update_owner_admin_change_set_on_paid_store_returns_400_PlanLocked` (existente).
8. `Update_superadmin_change_set_on_paid_store_allowed` (existente).
9. `Update_empty_module_ids_returns_400` (existente).
10. `Update_unknown_module_returns_400` (existente).

### E6 — DELETE /api/v1/Owners/{id}

**Happy**
1. `Delete_owner_removes_all_store_references` — owner con store (vía register o seed completo: store + storeusers + storemodules + storerolefeatures + storeusages user & store + resellerowner + userroles): DELETE → 200. DB asserts: 0 filas en Store, StoreUser, StoreModule, StoreRoleFeature, StoreUsage (user + store), ReSellerOwner, UserRole, Owner, User (IgnoreQueryFilters).
2. `Delete_owner_removes_non_default_tenant` — owner creado vía POST /Owners con TenantId propio (default behavior CreateOwnerService crea tenant nuevo): tras delete, tenant eliminado.
3. `Delete_owner_default_tenant_survives` — owner con TenantId == DefaultTenant: tenant sigue existiendo.

**Edge**
4. `Delete_owner_with_store_payments_does_not_cascade` — paid store con StorePayment: DELETE **falla** (FK Restrict StorePayment→Store)? NO: el handler no borra StorePayments → SaveChanges lanza FK violation → 500. **TEST CRÍTICO**: documentar el comportamiento actual (expected: error 500). Esto es información para el usuario, no un obstáculo: el test lo aserta como comportamiento documentado. **PARA Y PREGUNTA**: si al ejecutar el test no falla como se espera, parar y notificar — puede indicar que el handler ya no falla (módulo cambiado). [Riesgo: producción]
5. `Delete_owner_with_refresh_tokens_cleans_or_leaves_orphans` — RefreshToken UserId FK? Configuration no define FK explícita (solo índice) → **no hay FK Restrict** → tokens quedan huérfanos. Test: DELETE OK, RefreshTokens del usuario siguen presentes (huérfanos documentados, no bloquean).
5b. `Delete_owner_with_inventory_entries_or_orders_fails_with_fk_error` — store con InventoryEntry/Order: DELETE → FK violation → 500 (documentado, no silent data loss). **PARA Y PREGUNTA**: mismo tratamiento que 4.

**Error**
6. `Delete_owner_unknown_returns_400_Id` (existente).
7. `Delete_owner_as_reseller_returns_400_guard` (existente).
8. ` Restrict_FK_owner_with_active_store_users` — [REMOVED]: StoreUsers sí son borrados por el handler.

### Integration-contract (cross-endpoint)
1. `Plan_change_propagates_to_me_and_roster_consistently` — paid → toggle free → both me y roster reflejan el mismo set (consistencia de la cadena FilterForBilling entre los dos read-paths).
2. `Create_store_role_features_match_catalog_features_for_plan_modules` — tras POST /stores con {7,6,13}: features activas por rol OwnerAdmin/StoreUser == las esperadas del catálogo (36/37 ∈ OwnerAdmin via StoreRoleFeatures enum mapping).
3. StorePlanModule catalog test: `StorePlanModule_seed_matches_documented_plan_matrix` — query directa: Gratis={2,3,4,5,7}, Pago=Gratis+{6,12,8,9,10,11}, Superior=VIP={2..14}\{1}. (Verifica el SEED de la tabla StorePlanModule — no gating runtime, solo integridad del catálogo de planes.)

## Análisis de impactos de estos cambios (pedido del usuario)

1. **`StorePlanModule` no es la fuente de verdad todavía**: todos los tests de esta suite se anclan al comportamiento ACTUAL (módulos asignados explícitamente + FilterForBilling por billing status). Cuando llegue el gating por StorePlan, esta suite será la red de seguridad para detectar drift (los tests de matriz de catálogo StorePlanModule lo documentan).
2. **Hard delete de owner con datos operativos**: FK Restrict de StorePayments/InventoryEntries/Orders → DELETE falla con 500 (comportamiento actual). Ninguna limpieza extra se agrega en esta iteración (solo tests). Puede ser un GAP de diseño a decidir: ¿borrar también esos datos, o bloquear el delete con 400 explicativo? **PENDIENTE DECISIÓN DEL USUARIO** — el plan solo lo documenta y testea el comportamiento actual.
3. **RefreshTokens huérfanos tras delete de usuario**: sin FK, quedan filas apuntando a usuarios inexistentes. Impacto: refresh de un usuario borrado ya falla por validación de existencia; no hay leak de seguridad. Documentado.
4. **Roster offline con módulos retirados**: un roster exportado antes de un downgrade conserva features que ya no tiene la tienda online. Impacto frontend offline: usuarios offline siguen viendo features retiradas hasta que el roster expire. Documentar (no test de backend).
5. **Trial de WholesaleSales (desc 100%)**: módulo 12 efectivo 0 → no dispara billable amount → `IsInTrial` false si solo tiene 12+free. Edge test: store con solo módulos free + 12: PlanType "Paid"? hasPaidModule (12 PriceIncluded=false) && PaymentStartDate → "Paid", pero effectiveAmount 0 → IsInTrial false. Comportamiento sutil documentado en test edge E1.
6. **Warehouses price change (5/50%)**: los snapshots nuevos usan 5/50 (efectivo 2.5); stores con snapshot viejo (2/100) mantienen el viejo hasta re-asignación. Tests de toggle/update asertan precio NUEVO de catálogo al reactivar.

## What's NOT covered (fuera de alcance)

- Test de `HasPermissionAttribute` runtime 403 por módulo retirado (features disponibles via me/roster ya lo prueban indirectamente; un test directo de gating runtime por endpoint con `[HasPermission]` se puede agregar si el usuario lo pide — sería un archivo nuevo con endpoints probe).
- Frontend.
- Unit tests de handlers (Application.Tests ya cubren CreateStoreService, ToggleStorePlan, UpdateStore, ExportOfflineRoster con mocks).

## Estructura de archivos (nuevos, en carpetas existentes)

```
backend/src/SMCA.WebApi.E2ETests/
├── Plans/                                    [nueva carpeta]
│   ├── StorePlanCatalogTests.cs              — E-Integration 3 (matriz StorePlanModule seed)
├── Stores/
│   ├── StorePlanChangeTests.cs               — E4 nuevo + E4-E4/E5-E5 up/down-grade via UpdateStore
│   │                                            (module set change correctness: 12/13/14 focus)
│   ├── StoreCreatePlanTests.cs               — E3 nuevo (plan Pago default + módulos 12/13/14)
├── Auth/
│   ├── AuthMePlanModulesTests.cs             — E1 (StoreModuleIds/FeatureIds/PlanType/Trial por plan)
│   ├── AuthRegisterPlanTests.cs              — E3b (register → plan Pago + módulos nuevos)
├── Users/
│   └── ExportOfflineRosterPlanTests.cs        — E2 (roster modules/features por plan)
├── Owners/
│   └── OwnersDeleteReferencesTests.cs         — E6 (referencias limpiadas + FK-error paths documentados)
```

## Convenciones (per skill + suite existente)

- xUnit + FluentAssertions + PostgreSQL real (`WebAppFixture` aplica migraciones).
- Arrange: seeds directos a DB (Added = tracked, evitar NoTracking trap: query-then-mutate escribe NADA — attach con Update o ExecuteUpdateAsync).
- Assert DB con `IgnoreQueryFilters()` (tenant filters esconden filas de contextos no-SuperAdmin).
- Cleanup en `finally` (BillingSeed.CleanupAsync / DbTestHelpers.CleanupUserAsync / CleanupTenantCascadeAsync).
- Naming: `{Action}_{Scenario}_{Expected}`. Un concepto por test. Multi-assert OK si es el mismo concepto (response shape).
- No comments salvo tramps/gotchas documentados (AGENTS.md frontend; backend sin regla explícita — seguir estilo existente: comentarios doc en headers de clase).

## Verificación

1. `dotnet build backend/src/SMCA.sln`
2. `dotnet test backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj` (PostgreSQL `smca_test` corriendo en localhost:5432).
3. Todos los tests NUEVOS verdes + suite existente intacta (regla: no tocar E2E existentes).

## Riesgos y decisiones RESUELTAS (usuario, 2026-09-08)

1. **E6-4/E6-5b (delete con StorePayments/InventoryEntries/Orders)**: DECISIÓN — tests asertan el comportamiento ACTUAL (FK violation → 500 / orphans), documentado. Sin cambios de producción en esta iteración.
2. **Costo runtime**: DECISIÓN — implementar **por lotes**:
   - **Lote 1 (ahora)**: E1 (`AuthMePlanModulesTests`) + E2 (`ExportOfflineRosterPlanTests`) — auth + roster, lo pedido explícito.
   - **Lote 2**: E3 (`StoreCreatePlanTests`) + E3b (`AuthRegisterPlanTests`) — creación con plan Pago.
   - **Lote 3**: E4 + E5 (`StorePlanChangeTests`) — cambios de plan.
   - **Lote 4**: E6 (`OwnersDeleteReferencesTests`) + E-Integration (`StorePlanCatalogTests`).
   Cad lote: build + run de los tests nuevos + suite existente intacta antes del siguiente.
