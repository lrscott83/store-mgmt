# Feature — Módulo Gestores de Ventas

- **Objetivo:** módulo nuevo, opt-in por tienda (Superior/VIP), que permite al Owner (coordinador) dar acceso a gestores de ventas autenticados para que hagan pedidos desde el catálogo web y los envíen por WhatsApp; al pasar el pedido a `Entregado` se genera la comisión del gestor, y el Owner la marca como pagada.
- **Rama:** `feat/gestor-ventas-module` (desde `dev` @ `d0ad31e0`).
- **Entrega:** work-unit commits en la rama; push/PR = decisión del humano.
- **Runner:** `dotnet test` (backend) · `pnpm --filter @store-mgmt/web-store-pos test` / `typecheck` / `lint` (frontend React).
- **Reglas del repo:** Angular `frontend/` es legacy y NO se lee ni se toca. E2E existentes (backend y Playwright) son intocables; solo se agregan tests nuevos. `Product` no recibe columnas de este módulo. `ReSeller` no se toca. Todo lo existente debe seguir funcionando igual.

## Specs

**S1 — Módulo opt-in.** Crear el módulo de Gestores de Ventas con precio `20` y descuento del `50%` (neto `10`), disponible en los planes **Superior** y **VIP**. No se asigna a ninguna tienda por defecto: solo se crea el módulo.
> "solo es crear el modulo y con precio 20 y un 50% de descuento" · "Superior y VIP" · "por defecto no se le pondrá a ninguna tienda"

**S2 — Rol nuevo a nivel Owner.** `Gestor de ventas` es un rol nuevo. El **Owner es el coordinador** de los gestores; no hay otro rol de coordinador ni interviene `StoreUser`. El gestor pertenece al **Owner entero**, no a una tienda.
> "esto de gestor de ventas es un nuevo role y en este caso el owner sera el coordinador de los gestores" · "el gestor es del Owner entero, no es por tienda" · "en ningun momento te mencione StoreUser... te dije Owner"

**S3 — Acceso del gestor.** El gestor autenticado solo ve: (a) su vista de pedidos y comisiones, y (b) el catálogo web de **todas las tiendas de su Owner**. Nada más.
> "El gestor tambien tiene una vista para sus pedidos y sus comiciones y solo tendra acceso a esa vista y al catalogo web de todas las tiendas."

**S4 — Pedido del gestor.** El gestor arma el pedido desde el catálogo web y lo **envía por WhatsApp al Owner**. El Owner lo gestiona con el flujo de pedidos existente hasta ponerlo en `Entregado`.
> "el gestor hace el pedido y lo envia por whatsapp al owner. Despues el owner segun corrsponda hace la gestion hasta que lo pone en entregado."

**S5 — Disparador de la comisión.** `Entregado` significa pagado; en esa transición se adiciona la comisión que debe cobrar el gestor. Aplica la configuración vigente **en el momento de la entrega**.
> "Eso es que esta pagado y en ese momento entonces se debe adicionar la comision que debe cobrar el gestor" · "la del momento de la entrega"

**S6 — Configuración por producto, en tablas del módulo.** Cada producto puede tener una comisión de tipo **porcentaje** o **valor fijo** (uno u otro), con su **moneda de pago**. Todo va en tablas propias del módulo; no se agregan columnas a `Product`.
> "la comision tiene un % o un valor fijo" · "Cada producto debe tener una comision en porciento y/o en total y una moneda para pagar." · "Todas las tablas nuevas deben ser propias de este modulo, no es adicionar cosas a la tabla producto"

**S7 — Cálculo.** La base es el **precio final del producto** de la línea del pedido (snapshot), por unidad y multiplicado por la cantidad. Si es fijo, se paga por unidad (3 unidades = 3 veces). Si es porcentaje, se aplica al precio final unitario. **No se convierte moneda**: si la moneda configurada no coincide con la de la línea, se muestra la comisión en la moneda configurada. Redondeo a 2 decimales. Producto sin comisión configurada: todo normal, comisión `0`.
> "la comision se calcula sobre el precio del producto calculado como debe ser porque puede tener el producto % de descuento y descuento" · "1. 3 veces, la comision es por producto" · "SI la moneda no cincide no importa lo tuyo es mostrar la comision y ya y no hay que convertir nada" · "Si no tiene comision se hace todo normal y entonces todo da 0 que no afecta en nada"

