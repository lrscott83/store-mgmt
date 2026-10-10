# Pedidos WhatsApp — persistencia, entidades y estados (F2)

## Objetivo

Extender las entidades **existentes** `Order`/`OrderItem` con los campos del pedido online, añadir
las tablas nuevas `StoreCatalogSettings` (config de pedidos **y** marca) y `DeliveryDriver`, definir
los enums `OrderStatus`/`OrderPaymentStatus`/`OrderDeliveryType` y `OrderType.WhatsApp = 101`, crear
el **command server-side que crea un `Order`** (hoy no existe ninguno: toda la escritura de pedidos
es local del POS), fijar las **reglas de transición de estado**, el **aislamiento POS ↔ backend**, la
feature de gestión `OnlineOrdersAdmin` y la **migración EF + script 29**.

## Problema

`Order`/`OrderItem` existen pero solo los escribe el POS en localStorage (`OrderOfflineService`);
**no hay ningún endpoint ni command que cree un `Order` en el servidor**. Tampoco existen campos para
cliente, entrega, estado, pago ni repartidor, ni tablas para la configuración/marca y los
repartidores. Sin esta base, F1 (config), F3 (crear pedido), F5 (gestionar), F6 (ventas) y F7
(repartir) no pueden persistir nada.

## Por qué

- **Reutilizar y extender** `Order`/`OrderItem` (D6) evita duplicar el modelo de pedido y aprovecha
  que `OrderItem` ya guarda el snapshot (`ProductId`, `Name`, `Price`, `Quantity`, `OrderIndex`).
- Centralizar entidades, enums y la máquina de estados en una sola feature hace que el resto de
  features compartan un contrato único.
- Respetar **D14** (sin sincronización POS ↔ backend) garantiza que extender `Order` no rompa el POS
  local ni sus ventas.
- Una **sola migración** (y su script generado) mantiene el despliegue al VPS atómico y auditable.

## Alcance

### Autorizado

- Extender `backend/src/Domain/Entities/Orders/Order.cs` y (si aplica) `OrderItem.cs` con campos
  **nullable**.
- Nuevas entidades `StoreCatalogSettings` (config + marca) y `DeliveryDriver`.
- Nuevos enums en `backend/src/Domain/Common/Enums/` (`OrderType.WhatsApp = 101` incluido).
- Configuración EF (`OrderEntityTypeConfiguration`, nuevas configuraciones), repositorios nuevos y
  **una migración EF** (el `.sql` se **genera** con `dotnet ef migrations script`).
- `CreateOnlineOrderCommand` (server-side) con sus validaciones.
- Reglas de transición de estado (dominio o aplicación).
- Feature de gestión `OnlineOrdersAdmin` (propuesta de nombre) en `StoreRoleFeatures`, con
  **OwnerAdmin + StoreUser**, colgada del módulo Catálogo Web.

### Fuera de alcance

- No se inventan entidades `OnlineOrder`/`OnlineOrderItem` (prohibido por el owner).
- No se añade método/tipo de pago a la orden ni a `OrderItem` (D3/D6). `OrderPayment` no se usa para
  pedidos online.
- **No** se añade ninguna moneda configurable de pedidos (A3 eliminada): `Order.Currency` sale del
  catálogo/producto.
- No se sincronizan ventas del POS al backend (D14).
- No se implementa todavía el carrito, el enlace `wa.me`, el dashboard, las ventas ni el CRUD de
  repartidores (F3–F7), aunque sus entidades quedan aquí.
- No se altera el catálogo web ni su UI.

## Dependencias

- F1 consume `StoreCatalogSettings` (config de pedidos).
- F8 consume/edita las columnas de marca de `StoreCatalogSettings` y aplica logo/banner/paleta.
- F3 usa `CreateOnlineOrderCommand`; F5 usa las transiciones de estado; F7 usa `DeliveryDriver`.
- Patrón de entidad: `Order`/`OrderItem` actuales; enums existentes en `Domain/Common/Enums`
  (`OrderType`, `Currency`, `SalePaymentMethod`).
- Patrón de migración y generación de `.sql`: `AGENTS.md` → *Database migrations* y
  `backend/scripts/README.md`.

## Decisiones del owner aplicables

| # | Decisión | Cómo aplica a F2 |
| --- | --- | --- |
| D3 | Pago manual en entrega/recogida | No hay método/tipo de pago; solo `PaymentStatus`. |
| D5 | Tabla nueva de repartidores | `DeliveryDriver`. |
| D6 | Reutilizar `Order`/`OrderItem` y extenderlas; snapshot en `OrderItem` | Núcleo de esta feature. |
| D7 | Config en tabla nueva por tienda | `StoreCatalogSettings`. |
| D11 | `New → Accepted → Preparing → Ready → Delivered` (+`Cancelled`) | Enum `OrderStatus` + transiciones. |
| D12 | Pago `Pendiente / Pagado` | Enum `OrderPaymentStatus`. |
| D14 | Sin sincronización POS ↔ backend | `Order` del backend = solo online. |
| D15 | StoreUser gestiona pedidos/ventas/repartidores; OwnerAdmin configura | Feature `OnlineOrdersAdmin` (OwnerAdmin + StoreUser). |
| D16 | Horarios/zonas = texto simple | `BusinessHours`/`DeliveryZones` como texto. |
| D17 | Añadir `OrderType.WhatsApp = 101` | Enum `OrderType`. |
| D18 | Sin estado "En camino" en v1 | No se crea ese estado. |
| D19 | Marca y config en la misma tabla; marca en la vista Catálogo Web | `StoreCatalogSettings` incluye las columnas de marca. |
| — | Precios/moneda | **Fuera de alcance**: los precios y la moneda vienen del catálogo. |

