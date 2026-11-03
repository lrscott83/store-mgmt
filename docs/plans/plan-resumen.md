# Plan resumen — estado de `docs/plans` y trabajo pendiente

> **Índice único y evolutivo.** Actualizar este documento cada vez que un plan se
> complete, se agregue uno nuevo o cambie de prioridad.
>
> **Última auditoría:** 2026-11-03 · Rama: `dev` · 34 documentos en `docs/plans`
> (10 agregados después de la auditoría del 2026-09-20, que estaban sin indexar).
> **Método:** verificación plan-por-plan contra el código real (archivo:línea o
> commit). Sin asumir: cada clasificación tiene prueba.
>
> **Cambio de formato (2026-11-03):** cada pendiente lleva **Problema**, **Propuestas**
> y **Recomendación**. La prioridad ya no es "lo que dice el plan", sino impacto real
> verificado en código.

## Cómo usar este documento

- **Pendiente** = trabajo real por hacer, ordenado de P0 (mayor) a P3 (menor).
- Al cerrar un ítem: marcar la casilla, anotar commit / evidencia observada y mover el
  detalle a §2 (cerrado).
- Al crear un plan nuevo en `docs/plans/`, agregarlo a la sección que corresponda.
- **`docs/plans` no es el backlog completo.** El trabajo de ejecución vive en
  `odd/tasks/`; aquí quedan las decisiones de diseño, los pendientes y el índice.
- Un plan marcado como "no iniciado" puede estar implementado: varios documentos no se
  actualizaron después de su entrega (ver §3).

---

## 1. Trabajo pendiente (por prioridad)

### P0 — Correctitud de datos e invariantes (alto impacto, desbloqueado)

#### [ ] P0-1 · El snapshot de venta: una lectura que escribe y puede tumbar la pantalla

- **Fuente:** `2026-10-06-sale-snapshot-review-findings.md` §F1 y §F3 (hallazgos RDD).
- **Problema:** `order-offline-service.ts:895` hace `if (changed) this.setOrdersLocalStorage(stored)`
  dentro de `getOrdersFromLocalStorage`. Desde el backfill del 2026-10-06 la lectura sanea la
  orden **y la reescribe**. Si esa escritura falla —`QuotaExceededError` con `localStorage` lleno,
  o `MissingDataKeyError` porque la DEK aún no está en memoria (`setOrdersLocalStorage` cifra)— la
  excepción **se propaga** y la lectura completa falla. Antes del backfill la lectura no podía
  fallar. El diseño original (`D4`) era explícito: un store ilegible nunca se sobrescribe.
- **Propuestas:**
  - **A. Persistencia best-effort.** `try { setOrdersLocalStorage(stored) } catch { /* log */ }` y
    devolver siempre el resultado saneado. Cambio de 4 líneas, no cambia el contrato.
  - **B. Precondición explícita.** Persistir solo si la DEK está disponible y hay espacio
    (`navigator.storage.estimate()`); no cubre la carrera entre la comprobación y el `setItem`.
  - **C. Sacar la escritura del camino de lectura.** Una migración explícita al abrir la app
    (una sola vez) y la lectura vuelve a ser solo lectura. Es el diseño conceptualmente correcto,
    pero más trabajo y hay que garantizar que la cura ocurra.
- **Recomendación:** **A**, con el test de F3 en el mismo cambio (leer dos veces un store legacy:
  la primera persiste, la segunda **no** llama a `setOrdersLocalStorage`). C queda como ideal a
  futuro; no bloquea nada. Telemetría/consola del fallo, sin marcarlo como persistido.
- **Riesgo del arreglo:** bajo (ningún dato, seguridad, contrato ni concurrencia). Tests: unit del
  servicio + un caso que fuerza el fallo de `setOrdersLocalStorage`.

#### [ ] P0-2 · Lost update en los 3 `PATCH` de pedidos online (6.1 / X2)