**S8 — Registro de la comisión.** Cada comisión referencia el `OrderItemId` y guarda su propio monto y moneda. Una comisión por `OrderItem`. El registro existente y la comisión quedan congelados: cambios posteriores de configuración no los alteran.
> "las comiciones debe tener el id del ordenItem" · "un snapshot de los valores y la moneda del precio del producto en ese momento"

**S9 — Pago por el Owner.** El Owner marca la comisión como pagada con **una sola acción**, por el **total**. Sin pagos parciales. Se registra fecha, quién la registró y nota.
> "4. Completa, con una accion y punto." · "despues el owner puede decir que la comision a ese gestor se pago"

**S10 — Gate del módulo.** Solo genera comisión el pedido de una tienda que tenga el módulo activo. Si el módulo no está activo, **no se inserta nada** de comisión. Al desactivarlo no se borran las comisiones ya generadas; las pendientes siguen siendo pagables.
> "Esto es un feature nuevo si la tienda tiene el modulo gestores activo." · "Si no esta ese modulo no se inserta nada a la comicion ni nada por el estilo"

**S11 — Snapshot de la línea.** `OrderItem` debe guardar en BD el snapshot del precio del producto en ese momento: precio base, porcentaje de descuento, descuento fijo y moneda. `Price` sigue siendo el precio final cobrado (sin cambiar su significado). Pedidos viejos quedan con los campos nuevos en `null` y no se tocan.
> "orderitem en la BD debe guardar la moneda, el porciento de descuento y el descuento, todo el snapshot para poder calcular el precio del producto"

**S12 — Sin regresión.** `ReSeller` no se toca. El flujo actual de catálogo, pedidos, estados, WhatsApp, planes y precios sigue funcionando igual. El módulo solo agrega comportamiento cuando está activo.
> "por favor, no te vayas del scope. Eso es un además, todo lo que esta debe seguir funcionando como esta."

**S13 — Pruebas.** Solo se agregan tests nuevos. Los E2E existentes (backend `SMCA.WebApi.E2ETests` y Playwright `frontend-react/e2e`) no se modifican, renombran, saltan ni debilitan. Cobertura nueva para: snapshot, configuración por producto, generación al entregar, gate del módulo, pago completo, acceso del gestor y no-regresión.

## Tasks

| ID | Tarea | Specs | Ruta | Estado |
| --- | --- | --- | --- | --- |
| T1 | Snapshot de `OrderItem`: entidad + configuración EF + migración + script + población en `CreateOnlineOrderCommand` + tests | S11 | inline | done — `d401b65e` |
| T1b | Follow-ups del review de T1: round-trip EF/PostgreSQL del snapshot, freeze tras mutar el producto y contrato `null` vs `0` | S11, S13 | inline | done — `f826348b` |
| T2 | Catálogo del módulo: módulo 21, features, rol 5, `StorePlanModule` Superior/VIP, sin `StoreModule`; migración + script + tests | S1, S2 | inline | done — `5215a074` |
| T2b | Follow-ups del review de T2: scoping del E2E de catálogo, mapeo del generador y rollback de rol 5 | S1, S2, S13 | inline | done — `02a02cb6` |
| T2c | E2E existentes de matriz de planes actualizados con autorización explícita (módulo 21/feature 125) | S1, S12, S13 | inline | done — `7fdeb27b` |
| T3 | Dominio y persistencia del módulo: `SalesManager`, `ProductSalesCommission`, `OrderSalesCommission`; configuraciones y repositorios | S6, S8 | inline | done — `b42f35e2 + 3b9dbe04` |
| T4 | Owner crea gestores: comando/API, usuario con rol 5 a nivel Owner, claims/features | S2, S3 | inline | done — `ee5d834b` |
| T5 | Pedido del gestor: creación autenticada desde el catálogo + atribución en tabla del módulo + WhatsApp al Owner | S3, S4 | inline | done — `c0434d6a` + `7e82938f` + `ed30c49b` |
| T5a | Atribución `OrderSalesManager`: entidad/configuración/repositorio/migración | S4, S8 | inline | done — `c0434d6a` |
| T5b | Alta del pedido con atribución + endpoint gestor-only + verificación Owner-tienda | S3, S4 | inline | done — `7e82938f` |
| T5c | Frontend: catálogo del gestor + envío por WhatsApp al Owner | S3, S4 | inline | done — `ed30c49b` |
| T6 | Generación de comisión al pasar a `Entregado`: hook transaccional, idempotente, gate del módulo, configuración al momento de entrega, snapshot, fijo por unidad, % por unidad, sin conversión | S5, S7, S10 | inline | done — `2ee92cd3` |
| T6b | Follow-ups del review de T6: idempotencia, persistencia E2E y scoping de los lookups de comisión | S5, S7, S10, S13 | inline | pending |
| T7 | Pago de comisión por el Owner: acción completa, auditoría (fecha/quién/nota) | S9 | inline | pending |
| T8 | Configuración de comisión por producto (API + pantalla del Owner) | S6 | inline | pending |
| T9 | Vista del gestor: sus pedidos y comisiones + acceso a los catálogos de todas las tiendas de su Owner | S3 | inline | pending |
| T10 | Vista del Owner: comisiones pendientes/pagadas por gestor y por pedido | S7, S9 | inline | pending |
| T11 | Pruebas nuevas + regresión + RDD/verificación + cierre | S12, S13 | inline | pending |