## Decisiones resueltas y notas

**No quedan decisiones abiertas bloqueantes para F2.** Las antiguas A3/A4/A5 quedaron resueltas así:

- **A3 → ELIMINADA**: no hay moneda configurable de pedidos online. `Order.Currency`/`OrderItem.Currency`
  toman el valor del catálogo/producto; `StoreCatalogSettings` **no** tiene columna `Currency`.
- **A4 → D17**: se añade `OrderType.WhatsApp = 101` al enum existente (resuelto, ya no es propuesta).
- **A5 → D18**: **no** hay estado "En camino" en v1 (solo la secuencia
  `New → Accepted → Preparing → Ready → Delivered` + `Cancelled`).

## Diseño técnico

### Extensión de `Order` (nullable, sin romper el POS — D6)

Campos nuevos:

- `Code` (`string?`): código público corto, único por tienda, para consulta y WhatsApp.
- `DeliveryType` (`OrderDeliveryType`, default `Pickup`).
- `Status` (`OrderStatus`, default `New`).
- `PaymentStatus` (`OrderPaymentStatus`, default `Pending`).
- `CustomerName` (`string?`), `CustomerPhone` (`string?`).
- `DeliveryAddress` (`string?`, solo domicilio), `Notes` (`string?`).
- `DriverId` (`Guid?`, FK a `DeliveryDriver`), navegación `Driver`.

`OrderItem` se conserva **tal cual** (ya lleva el snapshot). No se le añaden campos de pago. Su
`Currency` se hereda del producto del catálogo.

> La factoría privada `Order.Create(...)` debe ampliarse o añadirse una sobrecarga
> `Order.CreateOnline(...)` para fijar los campos nuevos (propuesta: sobrecarga nueva, dejando la
> actual intacta para no alterar llamadas existentes). **Modificar `Order.cs` es tocar código de
> producción: requiere notificación y aprobación explícita del owner** (regla de alcance del repo).

### Enums nuevos (`Domain/Common/Enums`)

```
OrderStatus:           New = 0, Accepted = 1, Preparing = 2, Ready = 3, Delivered = 4, Cancelled = 5
OrderPaymentStatus:    Pending = 0, Paid = 1
OrderDeliveryType:     Pickup = 0, Delivery = 1
OrderType (existente): … + WhatsApp = 101   (D17)
```

### `StoreCatalogSettings` (nueva, por tienda — D7/D19)

`AuditableEntity<Guid>, ITenantBaseEntity`.

- **Pedidos (F1)**: `Enabled` (bool, default `false`), `WhatsappNumber` (string?),
  `PickupEnabled` (bool), `DeliveryEnabled` (bool), `DeliveryFee` (decimal),
  `MinimumOrderAmount` (decimal), `BusinessHours` (string?, D16), `DeliveryZones` (string?, D16).
- **Marca (F8)**: `LogoKey` (string?), `BannerKey` (string?), `PaletteId` (string; por defecto la
  paleta actual).
- **Comunes**: `StoreId` (único), `TenantId`, `SyncedAt`.
- **Sin** `Currency` (A3 eliminada).

### `DeliveryDriver` (nueva, por tienda — D5)

`AuditableEntity<Guid>, ITenantBaseEntity`: `Id`, `StoreId`, `TenantId`, `Name`, `Phone`, `IsActive`.

### Feature de gestión `OnlineOrdersAdmin` (D15)

`StoreRoleFeatures.OnlineOrdersAdmin` (propuesta de nombre), colgada del módulo Catálogo Web
(`ModuleType.WebCatalog = 18`), con **`[HasRoles(OwnerAdmin, StoreUser)]`** y su `[HasFeature(...)]`
propio del módulo. Es la feature que protege pedidos, ventas y repartidores (F5/F6/F7). La
**configuración** y la **marca** siguen bajo `WebCatalogAdmin` (OwnerAdmin).

> Como toda feature con módulo, debe tener su entrada en `StoreRoleFeatures` (`[HasFeature]` +
> `[HasModule]`) — ver la nota de `AGENTS.md`; una feature sin mapeo queda invisible en `/me` y en el
> roster offline.

### Repositorios (propuesta)

- `IOrderRepository` (nuevo): crear/leer pedidos online por tienda, código y rango de fechas.
- `IStoreCatalogSettingsRepository` (nuevo): lectura/upsert por `StoreId`.
- `IDeliveryDriverRepository` (nuevo): CRUD por tienda.

### `CreateOnlineOrderCommand` (server-side)

`CreateOnlineOrderCommand` → `OnlineOrderCreatedDto` (`Id`, `Code`, `Total`, `Currency`). Pasos:

1. Resolver tienda por `StoreId`/slug y verificar `StoreCatalogSettings.Enabled`.
2. Validar `DeliveryType` permitido (`PickupEnabled`/`DeliveryEnabled`); si `Delivery`, exigir
   `DeliveryAddress`.
3. Recalcular el **total en servidor** a partir de los `ProductId` + cantidades y la **moneda del
   catálogo** (nunca confiar en el total ni en la moneda del cliente).
