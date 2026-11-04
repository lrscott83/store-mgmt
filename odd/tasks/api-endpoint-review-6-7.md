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

## Tasks

| ID | Qué | Specs | Ruta | Estado |
| --- | --- | --- | --- | --- |
| T1 | Pedidos online: page acotado, search acotado, `driverId` requerido, existencia de repartidor, `[Authorize]`, guard y 404 compartidos, `CancellationToken`, `Include`s | S1, S2, S3, S4, S5, S6, S7, S8, S15 | delegado (worker) | pendiente |
| T2 | Repartidores: update parcial, validación recortada, DTO/límites/guard únicos, `:guid` y `ProducesResponseType`, E2E cross-store | S5, S9, S10, S11, S12, S13, S15 | delegado (worker) | pendiente |
| T3 | Índices: `pg_trgm` GIN en `Code`/`CustomerPhone`, `(StoreId, Date)`, migración + script | S14, S15 | delegado (worker) | pendiente |

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
