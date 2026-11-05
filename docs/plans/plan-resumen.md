# Plan resumen — estado de `docs/plans` y trabajo pendiente

> **Índice único y evolutivo.** Contiene SOLO trabajo pendiente.
>
> **Regla de cierre (owner, 2026-11-03):** cuando un elemento se completa, **se elimina de este
> documento**. No se marca `[x]`, no se deja una nota de "hecho" ni una tabla de cerrados. Si hace
> falta recuperar su historia, está en `git log` / `git show <commit>:docs/plans/plan-resumen.md`.
>
> **Última auditoría:** 2026-11-03 · Rama: `dev` · 34 documentos en `docs/plans`
> (10 agregados después de la auditoría del 2026-09-20, que estaban sin indexar).
> **Método:** verificación plan-por-plan contra el código real (archivo:línea o
> commit). Sin asumir: cada clasificación tiene prueba.
>
> **Formato:** cada pendiente lleva **Problema**, **Propuestas** y **Recomendación**. La prioridad
> es el impacto real verificado en código, no lo que diga un documento viejo.

## Cómo usar este documento

- **Pendiente** = trabajo real por hacer, ordenado de P0 (mayor) a P3 (menor).
- Al cerrar un ítem: **bórralo** de aquí. No lo marques, no lo comentes, no lo muevas a otra tabla.
- Al crear un plan nuevo en `docs/plans/`, agrégalo a la sección que corresponda.
- **`docs/plans` no es el backlog completo.** El trabajo de ejecución vive en
  `odd/tasks/`; aquí quedan las decisiones de diseño, los pendientes y el índice.
- Un plan marcado como "no iniciado" puede estar implementado: varios documentos no se
  actualizaron después de su entrega (ver §2).

---

## 1. Trabajo pendiente (por prioridad)

### P1 — Features pendientes acordadas (desbloqueadas)

#### [ ] P1-1 · Resto de `api-endpoint-review` en pedidos y repartidores (unidades 6-7)

- **Fuente:** `2026-10-11-api-endpoint-review-catalogo-pedidos.md`. Unidades 6 y 7 cerradas el
  2026-11-04 (`5d6e0d90`, `3d607ddc`, `fac049c7`; RDD aprobado por unidad). Lo del catálogo web
  público y la plantilla (unidades 8-9) queda **descartado** por decisión del owner (§6).
- **Problema que queda:**
  - **6.7 · PII sin máscara** en el listado de pedidos (`CustomerName` + `CustomerPhone`, 100 por
    página). **Bloqueado por decisión del owner:** enmascarar rompe la operación (el dueño y el
    repartidor usan el teléfono para llamar al cliente). Hay que decidir entre dejar la PII visible
    para el personal autorizado, enmascararla, o auditar los accesos.
  - **7.8 · resto (LOW)** — `POST /delivery-drivers` sigue en 200 y no hay `GET /{id}`. Pasar a 201
    exige cambiar `DeliveryDriverCreateE2ETests`, que lo fija; el owner ya autorizó tocarlo, así que
    queda pendiente de ejecutar.
  - **X4 · OpenAPI incompleto**: casi ninguna acción declara 400/401/403/404/409 que sí devuelve.
    Aprobado por el owner, pendiente de ejecutar (sin asumir: verificar cada acción antes de
    declararla).
- **Cerrado sin trabajo de código:** **X1** ya estaba implementado en cada endpoint; se reforzó con
  verificación del contenido real y el reparto del límite del proxy (`642ceaf6`, `7933c0f5`).
  **X3** ya estaba implementado (mapeo `23505` → 409 en `ErrorHandlerMiddleware`); solo se alineó el
  mensaje visible al inglés (`f41be3b3`). **6.7** queda como riesgo aceptado por el owner.


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

#### [ ] P1-5 · Restos de PWA (logs de diagnóstico) — DIFERIDO al próximo cambio del service worker

> **Decisión del owner (2026-11-03):** no se hace como trabajo aparte. Cualquier cambio en
> `service-worker.ts` cambia su huella y **fuerza la actualización de todos los clientes**, así que
> este trabajo se ejecuta **junto con la próxima modificación real del service worker**. El punto
> del gzip queda **descartado** (ver abajo).

- **Fuente:** `2026-07-27-pwa-offline-shell-frontend-plan.md` Task 6/8; verificado en código el
  2026-11-03.
- **Problema (verificado):** quedan **4** `console.info` `[SW]` en `app/service-worker.ts:38,44,62,155`
  y **8** logs `[PWA]` en `service-worker-registration.ts:29,38,43,45,54,57,64` (el de `:71` es un
  `console.error` legítimo y se conserva). Ensucian la consola de producción; no filtran datos ni
  rompen nada.
- **Descartado — gzip/MIME:** `nginx.conf:35-43` ya comprime los bundles
  (`application/javascript`), y `application/manifest+json` está por debajo de
  `gzip_min_length 1024`, así que añadirlo no comprimiría nada. Sin acción.