4. Aplicar `DeliveryFee` y validar `MinimumOrderAmount`.
5. Generar `Code` único por tienda; crear `Order` (`OrderType = WhatsApp`, D17) y sus `OrderItem` con
   el snapshot leído en servidor.
6. `PaymentStatus = Pending`, `Status = New`.
7. Persistir y devolver el `Code`.

> El detalle de validaciones anti-abuso y del payload del pedido vive en F3; aquí se fija el comando
> y la persistencia.

### Reglas de transición de estado (`OrderStatus`)

```
New        → Accepted, Cancelled
Accepted   → Preparing, Cancelled
Preparing  → Ready, Cancelled
Ready      → Delivered, Cancelled
Delivered  → (terminal)
Cancelled  → (terminal)
```

**No existe el estado "En camino" (D18).** Cualquier transición fuera de esta tabla se rechaza (400
propuesto). El pago (`Pending → Paid`) es independiente del estado del pedido, salvo que
`Delivered`/recogido suele acompañar a `Paid` (marcado a mano — D3/D12). Máquina propuesta como
método de dominio `Order.ChangeStatus(OrderStatus)` que lanza `ApiException` en transiciones
inválidas.

### Migración EF y script 29 (la migración es la fuente; el `.sql` se genera) — obligatorio

Una sola migración incluye **todos** los cambios (columnas de `Order`, tablas `StoreCatalogSettings` y
`DeliveryDriver`, `OrderType.WhatsApp`). El script se **genera** de la migración (nunca a mano):

1. `dotnet ef migrations add Add-StoreCatalogSettings-Drivers-OrderFields --project src/Infrastructure --startup-project src/SMCA.WebApi`
2. Aplicar contra `smca` (dev) y `smca_test` (`database update`).
3. Generar el script **desde la migración** (regla AGENTS.md: migración única → `-From` la **previa**
   y **sin** `-To`):
   `dotnet ef migrations script <PreviousMigration> --project src/Infrastructure --startup-project src/SMCA.WebApi -o scripts/29-<nombre>.sql`
4. Patch obligatorio del script generado: `ON CONFLICT ("MigrationId") DO NOTHING;` + cabecera
   (nombre, migración EF, fecha) + `SELECT`s de verificación. **Nunca** escribir el `.sql` a mano.
5. Añadir la fila del nuevo script a la tabla de `backend/scripts/README.md`.
6. **VPS** (ver `README.md` raíz §4): backup **antes**, luego
   `podman exec -i smca_postgres_db psql -U postgres -d smca < backend/scripts/29-<nombre>.sql`.

Nombre propuesto del script: `29-20261006-Add-StoreCatalogSettings-Drivers-OrderFields.sql`.

### Aislamiento POS ↔ backend (D14)

- La tabla `Order` del backend pasa a contener **exclusivamente pedidos online**.
- El POS no lee ni escribe estos pedidos; sigue con su almacén local cifrado.
- El carrito del storefront es un store propio (F3) y no usa `useCartStore` ni `lizoft-cart`.

### UI React

Sin UI en F2. Los contratos de tipos TypeScript (`OrderStatus`, `OrderPaymentStatus`,
`OrderDeliveryType`, DTOs) se añaden al paquete `@store-mgmt/domain` para consumo de F3/F5/F6/F7
(**propuesta**: mantener los enums espejo en `frontend-react/packages/domain`).

## Tareas

- [x] **T1** — Enums `OrderStatus`, `OrderPaymentStatus`, `OrderDeliveryType`; `WhatsApp = 101` en
  `OrderType` (D17).
- [x] **T2** — Entidades `StoreCatalogSettings` (config + marca) y `DeliveryDriver`.
- [x] **T3** — Feature `OnlineOrdersAdmin` (OwnerAdmin + StoreUser) en `StoreRoleFeatures`, colgada
  del módulo Catálogo Web.
- [x] **T4** — Extender `Order` con los campos nullable + factory `CreateOnline` (aprobado por el
  owner para tocar producción).
- [x] **T5** — Configuración EF (Order, OrderItem, StoreCatalogSettings, DeliveryDriver), índices
  únicos (`Order.StoreId`+`Code`, `StoreCatalogSettings.StoreId`) y FK `DriverId`.
- [x] **T6** — Repositorios `IOrderRepository`, `IStoreCatalogSettingsRepository`,
  `IDeliveryDriverRepository` (+ registros DI).
- [x] **T7** — `CreateOnlineOrderCommand` con recalculo de total, snapshot, moneda del catálogo y
  `Code`.
- [x] **T8** — Reglas de transición `OrderStatus` (método de dominio + test unitario de la tabla).
- [x] **T9** — **Migración EF** `Add-StoreCatalogSettings-Drivers-OrderFields` y **script 29
  generado** (con el patch de idempotencia) + fila en `backend/scripts/README.md`.
- [x] **T10** — Tipos espejo en `@store-mgmt/domain`. **Resuelto como NO implementado (2026-10-10)**: los tipos del carrito/pedido viven en la propia app (`app/sales/lib/services/catalog-http-service.ts`), no en el paquete compartido, porque no hay otro consumidor que la app del POS; `frontend-react/AGENTS.md` manda YAGNI. Si otra app los necesita, se mueven entonces.
- [x] **T11** — Tests unitarios de dominio (defaults, transiciones válidas/inválidas) y de aplicación
  (command con Moq). Nuevos E2E solo en ficheros nuevos si se autoriza.
