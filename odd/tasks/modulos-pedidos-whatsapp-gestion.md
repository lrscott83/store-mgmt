# Módulos nuevos: "Pedidos WhatsApp" y "Gestión de Pedidos"

## Objetivo

Reorganizar en **dos módulos nuevos** las funcionalidades que hoy cuelgan del módulo Catálogo web (18):
carrito + envío por `wa.me` + su configuración por un lado, y la **persistencia de la orden** en backend
+ gestión de entregas por otro. **Sin cambio de negocio**: es repartir lo que ya existe.

- **"Pedidos WhatsApp"**: cuando está activo, en el catálogo público se muestra el **carrito** y se
  puede **enviar el pedido por WhatsApp**; incluye **su configuración** (número, tipos de entrega,
  envío, mínimo, horarios, zonas). **No guarda nada en `Order`** ni gestiona entrega.
- **"Gestión de Pedidos"**: **sí guarda las órdenes** en el backend y **gestiona las entregas** y todo
  lo demás (vistas Pedidos / Ventas / Repartidores).
- **Catálogo web (18)** se queda con el catálogo y la marca.

## Decisiones del owner (2026-10-08)

| # | Decisión |
| --- | --- |
| M1 | Dos módulos nuevos: **"Pedidos WhatsApp"** y **"Gestión de Pedidos"**. |
| M2 | **El carrito pertenece solo a "Pedidos WhatsApp"**. "Gestión de Pedidos" administra las órdenes que ya existen. Sin "Pedidos WhatsApp" no hay carrito ni pedidos nuevos. |
| M3 | **La orden se persiste solo cuando "Gestión de Pedidos" está activo.** Con solo "Pedidos WhatsApp" el pedido se arma y se envía por `wa.me` **sin crear `Order`** y sin gestionar entrega. |
| M4 | La **configuración** necesaria vive en la vista **"Pedidos WhatsApp"**. |
| M5 | Precio de **ambos módulos: 10 con 50% de descuento** → `Price=10, PercentDiscountPrice=50, DiscountPrice=0` (**actual 5**). |
| M6 | Los dos módulos van a los planes **Superior (3) y VIP (4)** — igual que Catálogo web. |

## Diseño técnico

### Módulos (catálogo)

- `ModuleType.PedidosWhatsApp = 19` (`[Description("Pedidos WhatsApp")]`).
- `ModuleType.GestionPedidos = 20` (`[Description("Gestión de pedidos")]`).
- `Order` de módulo: 150 y 151 (el último usado es 140).

### Features

- Nueva `FeatureType.PedidosWhatsApp = 124` (`[Description("Pedidos WhatsApp")]`), `ModuleId=19`,
  `Order=252`, `AvailableToStore=true`. Gatea la **config** y el carrito.
- **Mover** la feature existente `OnlineOrders = 123` del módulo 18 al **módulo 20** (cambio de
  `HasData` → `UpdateData` de EF).
- `WebCatalog = 122` se queda en el módulo 18.

### `StoreRoleFeatures`

- `PedidosWhatsAppAdmin` (feature 124, módulo 19), `[HasRoles(OwnerAdmin)]` (la config es del dueño).
- `OnlineOrdersAdmin` (feature 123): cambiar `[HasModule(ModuleType.GestionPedidos)]`
  (roles OwnerAdmin + StoreUser, sin cambios).
- `WebCatalogAdmin` (122, módulo 18): sin cambios.

### Gating (comportamiento)

- **Carrito visible** en el catálogo público ⟺ la tienda tiene el **módulo 19** activo (y la config
  `StoreCatalogSettings.Enabled`).
- **La orden se persiste** ⟺ la tienda tiene el **módulo 20** activo. Si no, el checkout **no hace
  `POST`**: arma el `wa.me` en cliente.
- El **config público** (`GET /public/ordering/{slug}/config`) expone los **flags de los dos módulos**
  (`PedidosWhatsAppEnabled` / `GestionPedidosEnabled`). El **número de WhatsApp NO viaja ahí**: sigue en la
  respuesta de creación (`F4-T2`), que solo recibe quien deja sus datos de contacto.

### Migración + script (README/AGENTS.md)

Una sola migración EF; el `.sql` se **genera** (`dotnet ef migrations script <anterior>`, sin `-To`)
y se guarda como **`scripts/31-<nombre>.sql`** (el último es el 30). La migración incluye:

1. `HasData`: altas de `Module` 19/20, `Feature` 124, cambio de `ModuleId` de la 123, `StorePlanModule`
   (19/20 → planes 3 y 4).