- **Fuente:** `2026-10-11-api-endpoint-review-catalogo-pedidos.md` unidad 6.1 y transversal X2.
- **Problema:** `UpdateOrderStatusCommand.cs:137`, `UpdateOrderPaymentStatusCommand.cs:89` y
  `AssignOrderDriverCommand.cs:103` cargan el pedido, mutan **un** eje y llaman a
  `_orderRepository.UpdateAsync(order)`. `GenericRepository.cs:29-33` hace
  `Entry(entity).State = EntityState.Modified`: **UPDATE de fila completa**, con contexto
  `NoTracking` y sin token de concurrencia. Si A marca el pago mientras B marca "aceptado", el
  último `SaveChanges` **revierte en silencio la columna del otro**. No hay error, no hay rastro.
  El flujo multiusuario (dueño + StoreUser) es el caso normal, no el borde.
- **Evidencia verificada:** `GenericRepository.cs:29-33`; los 3 call sites comparten el patrón;
  `Order` no tiene `RowVersion`/`ConcurrencyToken` (grep en `Domain/Entities/Orders/Order.cs`).
- **Propuestas:**
  - **A. Actualización parcial por columnas.** Marcar solo las propiedades que la operación tocó
    (`Entry(entity).Property(x => x.Status).IsModified = true`, etc.). Es el patrón que ya se
    aplicó y probó en `StoreCatalogSettingsRepository.UpsertAsync` (5.3, `00acfe44`).
  - **B. Token de concurrencia.** `rowversion`/`xmin` en `Order` + mapear
    `DbUpdateConcurrencyException` → **409**. Exige migración, script y cambio de contrato.
  - **C. Solo A ahora; B como unidad aparte.**
- **Recomendación:** **C**. A resuelve la pérdida entre ejes distintos (estado vs pago vs
  repartidor) sin migración y reutiliza un patrón ya aprobado en este repo. B aporta protección
  real cuando dos personas editan **la misma** columna, pero el dominio ya serializa transiciones;
  se difiere a una unidad con migración y semántica 409 documentada. A no debe presentarse como
  "cerrado": en el plan queda B como deuda explícita.
- **Riesgo:** alto (datos). Requiere aprobación backend y test contra PostgreSQL real (el E2E
  nuevo debe demostrar que un `PATCH payment` concurrente sobrevive a un `PATCH status`).

#### [ ] P0-3 · `PATCH /delivery-drivers/{id}` da de baja al repartidor en silencio (7.1)

- **Fuente:** `2026-10-11-api-endpoint-review-catalogo-pedidos.md` unidad 7.1.
- **Problema:** `UpdateDeliveryDriverCommand.IsActive` es `bool` **no nullable** y el handler
  escribe siempre (`driver.IsActive = request.IsActive`). Un `PATCH` canónico
  `{"name":"...","phone":"..."}` deja `IsActive = false` y devuelve **200**: el repartidor
  desaparece de la lista por defecto y no se puede asignar a pedidos nuevos. Hoy solo lo tapa el
  tipo TypeScript del cliente; cualquier otro consumidor (o un cliente futuro) lo dispara.
  Semántica `PATCH` = "lo omitido no se toca", y aquí lo omitido borra.
- **Propuestas:**
  - **A. `bool? IsActive` + escribir solo si `HasValue`.** Cambio mínimo, conserva el contrato y
    el endpoint único.
  - **B. Separar acciones.** `PATCH` solo nombre/teléfono + `POST /{id}/deactivate` y
    `/activate`. Más explícito, pero duplica endpoints y no arregla el cuerpo actual.
  - **C. JSON Patch (RFC 6902).** Fuera de escala para este repo.
- **Recomendación:** **A** + validator que exija al menos un campo del cuerpo y un test E2E nuevo
  (`PATCH` sin `isActive` no cambia el estado; `isActive:false` sí). Documentar la semántica en el
  endpoint. B es una mejora de UX posterior, no un requisito.
- **Riesgo:** medio (contrato de un endpoint consumido por la app, no publicado). Requiere
  aprobación backend por la regla del repo.

---

### P1 — Features pendientes acordadas (desbloqueadas)

#### [ ] P1-1 · Resto de `api-endpoint-review` en pedidos y repartidores (unidades 6-7)

- **Fuente:** `2026-10-11-api-endpoint-review-catalogo-pedidos.md`. Controllers 1-5 **hechos y
  aprobados por RDD**; de las unidades restantes solo siguen vivas las de **gestión de pedidos**
  (6) y **repartidores** (7). Lo del catálogo web público y la plantilla (unidades 8-9) queda
  **descartado** por decisión del owner (§7).