- **Propuestas (para cuando se toque el SW):** A. borrar los `console.info` y dejar solo el
  `console.error`; B. dejarlos detrás de un flag de depuración.
- **Recomendación:** **B** en ese momento (útiles en soporte, invisibles por defecto), dentro del
  mismo cambio que ya fuerza la actualización. No justifica una actualización por sí solo.

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

#### [ ] P3-7 · Las pantallas con datos vivos no se suscriben al aviso de cambios

- **Fuente:** `2026-10-06-subscription-refresh-for-views.md`; verificado en código el 2026-11-03.
- **Problema (verificado):** `data-revision-store` sube un contador cuando algo cambia y los
  servicios lo leen para invalidar su copia en memoria, pero **despertar la pantalla** es aparte:
  solo `sale.tsx`, `wholesale.tsx` y `cash-closing.tsx` usan `useDataRevisionStore`. Siete
  pantallas con datos vivos **no** lo usan (`products`, `entries`, `egress`, `warehouses`,
  `channel-rates`, `credits`, `today-orders`). El carrito (`cart-shell.tsx`) vive en la barra de
  navegación, así que **una venta puede completarse desde cualquier pantalla**: el pedido y el
  inventario quedan bien guardados, pero la pantalla abierta sigue mostrando los números viejos
  hasta cambiar de ruta o recargar. Es el mismo fallo que se corrigió en venta.
- **No verificado aún:** qué campo exacto de cada una de esas siete pantallas cambia con una venta.
  Se cierra pantalla por pantalla al implementar.
- **Propuestas:**
  - **A. Hook único** (`useLiveValue`) que se suscribe internamente al contador y devuelve el valor
    recalculado; la pantalla no declara dependencias.
  - **B. Suscripción explícita por pantalla** (lo de hoy, repetido): barato pero repite el olvido.
  - **C. Test de guardia** que falle si una pantalla con datos vivos no está suscrita.
- **Recomendación:** **A + C**, empezando por las que muestran cantidades que una venta cambia
  (`today-orders`, `warehouses`, `entries`/`egress`, `credits`) y siguiendo con el resto. El
  agrupamiento por ráfaga de `invalidation-universal-write-through` ya está hecho: es la
  precondición de rendimiento, no un extra. No es P0: no corrompe datos, solo muestra números
  viejos.

---

## 2. Planes con estado desactualizado o superseded

| Documento | Estado real (verificado) | Acción |
| --- | --- | --- |
| `2026-09-05-store-payment-zero-override-plan.md` | Sin código | P2-2 |
| `2026-09-10-store-plan-change-reauth-popup-plan.md` | Premisa obsoleta | P2-7 |
| `2026-09-03-offline-roster-jwt-online-operations.md` | Superseded (Option 2 implementada) | Borrar (P3-4) |
| `2026-08-04-offline-roster-billing-fields-frontend.md` | v3 en código; doc describe v2 | Borrar (P3-4) |
| `2026-08-04-frontend-work-queue.md` | Snapshot obsoleto; su único pendiente vivo es P2-1 | Borrar (P3-4) |

## 3. Trackers vivos (no borrar; actualizar periódicamente)

- `docs/plans/2026-08-02-pending-manual-verification.md` — pasos bloqueados por humano.
- `docs/plans/endpoints-e2e-coverage.md` — inventario **obsoleto** (P3-1).

## 4. Registros de diseño (histórico, no borrar)

- `docs/plans/2026-07-25-at-rest-encryption-local-data-design.md` — diseño implementado.
- `docs/plans/2026-07-27-pwa-offline-shell-design.md` — diseño implementado; ligado al cambio activo `pwa-offline-shell`.
- `docs/plans/sesion-de-caja-apertura-cierre-pos.md` — investigación de referencia para P2-1.
- `docs/plans/imagenes-manual-referencia-pos.md` — referencia de las capturas del manual.

## 5. Cómo se clasificó

| Estado | Significado |
| --- | --- |
| IMPLEMENTED | Todos los entregables están en el código con evidencia → eliminado del índice. |
| PARTIAL | Parte implementada, parte pendiente → queda, con lo pendiente arriba. |
| NOT_IMPLEMENTED | Sin entregables en el código → pendiente. |
| DESIGN_ONLY | Doc de diseño sin checklist; se indica si el diseño existe en código. |
| SUPERSEDED | Otro plan/cambio cubre lo mismo → §2. |
| LIVING_TRACKER | Doc de seguimiento continuo, no entregable → §3. |

---

## 6. Descartado por decisión del owner (2026-11-03)

**Decisión:** el catálogo web se queda **como está**. No se proponen cambios de comportamiento,
validación, contratos ni limpieza sobre el catálogo web, sus endpoints públicos, la plantilla del
catálogo ni sus imágenes.

**Motivo:** pedido explícito del owner (2026-11-03): «todo lo del catálogo web se mantiene como
está y punto».

**Cómo se reabre:** solo con un incidente real observado en esa superficie, y con evidencia del
incidente. "La auditoría lo decía" no es motivo suficiente.
