# Catálogo de tests E2E backend — módulos y features

**Alcance**: `backend/src/SMCA.WebApi.E2ETests` (xUnit + WebAppFixture, corre contra BD local `smca_test` en `localhost:5432`).
**Objetivo**: inventario de todos los tests E2E que usan módulos o features: qué prueban y **de dónde salen los valores que asertan**.
**Fecha de verificación de la BD**: 2026-09-24 (fuente de verdad consultada directamente).

> Este documento es un catálogo, no una autorización. No modifica ni propone modificar ningún test E2E existente (intocables sin aprobación explícita).

---

## 1. Fuente de verdad (BD local `smca_test`)

### Módulos

| ID | Nombre | `IsActive` | `AvailableToStore` |
|----|--------|------------|--------------------|
| 1 | Administración | true | **false** |
| 2 | Ventas | true | true |
| 3 | Inventario | true | true |
| 4 | Sincronización | true | true |
| 5 | Reportes | true | true |
| 6 | Estadísticas | true | true |
| 7 | Gestión | true | true |
| 8 | Gastos | true | true |
| 9 | Facturación | true | true |
| 10 | Historiales | true | true |
| 11 | Créditos | true | true |
| 12 | Ventas Mayoristas | true | true |
| 13 | Almacenes | true | true |
| 14 | Múltiples tiendas | true | true |
| 15 | Múltiples monedas | true | true |
| 16 | Múltiples pagos | true | true |
| 17 | Elaboración | true | true |

### Features por módulo

| Módulo | Features activas (`IsActive=true`) | Notas |
|--------|-------------------------------------|-------|
| 1 Administración | 10–16 | `AvailableToStore=false` — nunca llegan a tienda/roster |
| 2 Ventas | 20, 21, 22, 23 | |
| 3 Inventario | 30, 31, 32, 34, 35 | **NO existe 33 (Egress) en la BD** |
| 4 Sincronización | 40, 41, 42 | |
| 5 Reportes | 50 | |
| 6 Estadísticas | 60 | |
| 7 Gestión | 70, 72, 73, 74 | |
| 8 Gastos | 80 | |
| 9 Facturación | 90 | **NO existe 91 (StorePayment) en la BD** |
| 10 Historiales | 100, 101, 102, 103 | |
| 11 Créditos | 110 | |
| 12 Ventas Mayoristas | 39 | |
| 13 Almacenes | 36, 37 | |
| 14 Múltiples tiendas | 38 | |
| 15 Múltiples monedas | 43 | |
| 16 Múltiples pagos | 44 | Sin entrada en enum `StoreRoleFeatures` → el generador la descarta |
| 17 Elaboración | 120, 121 | |

> Las features **33 (Egress)** y **91 (StorePayment)** existen en el enum `FeatureType.cs` (líneas 51 y 122), en el enum `StoreRoleFeatures.cs` (líneas 67 y 115) y en el seed `FeatureEntityTypeConfiguration` (líneas 151-152 y 352-353), **pero no hay filas en la tabla `Feature` de la BD** (drift seed/migración ya reportado en `PlanChangeMatrixTests.cs:100-104`, no arreglado).

---

## 2. Cómo leer el doc

### Etiquetas de origen de los valores asertados

| Etiqueta | Significado |
|----------|-------------|
| `BD_VIVA` | Los valores salen del seed (`FeatureEntityTypeConfiguration` / `ModuleEntityTypeConfiguration` / `StorePlanModule`) que WebAppFixture migra a la BD; el test compara contra la BD viva |
| `ENUM` | Los IDs salen de `(int)ModuleType` / `(int)FeatureType` / `(int)StoreRoleFeatures` / `(int)StorePlanType` (Domain/Common/Enums) |
| `HELPER_HARD` | Constantes, mapas o switches hardcodeados en el propio test (consts, universos de plan, `FeaturesForModule`, `[36,37]`, …) |
| `SEED_PROPIO` | El test siembra filas `StoreModule` / `StoreRoleFeature` / `Feature` con IDs explícitos (vía seeds compartidos AuthzSeed/BillingSeed/StoreSeed/UserSeed/FeatureSeed o `db.Set<...>().Add(...)` directo) |
| `RESPUESTA_API` | El test aserta sobre la respuesta real del endpoint (`/me`, roster offline, catálogo, plan) sin depender de IDs hardcodeados como fuente |

### Marcado de drift

- ✅ **Alineado**: el test y su fuente coinciden con la BD viva.
- ⚠️ **DRIFT**: el test asume un estado que la BD viva no tiene (features fantasma 33/91, módulo 16 sin entrada de enum, mapa desactualizado).
- 🔶 **Documentado como comportamiento esperado**: el drift es conocido y asertado a propósito (p. ej. `PlanChangeMatrixTests` fija `16 → []`).

---

## 3. Inventario por carpeta

### Plans/