- [x] **T12** — Verificación (build, tests, `database update` + `migrations script`).

## Criterios de aceptación

1. `Order` y `OrderItem` conservan su comportamiento actual para el POS (campos nuevos nullable, sin
   cambios de firma que rompan llamadas existentes).
2. Existen `StoreCatalogSettings` (una fila por tienda, con config **y** marca) y `DeliveryDriver`
   (por tienda).
3. `CreateOnlineOrderCommand` persiste un `Order` con `Code`, `OrderType = WhatsApp`, estado `New` y
   pago `Pending`, con el total calculado en servidor y la moneda del catálogo.
4. Las transiciones de estado inválidas se rechazan; las válidas se aceptan. No existe "En camino".
5. La migración EF aplica limpia sobre `smca_test`; el **script 29 generado** es idempotente y está
   registrado en `backend/scripts/README.md`.
6. Existe la feature `OnlineOrdersAdmin` (OwnerAdmin + StoreUser) mapeada a su módulo y feature.
7. No hay ningún camino que sincronice pedidos del backend hacia el POS ni viceversa.

## Comandos de verificación

```bash
cd backend
dotnet build src/SMCA.sln
dotnet test src/Domain.UnitTests/Domain.UnitTests.csproj
dotnet test src/Application.Tests/Application.Tests.csproj

# Migración (aplicar y generar script)
dotnet ef database update --project src/Infrastructure --startup-project src/SMCA.WebApi \
  --connection "Host=localhost;Database=smca_test;Username=postgres;Password=postgres"
dotnet ef migrations script <PreviousMigration> --project src/Infrastructure --startup-project src/SMCA.WebApi -o scripts/29-<nombre>.sql
```

## Riesgos

- **Tocar `Order.cs`/`OrderItem.cs`** es modificar producción: exige notificación y aprobación
  explícita; los campos deben ser nullable para no alterar el POS.
- **`NoTracking` por defecto** en `ApplicationDbContext`: al persistir pedidos nuevos usar `.Add(...)`
  (tracked como Added); no caer en query-then-mutate.
- **Total manipulado**: el total y la moneda siempre se recalculan/leen en servidor desde el
  catálogo.
- **Código duplicado**: garantizar unicidad de `Code` por tienda con índice único.
- **Feature sin mapeo**: `OnlineOrdersAdmin` sin entrada en `StoreRoleFeatures` queda invisible en
  `/me` y en el roster offline.
- **Migración mal generada**: nunca escribir el `.sql` a mano; verificar el `Up` ejecutándolo de
  verdad.

## Decisiones resueltas durante la implementación (2026-10-06)

| # | Punto | Decisión | Motivo |
| --- | --- | --- | --- |
| I1 | `FeatureType` de `OnlineOrdersAdmin` | Nuevo `FeatureType.OnlineOrders = 123` | Reusar `WebCatalog=122` duplicaría el par `(122, OwnerAdmin)` y rompería `StoreRoleFeatures_ShouldHaveNoDuplicateFeatureAndRoleCombinations`. |
| I2 | Datos de catálogo del feature nuevo | **En la migración 29** (owner eligió opción 1) | Un despliegue atómico al VPS. |
| I3 | Mecanismo de la fila `Feature` 123 | **`HasData`** en `FeatureEntityTypeConfiguration` (no SQL crudo en `Up()`) | Las 43 features del repo se siembran por `HasData`; el SQL crudo dejaba seed ↔ BD divergentes y un `InsertData` futuro colisionaría en PK 123. El SQL crudo se reserva al backfill de `StoreRoleFeature` (por tienda), como `WholesaleSalesMultiStoresRoleFeatureBackfill`. |
| I4 | `Name`/`Description` de la feature 123 | `Name='Pedidos online'`, `Description='Funcionalidad para gestionar los pedidos online de la tienda'` | Convención del catálogo: el `[Description]` del enum es la etiqueta (`Name`); las 43 filas usan la frase `Funcionalidad para …` en `Description`. |
| I5 | Orden de la feature | `"Order" = 251` | Siguiente slot tras 122 (250) dentro del módulo 18. |
| I6 | Excepción de transición | `InvalidOrderStatusTransitionException` de **dominio** | `Domain` no referencia `Application`; el handler de F5 la traducirá a `ApiException(400)`. |
| I7 | Tipos espejo TS (T10) | **Diferidos a F3** | Sin consumidor todavía; `frontend-react/AGENTS.md` (YAGNI) y meter `WhatsApp=101` en el `OrderType` TS cambiaría el selector de tipos del POS (`getOrderTypes`). |

## Evidencia de verificación (2026-10-06, la corrió el padre)

| Comando | Resultado |
| --- | --- |
| `dotnet build src/SMCA.sln` | `Build succeeded`, 0 errores |
| `dotnet test src/Domain.UnitTests/…` | **154 passed (154)**, 0 fallos (spot check del padre: 154/154) |
| `dotnet test src/Application.Tests/…` | **626 passed (626)**, 0 fallos |
| `dotnet ef migrations has-pending-model-changes …` | `No changes have been made to the model since the last migration.` |
| `dotnet ef database update … smca_test` | `Applying '20261007021020_Add-StoreCatalogSettings-Drivers-OrderFields'. Done.` |
| `psql -f scripts/29-….sql` (×2) | exit 0 ambas; 2ª corrida sin errores (idempotente) |
| `psql` SELECT Feature 123 | 1 fila, valores = seed; `Feature_Id_seq.last_value > 123` |
| E2E | **No se corrió** (excluido por el owner) |