2. `setval` de los seriales `"Module"` y `"Feature"` (los insert con PK explícita no avanzan el serial).
3. **Backfill por SQL crudo** (no `HasData`) de `StoreModule` (módulos 19/20) y `StoreRoleFeature`
   (features 124 y 123) para las tiendas existentes de Superior/VIP, derivando el universo de
   `StoreModule`/plan (patrón `OnlineOrdersRoleFeatureBackfill`).

## Tareas

- [x] **T1** — `ModuleType` 19/20 + `FeatureType` 124 + `StoreRoleFeatures` (124 nuevo; 123 cambia de módulo).
- [x] **T2** — `HasData`: `Module` 19/20, `Feature` 124, `ModuleId` de 123 → 20, `StorePlanModule` 19/20 → planes 3/4.
- [x] **T3** — Migración EF + **script 31** generado (con el patch de idempotencia) + fila en `scripts/README.md`.
- [x] **T4** — Backfill SQL de `StoreModule` y `StoreRoleFeature` para tiendas existentes (+ `setval`).
- [x] **T5** — Backend: el config público expone los flags de módulo (**no** el número: ya no viaja aquí, F4-T2).
- [x] **T6** — Backend: `CreateOnlineOrderCommand` exige módulo 20 (y la config) para persistir.
- [ ] **T7** — Frontend: carrito gated por módulo 19; checkout sin `POST` cuando no hay módulo 20.
- [ ] **T8** — Frontend: gating de las vistas de gestión por el módulo 20.
- [ ] **T9** — i18n.
- [ ] **T10** — Tests.
- [ ] **T11** — Verificación.

## Criterios de aceptación

1. Existen los módulos "Pedidos WhatsApp" y "Gestión de Pedidos" (precio 10, 50% → 5) en Superior y VIP.
2. Con solo "Pedidos WhatsApp": el catálogo muestra carrito y el pedido se envía por `wa.me` **sin crear `Order`**.
3. Con "Gestión de Pedidos": la orden **se persiste** y se gestionan entregas (Pedidos/Ventas/Repartidores).
4. La configuración necesaria se edita en la vista "Pedidos WhatsApp".
5. La migración aplica limpia y el **script 31 generado** es idempotente.
6. Catálogo web (18) y marca siguen funcionando igual.

## Riesgos

- **Mover la feature 123 de módulo** afecta a `StoreRoleFeature`/`StoreModule` existentes → backfill y verificación.
- **Módulos sin mapeo** quedan invisibles en `/me` y el roster → entradas en `StoreRoleFeatures`.
- **Migración**: la fuente es EF; el `.sql` se genera, nunca a mano.

## Progreso

- 2026-10-08 — Feature creado. Decisiones M1–M6 del owner. Sin implementación.
- 2026-10-08 — **T1–T4 cerradas.** Migración EF `20261008185523_Add-PedidosWhatsApp-GestionPedidos-Modules`
  + script `backend/scripts/31-20261008-Add-PedidosWhatsApp-GestionPedidos-Modules.sql` (generado con
  `dotnet ef migrations script 20261008021950_Add-StoreCatalogImages`, sin `-To`). Catálogo por `HasData`,
  SQL crudo solo para la parte por tienda (`PedidosModulesBackfill`). Tests: 163 Domain.UnitTests +
  1140 Application.Tests en verde.
  - **Gotcha propio de esta migración**: el scaffolder de EF ordena las sentencias de seed por TABLA, no
    por dependencia FK, así que el `UpdateData` de `Feature 123 → 20` salía **antes** del `InsertData` de
    `Module 19/20` en el `Up()` y **después** de su `DeleteData` en el `Down()`. Ambos reventan con
    `23503 FK_Feature_Module_ModuleId`. Orden corregidos a mano (solo el orden, ningún texto SQL), con
    los `ORDER NOTE` explicados en la migración y en el script.
  - El `Down()` borra `StoreRoleFeature` 124 y `StoreModule` 19/20, pero **no** las filas de la
    feature 123: son de la migración 29 (`scripts/29`), no de esta.
  - El grant de 123 se deriva del **módulo 18**, no del 20: tienda con solo el 19 no debe adquirir
    permisos de gestión de pedidos (M2/M3). Hay un `SELECT` de verificación que lo fija.
  - El `Down()` está probado: revertido y reaplicado contra `smca_test`, no solo aplicado.