#### `PlanChangeMatrixTests.cs` — ancla de referencia de cambio de plan
Verifica que un cambio de plan produce exactamente el universo de módulos/features objetivo en filas `StoreModule` y `StoreRoleFeature`.

- **`FeaturesByModule` L108-126** (`HELPER_HARD`): mapa calibrado contra la BD viva. 🔶 `MultiPayments (16) → []` (L124) con comentario: feature 44 existe pero no tiene entrada `StoreRoleFeatures` → el generador la descarta. Es el único mapa hardcodeado que excluye 33/91 correctamente.
- **Universos Gratis/Pago/Superior/VIP L65-96** (`HELPER_HARD` + `ENUM`): Superior incluye 12/13/14/15/17; VIP añade 16 — alineado con scripts 21/22 (WholesaleSales fuera de Pago; Almacenes fuera de Gratis/Pago; Superior/VIP los conservan).
- 9 tests (L131-163) vía `AssertChangeKeepsTargetUniverseAsync` (L175), `MappedFeaturesOf` (L271), `SeedOwnerStoreAsync` (L283). ✅ Sin drift.

#### `StorePlanCatalogTests.cs` — catálogo de planes
`StorePlanModule_seed_matches_documented_plan_matrix` (L26): catálogo de planes 1-4 (Gratis/Pago/Superior/VIP) y sus miembros; WholesaleSales (12) solo en Superior(3)/VIP(4). Fuente: `BD_VIVA` vs matriz `HELPER_HARD`. ✅

#### `WholesaleSalesPagoRemovalTests.cs` — migración de remoción
`CleanupSql_removes_wholesale_sales_from_pago_stores_and_leaves_superior...` (L36): ejecuta el SQL de la migración (ModuleId=12, FeatureId=39), verifica remoción en tiendas Pago y preservación en Superior. Fuente: `HELPER_HARD` (consts de migración) + `SEED_PROPIO`. ✅ (La feature 60 sobrevive; nota L33.)

#### `PlanCatalogVisibilityTests.cs` — visibilidad por rol
- `PC1_superadmin_catalog_includes_vip` (L76, plan VIP id=4)
- `PC2_owneradmin_catalog_excludes_vip` (L94)
- `PC3_superior_catalog_serves_multimonedas_module` (L114, módulo 15)
- `PC4_vip_catalog_serves_its_module_matrix` (L137, módulos {15,16,17})
Fuente: `RESPUESTA_API` + `HELPER_HARD`/`BD_VIVA`. ✅ Sin drift.

### Auth/

#### `AuthMePlanModulesTests.cs` — `/me` de owner según plan
11 tests: módulo gratis, plan Pago, módulos 12/13/14 con features 36/37, toggles free↔paid, soft-delete de módulo pago, WholesaleSales precio efectivo 0 (no trial), errores 401/404.
- Consts L35-43 (`HELPER_HARD`): 7, 6, 13, 12, 14 + features 60, 36, 39, 38.
- Seed `SeedOwnerAdminWithModulesAsync` L366 (`SEED_PROPIO`): crea StoreModule + SRF vía **generador real**.
- **⚠️ DRIFT — `FeaturesForModule` L415-431** (`HELPER_HARD`): módulo 3 → `[30,31,32,33,34,35]` incluye **33** y módulo 9 → `[90,91]` incluye **91**, features que **no existen en la BD**. No cubre módulos 15/16/17 (devuelve `[]` aunque la BD tiene 43/44/120/121). El drift es silencioso porque el generador filtra por enum (no por existencia en BD) y `/me` FeatureIds pasa por `FilterAvailableToStoreByIds`.
- Asserts: `RESPUESTA_API` (StoreModuleIds/FeatureIds/Roles de `/me`).

#### `AuthMePlanModulesGapTests.cs` — gaps de `/me`
- `Me_inactive_storeuser_not_in_roles` (L41): Roles vacío para StoreUser inactivo.
- `Me_superuser_sees_full_module_list` (L79): `BD_VIVA` (`AvailableModulesAsync` L117 = `GetAvailableModulesToStore`).
Fuente: `BD_VIVA` + `SEED_PROPIO`. ✅

#### `MeAfterOwnerPlanChangeTests.cs` — plan tras cambios de SuperAdmin
- Consts L54-73 (`ENUM`): 13 módulos + 15 features.
- Universos Gratis L77-78 / Superior L81-84 (`HELPER_HARD`): incluye módulos 8/12/13/14/15/17.
- `Me_follows_the_plan_across_superadmin_flips_with_same_owner_token` (L95): upgrade → SuperiorUniverse en StoreModuleIds y FeatureIds {36,37,60} (L120-128); roles[].featureIds por SRF (L134-147); downgrade → GratisUniverse (L153-172).
- `StoreUser_me_after_owner_change_plan_upgrade_then_downgrade...` (L184): FeatureIds vacío para StoreUser.
Fuente: `ENUM` + `RESPUESTA_API` + `HELPER_HARD`. ✅