- **Problema:** hallazgos sin implementar en `OnlineOrders` (paginación sin tope, `search` sin
  índice, PII sin máscara, sin `[Authorize]` de feature) y `DeliveryDrivers` (resto: validación que
  mide distinto que lo que guarda, DTO copiado, store-guard repetido). Los transversales X1
  (multipart global sin tope real), X3 (check-then-act → 500) y X4 (OpenAPI incompleto) tocan
  varios controladores.
- **Propuestas:** implementar **unidad por unidad** con aprobación punto por punto, como se hizo
  con 1-5 (build + `Application.Tests` + RDD por unidad). No un solo PR gigante.
- **Recomendación:** **6 → 7 (resto) → transversales** (X1 antes de X4; X3 junto con la unidad que
  lo toque). Cada unidad cierra con tests nuevos; los E2E existentes no se tocan.

#### [x] P1-2 · Deriva del spec canónico REQ-5 — HECHO 2026-11-03

Cerrado: `openspec/specs/e2e-store-plan-activation-ui/spec.md` REQ-5 ahora exige **exactamente un**
`GET /v1/auth/me` tras cambiar el plan (el refresco suave), conserva cero en una recarga (REQ-1 de
`e2e-session-hydration`) y explica las dos correcciones (2026-08-08 y 2026-11-03). Sin cambios de
código: la implementación y el E2E ya coincidían desde el 2026-09-16.

#### [ ] P1-3 · SEO de la landing — solo queda el cuerpo estático (P1/P2)

- **Fuente:** `2026-10-20-landing-seo-audit.md` §5. Iteraciones 1-4 cerradas (JSON-LD, H1, OG,
  `offers`, constantes de schema, timeout de vitest).
- **Problema que queda:** **P1** el `<body>` servido no trae contenido (los rastreadores sin JS no
  tienen qué describir) y **P2** los `offers` del JSON-LD se inyectan en runtime. **P6** (title de
  62 caracteres) es cosmético y opcional.
- **Propuestas:** P1 = prerender real o bloque semántico inyectado en el build; P2 = generar los
  `offers` del lado servidor cuando exista P1.
- **Recomendación:** P1 y P2 son **un proyecto aparte**, caro, y no bloquean nada de la operación
  actual. No se agendan hasta que el owner los pida.

#### [ ] P1-4 · Las vistas deben suscribirse solas al aviso de cambios

- **Fuente:** `2026-10-06-subscription-refresh-for-views.md`.
- **Problema:** `data-revision-store` sube un contador cuando algo cambia, pero **no despierta a
  nadie**: solo `sale.tsx` y `wholesale.tsx` se suscriben a mano. Gastos, almacenes, tasas, ventas
  a crédito, entradas y créditos no se vuelven a pintar aunque el dato en memoria sea nuevo. Y una
  pantalla nueva que olvide suscribirse queda congelada sin que nada falle.
- **Propuestas:**
  - **A. Hook único** (`useLiveValue`) que se suscribe internamente al contador, invalida la foto
    de los servicios y devuelve el valor recalculado; la pantalla no declara dependencias.
  - **B. Suscripción explícita por pantalla** (lo de hoy, generalizado): barato pero repite el
    error que el plan quiere eliminar.
  - **C. Test de guardia** que falle si una pantalla con datos vivos no está suscrita.
- **Recomendación:** **A + C**, migrando en este orden: `sale`/`wholesale` (quitar la suscripción
  manual) → gastos → almacenes → el resto. El agrupamiento por ráfaga de
  `invalidation-universal-write-through` ya está hecho: es la precondición de seguridad, no un
  extra.

#### [ ] P1-5 · Restos de PWA (logs de diagnóstico y tipos MIME)

- **Fuente:** `2026-07-27-pwa-offline-shell-frontend-plan.md` Task 6/8; auditoría 2026-11-03.
- **Problema:** quedan 4 logs `[SW]`/`[PWA]` vivos (`app/service-worker.ts`, y
  `service-worker-registration.ts`) que ensucian la consola de producción, y `nginx.conf:35-41`
  no incluye `text/javascript` ni `application/manifest+json` en `gzip_types` (el JS se sirve como
  `application/javascript` así que funciona, pero el manifest no se comprime).
