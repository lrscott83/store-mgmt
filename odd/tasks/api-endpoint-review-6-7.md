# api-endpoint-review-6-7 — cierre de hallazgos de pedidos online y repartidores

Rama `dev` (base `b138440e`, tras fusionar `origin/qa`). Entrega: commits por unidad en `dev`, sin push.
Runner: `dotnet test` (Application.Tests + SMCA.WebApi.E2ETests sobre PostgreSQL local `smca_test`).

## Specs

S1. `GET /api/v1/online-orders` no debe romper con `page` enorme: `?page=2147483647` hoy desborda
    `(page - 1) * pageSize` a un `Skip` negativo. Debe devolver 200 con la página acotada.
    (hallazgo 6.2)

S2. `search` debe rechazar términos desmedidos antes de llegar a la base: el término se recorta y se
    limita a 64 caracteres; por encima responde 400 con un mensaje claro, no un `LIKE '%…%'` gigante.
    (hallazgo 6.3, parte de validación)

S3. `PATCH /api/v1/online-orders/{id}/driver` con cuerpo `{}` debe responder 400 y **no** desasignar
    al repartidor. `{"driverId": null}` sigue desasignando con 200; `{"driverId": "<guid>"}` sigue
    asignando. (hallazgo 6.4)

S4. La validación del repartidor asignable no debe materializar la plantilla completa: una consulta
    de existencia por `(storeId, driverId)` dentro del filtro activo. (hallazgo 6.5)

S5. `OnlineOrdersController` y `DeliveryDriversController` deben exigir autenticación con
    `[Authorize]` a nivel de clase, además del filtro `[HasPermission]` ya existente. El anónimo
    sigue recibiendo 401. (hallazgo 6.6, sin `FallbackPolicy` global — ver L5)

S6. El guard de tienda (`StoreId` vacío → 400 `StoreNotSelected`) y el par cargar-pedido/404 deben
    existir una sola vez y ser compartidos por los handlers que hoy los copian. (hallazgo 6.8)

S7. `CancellationToken` debe llegar desde el controller hasta las lecturas de repositorio de los
    endpoints de pedidos. (hallazgo 6.8)

S8. Las lecturas de los PATCH de pedidos no deben cargar `Include`s que no usan: `payment` y
    `driver` leen la fila sin líneas ni repartidor; `status` conserva las líneas porque la rama de
    comisión las necesita. (hallazgo 6.9)

S9. `PATCH /api/v1/delivery-drivers/{id}` debe persistir solo las columnas que cambian
    (`Name`, `Phone`, `IsActive` cuando venga), no la fila completa vía `EntityState.Modified`.
    (hallazgo 7.2)

S10. Un `PATCH` cross-store de repartidor debe responder 404 y no tocar la fila; debe quedar cubierto
     por un E2E nuevo. (hallazgo 7.3, mitad faltante)

S11. `name`/`phone` de repartidor se validan sobre el valor **recortado**: un nombre de 200
     caracteres con espacios alrededor es válido; 201 recortados no. El teléfono debe tener al menos
     6 dígitos y solo caracteres de teléfono (`+ - ( ) espacio` y dígitos); se mantiene la libertad de
     formato (D17). (hallazgos 7.4 y 7.5)

S12. `ToDto`, los límites de columna y el guard de tienda de repartidores deben existir una sola vez.
     Los nombres públicos `CreateDeliveryDriverCommand.NameMaxLength/PhoneMaxLength` se conservan.
     (hallazgos 7.6 y 7.7)

S13. `DeliveryDriversController` debe declarar `{id}:guid` y los `[ProducesResponseType]` de 400/404.
     El `POST` sigue devolviendo 200: un E2E existente lo fija y no se toca. (hallazgo 7.8, parcial)

S14. `search` y el orden del listado deben apoyarse en índices: extensión `pg_trgm` e índices GIN
     para `Code`/`CustomerPhone`, y un índice `(StoreId, Date)` para el orden. Migración EF como
     fuente y script `.sql` generado desde ella. (hallazgo 6.3, parte de base de datos, y 6.9)

S15. Toda unidad cierra con tests nuevos; ningún E2E existente se modifica.

S16. **X4 bloque 2 (stores/billing)**: cada acción de `StoresController`, `PlansController`,
     `ModulesController`, `TenantsController`, `SalesCommissionsController` y
     `ProductSalesCommissionsController` declara con `[ProducesResponseType]` (a) el payload de éxito
     tipado que realmente devuelve y (b) cada código no-éxito que realmente puede producir
     (400 por validación/guard, 401/403 por `[HasPermission]`/`[Authorize]`, 404, 409), verificado
     contra validadores, guards, filtros y `ErrorHandlerMiddleware`; nada inventado. Una guardia de
     reflexión lo fija.