#### `AuthMePermissionsTests.cs` — permisos por feature
`Me_owner_admin_with_management_store_includes_stores_feature` (L38, feature **73** `AuthzSeed.StoresFeatureId` L45), `..._without_management_store_excludes` (L51), `Me_store_user_with_feature_reports_role_in_selected_store` (L64, grant 73). Fuente: `RESPUESTA_API` + grant `SEED_PROPIO`. ✅

#### `AuthRegisterPlanTests.cs` — registro de tienda y plan Pago
- Consts L36-38 (13, 12, 14).
- `Register_creates_store_with_pago_plan_and_all_available_modules` (L52): activos ≠ 12 (L75), ≠ {13,14,15,17} (L76), ≠ 1 (L77, Administración).
- `Register_warehouse_module_13_carries_new_catalog_price_snapshot` (L86).
- `Register_generates_store_role_features_for_mapped_plan_features` (L110): SRF {60,90} sí (L130); {36,37,38,39,91,120,121} no (L131) — 91/StorePayment es SuperAdmin/ReSeller-only en `StoreRoleFeatures`.
- `Register_owner_me_shows_full_plan_module_set` (L140).
Fuente: `BD_VIVA` (catálogo `StorePlanModule`) + `SEED_PROPIO` (vía API de registro) + `RESPUESTA_API` + `ENUM`. ✅

### Billing/

#### `GetMeBillingTests.cs` / `GetMeBillingStatesTests.cs` / `GetMeBillingZeroAmountTests.cs` — estados de billing en `/me`
Consts 7/6 (Gestión/Estadísticas, `HELPER_HARD`). Verifican que módulos pagos se ocultan (Vencido) o se muestran (AlDia, PorVencer, EnGracia), y trial por monto (descuento 100% no trial vs descuento parcial sí). Fuente: `SEED_PROPIO` (módulo 7 gratis + 6 pago 2000) + `RESPUESTA_API`. ✅

#### `ApprovedStoreBillingTests.cs` — tienda reprobada ("No aplica")
`DisapprovedStore_me_returns_NoAplica_free_noDueDate_keepsAllModules` (L100): conserva TODOS los módulos {7,6} (L119-120); ausente de to-collect (L129); registro de pago rechazado (L156). Fuente: `SEED_PROPIO` + `RESPUESTA_API`. ✅

#### `GetStoresToCollectTests.cs` / `RegisterStorePaymentTests.cs` / `ToCollectTests.cs` — cobros y pagos
Seed `StoreModule.Create(id, 2, 2000...)` (módulo 2 Ventas pago, `SEED_PROPIO`). Verifican qué tiendas salen en to-collect y quién puede registrar pagos. Fuente: `SEED_PROPIO` + `RESPUESTA_API`. ✅

#### `StoreCreationTrialTests.cs` — trial al crear tienda
19 tests (L216-674), `CreateStoreViaApiAsync` L93 (payload `ModuleIds`). Precio esperado = suma de StoreModules activos no-PriceIncluded (`BD_VIVA` L627-638). `Vencido_store_keeps_only_free_modules` (L500). Fuente: `SEED_PROPIO` + `RESPUESTA_API` + `BD_VIVA`. ✅

### Features/