`StoreRoleFeature` backfill da 0 filas en `smca_test` porque las 10 tiendas están en `StorePlanId=2` y
el módulo 18 vive en planes 3/4 — universo vacío, no un fallo. Se probó la sentencia a nivel de fila
con el texto verbatim del script dentro de una transacción revertida: roles 2/3 → 2 filas, 2ª corrida
→ 0 (ON CONFLICT), ROLLBACK → 0.

## Follow-ups (no bloqueantes)

- **Contrato F2 ↔ F3**: `CreateOnlineOrderCommand` resuelve la tienda por
  `IHttpContextService.StoreId`, pero el endpoint público de F3 (`POST /public/ordering/{slug}/orders`)
  es **anónimo por slug**. F3 debe resolver la tienda por slug y pasarla al comando (o envolverlo).
  El propio plan deja "definir el contrato con F3" abierto.
- **`setval` duplicado en el script**: Npgsql ya emite su propio `setval` tras el `InsertData` de la
  feature, y el `SequenceFixupsSql` hace lo mismo. Es idempotente y duplicado inofensivo; se deja y se
  documenta (no se borra en silencio).
- **`OrderRepository.CodeExistsAsync` usa `IgnoreQueryFilters`**: el filtro global de
  `ApplicationDbContext` es por *tenant*, no por *tienda*; sin él dos tiendas con el mismo código
  romperían el índice único.
- **Mínimo sobre el total con envío dentro**: hay test que lo fija
  (`Handle_WhenTheDeliveryFeePushesTheTotalOverTheMinimum_ShouldAccept`).

## Hallazgos de la revisión nativa (RDD) — TODOs rastreados (2026-10-07)

Tareas nuevas derivadas de la revisión nativa (todas **advisory, no bloqueantes**). Ninguna reabre F2;
son trabajo posterior. Destino indicado por tarea.

- [x] **F2-R1** (WARNING · slice 1) — Ramas del handler sin test: carrito multi-moneda
  (`EnsureSingleCurrency`, `CreateOnlineOrderCommand.cs:260-265`) y `DeliveryType` fuera del enum
  (`:214-215`). Acción: casos en `CreateOnlineOrderCommandHandlerTests`. **Destino: F2 (tests).**
  - **Cerrado (2026-10-09).** Cuatro casos nuevos en `CreateOnlineOrderCommandHandlerTests`, todos con
    el status y el mensaje que fija cada rama:
    - `Handle_WhenTheCartMixesTwoCurrencies_ShouldRejectTheWholeOrder`: 400 +
      `OnlineOrderMixedCurrencies`, y `AddAsync`/`SaveChangesAsync` `Never` (el rechazo es anterior al
      alta, no un pedido guardado a medias).
    - `Handle_WithTwoProductsOfTheSameCurrency_ShouldNotTreatItAsMixedCurrency`: su control positivo.
      Sin él, un `Distinct().Count() > 1` distraído pasaría los dos tests.
    - `Handle_WithADeliveryTypeOutsideTheEnum_ShouldRejectBeforeReadingTheCart` (`[Theory]` -1/2/999):
      400 + `OnlineOrderDeliveryTypeInvalid`, y `GetPublishedByIdsAsync` `Never` porque la modalidad se
      resuelve ANTES que las líneas. El validador deja pasar esos valores a propósito
      (`Validate_ShouldNotJudgeTheDeliveryType_ThatIsTheHandlersJob`): la puerta está en el handler.
  - Sonda de mutación (hecha dentro de la superficie, sin tocar producción): los dos mensajes
    esperados cambiados por una cadena inexistente → **4 fallos y solo esos 4** (36 verdes). Revertido.