## Decisiones de diseño (no son requisitos nuevos)

- D1 — La comisión se registra en la **misma transacción** que la transición a `Entregado` cuando el módulo está activo y el pedido tiene gestor. Si la comisión no puede registrarse, la transición falla: no se pierde dinero. Para tiendas sin el módulo o pedidos sin gestor, el flujo no cambia.
- D2 — La atribución del pedido al gestor va en una tabla propia del módulo (`OrderSalesManager` o equivalente), no en una columna nueva de `Order`.
- D3 — La configuración de comisión es por producto de la tienda (`ProductId`), en tabla propia del módulo.
- D4 — El gestor es un `User` con rol 5 y un registro de módulo ligado al Owner/Tenant; no es `StoreUser` ni `ReSeller`.
- D5 — El acceso del gestor a los catálogos de las tiendas del Owner se resuelve por pertenencia al Owner, no por `StoreModule`.
- D6 — El precio del módulo se aplica con la regla única existente (`CurrentPriceServiceUtils.GetCurrentPrice`): 20 con 50% = 10.

## Follow-ups del review RDD de T1

Lineage `review-62781ea0de5eef8a` · lentes `review-risk` + `review-reliability` · resultado **approved**, autoridad quemada. Sin bloqueantes. Hallazgos no bloqueantes (trabajo posterior, no reabren este candidato):

- **R3-PERSISTENCE-ROUNDTRIP** (WARNING, reliability): no hay test que escriba y relea las columnas nuevas contra PostgreSQL/EF. Agregar un E2E nuevo que cree un pedido online y relea `BasePrice`, `PercentDiscountPrice` y `DiscountPrice`. → T1b.
- **R3-SNAPSHOT-FREEZE** (SUGGESTION, reliability): falta un test que mute el producto después de crear el pedido y verifique que el snapshot del `OrderItem` no cambia. → T1b.
- **R3-NULL-VS-ZERO-CONTRACT** (SUGGESTION, reliability): `0/0` significa "cero conocido" (producto sin descuentos); `null` significa "legacy/sin snapshot". T6 debe tratar `null` como sin comisión y no confundirlo con un descuento cero. → documentar y cubrir en T6.

## E2E — estado verde (comando documentado del README raíz)

Los 7 tests existentes de matriz de planes se actualizaron con autorización explícita del usuario (commit `7fdeb27b`): se añadió módulo 21/feature 125 a los universos Superior/VIP en `PlanChangeMatrixTests`, `StorePlanCatalogTests` y `MeAfterOwnerPlanChangeTests`. El filtro focalizado de esos tres archivos pasa **12/12**.

La verificación completa se hizo con el comando único documentado en el README raíz (`dotnet test backend/src/SMCA.sln`, los 3 proyectos):

- `Domain.UnitTests`: **185/185**
- `Application.Tests`: **1473/1473**
- `SMCA.WebApi.E2ETests`: **770/770**
- wall: **398.3 s**

Una corrida previa solo del proyecto E2E abortó por crash del test host; el comando documentado de la solución **no** reproduce el crash. Lección registrada: la verificación completa se corre con el comando de la solución, no con el proyecto E2E aislado.

## Follow-ups del review RDD de T3-A

