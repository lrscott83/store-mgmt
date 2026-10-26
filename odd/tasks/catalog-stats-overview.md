# Catalog stats overview (vista general + select filtrado por visitas)

Branch: trabajo directo sobre la rama actual. Delivery: work-unit commits.
Runner: `dotnet test` (backend), `pnpm test` / `pnpm typecheck` (frontend-react).

## Specs

S1. `/admin/catalog-stats` abre en una vista GENERAL: un solo agregado de TODAS las tiendas para el periodo elegido (7 o 30 días). "General" es la opción por defecto del select.

S2. El select lista ÚNICAMENTE las tiendas con visitas (>0) en el periodo seleccionado, más la opción "Todas las tiendas". Al cambiar el periodo la lista se recalcula.

S3. Seleccionar una tienda hace drill-down a las estadísticas de esa tienda con el endpoint per-tienda existente, sin cambiar sus números. Si la tienda seleccionada deja de tener visitas en el nuevo periodo, la página vuelve a la vista general (sin estado inconsistente).

S4. Nuevo endpoint SuperAdmin `GET /api/v1/stores/catalog-stats?days=N` que devuelve el agregado general (mismo contrato de KPIs, orígenes, top productos y serie diaria que el per-tienda) MÁS la lista `stores` de tiendas con visitas en ese periodo (`storeId`, `name`, `visits`, ordenada por visitas desc y luego nombre).

S5. Semántica del agregado, documentada en código: `Visitantes únicos` es la suma de únicos por tienda (el hash es por tienda + día), no un único global de personas. `Visitas` = sesiones distintas (el hash de sesión incluye la tienda). `Conversión` = pedidos online de todas las tiendas / visitas.

S6. El endpoint per-tienda `GET /v1/stores/{storeId}/catalog-stats` no cambia de comportamiento: mismos números, misma ventana, mismo gate SuperAdmin.

S7. Sin cambios de esquema no pedidos. **Enmendada 2026-10-26 (L11):** se añade el índice `(OccurredAt, SessionHash)` con migración EF `20261026210157_Add-CatalogEvents-OccurredAt-SessionHash-Index` y script `backend/scripts/41-20261026-Add-CatalogEvents-OccurredAt-SessionHash-Index.sql`. Ningún otro cambio de esquema. No se toca ningún E2E existente: la cobertura nueva va en archivos nuevos.

## Tasks

| ID | Specs | Route | Status |
| --- | --- | --- | --- |
| T1 | S4, S5 | inline | done — `GetOverviewStatsAsync` + overload global de pedidos; `1d4735cb` |
| T2 | S4, S5, S6 | inline | done — query, DTOs, endpoint; per-tienda restaurado a su forma original (sin helper compartido); `1d4735cb` |
| T3 | S4, S5 | inline | done — 5 tests de handler (incluye clamp 365); `1d4735cb` |
| T4 | S4, S5 | inline | done — E2E nuevo: agregado + invariante `Visits > 0` + 403 al dueño; `1d4735cb` |
| T5 | S1, S2, S3 | inline | done — vista general por defecto y select filtrado. |
| T6 | S1, S2, S3 | inline | done — 14 tests de página (Vitest). |
| T7 | S4, S5, S7 | delegated (worker) | done — serie diaria por día con `[day, day+1)`, índice `(OccurredAt, SessionHash)` + migración/script, snapshot `RepeatableRead`, token en el conteo global, E2E multi-tienda; `6de5a1b6` |
| T8 | S1, S2, S3 | delegated (worker) | done — un fallo transitorio conserva el último overview bueno (KPIs + selector + selección); tests del camino positivo. |

## Log

L1 (pedido original, verbatim): "revisa porque las estadisticas del admin/catalog-stats deben mostrarse de forma general y mostrar solo en el select las tiendas que han tenido visitas en ese periodo. Si tioens alguna duda me preguntas para que no asumas nada de nada"

L2 (decisión, 2026-10-26): el usuario confirmó el alcance y autorizó el cambio en backend: "Sí, agregado global + select filtrado". General = una sola vista agregada de TODAS las tiendas (opción por defecto en el select); el select lista solo tiendas con visitas en el periodo para hacer drill-down.

L3 (diagnóstico previo): la página era per-tienda de punta a punta — `catalog-stats.tsx:50-69` listaba todas las tiendas por `/v1/stores/by-current-user` y autoseleccionaba `data[0]`; `GetCatalogStatsQuery.cs:45-49` y `CatalogEventRepository.cs:27-28` filtran por `StoreId`. No existía endpoint agregado. El SuperAdmin sí puede agregar cross-store: el filtro global de tenant es `_context.IsSuperAdmin || x.TenantId == _context.TenantId` (`CatalogEventEntityTypeConfiguration.cs:26`).