- [x] **F2-R2** (WARNING · slice 1) — La persistencia nueva se prueba **solo con Moq**:
  `StoreCatalogSettingsRepository.UpsertAsync` (NoTracking, UPDATE vs INSERT, `IgnoreQueryFilters`),
  `OrderRepository.CodeExistsAsync`/`GetByCodeAsync` y `ProductRepository.GetPublishedByIdsAsync`.
  Acción: cobertura de integración real (E2E intocable ⇒ archivo nuevo o test de infraestructura).
  **Destino: F2 (tests de integración).**
  - **Cerrado (2026-10-09)** con `Orders/OnlineOrderingPersistenceE2ETests.cs` — **archivo NUEVO**,
    `[Collection("e2e")]` + `WebAppFixture`, 7 casos contra `smca_test` real. Reutiliza
    `PublicOrderingSeed` **sin modificarlo** (ya crea tienda con slug, categoría con slug, producto
    publicado y configuración con pedidos abiertos); lo que faltaba lo crea con helpers locales.
  - Casos:
    - `R2_1` — rama de **INSERT** de `UpsertAsync`: una fila, con el id que trajo el caller. Lo que
      prueba que es esa rama es el índice único de `StoreId`: la rama del UPDATE sobre una clave
      inexistente daría «UPDATE de 0 filas» y el test caería con un error de BD, no con una aserción.
    - `R2_2` — rama de **UPDATE** sobre la fila real, con la sonda del `NoTracking` delante: mutar la
      fila CARGADA y llamar a `SaveChanges` no escribe nada (`ChangeTracker.Entries` vacío, el valor
      sigue en la BD sin error ni aviso) y el `UpsertAsync` sí la escribe sin duplicar. Las dos mitades
      se distinguen EN LA BASE REAL: si tomara la del INSERT, el índice único lo rechazaría.
    - `R2_3` — el índice único NO parcial no bloquea nada (ver F2-R5 abajo).
    - `R2_4` — `CodeExistsAsync` encuentra la fila sin tenant en el contexto y **no** encuentra el
      mismo código en otra tienda, con la **sonda** que hace que eso valga: en el mismo scope, la
      consulta filtrada devuelve 0 filas y la de `IgnoreQueryFilters` devuelve 1. Sin ella, un `true`
      no distingue «el bypass funciona» de «el filtro global no llega a traducirse a SQL», que es
      justo lo que InMemory escondería.
    - `R2_5` — `GetByCodeAsync` con el tenant de la tienda devuelve el pedido **con sus líneas**
      (`OrderItem` tiene su propio filtro por tenant, así que el `Include` tiene que llegar a ellas);
      sin tenant devuelve `null`; el código de otra tienda no existe.
    - `R2_6` / `R2_6b` — `GetPublishedByIdsAsync`: las **cuatro** puertas de publicación rotas de una en
      una (producto inactivo / no en venta / categoría sin slug / categoría inactiva) más el producto de
      otra tienda, con una sola lista de ids para que el fallo diga PUERTA y no «algo del filtro»; el
      control positivo por tienda; y el `ids.Count == 0`.
  - **Por qué E2E y no InMemory**: InMemory no es SQL — ejecuta el filtro global como predicado en
    memoria y acepta cualquier clave primaria, así que un UPDATE de una fila que no existe «funciona»
    y un índice único inexistente no se nota. Las dos cosas que estos casos verifican solo existen en
    PostgreSQL.
  - **Catálogo intacto**: ni una línea inserta, borra o lee `Module`/`Feature`/`StorePlanModule`/
    `StoreRoleFeature`. Siembra y limpieza SIEMPRE en `finally`, con `IgnoreQueryFilters`, en orden de
    FK (líneas → pedido → configuración → productos → categorías → grafo de tienda). Auditoría tras la
    corrida: `StorePlanModule` 19/20 = **4**, `Feature 123` → `ModuleId` **20**, **0** filas E2E
    remanentes (productos, tiendas, categorías, pedidos, settings, usuarios).
- [x] **F2-R3** (WARNING · slice 2) — El grant de la feature 123 por tienda (backfill) no tiene test que
  confirme que `OnlineOrdersAdmin` queda resuelto (`/me` `FeatureIds` / roster offline) para una tienda
  con módulo 18. **Destino: F2/F5 (test del generador).**
  - **Cerrado (2026-10-09)** en `Domain.UnitTests/Tenants/StoreRoleFeatureGeneratorTests.cs`. La
    pregunta útil no es «¿el generador mapea 123?» —eso lo responde cualquier test que le pase el
    id— sino «**una tienda con el módulo 20 activo** recibe ese grant», y esa pregunta no la puede
    responder el generador solo: la lista de featureIds la produce `AllowedFeaturesService`, que se
    queda con las entradas de `StoreRoleFeatures` cuyo `[HasModule]` está entre los módulos de la
    tienda. Por eso el test modela esa media etapa con un helper `FeaturesGrantedBy(module)` que la
    deriva del propio enum con el mismo criterio que `AllowedFeaturesService`.
  - `..._ForAStoreWithTheGestionPedidosModule_ShouldResolveOnlineOrdersForOwnerAdminAndStoreUser`
    afirma 123 para OwnerAdmin **y** StoreUser (D15), y de paso fija `(GestionPedidos, OnlineOrders)
    == (20, 123)` para que una mudanza de módulo futura lo rompa en vez de dejarlo pasar en verde.
  - `..._ForAStoreWithoutTheGestionPedidosModule_ShouldNotResolveOnlineOrders` es el caso que le da
    sentido: el módulo 18 (Catálogo web) **no** arrastra la gestión de pedidos, y sí incluye un control
    positivo (la feature 122 del módulo 18 sí sale). Nota: el hallazgo decía «módulo 18»; el
    2026-10-08 (M3) la feature 123 se movió al **módulo 20** «Gestión de Pedidos» — el test fija la
    topología actual.