Lineage `review-9e0f51a8e8e97b9c` · lentes `review-risk` + `review-reliability` · **approved**, autoridad quemada. 0 bloqueantes; 12 hallazgos advisory.

| Hallazgo | Severidad | Fase | Estado |
| --- | --- | --- | --- |
| R1-INACTIVE-MANAGER-RESOLUTION | WARNING | T4 | ✅ Resuelto en `ee5d834b` |
| R1-TENANT-FILTER-BYPASS-ORDERITEM | WARNING | T6 | ✅ Mitigado: el lookup corre tras `GetByIdWithItemsAsync(storeId, id)`, con el OrderItem ya acotado |
| R1-COMMISSION-AMOUNT-UNVERIFIED | WARNING | T6 | ✅ El `Amount` se calcula desde Type/Value/UnitPrice/Quantity; no hay monto de cliente |
| R1-MARKPAID-PAYER-UNBOUND | SUGGESTION | T7 | ⏳ Pendiente |
| R1-ROLLBACK-DELETES-USERROLE | WARNING | — | Documentado (rollback esperado) |
| R3-REPO-FILTERS-UNTESTED | WARNING | T4/T7 | 🟡 Parcial: T4 cubre auth/list; estados de comisión en T7 |
| R3-SCHEMA-MIGRATION-UNPROVED | WARNING | T3-B | ✅ Resuelto (migración aplicada + suite 772/772) |
| Sugerencias T3 | SUGGESTION | T6/T7/T8 | ⏳ Pendientes |

Se trasladan a las tareas que los consumen:

- **R1-INACTIVE-MANAGER-RESOLUTION (WARNING) → T4:** `SalesManagerRepository.GetByUserIdAsync` no filtra `IsActive`; el claims/login debe rechazar un gestor inactivo y un test debe fijarlo.
- **R1-TENANT-FILTER-BYPASS-ORDERITEM (WARNING) → T6:** `GetByOrderItemIdAsync` usa `IgnoreQueryFilters`; la generación debe correr con tenant/orden validada y apoyarse en el índice único, no en un lookup global.
- **R1-COMMISSION-AMOUNT-UNVERIFIED (WARNING) → T6:** el `Amount` no se valida contra `Type/Value/UnitPrice/Quantity`; T6 debe calcularlo y añadir la invariante + test.
- **R1-MARKPAID-PAYER-UNBOUND (SUGGESTION) → T7:** el handler debe exigir que el pagador sea el Owner; test de pagador ajeno.
- **R1-ROLLBACK-DELETES-USERROLE (WARNING):** el rollback de la migración de rol 5 borra `UserRole` de rol 5. Es el orden FK necesario; un rollback elimina asignaciones reales. Documentado, no se cambia ahora.
- **R3-REPO-FILTERS-UNTESTED (WARNING) → T4/T7:** faltan tests de `GetByUserIdAsync`/`GetByOwnerIdAsync`/filtros por estado; se cubren al construir las vistas.
- **R3-SCHEMA-MIGRATION-UNPROVED (WARNING):** resuelto por T3-B (migración generada, aplicada a `smca_test`) + E2E de round-trip 1/1 + suite completa 771/771.
- **Sugerencias (T6/T7/T8):** bordes 0/100 y cantidad/precio negativos, `paidAt` por defecto, longitud de nota, precisión de `Value` frente a `Amount`, validación de enums y no acoplar el E2E a los defaults del seed.

## Bloqueo RDD — T5c

El review de T5c encontró **R3-001 (CRITICAL)**: el modo gestor se activaba en cualquier catálogo y, si el endpoint del gestor fallaba (tienda de otro Owner o sin módulo 21), el checkout mostraba `CHECKOUT.FAILED` y perdía el pedido. Corrección acotada en `3b2c9b4d`: fallback al alta pública (pedido sin atribución) cuando el endpoint del gestor falla; test nuevo 8/8.

La validación nativa quedó **bloqueada**, no aprobada:

- `review-validator` devolvió `opencode_review_transport_relay_refused` (`role_capture_failed`).
- El STATUS posterior devolvió `operation_timeout` (`context deadline exceeded`), `retry_safe: false`, `next_action: stop`.
- La review queda en `correction_required`, sin acknowledgement ni PASS. No se inventa un veredicto.

## Follow-ups del review RDD de T6

Lineage `review-95df7427600683a0` · lentes `review-risk` + `review-reliability` · **approved**, autoridad quemada. 0 bloqueantes; 3 hallazgos advisory:

- **R3-001 (WARNING) → T6b:** ningún test ejerce la rama de idempotencia (`existing is not null`); el mock devuelve null en todos los casos. Falta un test con una comisión ya existente que demuestre que no se duplica.
- **R3-002 (WARNING) → T6b:** toda la cobertura es de handler con mocks; falta una prueba E2E/integración que persista una comisión real al pasar a `Entregado` y demuestre la transacción única.
- **R3-003 (SUGGESTION) → T6b:** el scoping store/tenant de los lookups de comisión es código leído, no evidencia; falta un test que lo fije.

## Log

- **L1 (2026-10-21, solicitud original):** "necesito que busques el plan para los gestores de ventas y revises si todo esta cubierto para su implementacion. La idea es poder tener un modulo para eso y que cuando este activo se configure para quien pueda entrar los gestores de ventas autenticados y que hagan pedidos y luego cuando el pedido sea pagado entonces se le ponga una comision a los gestores de ventas y que se pueda saber si se pagaron esas comisiones o no. Si tienes alguna duda me preguntas para que no asumas nada de nada."
- **L2:** No existía plan para este feature. `docs/plans/2026-10-16-owner-reseller-dual-role-comisiones-plan.md` es otro feature (Owner + ReSeller) y no se toca.
- **L3:** "Esto de gestor de ventas es nuevo... ReSeller es el que busca clientes para que usen este sistima. Y el gestor de ventas es el que usando el catalogo web hace pedidos de productos a un coordinador de gestores."
- **L4:** "el gestor hace el pedido y lo envia por whatsapp al owner. Despues el owner segun corrsponda hace la gestion hasta que lo pone en entregado. Eso es que esta pagado y en ese momento entonces se debe adicionar la comision..."
- **L5:** "en ningun momento te mencione StoreUser... te dije Owner" — se elimina `StoreUser` de todo el diseño; solo el Owner crea gestores y marca comisiones pagadas.
- **L6:** "el gestor es del Owner entero, no es por tienda." El gestor accede a los catálogos de todas las tiendas de su Owner.
- **L7:** "1. 3 veces, la comision es por producto 2. ... orderitem en la BD debe guardar la moneda, el porciento de descuento y el descuento, todo el snapshot para poder calcular el precio del producto."
- **L8:** "la comision tiene un % o un valor fijo" — no hay comisión con % y fijo a la vez, ni descuento propio de la comisión.
- **L9 (2026-10-21):** Autorización para implementar con ODD. Rama `feat/gestor-ventas-module` creada desde `dev` (`d0ad31e0`). Documento creado antes del primer write de código.
- **L10 (2026-10-21, T1 cerrada):** `OrderItem` guarda `BasePrice` (numeric 18,6), `PercentDiscountPrice` y `DiscountPrice` (integer), nullables; `Price` sigue siendo el precio final. `OrderLine` y `CreateOnlineOrderCommand` transportan el snapshot desde `Product`. Migración `20261021180754_Add-OrderItem-Price-Snapshot` aplicada a `smca_test`; script `backend/scripts/37-20261021-Add-OrderItem-Price-Snapshot.sql` generado desde la migración. RED observado: tests no compilaban (`BasePrice`/`PercentDiscountPrice`/`DiscountPrice` y `OrderLine` de 8 argumentos inexistentes). GREEN: `Domain.UnitTests` 184/184; `Application.Tests` 1471/1471. Commit `d401b65e`.
- **L11 (2026-10-21, RDD de T1):** assessment `medium`; escalado a `high` por el ítem 1 (migración con columnas persistidas). Consentimiento otorgado. Lentes `review-risk` + `review-reliability`; resultado **approved**, autoridad quemada (`revision a9244845...`). 0 bloqueantes; 3 hallazgos advisory registrados como T1b y para T6.
- **L12 (2026-10-21, T1b cerrada):** follow-ups del review de T1. Nuevo E2E `Orders/OrderItemPriceSnapshotE2ETests` (write/read real contra PostgreSQL) 1/1; tests de aplicación para snapshot congelado tras mutar el producto y para `0/0` como cero conocido. `Application.Tests` 1473/1473. Commit `f826348b`.
- **L13 (2026-10-21, T2 cerrada):** módulo 21 "Gestores de ventas" (`Price 20`, `PercentDiscountPrice 50` → neto 10), feature 125, rol 5 "Gestor de ventas", `StorePlanModule` (3,4), **sin** `StoreModule` ni `StoreRoleFeature` por defecto. Migración `20261021185058_Add-Gestores-Ventas-Module` aplicada a `smca_test`; script `backend/scripts/38-20261021-Add-Gestores-Ventas-Module.sql` generado. Enums backend + espejo frontend. E2E `GestoresVentasModuleCatalogTests` 1/1; `Domain.UnitTests` 184/184; `Application.Tests` 1473/1473; `pnpm typecheck` 5/5. Commit `5215a074`.
- **L14 (2026-10-21, RDD de T2 y T2b):** assessment `medium`; escalado a `high` por el ítem 2 (rol 5 y permiso `StoreRoleFeatures`). Consentimiento otorgado; lentes `review-risk` + `review-reliability`; resultado **approved**, autoridad quemada (`review-ef421233ca6b5558`). T2b (`02a02cb6`): rollback borra `UserRole` de rol 5 antes del rol (FK Restrict), E2E de catálogo scopeado a una tienda del test, test del generador `GestoresVentasAdmin → feature 125 solo OwnerAdmin`, comentario del test de freeze acotado. Full E2E: **763/770**, 7 fallos en tests existentes de matriz de planes. No se tocaron en ese momento.
- **L15 (2026-10-21, T2c):** con autorización explícita del usuario se actualizaron SOLO `PlanChangeMatrixTests.cs`, `StorePlanCatalogTests.cs` y `MeAfterOwnerPlanChangeTests.cs` para incluir módulo 21/feature 125 en los universos Superior/VIP. Estas son las únicas modificaciones a E2E existentes y no debilitan ninguna aserción. Filtro focalizado 12/12. Commit `7fdeb27b`. El full E2E posterior abortó por crash del test host tras 197 tests (0 failed) al correr el proyecto E2E aislado; la verificación con el comando documentado de la solución (`dotnet test backend/src/SMCA.sln`) dio **770/770**.
- **L16 (2026-10-21, verificación completa):** `dotnet test backend/src/SMCA.sln` → `Domain.UnitTests` 185/185, `Application.Tests` 1473/1473, `SMCA.WebApi.E2ETests` **770/770**, wall 398.3 s. El crash anterior era del proyecto E2E aislado; el comando único del README raíz es el autoritativo y queda como la forma de verificar este feature.
- **L17 (2026-10-21, T3 cerrada):** entidades `SalesManager` (Owner-level, `UserId` único), `ProductSalesCommission` (tabla propia; `ProductId` único; tipo % o fijo + moneda) y `OrderSalesCommission` (una por `OrderItemId` único; snapshot del cálculo; `MarkPaid` completo). Enums `SalesCommissionType`/`SalesCommissionStatus`; configuraciones EF con filtro por tenant y FKs Restrict; repositorios + DI. Migración `20261021203736_Add-Sales-Commissions-Tables` aplicada a `smca_test`; script `39-...sql`. `Product` y `Order` sin columnas nuevas. Pruebas: `SalesCommissionTests` (7) y E2E de round-trip con PostgreSQL (1/1). Suite completa con el comando documentado: `Domain` 192/192, `Application` 1473/1473, E2E 771/771. Commit `b42f35e2 + 3b9dbe04`.
- **L18 (2026-10-21, RDD de T3):** el review del T3 completo falló por `lens_context_budget_exceeded` (30 archivos / 5,559 líneas); se dividió en T3-A (`b42f35e2`, dominio/persistencia) y T3-B (`3b9dbe04`, migración generada). T3-A: lentes risk+reliability, **approved**, autoridad quemada (`review-9e0f51a8e8e97b9c`), 12 hallazgos advisory (6 WARNING) trasladados a T4/T6/T7. T3-B: assessment medium, `under_budget`, sin review debido. Suite completa: Domain 192/192, Application 1473/1473, E2E 771/771.
- **L19 (2026-10-21, T4 cerrada):** gestor Owner-level cableado. `AuthenticationService` entra al gestor activo sin tienda y rechaza el inactivo (`GetByUserIdAsync(..., includeInactive: true)` + `IsActive`); claim `gestor_ventas` en `ClaimsTransformerService`/`HttpContextService`; `CurrentUserDto.IsGestorVentas` en `/me`; `UserRoleRepository.IsGestorVentas`. API Owner-only `POST/GET/PUT /api/v1/SalesManagers` (crear, listar, activar/desactivar) con `User` + `UserRole` 5 + `SalesManager`, gateada por `StoreRoleFeatures.GestoresVentasAdmin`. Tests: 2 unitarios de auth (activo sin tienda / inactivo), E2E de creación + login + `/me` + desactivación. Suite completa: Domain 192/192, Application 1475/1475, E2E 772/772. Commit `ee5d834b`. La bandera/home del frontend queda para T9.
- **L20 (2026-10-21, T5a cerrada):** tabla propia `OrderSalesManager` (`OrderId` único) para atribuir el pedido al gestor; entidad, configuración EF con filtro por tenant, repositorio y DI. Migración `20261021231114_Add-OrderSalesManager-Attribution` aplicada a `smca_test`; script `40-...sql`. E2E de persistencia actualizado con la atribución (1/1). Los tests de auth de T4 que faltaban en el commit quedaron en `3b4c3dc6`. Commit `c0434d6a`. T5b (alta del pedido + endpoint) y T5c (frontend/WhatsApp) pendientes.
- **L21 (2026-10-21, T5b cerrada):** el alta pública acepta una atribución `SalesManagerUserId` marcada `[JsonIgnore]` (solo la pone el servidor). El handler verifica que el gestor esté activo, que pertenezca al Owner de la tienda y que la tienda tenga el módulo 21; crea `OrderSalesManager` en la MISMA transacción. Nuevo endpoint `POST /api/v1/sales-managers/orders/{storeSlug}` (`[Authorize]` + `IsGestorVentas`, slug por ruta, atribución server-side). Tests de aplicación: atribución correcta y gestor de otro Owner → 403. Suite completa: Domain 192/192, Application 1477/1477, E2E 772/772. Commit `7e82938f`.
- **L22 (2026-10-21, T5c cerrada):** frontend del gestor. `UserModel.isGestorVentas` (opcional) y `catalogHttpService.createSalesManagerOrder` → `POST /v1/sales-managers/orders/{slug}`. `StorefrontCheckout` gana `salesManagerMode`: alta síncrona contra el endpoint del gestor y **siempre** resumen por WhatsApp, aunque `gestionPedidosEnabled` sea false. `public-catalog.tsx` detecta `user.isGestorVentas` y activa el modo. Tests nuevos del endpoint y del checkout (23/23 focalizados); `pnpm typecheck` 5/5; `pnpm lint` 4/4. Suite frontend completa: 5,749 passed / 1 failed / 6 skipped; el único fallo (`store-routes.test.tsx`) pasa 21/21 aislado — flake de carga, no del cambio. Commit `ed30c49b`. El home/vista del gestor queda para T9.
- **L23 (2026-10-22, T5c + corrección RDD):** review de T5c con R3-001 CRITICAL; corregido en `3b2c9b4d` con fallback al alta pública y test 8/8. El validador objetivo falló por transporte (`role_capture_failed`) y el STATUS posterior dio `operation_timeout`; review en `correction_required`, sin aprobación. Ver "Bloqueo RDD — T5c".
- **L24 (2026-10-22, T6 cerrada):** `UpdateOrderStatusCommandHandler` genera la comisión al pasar a `Entregado`, en la misma transacción. Gate: módulo 21 activo + `OrderSalesManager` con atribución; lee `ProductSalesCommission` vigente por `ProductId`; omite líneas sin configuración. Porcentaje: redondeo unitario a 2 decimales × cantidad; fijo: por unidad. Moneda configurada, sin conversión; `Status = Pending`; `OrderItemId` único + comprobación de idempotencia. 5 tests nuevos (porcentaje+fijo, módulo inactivo, sin atribución, línea sin config, redondeo). Suite completa: Domain 192/192, Application 1482/1482, E2E 772/772. Commit `2ee92cd3`.
- **L25 (2026-10-22, RDD de T6):** assessment inicial `medium`/`under_budget`; por pedido explícito del usuario se forzó el review. Lentes `review-risk` + `review-reliability`; **approved**, autoridad quemada (`review-95df7427600683a0`). 0 bloqueantes; R3-001 (idempotencia sin test), R3-002 (persistencia E2E ausente) y R3-003 (scoping de lookups sin test) quedan como T6b advisory.