L4 (riesgo conocido, no implementado): los índices de `CatalogEvent` empiezan por `StoreId` (`CatalogEventEntityTypeConfiguration.cs:31-34`), así que el barrido global del periodo no tiene índice líder por fecha. Queda como follow-up; agregar un índice exige migración y no se pidió.

L5 (verificación, 2026-10-26):
- `dotnet build src/SMCA.WebApi` → Build succeeded.
- `dotnet test src/Application.Tests` → 1532 passed, 0 failed (incluye los 4 tests per-tienda preexistentes).
- `dotnet test src/SMCA.WebApi.E2ETests --filter "FullyQualifiedName~SMCA.WebApi.E2ETests.Catalog"` → 90 passed, 0 failed (incluye `CatalogTelemetryE2ETests`, que no se tocó).
- `pnpm --filter @store-mgmt/web-store-pos test -- --run app/admin/catalog-stats` → 7 passed.
- `pnpm --filter @store-mgmt/web-store-pos typecheck` → sin errores. `lint` → sin warnings.

L6 (diferencial per-tienda): el endpoint `GET /v1/stores/{storeId}/catalog-stats` conserva sus 4 tests de handler y su E2E intactos y verdes.

L7 (corrección de alcance, 2026-10-26, pedido del usuario): "reviertelo. La idea es mantener lo que estaba tambien por tienda pero solo al inicio tener un resumen con todas las tiendas." Se deshizo la extracción de `CatalogStatsComposition`: `GetCatalogStatsQuery.cs` vuelve a ser el archivo original byte por byte (diff vacío contra el commit previo) y el handler general se queda con su propia ventana/densificado. No se tocó nada más del panel por tienda. Re-verificado: build OK, 1532 unit tests, 90 E2E de catálogo.

L8 (verificación independiente, 2026-10-26). El verifier confirmó S1–S7 cumplidos y la invariante per-tienda por hash de archivo, y encontró **2 regresiones mías** al partir el loader único en dos:
- **B1** el contador `pending` se fugaba cuando una respuesta llegaba superada (`end()` estaba condicionado al request vigente) → spinner infinito. Fix: cada `begin()` tiene exactamente un `end()` en `finally`.
- **B2** el error de un drill-down fallido no se limpiaba al volver a General ni al elegir otra tienda → pantalla vacía con mensaje obsoleto. Fix: un estado de error por lectura (`overviewError` / `storeError`), el render usa el de la vista visible; se elimina el acoplamiento que compartía un solo `error`.
- **A1** (advisory) la selección oculta podía re-seleccionarse sola: ahora un efecto limpia el `storeId` real cuando la tienda deja de tener visitas en el periodo **o cuando el overview falla** (residual cerrado a pedido del usuario).
Se añadieron 4 tests de regresión a la página (11 total). **A2**: la suite E2E de catálogo es sensible al estado compartido; en esta sesión volvió a dar 90/90 verde después de esperar 3 s y matar `testhost`, y la clase nueva pasa 2/2 aislada. La cifra de L5 no es reproducible al 100% por esa razón, no por el cambio.
Se añadió también a la E2E la invariante que pide el usuario: `Totals.Visits == Stores.Sum(Visits)` ("es una suma") y el clamp de ventana por HTTP.

L9 (RDD, 2026-10-26). `gentle-ai review mode status` → `receipt-driven development: on (decided by global)`. `gentle-ai review assess --base-ref 1d4735cb^ --committed-only` sobre `b49fc781` → `risk: medium`, `review_due: false`, `review_due_reason: under_budget`, 14 paths / 1085 líneas cambiadas. Per el contrato de RDD, un candidato bajo presupuesto no abre revisión: la rebanada queda pendiente hasta que un commit posterior alcance el presupuesto. Nada que ackear.

