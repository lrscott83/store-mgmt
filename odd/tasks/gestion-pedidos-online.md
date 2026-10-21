# Gestión de pedidos online — estados, vista mobile e historial

Branch: `feature/gestion-pedidos-online` · Delivery: dos commits (`backend`, `frontend+docs`), sin PR · Backend .NET 8 (xUnit) + frontend React Router (`pnpm`, vitest).

## Specs

- **S1** — `OrderStatus` queda con exactamente cinco miembros y estos valores: `Creado=0`, `Preparado=1`, `Transportando=2`, `Entregado=3`, `Cancelado=10`. "a todos los que existen le pones Creado y usa por ahora los 5 mios y no dejes estados colgando, asi que si sobra alguno lo eliminas" + "pero pones Cancelado con id 10 para poder poner otros estados".
- **S2** — Migración: toda fila existente de `Order` pasa a `Creado` (`0`). No queda ningún pedido en un estado eliminado.
- **S3** — Secuencia estricta, sin saltos: `Creado → Preparado → Entregado` con `Pickup`; `Creado → Preparado → Transportando → Entregado` con `Delivery`. "Claro que preparado no se salta" + "Si no hay entrega a domicilio en la tienda entonces el transportando no sale".
- **S4** — `Cancelado` es alcanzable desde cualquier estado no terminal y exige una razón de texto libre, obligatoria y no vacía. "Cancelado siempre con una razon" + "Texto libre". `Entregado` y `Cancelado` son terminales.
- **S5** — Al pasar a `Entregado` el pedido queda pagado: `PaymentStatus = Paid`. "El estado entregado es como si ya estuviera pagado el pedido a la tienda".
- **S6** — Se elimina el control manual de pago de la vista de gestión. "primera duda quitarlo".
- **S7** — Al pasar a `Transportando` se asigna el repartidor en la propia transición, y es obligatorio. "segunda duda se asigna al pasar a transportando".
- **S8** — Vista de gestión mobile friendly, con un panel colapsable por estado y el contador de pedidos. `Creado`, `Preparado` y `Transportando` sin filtro de fecha; `Entregado` y `Cancelado` solo del día actual según el reloj del dispositivo. "Todo tiene que ser mobile friendly asi que por cada estado lo muestras en paneles colapsables con la cantidad que hay" + "En esa vista de gestion solo vamos a mostrar los entregados y los camcelados del dia actual segun el tiempo del telefono que esta usando el usuario".
- **S9** — Cada card de pedido ofrece ver sus detalles. "Ademas en cada card del pedido mostrar para ver los detalles".
- **S10** — Vista de historial en ruta nueva: todos los pedidos, filtro por estado y por rango de fechas usando el `DateRangeFilter` compartido del POS, con días locales completos e inclusivos, y paginación en servidor. "adicionaremos una vista ... para el historial de pedidos donde se muestren todos y se permita filtrar por estado y fechas" + "El filtro de fecas es pos dia como mismo tenemos el componente que usamos en el POS e incluye esos dias completos".
- **S11** — Sonido al entrar un pedido nuevo: solo documentado, fuera de alcance. "Vamos a documentar 5 y por ahora esta fuera del scope".
- **S12** — Autorizado el único cambio en E2E existente: `PublicOrderingReadE2ETests.cs:109` pasa de `OrderStatus.New` a `OrderStatus.Creado`.

## Tasks

| ID | Specs | Ruta | Estado |
|----|-------|------|--------|
| T1 | S1, S3, S4, S5 | inline | hecho — `OrderStatus`, `Order.ChangeStatus`, `AllowedTransitionsFrom`, `CancellationReason`, `ChangePaymentStatus`; `OrderStatusTransitionTests` 57/57 |
| T2 | S2 | inline | hecho — `20261020141225_Reescritura-Estados-Pedidos-Online` aplicada en `smca_test`; script `36-20261020-...sql` |
| T3 | S4, S5, S7 | inline | hecho — comando con `DriverId`/`CancellationReason`, validador y traducción a 400; Application.Tests OnlineOrdering 451/451 |
| T4 | S12 | inline | hecho — `PublicOrderingReadE2ETests.cs:109` → `OrderStatus.Creado` |
| T5 | S1, S3 | inline | hecho — `OnlineOrderStatus` (5 valores) y `allowedTransitionsFrom(status, deliveryType)`; `ordering-sales` migrado |
| T6 | S6, S8, S9 | inline | hecho — vista de gestión reescrita en paneles colapsables; toggle de pago eliminado; detalles por card |
| T7 | S10 | inline | hecho — `/sales/online-orders/history` con estado + `DateRangeFilter` y paginación de servidor |
| T8 | S8, S9, S10 | inline | hecho — claves i18n nuevas; tests de vista 15/15 y `ordering-sales` 17/17 |
| T9 | S11 | inline | hecho — `docs/online-orders/new-order-sound.md` |

## Log