## Tasks

| ID | Qué | Specs | Ruta | Estado |
| --- | --- | --- | --- | --- |
| T1 | Pedidos online: page acotado, search acotado, `driverId` requerido, existencia de repartidor, `[Authorize]`, guard y 404 compartidos, `CancellationToken`, `Include`s | S1, S2, S3, S4, S5, S6, S7, S8, S15 | delegado (worker) | hecho — `5d6e0d90`, RDD `review-3904c69fea54839c` aprobado y quemado |
| T2 | Repartidores: update parcial, validación recortada, DTO/límites/guard únicos, `:guid` y `ProducesResponseType`, E2E cross-store | S5, S9, S10, S11, S12, S13, S15 | delegado (worker) | hecho — `3d607ddc`, RDD `review-adecbd9e3044c26f` aprobado y quemado (2 avisos) |
| T3 | Índices: `pg_trgm` GIN en `Code`/`CustomerPhone`, `(StoreId, Date)`, migración + script | S14, S15 | delegado (worker) | hecho — `fac049c7`, RDD `review-451fa6a3fd6d7371` aprobado y quemado (1 aviso) |
| T4 | X4 bloque 2: declaraciones reales en Stores, Plans, Modules, Tenants, SalesCommissions y ProductSalesCommissions + guardia de reflexión | S16, S15 | delegado (worker) | hecho — `427b6f6e`, RDD `review-b3aa354767e95c44` aprobado y quemado (4 avisos) |

## Log

L1 (2026-11-04, verbatim): «actualiza esta rama local dev con los cambios de la rama remota qa, no
hagas verificacion post merge, luego push y vuelve a revisar todo en el codigo fuentes para que no
asumas nada de nada. Recuerda usar los subagentes para el explorer, para el worker y las tareas que
debes usar los subagentes. Usa codegraph para las cosas que debes usarlo y no usar grep o otro
comando para esos casos. Ademas tienes que hacer RDD cada vez que toque.»

L2 (2026-11-04, verbatim): «dale con todo. Recuerda usar los subagentes para el explorer, para el
worker y las tareas que debes usar los subagentes. Usa codegraph para las cosas que debes usarlo y
no usar grep o otro comando para esos casos. Ademas tienes que hacer RDD cada vez que toque.»

L3 (2026-11-04): merge `origin/qa` → `dev` = `b138440e` (10 archivos nuevos, 2.120 líneas), push OK.
Sin verificación post-merge, por pedido explícito (L1).

L4 (2026-11-04): reconcile con CodeGraph corrige el plan: 6.1, 6.10 y 7.1 ya están fijos; 7.3 es
parcial. Quedan abiertos 6.2-6.9, 7.2, 7.4-7.8.

L5 (2026-11-04, decisión): **6.7 (PII sin máscara) no se implementa sin decisión del Owner.** Enmascarar
`CustomerName`/`CustomerPhone` en el listado rompe la operación real (el dueño y el repartidor usan el
teléfono para llamar al cliente). Queda pendiente de decisión explícita, no se asume.
L5b (2026-11-04, decisión): **`FallbackPolicy` global no se toca.** Exigiría auditar cada controller
anónimo (`PublicCatalogController`, `PublicOrderingController`, auth) y no hay test que fije esa
anonimidad; S5 se limita a `[Authorize]` en los dos controllers.
L5c (2026-11-04, decisión): **`POST /delivery-drivers` sigue en 200.** `DeliveryDriverCreateE2ETests`
(nuevo en `qa`) lo fija y los E2E existentes no se tocan.

L6 (2026-11-04, RDD): el slice completo (`b138440e..fac049c7`, 50 archivos, 6.980 líneas) NO se puede
revisar: `lens_context_budget_exceeded` tanto con 3 lentes como con 1. Se revisó unidad por unidad,
cada una en un worktree sobre su propio commit, y las tres quedaron `approved` + `acknowledged`
(autoridad quemada).

L8 (2026-11-04, decisiones del owner sobre lo que quedaba abierto):
- **6.7 (PII): cerrado, se deja tal cual.** No todos los usuarios tienen acceso a la gestión de
  pedidos. Sin acción de código.
- **X1 (subidas): límites aprobados** (2 MB por imagen de catálogo, 4 MB por marca, 50 MB por copia
  de seguridad) **y se cierran los dos huecos reales**: verificación del contenido real del archivo
  y alineación del límite del proxy. Commit `642ceaf6`.
- **X4 (OpenAPI), X3 (check-then-act) y 7.8: aprobados**, pendientes de ejecutar.
- **R1-2 (teléfono legado): arreglado y revisado.** Commit `79feffce`, RDD `review-10c1b4ff3e9b694f`
  aprobado y quemado.