- **Propuestas:** A. borrar los logs; B. dejarlos detrás de un flag de depuración; C. mantenerlos.
- **Recomendación:** **B** para los logs (útiles en soporte, invisibles por defecto) y **añadir los
  dos tipos a `gzip_types`** (riesgo cero, ganancia real). Requiere **sign-off del owner** porque
  toca el despliegue y el service worker.

#### [ ] P1-6 · Reconciliar las fichas E2E desactualizadas

- **Fuente:** `odd/tasks/e2e-birth-plan-superior.md`, `odd/tasks/e2e-plan-gated-modules-gaps.md`,
  `odd/tasks/e2e-switcher-session-realign.md`; auditoría 2026-11-03.
- **Problema:** hay fichas cuyo log dice "hecho" y cuyas casillas siguen `[ ]`
  (`e2e-birth-plan-superior` T3..Tn/Tfinal; `e2e-plan-gated-modules-gaps` G1-G4, cuyos tres tests
  **existen** en `AuthMePlanModulesGapTests.cs` y `ExportOfflineRosterPlanGapTests.cs`). Una ficha
  que se contradice hace que la próxima sesión reabra trabajo cerrado o descarte trabajo real.
- **Propuestas:** A. marcar lo verificado y cerrar; B. reabrir con criterio; C. dejar como está.
- **Recomendación:** **A** en una sola pasada de 20 minutos: abrir el test/fixture citado, marcar,
  y anotar el commit. El "hallazgo de APP" de `e2e-birth-plan-superior.md:98-104` (guard de
  monedas) **ya está resuelto**: ver §2.

#### [ ] P1-7 · Confirmar el estado del VPS (catálogo y columnas)

- **Fuente:** `2026-09-24-revisar-e2e-expectativa-contra-bd.md` acción 2; `2026-09-27-web-catalog-module-plan.md`.
- **Problema:** las BD locales quedaron corregidas el 2026-09-25, pero el VPS nunca se confirmó:
  módulos/features (17/42) y columnas `Currency` (script 26). Sin eso, un cambio de plan en
  producción puede materializar menos features de las anunciadas y el catálogo puede fallar con
  `column p.Currency does not exist`.
- **Propuestas:** A. consulta **de solo lectura** (`__EFMigrationsHistory` + conteos por módulo) y
  decidir con el resultado; B. aplicar el backfill/script 26 si falta.
- **Recomendación:** **A primero** (información, sin mutación), con autorización explícita de
  acceso. B solo si la consulta muestra drift, y con el mismo criterio idempotente ya usado.

---

### P2 — Bloqueado por decisión de producto o aprobación backend

#### [ ] P2-1 · Sesión de caja POS (apertura / cierre / arqueo)

- **Fuente:** `sesion-de-caja-apertura-cierre-pos.md`; **sin código**; 5 decisiones abiertas (§3.8).
- **Problema:** hoy no hay turno de caja: no se puede saber con qué fondo se abrió, quién cobró
  ni si el efectivo cuadra. Es la misma necesidad del Group C de `2026-08-04-frontend-work-queue.md`.
- **Propuestas:** A. MVP (apertura con fondo, cierre con conteo por denominación y diferencia);
  B. completo (arqueo, retiros/ingresos, multi-caja por tienda); C. solo registro informativo sin
  bloqueo de ventas.
- **Recomendación:** **A**, y decidir primero las 5 preguntas (moneda del fondo, quién puede
  abrir/cerrar, qué pasa si se vende sin caja abierta, cierre a ciegas, arqueo obligatorio). Sin
  esas respuestas no se escribe código: es dinero.

#### [ ] P2-2 · Pago 0 por tienda (100 % de descuento)

- **Fuente:** `2026-09-05-store-payment-zero-override-plan.md`; **sin código**.
- **Problema:** el SuperAdmin no puede dejar el pago de una tienda en 0 sin reescribir precios de
  módulos; tampoco hay "Restablecer", ni el precio tachado en las dos vistas.