**L1** — "no se de donde sacas que aqui no hay cosas si aqui esta todo el modulo de gestion de pedidos en el backend para el catalogo web, todo esto es online y nada offline como lo que tenemos en el catalogo web. Tambien hay una vista para la gestion de los pedidos que vamos a tener esta pero adicionaremos una vista cuando este la gestion de pedidos activa para el historial de pedidos donde se muestren todos y se permita filtrar por estado y fechas. Vamos a tener los siguientes estados creado → preparado → transportando → entregado y cancelado. Cancelado siempre con una razon. Si no hay entrega a domicilio en la tienda entonces el transportando no sale. Todo tiene que ser mobile friendly asi que por cada estado lo muestras en paneles colapsables con la cantidad que hay. El estado entregado es como si ya estuviera pagado el pedido a la tienda. EN esa vista de gestion solo vamos a mostrar los entregados y los camcelados del dia actual segun el tiempo del telefono que esta usando el usuario. Cualquier duda me preguntas para que no asumas nada de nada"

**L2** — "a todos los que existen le pones Creado y usa por ahora los 5 mios y no dejes estados colgando, asi que si sobra alguno lo eliminas."

**L3** — "1. OK, pero pones Cancelado con id 10 para poder poner otros estados. 2. Texto libre 3. No entiendo esa vista que me dices que esta el toggle de pago. 4. Claro que preparado no se salta, no te dije nada de eso por que lo quieres saltar? 5. Vamos a documentar 5 y por ahora esta fuera del scope. 6. asi mismo como dices lo de hoy solo te lo dije para entregado y cancelado. El filtro de fecas es pos dia como mismo tenemos el componente que usamos en el POS e incluye esos dias completos. Ademas en cada card del pedido mostrar para ver los detalles."

**L4** — "primera duda quitarlo, la vista de gestion es como la estamos definiendo ahora. segunda duda se asigna al pasar a transportando"

**L5** — Autorización E2E: "si" (a cambiar `OrderStatus.New` → `OrderStatus.Creado` en `PublicOrderingReadE2ETests.cs:109`).

**L6** — Exploración inicial: `OrderStatus` vive en `Domain/Common/Enums/OrderStatus.cs`; la puerta única es `Order.ChangeStatus` (`Domain/Entities/Orders/Order.cs:160`) con `AllowedTransitionsFrom` (`:169`). Consumidores: `UpdateOrderStatusCommand`, `GetOnlineOrders`, `GetOnlineOrderStats`, `GetOnlineOrderById`, `OnlineOrdersController`, y el espejo frontend `frontend-react/.../sales/lib/services/ordering-http-service.ts` (`OnlineOrderStatus` + `ORDER_STATUS_TRANSITIONS`). Última migración: `20261019160559_AddStoreLocationFields`; siguiente script: `36-`.

**L7** — Decisión añadida (no preguntada, derivada de S8): el filtro por rango de `GetOnlineOrders` normaliza a días UTC, lo que movía "hoy" al día de la tienda y no al del teléfono. Se añadió `exactRange` (query param aditivo, por defecto `false`) para que la vista envíe los dos instantes UTC de su día local. El historial usa el mismo mecanismo, así las dos vistas coinciden en qué es "hoy". Test: `Handle_WithExactRange_ShouldForwardBothInstantsUntouched`.

**L8** — Decisión añadida (no preguntada): el endpoint manual de pago se conserva, pero `Order.ChangePaymentStatus` rechaza devolver a `Pending` un pedido `Entregado` (invariante de S5). Sin esa puerta, el eje manual podía contradecir "entregado = pagado". La UI ya no lo ofrece.

**L9** — Evidencia: `Domain.UnitTests` 183/183; `Application.Tests` 1419/1419; E2E `PublicOrderingReadE2ETests` 4/4; frontend `typecheck` limpio y suite 5673 passed / 4 failed en dos archivos NO tocados (`management/stores/.../my-stores.test.tsx`, `shared/lib/storage/.../decryption-failure-policy.test.tsx`), sin imports compartidos con este cambio; no se verificaron contra la base.

**L10** — RDD omitido en la primera entrega: no se corrió `review assess` antes de declarar el trabajo terminado, con el modo en `on`. Corregido después.

**L11** — RDD ejecutado con hallazgos reales:
- `R3-001` (BLOCKER, determinista): `GetOnlineOrdersQueryHandlerTests.cs` tenía `/// </summary>    [Fact]` en la misma línea, así que el atributo quedaba dentro del comentario y `Handle_WithASearch_ShouldForwardItTrimmed` no se ejecutaba. Corregido (verde 1/1).
- `R3-status-renumber-no-migration` y `R3-cancellation-reason-no-schema-migration`: el commit del enum sin su migración no es coherente por separado. Corregido uniendo backend y migración en un solo commit.
- El candidato backend completo (4.385 líneas, casi todas `Designer.cs` generado por EF) excede `lens_context_budget_exceeded`: no existe aprobación nativa. Dos transacciones quedaron en `correction_required` (`review-02e7f88c6d982829`, `review-d0b4e154ea06c92d`); abandonarlas exige autorización de mantenedor.

**L12** — Decisión del usuario sobre la entrega (2026-10-20): partir en dos unidades —backend y frontend— pero **sin PR, solo commits**. Se entrega la rama con dos commits; el backend queda sin aprobación nativa por presupuesto de contexto del revisor.