- [x] **F2-R4** (SUGGESTION · slice 1) — Tests estructurales por reflexión
  (`CreateOnlineOrderCommand_ShouldCarryNoPriceFieldAtAll` / `...NoCodeField`): frágiles; sustituir por
  aserción de comportamiento. **Destino: F2 (tests).**
  - **Cerrado (2026-10-09), sin reflexión y más fuerte.** Lo que decide si el cliente puede mandar un
    precio o un código es lo que hace el **binding real** de
    `POST /api/v1/public/ordering/{slug}/orders` (`[FromBody] CreateOnlineOrderCommand`), así que los
    tests deserializan CUERPOS con esos campos colados usando `JsonSerializerDefaults.Web` (las
    opciones de ASP.NET Core; sin su `PropertyNameCaseInsensitive` un `"total"` minúsculo no llenaría un
    `Total` del contrato y el test pasaría por un motivo falso) y exigen que el comando que salga sea
    **idéntico** al del cuerpo limpio:
    - `Handle_WithAForgedCodeInTheRawPayload_ShouldPersistItsOwnGeneratedCode` sustituye a
      `..._ShouldCarryNoCodeField`: el `code`/`Code` forjado no aterriza, y el handler persiste y
      devuelve su propio código.
    - `Handle_ShouldRecalculateTheTotalServerSide_IgnoringAnyClientTotal` reescrito: su
      `command.Items.Should().ContainSingle()` no probaba nada. Ahora `total`/`subtotal`/`amount`/
      `currency`/`price`/`unitPrice` colados en el pedido **y** en la línea no sobreviven al binding, y
      lo persistido es 2 × 100 en la moneda del catálogo.
    - `Validate_WithAPayloadFullOfPrices_ShouldProduceTheSameCommandAsACleanOne` sustituye a
      `..._ShouldCarryNoPriceFieldAtAll`: los dos cuerpos producen el mismo comando, y el validador no
      se inventa ninguna regla de precio.
    - Además `Handle_WithAForgedWhatsappNumberInTheRawPayload_ShouldReturnTheStoresOne`: el tercer test
      por reflexión del archivo, cuyo comentario además decía «por comportamiento». Mismo patrón;
      cierra la misma debilidad.
  - Los tests por reflexión no miraban solo seis nombres: un `Importe` colado en el contrato pasaba
    los tres. Ahora da igual cómo se llamara el campo — si existiera, el binding lo llenaría y los dos
    comandos dejarían de coincidir.
- [x] **F2-R5** (SUGGESTION · slice 2) — Índice único `StoreCatalogSettings.StoreId` **no parcial**: con
  soft-delete, la fila retenida bloquearía recrear settings; las tablas nuevas del catálogo usan filtro
  parcial. Requiere **nueva migración**. **Destino: F1/F8 (config/marca).**
  - **FALSO POSITIVO (2026-10-09). Sin migración.** La premisa —«con soft-delete, la fila retenida
    bloquearía recrear settings»— no se da: **`StoreCatalogSettings` NO es soft-deletable**. Evidencia:
    1. `StoreCatalogSettingsEntityTypeConfiguration.cs:25` — el único `HasQueryFilter` es
       `x => IsSuperAdmin || x.TenantId == TenantId`: **por tenant**, sin `x.IsActive`. Una fila «dada
       de baja» con `IsActive = false` la sigue viendo la lectura de sesión.
    2. `StoreCatalogSettings : AuditableEntity<Guid>, ITenantBaseEntity`, sin `IDeleteableEntity`, sin
       `IsDeleted` y sin interceptor de borrado lógico: el borrado es de verdad (`DELETE`).
    3. Por tanto el `AnyAsync(s => s.Id == settings.Id)` de `UpsertAsync` —con `IgnoreQueryFilters`—
       **encuentra** la fila dada de baja y el guardado va por la **rama del UPDATE**, reutilizando su
       `Id`. El índice único no llega a evaluarse nunca frente a un segundo INSERT: la unicidad la
       garantiza el upsert y el índice es solo la red de seguridad.
  - Fijado además contra PostgreSQL: `R2_3_an_inactive_row_stays_visible_and_the_upsert_reactivates_it_in_place`
    deja `IsActive = false`, demuestra que la lectura de sesión sigue viendo la fila, que el upsert la
    reactiva **en la misma fila** y que sigue habiendo **una** sola. Ese test CAERÁ el día que la tabla
    se vuelva soft-deletable de verdad, que es justo cuando el índice parcial volvería a plantearse:
    el test avisa de que el día llegó.
- [x] **F2-R6** (SUGGESTION · slice 2) — El `Down()` del backfill borra **toda** fila `FeatureId=123`, no
  solo las creadas por la migración, y el comentario afirma "ONLY". Acción: acotar el `DELETE` o corregir
  el contrato declarado. Toca una migración ya aplicada. **Destino: F2 (migración) / decisión owner.**
  - **FALSO POSITIVO (2026-10-09) para el `DELETE`.** El borrado amplio es **obligatorio**, y acotarlo
    rompería el rollback:
    1. El `Down()` de la migración **también borra la fila de catálogo**: `20261007021020_…` ejecuta
       `OnlineOrdersRoleFeatureBackfill.DownStoreRoleFeatureSql` y acto seguido el `DeleteData`
       generado `table: "Feature", keyValue: 123`. `StoreRoleFeature.FeatureId` es **Restrict**
       (`FeatureEntityTypeConfiguration.cs:25`), así que cualquier fila `FeatureId = 123` que
       sobreviviera haría fallar el rollback con violación de FK. El orden está escrito y comentado en
       la propia migración (líneas 214-218) y es la razón de ser de la constante.
    2. Las migraciones posteriores se revierten **antes** en la cadena. `20261008185523` (Módulos 19/20)
       restaura el `ModuleId` de la feature 123 a 18 con su propio `UpdateData` y **no toca** las filas
       `StoreRoleFeature` de 123 —los módulos 19/20 son nuevos, luego no hay filas preexistentes que
       preservar—. Es el mismo razonamiento que ya dejó M-R3-003 como falso positivo.
    3. Acotar el `DELETE` al universo histórico «tiendas con módulo 18» dejaría fuera cualquier fila de
       123 que no venga de ese `INSERT`, y **cualquier fila de 123 que sobreviva bloquearía el
       `DeleteData`**. En un despliegue que pasó por las dos migraciones, esas filas existen.
  - **Corregido (2026-10-09):** el comentario de `OnlineOrdersRoleFeatureBackfill.DownStoreRoleFeatureSql`
    decía «remove ONLY the StoreRoleFeature rows this migration created», que no era exacto (borra las
    123, creadas por esta migración o no). Se reescribió para declarar que el `Down` es dueño de TODAS
    las filas 123 —el `Down` generado también borra la feature 123 y `StoreRoleFeature.FeatureId` es
    `Restrict`, así que ninguna grant puede sobrevivir— sin cambiar el comportamiento: es una
    corrección de comentario en producción, ya aplicada.