- **Propuestas:** A. flag por tienda (`BillableAmount = 0` / override) resuelto en
  `BillingService` y `ModulePriceCalculator`; B. descuento del 100 % en cada `StoreModule`
  (destructivo, pierde el precio negociado); C. no hacerlo y usar el mecanismo actual.
- **Recomendación:** **A**, entrando por la **regla única de precio** para que cartel y cobro no
  discrepen, y reutilizando el gate `hasBillableAmount` (monto 0 no entra en trial). Aprobar
  antes el contrato de "Restablecer".

#### [ ] P2-3 · Owner que también es ReSeller + comisiones como crédito

- **Fuente:** `2026-10-16-owner-reseller-dual-role-comisiones-plan.md`; **propuesta, no iniciado**.
- **Problema:** el modelo permite ambos roles a medias, pero no existe flujo, ni home/features para
  el doble rol, ni saldo de comisiones, ni forma de aplicarlo al pago propio. Sin guard de
  auto-comisión, comisión y descuento se realimentan.
- **Propuestas:** A. fases A→D→B→C del plan (doble rol, guard anti-auto-comisión, ledger, aplicar
  crédito); B. solo reporte de comisiones (ya existe) sin doble rol; C. crédito manual por
  SuperAdmin.
- **Recomendación:** responder primero §5 (automático vs elegido, caducidad, moneda, trial,
  retroactividad) y ejecutar **A** con el guard **antes** del ledger. Es dinero: ODD + verificación
  independiente.

#### [ ] P2-4 · Telegram exception alerts

- **Fuente:** `2026-09-05-telegram-exception-alerts.md`; **sin código**; requiere aprobación backend.
- **Problema:** las excepciones no manejadas quedan solo en logs; nadie se entera en producción.
- **Propuestas:** A. sink asíncrono desde `ErrorHandlerMiddleware` (fire-and-forget, rate-limited);
  B. health-check externo que lea logs; C. no hacerlo.
- **Recomendación:** **A**, con token en configuración, límite de mensajes por minuto y sin PII.
  Nunca bloquear la respuesta al cliente por Telegram.

#### [ ] P2-5 · Desacoplar la pantalla de desbloqueo a `/unlock-data`

- **Fuente:** `2026-09-06-auth-session-redirect-invariant-e2e-gaps.md` §6.
- **Problema:** una sesión válida con ciphertext ilegible aterriza en `/login?unlock=1`
  (`loaders.ts:44`). **No viola el contrato**: `docs/contracts/authenticated-session-redirect.md`
  documenta ese camino como **excepción legítima** del cifrado at-rest. El plan propone separar
  "¿está autenticado?" de "¿puede leer los datos?" con una ruta propia y un `guestOnlyLoader` que
  ya no mire `needsUnlock`.
- **Propuestas:** A. implementar la ruta dedicada; B. mantener la excepción actual y no tocar los
  loaders; C. mejora intermedia: mantener `/login?unlock=1` pero con copy/UI de desbloqueo en vez
  de formulario de login.
- **Recomendación:** **B** mientras no haya fricción real reportada; si se decide tocar loaders,
  **C** primero (UX, sin mover guards) y **A** como cambio propio con E2E nuevos. Cualquier cambio
  en `authLoader`/`guestOnlyLoader`/`needsUnlock` exige re-leer el contrato y aprobación explícita.

#### [ ] P2-7 · Popup de re-autenticación al cambiar de plan

- **Fuente:** `2026-09-10-store-plan-change-reauth-popup-plan.md`.
- **Problema:** la premisa es obsoleta (`updateStore` → `changeStorePlan`) y el popup nunca se
  implementó. El refresco real de permisos ya existe (`soft-refresh-session.ts`).
- **Propuestas:** A. borrar el plan; B. replantearlo como confirmación de impacto (qué módulos se
  pierden) sin re-auth; C. implementarlo como estaba.
- **Recomendación:** **A** o **B**; **C no**. Si se quiere UX, el valor está en mostrar el delta de
  módulos, no en pedir la contraseña otra vez.

---

### P3 — Housekeeping / documentación