#### `FeatureSeed.cs` — helpers de seed con features
`CleanFeatureRefsAsync` L63 (borra SRF referenciantes), snapshot/restore de 33/36/50 L76-91, `InsertFeatureUnderModuleAsync` L118 (ids E2E 9xxx), `InsertInactiveModuleWithActiveFeatureAsync` L129, `DeleteEgressAsync` L154-160 (limpia SRF de 33 antes de borrar). `SEED_PROPIO`. Base del resto de Features/*.

#### `FeaturesListTests.cs` / `FeaturesListGapTests.cs` — listado de features
SuperAdmin lista features; `includeInactive` true/false (L31/L46); shape con `ModuleId`; 400/404/401. Fuente: `BD_VIVA` + `SEED_PROPIO`. ✅

#### `FeaturesAvailableTests.cs` / `FeaturesAvailableGapTests.cs` — catálogo disponible
`Available_as_super_admin_returns_200` (L15). Gaps: excluye feature bajo **Administration(1)** (L32-34, feature 9095), módulo inactivo (L41-45), feature inactiva (L50-52, 9096), orden, shape, POST 405. Fuente: `ENUM` + `SEED_PROPIO`. ✅ (Confirma el vacío de Administración en `disponibles` — por diseño.)

#### `FeaturesActivateTests.cs` / `FeaturesActivateGapTests.cs` — activación
`Activate_as_super_admin_returns_200_true` (L20), idempotente (L49).
**`Activate_creates_Egress_when_missing` (L23)**: recrea deliberadamente la feature **33 (Egress)** bajo módulo 3 cuando la BD no la tiene (L36-38); snapshot/restore de 50 (L74-105). 🔶 **NO es drift**: prueba la rama de creación, alineada con el estado real (33 ausente).
Resto (ListAuth/AvailableAuth/ActivateAuth): 401/403 por rol, sin IDs. ✅

### Infrastructure/ (seeds y DTOs compartidos)

| Archivo | Qué siembra | Fuente |
|---------|-------------|--------|
| `AuthzSeed.cs` | `StoresFeatureId=73` L19, `ManagementModuleId=7` L20; `SeedOwnerAdminAsync` L25 (StoreModule 7), `SeedStoreUserAsync` L76 (StoreModule 7 + SRF del `grantedFeatureId` L102-103) | `HELPER_HARD` + `SEED_PROPIO` |
| `BillingSeed.cs` | `ManagementModuleId=7` L20, `StatisticsModuleId=6` L21; `SeedFreeStoreAsync` L32 (7), `SeedPaidStoreAsync` L62 (7+6), `SeedPaidStoreWithReSellerAsync` L98 | `HELPER_HARD` + `SEED_PROPIO` |
| `StoreSeed.cs` | `ManagementModuleId=7` L18, `UnavailableModuleId=999999` L19; `SeedStoreAsync` L40 (módulos `[7]` L47-48) | `HELPER_HARD` + `SEED_PROPIO` |
| `UserSeed.cs` | `SeedOwnerAdminWithStoreAsync` (módulo 7 L59, concede UsersAdmin y ProfileAdmin) | `SEED_PROPIO` |
| `TestDtos.cs` | DTOs de respuesta: `MeDto.FeatureIds`/`StoreModuleIds`, roles del plan, fila de roster | — |
| `DbTestHelpers.cs` | Cleanup: `RemoveByTenantAsync<StoreRoleFeature/StoreModule>` L118-119, `ResetAsync` (delete total L160-161) | — |

### Orders/

#### `OrderPaymentMethodPricingTests.cs` — pricing de métodos de pago
Seed con `storePlanId: StorePlanType.Superior` L76 + StoreModule(7) + SRF(73) L80-84 (`SEED_PROPIO`, scaffolding). Asserts de campos `OrderPayment` (esquema de Módulo 16/OrderPayment), **no de IDs de módulo**. ✅

### Owners/

#### `OwnersDeleteReferencesTests.cs` — borrado en cascada
Único de Owners con módulos/features: `Delete_owner_removes_all_store_references` (L41, StoreModule + SRF **73** OwnerAdmin/StoreUser L298-304), non-default tenant (L86), default tenant sobrevive (L127), reseller 500 (L154), store_payments no cascada (L177), refresh tokens (L202), inventory entries FK (L239). Fuente: `SEED_PROPIO` (módulo 7, feature 73). ✅

#### `OwnersUpdateTests.cs` — solo menciona `StoreRoleFeatures.OwnersAdmin` en comentario (L76-77); sin IDs. ✅

### Stores/

#### `StorePlanChangeTests.cs` — cambiar plan de tienda
Consts L31-35 (7, 6, 13, 12, 14); 8 tests: toggle free→paid excluye 12 (L46, SRF {36,37,38,60} sí / 39 no L92-93), paid→free soft-delete (L103), roundtrip sin duplicados (L150), PUT downgrade (L189) / upgrade (L235, SRF 36/37/38 L268), rechazo 12 (L278), reactivación (L310, SRF 36 sin duplicados), mismo set (L356).
- `SeedStoreAsync` L384 usa **generador real** (`IStoreRoleFeatureGenerator` L427-432).
- **⚠️ DRIFT — `FeaturesForModule` L470-486** (`HELPER_HARD`): mismo mapa con **33/91 fantasma** que `AuthMePlanModulesTests`.
Fuente: `SEED_PROPIO` + `RESPUESTA_API` + `HELPER_HARD`.

#### `ToggleStorePlanTests.cs` — toggle de plan
`WholesaleSalesModuleId=12` L54, `WholesaleSalesFeatureId=39` L55 (`ENUM`); `PaidCatalogModuleIdsAsync` L71 y `PaidCatalogFeatureIdsAsync` L79 (`BD_VIVA`); 10 tests: free→paid excluye 12 (L141-161), paid→free desactiva 6/7 (L200-202), roundtrip sin duplicados (`expectedSrfFeatureIds = paid − {39}` L276-287), ReSeller gates, 400s/401s. ✅

#### `StoreModuleLifecycleTests.cs` — ciclo de vida de módulos
`ComputeExpectedSrfAsync` L83 = `BD_VIVA` (features activas de módulo) + `ENUM` (StoreRoleFeatures). `Get_returns_only_active_modules_when_inactive_module_seeded` (L99), `Get_returns_catalog_module_ids` (L125), `Put_removing_module_deactivates_its_store_role_features` (L146, SRF 60 desactivado), `Put_adding_module_generates_store_role_features` (L174). ✅

#### `StoreCreatePlanTests.cs` — crear tienda con plan
Consts L33-39 (7, 6, 13, 12, 14, 15, 17). `Create_store_gets_pago_plan_modules_and_features` (L52: StoreModules ≡ request; SRF {60,36,37} sí / {38,39} no L91-92 — gap de mapeo `StoreRoleFeatures` documentado), `Create_store_rejects_wholesale_sales_module_for_pago_birth` (L103, 400), `Create_store_defaults_to_pago_but_modules_are_request_driven` (L136, catálogo Pago = 10 miembros L164-169), free-only con trial (L187), duplicados→500 PK (L221), módulo 38 no disponible (L255-269). ✅

#### `ChangeStorePlanTests.cs` — cambio de plan vía SuperAdmin
Consts L38-41 (7, 6, 13, 14); 10 tests: free→pago con universo del plan (L56-81), overdue→pago fija `nextDueDateOverride` (L90), paid→VIP completo (L124-149, 13+14 L149), downgrade limpia override y soft-delete (L159-182), no-op (L193), cross-owner 403 (L221), SuperAdmin any (L241), 400s (L267-301). Seed L353-359 (módulo 7 + SRF 73). ✅

#### `ChangePlanPermissionFlipTests.cs` — flips de permisos
Consts L46-47 (7, 14); OwnerAdmin ignora `ModuleIds` del body (L145); hereda MultiStores(14) (L104); `StoreModule.Create(7)` L175-176. ✅

#### `StorePlanTests.cs` — GET plan / PUT datos
`Get_plan_free_store_reports_null_payment_date_and_free_module` (L72, modules `{7}` L84); `Data_only_update_renames_store_and_leaves_modules_untouched` (L179, deja {7,6} L200); `OwnerAdmin_data_only_update_on_paid_store_does_not_fire_plan_lock` (L207). ✅

#### `StorePlanLockTests.cs` — bloqueo de plan
DG-7: OwnerAdmin cambia modules en tienda paga → 400 `PlanLocked` (L33); solo rename 200 (L59); activa tienda free 400 (L81); SuperAdmin 200 (L105). Seeds BillingSeed (7/6). ✅

#### `StorePlanCanonicalPriceTests.cs` — precios canónicos
P1 (L53, precio card = precio catálogo del plan), P2 (L123, toggle muestra precio Pago), P3 (L182, cambio de precio catálogo), P4/P5 (L243/L296, VIP), P6 (L345, reprobada → precios null). Cleanup SRF/StoreModule L391-393. Fuente: `RESPUESTA_API` + `BD_VIVA`. ✅

#### `StoreListPriceParityTests.cs` — paridad de precios
`Owner_and_superadmin_views_show_the_same_active_paid_snapshot_per_plan` (L52): 4 tiendas con módulos 7/6/13 (L86-103) + dead row (L101); parity; cleanup. ✅

#### `StoreCreateTests.cs` / `StoreCreateAuthorizationGapTests.cs` — creación y autorización
`Create_with_valid_payload_persists_store_and_modules` (L23, módulo 7 L43); validaciones 400 (`ModuleIds` vacío L67, `UnavailableModuleId` 999999 L71); duplicado 400. Gaps: owner con feature 73 → 403 sin efectos (L40); store user con 73 → 403 (L66); payload `[7]`; `StoreModule.Create(14)` L123-124. ✅

#### `MyStoresTests.cs` — mis tiendas
`PaidModuleId=2` L338; seed StoreModule(2, 10f) L172-174; `Modules_come_from_the_store_snapshot_with_prices` (L158, precios del snapshot L184); due dates por pagos (L216-290). ✅

#### `OwnerCreateStoreTests.cs` / `OwnerStoreSwitcherFlowTests.cs` — MultiStores
Consts (14, 7); OC01-OC07: storeuser con feature 73 → 403 (L97-102), owneradmin sin MultiStores 403 (L121), con MultiStores hereda {7,14} (L146, L171-175), foreign owner (L188), superadmin ignora approved (L209), vencido 403 (L247). SW1-SW4: tienda creada en `/me` con módulos {7,14} (L73-75), 403 sin MultiStores, is_active=false. ✅

#### `StoreActivationTests.cs` / `DisapprovedStoreBillingViewsTests.cs` — activación y vistas billing
Módulos solo en payload (`[7,6]` / `[7]`); storeuser 73 → 403; owner desactivado queda fuera hasta restauración; vistas billing "gratis" con fechas null para reprobada (StoreModule 7+6 L74-75). ✅

#### `StoreUpdateTests.cs` / `StoreAuthorizationTests.cs` — update y autorización
`ModuleIds` vacío (L209) / módulo no disponible (L213); owneradmin sin management 403 (L44); storeuser con feature 73 pasa (L56-58). ✅

#### `ElaborationModuleTests.cs` — módulo 17 (Elaboración)
Consts L52-55 (17 → 120/121, 7 `ENUM`). EM1 (tienda creada hereda 17+120/121 de la seleccionada, L171-181), EM2/EM3 (Superior/VIP activan 17+120/121 en `/me`), EM4 (downgrade a Pago los quita), EM5 (Superior activo los mantiene), EM6 (vencido los pierde). Seeds L89-126 (7+SRF 73; 17+SRF 120/121). ✅

#### `MultiMonedasModuleTests.cs` — módulo 15 (MultiMonedas)
Consts L50-52 (15 → 43, 7). MM1 (herencia 15+43), MM2/MM3 (Superior/VIP activan 15/43), MM4 (Pago los quita), MM5 (Superior activo los mantiene), MM6 (vencido los pierde). ✅

#### `MultiPaymentsPersistenceMirrorTests.cs` / `MultiPaymentsSequenceFixupTests.cs` — módulo 16
- MPM1 (esquema de Módulo 16/OrderPayment vs spec), MPM2 (round-trip de tasas), MPM3 (dos filas por canal append-only). Seed módulo 7 + SRF 73 (scaffolding). Asserts sin IDs de módulo/feature. ✅
- Sequence fixup: `MultiPaymentsModuleBackfill.SequenceFixupsSql` (L64) reseedea identidades de módulo 16/feature 44 por encima de los seeds. `BD_VIVA` + `ENUM`. ✅

#### `StoreSwitchDekWrapTests.cs` — DEK del switch
Módulo 7 vía `AuthzSeed.SeedOwnerAdminAsync` (scaffolding, sin asserts de módulos). ✅

### Users/

#### `ExportOfflineRosterPlanTests.cs` — roster offline según plan
Consts L35-42 (7, 6, 13, 12, 14 + features 36, 39, 38); 8 tests: roster paid refleja plan (StoreModuleIds {7,6,13,12,14} L67-70; **FeatureIds vacío SIEMPRE para StoreUser** L76; Roles por SRF L80-85), free solo 7 (L94-105), tras cambio de plan (roster NO filtra por billing: conserva 6/13 L139-145 vs `/me`), roundtrip sin duplicados (L160-190, catálogo paid − 12 L184-189), vencido excluye 12/13/14 (L207-226), owner synthetic (L236-257, SRF 36/37), 401 (L268), foreign 400 (L276), inactive store 403 (L298).
- `PaidCatalogModuleIdsAsync` L324 (`BD_VIVA`).
- **⚠️ DRIFT — `FeaturesForModule` L409-425** (`HELPER_HARD`): mismo mapa con **33/91 fantasma**.

#### `ExportOfflineRosterPlanGapTests.cs` — gaps del roster de planes
Consts L35-42 (+37, 39, 38). `Roster_warehouse_wholesale_multistores_in_paid_roster` (L47): StoreModuleIds {13,12,14} (L67-69); **OwnerAdmin FeatureIds {36,37,38,39}** (L76-79) — fija el fix `store-role-features-completeness` del 2026-09-20.
- **`FeaturesForModule` L155-162**: ✅ SIN fantasma (12 → [39] L158), solo 7/12/13/14. Es la versión limpia del mapa.

#### `ExportOfflineRosterTests.cs` — roster offline general
20 tests: vencido/aldía/noAplica exporta PriceIncluded / todos / todos (StoreModuleIds {7} o {7,6} L307/348/378); `OwnerAdmin_export_roster_matches_me_output_for_user` (L391: **roster FeatureIds/StoreModuleIds ≡ `/me`** L441-442); DEK/TTL (L455-622); inactivos excluidos (L625-708). Seeds: storeuser sin grant (L184), SRF 73 (L784), módulos 7+6 (L851-853). ✅

#### `OfflineRosterUsageAuthorizationTests.cs` — autorización de uso
`ProfileFeatureId=70` L38 (`ENUM FeatureType.Profile`; comentario L35-36: es el id de fila Feature, no el ordinal de `StoreRoleFeatures.ProfileAdmin`). 3 tests: token por usuario, autoriza uso 200, JWT expirado 401. Grants 70. ✅

#### `RosterExpiryTests.cs` — expiración del roster
`PaidStore_roster_and_JWT_expire_five_days_after_next_due_date` (L49), `FreeStore_roster_and_JWT_expire_default_35_days` (L102); `SetSelectedStoreAsync` L136. ✅

#### Grants de feature en Users (permisos 403/200)
| Test | Grant | Fuente |
|------|-------|--------|
| `UsersActivateTests.cs` L89-91 | feature **72** (`FeatureType.Users`) | `ENUM` |
| `UsersDeleteTests.cs` L70-72 | feature **72** | `ENUM` |
| `UsersUpdateTests.cs` L93/L229-231 | feature **70** (Profile) | `ENUM` |
| `UsersIsolationTests.cs` L51 | storeuser sin grant (control) | `SEED_PROPIO` |
| `UsersChangePasswordTests.cs` L162-164 | storeuser sin grant (control) | `SEED_PROPIO` |

### Warehouses/

#### `WarehousesAssignmentTests.cs` — backfill de módulo 13
`WarehouseFeatureIds=[36,37]` L22; `Backfill_sql_creates_exact_runtime_shapes_for_active_store` (L27: StoreModule 13 L39-40 + SRF 36/37 L52-53), `..._skips_inactive_store` (L67), `..._is_idempotent` (L101); ejecuta `WarehousesModuleBackfill.StoreModuleSql/StoreRoleFeatureSql` L127-128. ✅

#### `WarehousesCatalogTests.cs` — catálogo del módulo 13
`Migration_seeds_module_13_with_paid_two_and_a_half_effective_price` (L26), `Current_price_of_module_13_is_two_and_a_half` (L45), `Migration_seeds_features_36_37_under_module_13` (L52, L58-69), `Activate_stays_idempotent_with_feature_36_pre_seeded` (L76). `BD_VIVA` + `ENUM`. ✅

#### `WarehousesRuntimePathsTests.cs` — rutas runtime
`Register_assigns_warehouses_module_and_owner_features` (L30: StoreModule 13 L62-63 + SRF 36/37 L78-79), `Toggle_paid_to_free_deactivates_warehouses_module_and_features` (L92). `WarehouseFeatureIds` L25. ✅

#### `WarehousesBillingTests.cs` — billing con módulo 13
`Free_store_keeps_free_plan_and_sees_warehouses_module` (L27: `me.StoreModuleIds` contiene 13 L53; FeatureIds 36/37 L54-55). ✅

#### `WarehousesCreateStoreTests.cs` — creación con módulo 13
`Admin_create_store_with_warehouses_module_assigns_owner_features` (L30: ModuleIds=[13] L46; StoreModule 13 L56-57; SRF 36/37 L64-65). ✅

#### `WarehousesRollbackTests.cs` — rollback de la migración
`Migration_down_reverts_assignment_and_catalog_inside_rolled_back_transaction` (L42): `DownSql` + `DELETE StorePlanModule WHERE ModuleId=13` L57-65; verifica ausencia de features 36/37, StoreModule 13, SRF y StorePlanModule(13) L79-85. ✅

---

## 4. Resumen consolidado de drift (verificado contra BD viva, no especulado)

### ⚠️ 1. Features fantasma 33 (Egress) y 91 (StorePayment) en helpers `FeaturesForModule`

| Archivo | Líneas | Problema |
|---------|--------|----------|
| `AuthMePlanModulesTests.cs` | 415-431 | Módulo 3 → incluye **33**; módulo 9 → incluye **91** |
| `ExportOfflineRosterPlanTests.cs` | 409-425 | Ídem |
| `StorePlanChangeTests.cs` | 470-486 | Ídem |

- En la BD **no existen** filas `Feature` 33 ni 91 (sí existen en `FeatureType.cs:51/122`, `StoreRoleFeatures.cs:67/115` y `FeatureEntityTypeConfiguration`).
- Los seeds que usan estos helpers crean SRF que el generador real jamás produciría (el generador filtra por enum y no valida existencia en BD; `StoreRoleFeature` no tiene FK hacia `Feature`).
- **Impacto hoy: silencioso** — `/me` FeatureIds pasa por `FilterAvailableToStoreByIds` y las aserciones usan `Contain/NotContain` sobre otras features.
- Los helpers tampoco cubren módulos 15/16/17 (devuelven `[]` pese a que la BD tiene 43/44/120/121).

### ⚠️ 2. Módulo 16 (MultiPayments, feature 44) sin entrada en enum `StoreRoleFeatures`

- El enum termina en: MultiMonedas(43), Recipes(120), Elaborations(121), WholesaleSales(39), OwnerStores(38) — **no hay 44**.
- `PlanChangeMatrixTests.FeaturesByModule 16 → []` (L124) lo fija como comportamiento esperado (ancla calibrada). 🔶
- Consecuencia de negocio: una tienda con módulo 16 pago (VIP) NO recibe la feature 44 en `/me` ni en el roster offline.
- Misma clase de bug que el fix `store-role-features-completeness` (2026-09-20) arregló para 39 y 38 (**este quedó pendiente**).

### 🔶 3. Módulo 1 (Administración) `AvailableToStore=false`

- Nunca llega a tienda/roster; confirmado por `FeaturesAvailableGapTests` L30-34 y `AuthRegisterPlanTests` L77. Es **por diseño** (además `GetAvailableFeaturesToStore` excluye `ModuleType.Administration` por código).

### 🔶 4. Gaps de mapeo SRF documentados en código de test

- `StoreCreatePlanTests` L91-92 ({60,36,37} sí, {38,39} no) y `StorePlanChangeTests` L92-93 — **subsanados** para 38/39 por el fix del 2026-09-20; evidencia en `ExportOfflineRosterPlanGapTests` L76-79.

### ✅ NO es drift

- `FeaturesActivateGapTests` — recrea Egress(33) a propósito porque la BD no lo tiene (prueba la rama de creación).
- `ExportOfflineRosterPlanGapTests.FeaturesForModule` L155-162 — versión limpia, sin 33/91.
- `PlanChangeMatrixTests` — mapa calibrado contra la BD viva.

---

## 5. Archivos E2E que NO usan módulos/features

**Sin ninguna referencia** (sin seeds de filas de módulo, sin `PlanType`):
- `RateLimiting/RateLimitPoliciesTests.cs`, `RateLimiting/LoginRateLimitPoliciesTests.cs`
- `Middlewares/ErrorHandlerMiddlewareTests.cs`
- `Auth/`: `AuthTokenLifetimeTests`, `AuthRefreshTokenLifetimeTests`, `AuthPingTests`, `AuthMeTests`, `AuthMeFailureTests`, `AuthMeBlacklistParityTests`, `AuthLogoutTests`, `AuthLoginTests`, `AuthLoginValidationTests`, `AuthLoginSuccessTests`, `AuthLoginFailureTests`, `AuthLoginReSellerTests`, `AuthLoginOwnerAdminTests`, `AuthRegisterTests`*, `AuthRegisterValidationTests`, `AuthRegisterSuccessTests`*, `AuthRegisterDuplicateTests` (*crean tienda vía registro por API, no inspeccionan módulos/planes)
- `Billing/`: `BackfillMigrationTests`, `RegisterStorePaymentValidationTests`
- `Stores/`: `StoreRoleAccessTests`, `StoresHarnessSmokeTests`
- `Users/`: `UsersRolesTests`, `StoreUsersListTests`

**Uso solo como scaffolding** (seeds compartidos crean `StoreModule` 7/6 o grants de feature; los asserts no dependen de módulos/features):
- `Auth/`: `AuthLoginDekWrapTests`, `AuthLoginStoreUserTests`, `AuthMeDeactivationTests`, `AuthMeInactiveStoreOwnerTests`, `AuthMeStoreListTests` (grant 73 L148), `AuthMeStoreListIsActiveTests` (StoreModule 7 L78), `StoresAuthorizationTests` (grant 73 L58), `UsagesStoreUserAuthorizationTests` (grants 70 L47/L111), `UsagesSmokeTests`, `UsagesDashboardAlignmentTests`, `StoreScopingTests`
- `Users/`: `UsersActivateTests`, `UsersDeleteTests`, `UsersUpdateTests`, `UsersIsolationTests`, `UsersChangePasswordTests`, `StoreUsersCrudTests`, `StoreUsersByStoreIncludeInactiveTests`, `RosterEnvelopeContractTests`, `ExportOfflineRosterOwnerTests`, `UsersListTests`, `UsersGetByIdTests`
- `Stores/`: `StoreSwitchDekWrapTests`, `StoreDeactivationSessionTests`, `StoreGetByIdTests`, `StoresListTests`, `StoreApproveTests`, `StoresByCurrentUserTests`, `StoreDisapproveTests`
- `Billing/`: `PaymentDateTests`, `PaymentHappyPathTests`, `PaymentMoneyTests`, `GetReSellerCommissionsTests`, `ResellerCommissionsTests`
- `Owners/`: todos excepto `OwnersDeleteReferencesTests` y `OwnersUpdateTests` (comentario)

---

## 6. Referencias clave de producción consultadas

| Archivo | Relevancia |
|---------|------------|
| `backend/src/Domain/Common/Enums/FeatureType.cs` | Define los IDs de features (incluye 33 y 91) |
| `backend/src/Domain/Common/Enums/ModuleType.cs` | Define los IDs de módulos |
| `backend/src/Domain/Common/Enums/StoreRoleFeatures.cs` | Mapeo feature→roles→módulo; **sin entrada para 44** |
| `backend/src/Domain/Entities/Tenants/StoreRoleFeatureGenerator.cs` (L19-21) | Filtra por enum, no valida existencia en BD |
| `backend/src/Infrastructure/Persistence/EntityConfigurations/FeatureEntityTypeConfiguration.cs` (L151-152, 352-353) | Seed de código define 33/91 (drift vs BD) |
| `backend/src/Infrastructure/Persistence/EntityConfigurations/StoreRoleFeatureEntityTypeConfiguration.cs` (L22) | PK compuesta, sin FK a `Feature` |
| `backend/src/Infrastructure/Persistence/Repositories/FeatureRepository.cs` (L20, L35) | `FilterAvailableToStoreByIds`; excluye Administración por código |
| `backend/src/Infrastructure/Persistence/Repositories/StoreModuleRepository.cs` (L22-23) | Filtro de disponibilidad de módulos |