- 2026-10-08 — **Cierre de hallazgos de revisión (M-R3-001/002/003).**
  - El E2E `StorePlanCatalogTests` se actualizó para listar los módulos 19/20 en Superior y VIP (M6). Estaba
    **rojo**: el seed de `StorePlanModule` ya los añade desde el 2026-10-08 y el test mantenía la lista vieja,
    así que `BeEquivalentTo` fallaba — hallazgo del cierre de review, no un defecto del seed.
  - La query de verificación #4 del script 31 (cartesiano `JOIN "Feature" ON TRUE`) reescrita con `UNION ALL`
    por fila; ahora sí puede devolver el conteo que documenta.
  - Topología congelada en tests: `PedidosModulesSeedTests` (módulos 19/20, feature 123→20, 124→19,
    `StorePlanModule` solo 3/4) y `Catalog.PedidosModulesBackfillTests` (contrato del SQL compartido).
  - **M-R3-003 reclasificado como falso positivo**: el `DELETE` amplio del `Down` lo exige la FK **Restrict** —
    el `Down` también borra `Module 19/20` y `Feature 124`, así que cualquier fila superviviente en
    `StoreModule`/`StoreRoleFeature` violaría la FK y el rollback reventaría. Módulos nuevos ⇒ no hay filas
    preexistentes que acotar. Cubierto por test de contrato.
- 2026-10-10 — **T5 y T6 cerradas** (gating de módulos en backend, parte de T10).
  - **Lectura pública de módulos**: `IStoreModuleRepository.GetPublicActiveModuleIdsByStoreIdAsync(storeId)`
    → `IReadOnlyCollection<int>`, con `IgnoreQueryFilters()` porque `StoreModule` tiene filtro global
    `IsSuperAdmin || TenantId == TenantId` (`StoreModuleEntityTypeConfiguration:21`) y el anónimo no tiene
    tenant: con la lectura de sesión el conjunto saldría VACÍO. Devuelve solo los `ModuleId` con
    `StoreModule.IsActive`, **sin** filtrar por `Module.IsActive`/`AvailableToStore` — el gating responde
    "¿la TIENDA tiene este módulo?", no "qué puede ofrecer el catálogo" (`GetAvailableModulesByStoreIdAsync`
    seguiría siendo el camino equivocado para un booleano).
  - **Flags**: `PublicOrderingConfigDto.PedidosWhatsAppEnabled` (19) y `.GestionPedidosEnabled` (20), con
    `ModuleType` como fuente de los ids (no números sueltos). Son INDEPENDIENTES de `Enabled`: uno es la
    decisión de la tienda, el otro lo que compró.
  - **T6**: `CreateOnlineOrderCommandHandler` llama a `EnsureGestionPedidosAsync` **después** de
    `LoadEnabledSettingsAsync` y antes de cualquier escritura. Sin el 20 → 400
    `OnlineOrdersModuleNotEnabled` (es/en) y **nada** persistido. El 19 NO se exige aquí: el 19 habilita el
    carrito (M2), no la persistencia. Firma del comando sin cambios.
  - **Tests**: 430 `Application.Tests` en verde con `--filter FullyQualifiedName~OnlineOrdering`. 9 casos
    nuevos de flags (19 solo / 20 solo / ambos / ninguno / solo WebCatalog) + 6 del gating del alta, con
    `AddAsync`/`SaveChangesAsync`/`CodeExistsAsync` en `Never`. Sonda de mutación: quitar el
    `await EnsureGestionPedidosAsync(...)` pone en rojo exactamente los 3 tests que lo cubren.
  - **BLOQUEO (decisión del owner pendiente) — 3 E2E existentes quedan en rojo por T6**, verificado
    contra `smca_test` (`[E2E Guard] ... Database=smca_test`, 3 Failed / 24 Passed en
    `--filter FullyQualifiedName~E2ETests.Orders`):
    `PublicOrderingRateLimitE2ETests.R2_1_the_exceeding_post_is_rejected_with_429_by_the_middleware`,
    `R2_2_exhausting_one_slug_does_not_throttle_another_slug_from_the_same_ip` y
    `R2_3_the_slug_partition_key_normalizes_case`. **No es un defecto del gating**: los tres hacen POST y
    esperan 200, y ahora reciben 400.
    La causa es el seed: `PublicOrderingSeed.SeedAsync` crea la tienda con
    `db.Set<Store>().Add(store)` (saltándose el servicio que reparte `StoreModule` desde el plan) y **no**
    siembra filas `StoreModule` 19/20, así que la tienda sembrada nunca compró el módulo 20.
    El arreglo es de UNA línea en el seed (`db.Set<StoreModule>().Add(...)` para 19 y 20) — y `CleanupAsync`
    tendría que borrarlas antes de la tienda por la FK Restrict — pero `PublicOrderingSeed.cs` es un
    **support file de E2E existente** y la regla del repo lo prohíbe sin autorización explícita. **No se tocó.**