- [ ] **P3-1 · `endpoints-e2e-coverage.md` está obsoleto (2026-07-29).** Dice `ProductsController`
  0 % cuando hay E2E del recurso. Propuesta: regenerar el inventario contra los specs actuales o
  retirarlo y dejar que el runner sea la fuente. **Recomendación: regenerar** (sirve para decidir
  P1-1).
- [ ] **P3-2 · Deriva de la documentación de rate limit** (`2026-09-17-rate-limit-quota-doc-drift-plan.md`).
  `frontend-react/e2e/README.md:195,256,262-266` y el comentario de
  `RateLimitPolicies.cs:20-24` no coinciden con el código. **Recomendación:** corregir el README y
  el comentario en una sola unidad (sin cambio de comportamiento).
- [ ] **P3-3 · Triage de `docs/superpowers/`** (`2026-08-12-legacy-superpowers-artifacts-triage.md`).
  5 archivos siguen ahí y ninguna opción está marcada. **Recomendación:** mover los 2 con destino
  inequívoco y dejar los 3 restantes con una nota de por qué se quedan.
- [ ] **P3-4 · Retirar documentos obsoletos.** `2026-08-04-frontend-work-queue.md` (premisas
  muertas), `2026-08-04-offline-roster-billing-fields-frontend.md` (contrato v2 viejo; el código
  ya usa v3), `2026-09-03-offline-roster-jwt-online-operations.md` (Option A superseded por el
  interceptor de bearer). **Recomendación:** borrar con `git rm` (recuperables con `git log`).
- [ ] **P3-5 · Manual: `srcset`/AVIF opcional.** `2026-10-27-manual-image-optimization.md` ya
  entregó −51 % en imágenes. **Recomendación:** no hacerlo hasta que haya una queja real de peso;
  el PDF ya se genera aparte.
- [ ] **P3-6 · Smoke checklist offline-auth (manual, 9 pasos).** Nunca ejecutado por un humano;
  hoy cubierto en su mayoría por `login-offline`, `offline-access-panel` y `roster-recovery`.
  **Recomendación:** cerrarlo citando los specs que lo cubren y dejar solo los pasos que de verdad
  no se pueden automatizar (si queda alguno).

---

## 2. Cerrado en esta auditoría — no reabrir

| Tema | Evidencia verificada (2026-11-03) |
| --- | --- |
| Regla "una sola moneda por venta" | **Retirada** por decisión del owner el 2026-10-13: `currency-guard.ts` solo conserva `productCurrency`; `sale.tsx`, `egress.tsx` y `wholesale.tsx` ya no levantan el guard. El "hallazgo de APP" al final de `odd/tasks/e2e-birth-plan-superior.md:98-104` está **resuelto**; esa sección debe corregirse. |
| Refresco de permisos tras cambiar de plan | Implementado en `soft-refresh-session.ts` (un `GET /me` explícito, best-effort) y usado por `store-list.tsx:187` y `my-stores.tsx`; E2E actualizado el 2026-09-16. El plan `2026-09-15-...` dice "implementación NO iniciada": **el documento está mal**. |
| Filas E1-6/E1-7/E2-5 de la matriz E2E | Existen `Me_inactive_storeuser_not_in_roles`, `Me_superuser_sees_full_module_list` y `Roster_warehouse_wholesale_multistores_in_paid_roster` en `AuthMePlanModulesGapTests.cs` / `ExportOfflineRosterPlanGapTests.cs`. La ficha G1-G4 sin marcar está desactualizada. |
| Optimización de imágenes del manual | Entregada y medida (−51,3 % en imágenes servidas; PDF 9,06 MB). |
| SEO de la landing (iteraciones 1-4) | JSON-LD, H1, OG 1200×630, `offers` en runtime, constantes de schema y tests; veredicto RDD aprobado. |
| Módulo WebCatalog (18) y MultiMonedas (15) | Entregados, con E2E y scripts del VPS (script 26 incluye las columnas `Currency`). |
| Contrato de redirección de sesión | `docs/contracts/authenticated-session-redirect.md` documenta `/login?unlock=1` como excepción legítima; por eso P2-5 es decisión de UX, no un bug de invariante. |