L10 (RDD forzado, 2026-10-26, pedido explícito del usuario: "fuerzala"). Consentimiento `granted` relatado en un prompt bloqueante; START con 2 lentes (`review-resilience`, `review-reliability`) sobre 14 archivos / 1088 líneas, línea `review-98c6397b71076614`, target `sha256:bcc8e842…b91b383`. Resultado: **approved**, autoridad quemada (`review/acknowledge-approved`, revisión `sha256:d21629f6…`, `authority: burned`). Cero correcciones: los 10 hallazgos son **advisories informativos**.
- R4-001 / R3-4: el barrido global no tiene cota, ni índice líder por fecha, ni instrumentación (ya registrado como L4).
- R4-002: si una petición nunca resuelve, el contador de pendientes mantiene el spinner (no hay timeout/abort en esa ruta).
- R4-003: un fallo del overview deja sin KPIs, sin selector y sin selección a la vez (una sola lectura).
- R4-004: el conteo global de pedidos no acepta `CancellationToken`.
- R3-1: el test de ventana compara contra `DateTime.UtcNow.Date` en el assert (falla si cruza medianoche UTC).
- R3-2: las consultas del agregado no comparten transacción, así que `Totals.Visits == Stores.Sum(Visits)` puede diferir con escrituras concurrentes.
- R3-3: `IgnoreQueryFilters` en el conteo global de pedidos desactiva todos los filtros, no solo el de tienda.
- R3-5 / R3-6: sin cobertura de orden multi-tienda ni del camino positivo de persistencia de la selección.

L11 (corrección de enfoque, 2026-10-26, verbatim del usuario): "revisa bien compadre, porque hay cosas que se buscan por dia y esa no es la solucion, quizas poner un indice por fecha y hacer un filtro por <= y < que el dia siguiente como se hace en los filtros del POS con localStorage. Por favor, no inventes cosas y revisa antes soluciones similares y si no me preguntas porque la idea no hacer distintas. Entendido??????????"

L12 (ejecución de L11). Se descartó el plan anterior (acotar la ventana / SQL crudo). Precedentes encontrados y reutilizados: `NormalizeFrom`/`NormalizeTo` (`GetOnlineOrderStatsQuery.cs:171-191`) ya definen el rango por día completo; los índices del repo son `HasIndex` simples o compuestos (`OrderEntityTypeConfiguration.cs:20-21`, `CatalogEventEntityTypeConfiguration.cs:31-34`); no hay SQL crudo en producción. Cambios:
- Serie diaria: `COUNT(DISTINCT SessionHash)` por día en `[day, day+1)` (último día cortado en `toUtc`), sin materializar filas. TODO EF/LINQ.
- Índice `(OccurredAt, SessionHash)` + migración `20261026210157` + script `41-…` (aplicado a `smca_test`, verificado en `pg_indexes`).
- Lecturas de eventos dentro de una transacción `RepeatableRead` (R3-2).
- `CountOnlineOrdersAsync(from, to, ct)` sin `IgnoreQueryFilters` (R3-3, R4-004).
- Test de ventana a prueba de medianoche UTC (R3-1); E2E con dos tiendas, orden descendente e igualdad de la suma (R3-5).
- Frontend: un fallo transitorio conserva el último overview bueno (KPIs, selector y selección) (R4-003); el efecto de selección vuelve a limpiar solo cuando un overview exitoso ya no trae la tienda (A1); el timeout de 30 s del `api-client` ya libera el contador de pendientes (R4-002, sin código).
- R4-001: el barrido ya no materializa filas y cada día usa el índice. No se añade telemetría porque la capa Application no tiene logging y añadir la dependencia por una línea queda fuera de este cambio.

L13 (revisión RDD del slice nuevo, 2026-10-26). El primer candidato (`8edf1744..f280d182`, 267 líneas) se pasó del presupuesto de contexto del reviewer (`lens_context_budget_exceeded`) porque el `*.Designer.cs` generado pesa ~3876 líneas. Se reordenaron los commits para que la migración generada quede ANTES del slice revisado: `e29a4226` (migración + script) → `5ced6897` (código backend) → `f280d182` (frontend + doc).
El reviewer levantó 2 CRITICAL del recorte, no del código: el índice aparecía sin su migración dentro de la ventana y el escenario multi-tienda estaba dentro de un E2E que ya existía en la base. Corrección (`5c1f532a`, 93 líneas declaradas): el escenario multi-tienda pasa a `CatalogOverviewStatsMultiStoreE2ETests.cs`, `CatalogOverviewStatsE2ETests.cs` vuelve byte por byte a la versión de `e29a4226`, y la configuración del índice nombra su migración y su script. Revisión final: **approved** (linaje `review-e5c2738dc11973c7`, autoridad quemada), sin correcciones adicionales.
Advisories informativos de esa revisión: (a) el cambio de filtro del conteo global de pedidos no tiene test que lo fije; (b) el bucle por día añade N round-trips secuenciales dentro del snapshot (tradeoff elegido a propósito); (c) no hay test de frontera entre días ni del corte del último día en `toUtc`; (d) retener el último overview bueno puede dejar los KPIs en el periodo anterior mientras el drill-down ya pide el nuevo, bajo el banner de error.