L9 (2026-11-04, RDD bloqueado): la revisión de `61806a6f..642ceaf6` arrancó
(`review-e5d44c316a76db4e`) pero el STATUS del proveedor devolvió `operation_timeout` dos veces al
negociar la captura. Nada quedó aprobado ni quemado: hay que reintentar más tarde.

L10 (2026-11-04/05): **X1 y X3 ya estaban implementados en el código**; el plan los daba por
abiertos. X1 se reforzó (contenido real del archivo + reparto del límite del proxy: `642ceaf6`,
`7933c0f5`, y el defecto de apuntar al nginx congelado se corrigió con verificación independiente).
X3 solo necesitó alinear el mensaje visible del 409 (`f41be3b3`, RDD `review-3243c0d83dee8f99`
aprobado y quemado). Queda **X4** y **7.8**.

L11 (2026-11-05, X4 por bloques): **Bloque 1 cerrado** (Auth, Users, StoreUsers, Ping,
Notifications) en `7fe3e4c4`, RDD `review-fd93bc107673cd84` aprobado y quemado. Inventario real:
37 controladores, 171 acciones; 11 sin declaración (Messages 8, Notifications 2, WeatherForecast 1) y
83 solo con éxito. Bloques definidos: 1 auth/acceso (hecho), 2 stores/billing (Stores, Plans, Modules,
Tenants, SalesCommissions, ProductSalesCommissions), 3 catálogo, 4 catálogo admin, 5 pedidos/reparto,
6 público, 7 administración/sync, 8 mensajería/legado.

L12 (2026-11-05, contratos arreglados antes de seguir con X4):
- `29985987`: crear usuario de tienda devuelve el usuario creado (no `bool`) y el listado se tipa
  como lista concreta; el cliente de notificaciones tipa "marcar todas" como número.
  RDD `review-c448b9a31c92d792` aprobado y quemado.
- `bbb78a0e`: `StoreUserDto.StoreName` vuelve a ser texto y `Id` lleva el id del usuario; el detalle
  por id ahora carga usuario y tienda (antes devolvía nombre/login/teléfono/email vacíos — bug real).
  RDD `review-a28d64bf82e77d4c` aprobado y quemado.
- **Siguiente paso de la sesión**: bloque 2 de X4.

L7 (2026-11-04, avisos de revisión, NO bloqueantes, pendientes de decisión):
- `review-adecbd9e3044c26f` R1-2 (WARNING): las reglas de teléfono son más estrictas que la línea base,
  así que un repartidor ya guardado con `#`, `/` o menos de 6 dígitos **no se puede editar** (el PATCH
  valida un campo que el cliente no cambió). Es un cambio de comportamiento real: hay que decidir si se
  relaja la regla en `PATCH` o si se acepta.
- `review-adecbd9e3044c26f` R1-1 (SUGGESTION): `char.IsControl` solo cubre categoría `Cc`; los
  separadores U+2028/U+2029 y los bidi/zero-width (`Cf`) siguen pasando en el nombre.
- `review-451fa6a3fd6d7371` R1-001 (SUGGESTION): `CREATE EXTENSION pg_trgm` sin `SCHEMA` explícito y con
  los privilegios del rol de migración; documentar el privilegio y fijar el esquema.

L13 (2026-11-05, verbatim): «continua con la etapa 2 de los tests del backend». El Owner confirma que
"etapa 2" = **bloque 2 de X4** (stores/billing: Stores, Plans, Modules, Tenants, SalesCommissions,
ProductSalesCommissions). Autoriza implementarlo.

L14 (2026-11-05, X4 bloque 2 cerrado): commit `427b6f6e`, RDD `review-b3aa354767e95c44` (lentes risk
y readability) **aprobado y quemado**. Evidencia: guardia nueva en RED (5 de 6 controladores fallaban)
y después en GREEN; `--filter FullyQualifiedName~ApiContractProducesResponseType` → 24/24 y
`Application.Tests` → 1763/1763.
- **Hueco real encontrado en las dos guardias**: `[ProducesResponseType(StatusCodes.Status200OK)]` sin
  tipo reporta `Type == typeof(void)`, no `null`, así que `Type is not null` dejaba pasar un éxito sin
  tipar. Las dos guardias ahora exigen que todo éxito **con cuerpo** declare su tipo y permiten 204/205
  sin payload. Capturó un caso real: `StoresController.SetMyStoreIdAsync` (tipado como
  `ResponseResult<bool>`); `AuthController.RevokeAsync` resultó legítimo (204 sin cuerpo).
- Avisos de revisión (readability, NO bloqueantes, pendientes de decisión): el arnés de reflexión está
  duplicado entre las dos guardias (WARNING; se podría unificar con más `MemberData`); contador del
  bloque como número mágico; literales de status sin nombre; la referencia "X4, block 2" no resuelve
  dentro del repo.

