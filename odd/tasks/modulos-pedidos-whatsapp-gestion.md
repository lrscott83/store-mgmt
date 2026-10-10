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
  (`PedidosWhatsAppEnabled` / `GestionPedidosEnabled`). El **número de WhatsApp TAMBIÉN viaja ahí** —
  esto **revierte F4-T2** (decisión T5, 2026-10-10); ver "Supersesión de F4-T2" abajo.

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
- [x] **T5** — Backend: el config público expone los flags de módulo y (desde 2026-10-10) el número de
  WhatsApp —**revierte F4-T2**, ver "Supersesión de F4-T2" abajo.
- [x] **T6** — Backend: `CreateOnlineOrderCommand` exige módulo 20 (y la config) para persistir.
- [x] **T7** — Frontend: carrito gated por módulo 19; checkout sin `POST` cuando no hay módulo 20.
- [x] **T8** — Frontend: gating de las vistas de gestión por el módulo 20.
- [x] **T9** — i18n.
- [x] **T10** — Tests.
- [x] **T11** — Verificación.

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
- 2026-10-10 — **T7–T11 cerradas** (gating de módulos en el frontend + el número al config público).
  Sin commits en esta pasada.
  - **Supersesión de F4-T2 (decisión T5 aplicada)**: el config público **también** expone
    `WhatsappNumber`. F4-T2 lo dejaba solo en la respuesta de creación, y esa justificación —"solo
    recibe quien deja sus datos de contacto"— se rompe con M3: el modo "solo Pedidos WhatsApp" **no
    hace `POST`**, así que **no hay respuesta de creación** de la que sacar el número. Un gate que
    depende de una respuesta que en ese modo no se produce es un gate roto. Sigue sin exponer
    dirección, notas ni nada del cliente. Reflejado en el DTO, en el query, en los tests de
    `GetPublicOrderingConfigQueryHandlerTests` (el `ShouldCarryNoWhatsappNumber` se invirtió) y en el
    test F4-R4 del frontend.
  - **Carrito (M2)**: `orderingEnabled` pasa a ser `enabled && pedidosWhatsAppEnabled`. Los dos
    interruptores se exigen, y son independientes (uno es lo que compró la tienda, el otro si abre
    pedidos hoy). Sin el 19 no hay botón de carrito, ni "añadir" en la tarjeta, ni en el detalle, y
    el checkout ni se monta. El aviso `CATALOG_PUBLIC.ORDERS_DISABLED` cubre los dos casos: para el
    cliente la consecuencia es la misma —no se pide—.
  - **Checkout (M3)**: `persistsOrders = config.gestionPedidosEnabled`. Sin el 20 **no se llama al
    servicio** (ni para fallar: solo conseguiría el 400 con el que el backend rechaza el alta por
    diseño). Con módulo 20, el flujo es el de siempre: POST + resumen con el snapshot del servidor +
    `code` en el aviso. El aviso tiene dos copys según haya `Order` o no: con pedido,
    `WHATSAPP_PENDING`/`WHATSAPP_BLOCKED` (los de siempre); sin pedido,
    `WHATSAPP_SENT`/`WHATSAPP_BLOCKED_NO_ORDER`, que no promete un pedido guardado. `WhatsAppSend.code`
    pasa a `string | null` —`null` **es** "no hay pedido guardado"—, no un dato que falte. La defensa
    de doble envío (`submittingRef`) se suelta en las dos ramas: sin POST no hay nada en vuelo.
  - **El carrito NO se vacía en el modo sin persistencia**: el pedido solo vive en el chat de WhatsApp,
    y vaciarlo tiraría el trabajo del cliente si el handoff no llegó a completarse. El padre recibe
    `onSentWithoutOrder` (cierra el checkout) en vez de `onCreated` (que además abriría la consulta de
    un pedido inexistente).
  - **Cruce con el modo staff**: el handoff por WhatsApp se suprime para el staff **solo cuando el
    pedido se persistió** (`sendsByWhatsapp = !staffMode || !persistsOrders`). La alternativa —suprimirlo
    siempre— dejaba un botón que no hace nada visible para el dueño que atiende en el local. Con
    módulo 20 el modo staff queda intacto (registra, no manda, y su botón sigue diciendo "Registrar
    pedido"); sin módulo 20 el botón dice "Enviar por WhatsApp" para todos, porque "Registrar
    pedido" sería una etiqueta que miente.
  - **Resuelto**: `buildWhatsAppOrderLink` ahora acepta `code` **opcional** (`string | null`) y su
    cabecera omite el `Pedido <código>` cuando no hay pedido; el modo sin persistencia pasa
    `code: null` y la primera línea es solo el nombre de la tienda. Fijado por test
    (`sin código el encabezado es solo la tienda`).
  - **T8 — hallazgo, sin cambios en los cargadores**: `ordering-orders.tsx`, `ordering-sales.tsx` y
    `ordering-drivers.tsx` **ya gatean** con `featureLoader([EFeatures.OnlineOrders])`, o sea por la
    feature **123**, que desde T1/T2 es del módulo **20**. El gate de T8 se cumple sin tocar una
    línea; lo que documenta cada vista (bypass de OwnerAdmin/SuperAdmin en `featureLoader`, módulo
    replicado en el ítem de menú) sigue siendo cierto.
  - **Pendiente de T8 (fuera de las superficies de esta pasada)**: `menu-config.ts` sigue apuntando
    `moduleId`/`moduleIds` a `EModules.WebCatalog` (**18**) en los tres ítems de gestión, y
    `packages/domain/src/enums/index.ts` no tiene `PedidosWhatsApp = 19` / `GestionPedidos = 20`. Con
    la fila de `StoreRoleFeature` 123 derivada del módulo 18 (backfill de T4), una tienda con 18 y
    **sin** 20 pasa el gate de la vista y recibe un 403 en el primer GET. Reapuntar el menú a `20` y
    añadir los dos `EModules` es lo que cierra del todo el gating; requiere esos dos archivos.
  - **Fuera de alcance tocado (1 archivo)**: `storefront-checkout-staff.test.tsx` tiene su propia
    fixture `CONFIG: PublicOrderingConfig` y, sin los flags nuevos, sus 5 tests medirían el flujo de
    un checkout que ya no hace `POST`. Se le añadieron `pedidosWhatsAppEnabled`/`gestionPedidosEnabled`
    a la fixture y **nada más**: ninguna aserción de ese archivo se tocó.
  - **Tests**: 10 nuevos (8 de componente en `storefront-flow.test.tsx`, 2 de página en
    `public-catalog.test.tsx`): carrito oculto sin el 19 (y con el 19 pero `enabled: false`), con solo
    el 19 **no hay `POST`** + el `wa.me` se arma con el carrito y el número del config + el aviso no
    promete un pedido guardado + el botón no dice "Registrar pedido", sin número en el config el envío
    queda bloqueado, y con los dos módulos el flujo es el de siempre (POST + código + carrito vacío).
    Sonda de mutación: `persistsOrders = true` deja en rojo exactamente los **8** tests que dependen
    del gate (y los revertidos).
  - **Verificación (2026-10-10)**:
    - `dotnet build src/SMCA.sln` → `Build succeeded`, 0 errores, sin `error MSB` (testhost limpiado antes).
    - `dotnet test src/Application.Tests/Application.Tests.csproj --filter "FullyQualifiedName~GetPublicOrderingConfig"`
      → `Passed! 59 / 59`.
    - `pnpm vitest run app/catalog/ app/sales/` → **82 archivos / 1725 tests en verde**, `Type Errors: no errors`.
    - `pnpm exec eslint` sobre los 10 archivos tocados → sin salida (limpio).
    - `pnpm typecheck` → solo los **2 errores preexistentes y ajenos** de
      `app/admin/modules/routes/__tests__/module-catalog.test.tsx` (663/664). Ninguno nuevo.
  - **Sigue pendiente de la pasada anterior**: el bloqueo de los 3 E2E de
    `PublicOrderingRateLimitE2ETests` por el seed que no siembra `StoreModule` 19/20. Nada de esto la
    toca ni la desmiente; sigue necesitando autorización para tocar `PublicOrderingSeed.cs`.