## 3. Planes con estado desactualizado o superseded

| Documento | Estado real (verificado) | Acción |
| --- | --- | --- |
| `2026-09-15-store-plan-change-permission-refresh-plan.md` | Implementado | Marcar como implementado; conservar §6.2 como origen de P1-2 |
| `2026-09-08-e2e-plan-gated-modules-auth-roster.md` | Filas faltantes ya existen | Cerrar la matriz |
| `2026-09-24-revisar-e2e-expectativa-contra-bd.md` | Local resuelto; VPS pendiente | Solo P1-7 |
| `2026-09-17-multimonedas-module-plan.md` | **EN IMPLEMENTACIÓN** en el encabezado; el módulo está entregado y la regla de monedas retirada | Actualizar encabezado y §7 |
| `2026-09-05-store-payment-zero-override-plan.md` | Sin código | P2-2 |
| `2026-09-10-store-plan-change-reauth-popup-plan.md` | Premisa obsoleta | P2-7 |
| `2026-09-03-offline-roster-jwt-online-operations.md` | Superseded (Option 2 implementada) | Borrar (P3-4) |
| `2026-08-04-offline-roster-billing-fields-frontend.md` | v3 en código; doc describe v2 | Borrar (P3-4) |
| `2026-08-04-frontend-work-queue.md` | Snapshot obsoleto; su único pendiente vivo es P2-1 | Borrar (P3-4) |

## 4. Trackers vivos (no borrar; actualizar periódicamente)

- `docs/plans/2026-08-02-pending-manual-verification.md` — pasos bloqueados por humano.
- `docs/plans/2026-09-11-preexisting-e2e-failures.md` — **RESUELTO 2026-09-14**; conservar como bitácora.
- `docs/plans/endpoints-e2e-coverage.md` — inventario **obsoleto** (P3-1).

## 5. Registros de diseño (histórico, no borrar)

- `docs/plans/2026-07-25-at-rest-encryption-local-data-design.md` — diseño implementado.
- `docs/plans/2026-07-27-pwa-offline-shell-design.md` — diseño implementado; ligado al cambio activo `pwa-offline-shell`.
- `docs/plans/2026-08-02-getme-failure-as-200-backend.md` — **RESUELTO**; se retiene como registro histórico.
- `docs/plans/sesion-de-caja-apertura-cierre-pos.md` — investigación de referencia para P2-1.
- `docs/plans/imagenes-manual-referencia-pos.md` — referencia de las capturas del manual.

## 6. Cómo se clasificó

| Estado | Significado |
| --- | --- |
| IMPLEMENTED | Todos los entregables están en el código con evidencia → cerrado o eliminado. |
| PARTIAL | Parte implementada, parte pendiente → queda, con lo pendiente arriba. |
| NOT_IMPLEMENTED | Sin entregables en el código → pendiente. |
| DESIGN_ONLY | Doc de diseño sin checklist; se indica si el diseño existe en código. |
| SUPERSEDED | Otro plan/cambio cubre lo mismo → §3. |
| LIVING_TRACKER | Doc de seguimiento continuo, no entregable → §4. |

---

## 7. Descartado por decisión del owner (2026-11-03)

**Decisión:** el catálogo web se queda **como está**. No se proponen cambios de comportamiento,
validación, contratos ni limpieza sobre el catálogo web, sus endpoints públicos, la plantilla del
catálogo ni sus imágenes.

Descartado en esta auditoría:

- **P0-4 — topes del pedido público (8.1/8.2).** No se añaden límites de cantidad por línea ni de
  líneas por carrito.
- **Unidades 8-9 del `api-endpoint-review`.** PII del teléfono en query string y logs, código de
  pedido no criptográfico, `200` en un create, allowlist de `templateId` y `400` vs `404`: fuera.
- **P2-6 — limpieza de imágenes huérfanas del catálogo web.** La vista, el contador y la purga no se
  implementan.

**Motivo:** pedido explícito del owner (2026-11-03): «todo lo del catálogo web se mantiene como
está y punto».

**Cómo se reabre:** solo con un incidente real observado en esa superficie, y con evidencia del
incidente. "La auditoría lo decía" no es motivo suficiente.