## Siguiente paso

F1 (config, `StoreCatalogSettings` + sincronización), luego F8 (marca), F3 (carrito/checkout, que fija
el contrato de `CreateOnlineOrderCommand` y trae T10), F4–F7. Entrega (commit/push/PR) es decisión del
owner.

## Progreso

- 2026-10-06 — Feature creado (documento de diseño). Sin implementación.
- 2026-10-06 — Sincronizado con el maestro: `OnlineOrderingSettings` → `StoreCatalogSettings` (con
  columnas de marca); eliminada la moneda configurable (A3); `OrderType.WhatsApp=101` (D17); sin
  "En camino" (D18); feature `OnlineOrdersAdmin` (OwnerAdmin + StoreUser, D15); horarios/zonas texto
  (D16); migración + **script 29 generado** documentados; "Decisiones abiertas" → "Decisiones
  resueltas y notas". Sin implementación.
- 2026-10-06 — **T1–T9, T11, T12 implementadas** por tres escritores secuenciales (ruta ODD:
  directa delegada; disparadores de mapeo, escritura y preparación) + un inline diferido (T10 → F3).
  Owner aprobó explícitamente modificar producción y la opción 1 (datos de catálogo en la migración
  29). Migración final `20261007021020_Add-StoreCatalogSettings-Drivers-OrderFields` con la fila
  `Feature` 123 vía `HasData` y el backfill de `StoreRoleFeature` por SQL crudo idempotente. Script 29
  generado; `has-pending-model-changes` limpio. Ver evidencia arriba.
- 2026-10-07 — **Entrega y revisión nativa (RDD, on global)**: el rango F2 completo excedía el
  presupuesto de un lens (`lens_context_budget_exceeded`; sin autoridad creada), así que se reparticionó
  en 3 commits por unidad de trabajo con los tests junto a su código:
  `039f3969` (modelo + persistencia + `CreateOnlineOrderCommand` + tests), `a7f916e9` (migración +
  seed + script 29) y `ae418b49` (docs). Los dos primeros pasaron la revisión nativa (lens
  `review-reliability`) **aprobada y acknowledgeada** (autoridad quemada); el de docs es pasivo. La
  revisión dejó hallazgos **advisory no bloqueantes** (p. ej. ramas del handler sin test: multi-moneda
  y `DeliveryType` fuera de enum; `UpsertAsync`/repos solo probados con mocks; `Down()` del backfill
  borra toda fila `FeatureId=123`). Push/PR = decisión del owner.
- 2026-10-09 — **F2-R1..R6 cerrados.** R1, R3 y R4 son tests (unitarios, sin reflexión); R2 es un E2E
  **nuevo** (`Orders/OnlineOrderingPersistenceE2ETests.cs`, 7 casos contra `smca_test`) que cubre la
  persistencia que hasta ahora solo se probaba con Moq; R5 y R6 quedan **documentados como falsos
  positivos** con su evidencia (no hay migración ni cambio de código). Superficie tocada: solo los tres
  archivos de test del backend y un E2E nuevo; `PublicOrderingSeed` se **reutiliza sin modificar**.
  Sin commit (writer acotado).
  Verificación observada:
  - `dotnet build src/SMCA.sln` → **Build succeeded**, 0 errors, sin `error MSB`.
  - `dotnet test src/Domain.UnitTests/… --filter StoreRoleFeatureGeneratorTests` → **14/14**; la
    suite completa de `Domain.UnitTests` → **165/165**.
  - `dotnet test src/Application.Tests/… --filter OnlineOrdering` → **388/388**; la suite completa →
    **1166/1166**.
  - `dotnet test src/SMCA.WebApi.E2ETests/… --filter OnlineOrderingPersistenceE2ETests` → **7/7**, con
    la línea `[E2E Guard] ConnectionStrings:Application -> Database=smca_test` que prueba que el
    fixture se inicializó contra la base real; `--filter E2ETests.Orders` (los 4 archivos de la
    carpeta) → **17/17**.
  - Auditoría de `smca_test` tras la corrida: `StorePlanModule` 19/20 = **4**, `Feature 123` →
    `ModuleId` **20**, **0** filas E2E remanentes. El catálogo no se tocó.
  - Sonda de mutación (dentro de la superficie): los mensajes esperados de los dos rechazos nuevos
    cambiados por una cadena inexistente → **4 fallos y solo esos 4**; revertido.
  Sin pendientes fuera de superficie: el comentario «ONLY» de
  `OnlineOrdersRoleFeatureBackfill` se corrigió (ver F2-R6).
