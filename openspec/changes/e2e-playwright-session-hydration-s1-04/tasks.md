# Tareas — e2e-playwright-session-hydration-s1-04

## Review Workload Forecast

| Campo | Valor |
|---|---|
| Líneas estimadas | ~450-550 (casi todas aditivas) |
| Riesgo de presupuesto de 400 líneas | High |
| PRs encadenados recomendados | No (entrega es commits-only, sin PR) |
| Split sugerido | 8 commits de work-unit, en la rama única `feat/e2e-playwright-session-hydration-s1-04` |
| Delivery strategy | commits-only |
| Chain strategy | pending (no aplica: no hay PR) |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: High

**Nota sobre el guard de 400 líneas**: la entrega es commits-only sin PR (config de fase), así que no hay revisión de PR que fraccionar. El guard igual se documenta: cada WU de abajo es un commit autónomo, verificable en aislamiento, que cumple el rol que tendría una PR encadenada si la entrega cambiara de estrategia.

### Unidades de trabajo sugeridas

| WU | Objetivo | Ficheros | Riesgo |
|---|---|---|---|
| 1 | `expectMeRequestCount()` (TDD real) + T1 + T2 | `login-network-observer.ts`, `login.spec.ts`, `auth-storage.ts` (nuevo) | Compuerta: `login-rate-limit.spec.ts` verde |
| 2 | T3, T5, T10, T11 — resiliencia | `login.spec.ts` | R1 (offline+reload), R2 (Swal 500) |
| 3 | T4 — único veredicto real (401) | `login.spec.ts` | Ninguno |
| 4 | T6 — límite de expiración con `page.clock` | `login.spec.ts` | R3 (relojes) |
| 5 | T7 + T8 — qué borra `logout()` y cuándo no redirige | `login.spec.ts` | R4 (G2 declarada) |
| 6 | T9 — 401 fuera de `/me` | `login.spec.ts` | Ninguno |
| 7 | Documentación del invariante + 3 correcciones de README de Etapa 1 | `docs/testing/README.md`, `docs/testing/e2e-stage-1/README.md` | Va después de 1-6 verdes |
| 8 | Citas de línea de `S1-04.md` | `docs/testing/e2e-stage-1/S1-04.md` | Independiente, puede ir primero |

## Fase 0: Rama

- [x] 0.1 Crear `feat/e2e-playwright-session-hydration-s1-04` desde la rama actual `feat/e2e-playwright-login-s1-02` (no desde `main`).

## Fase 1: Observer + T1 + T2 (WU-1)

- [x] 1.1 RED: en `frontend-react/e2e/support/login-network-observer.ts`, agregar `expectMeRequestCount(expected: number)` a la interfaz `LoginNetworkObserver` (aditivo, junto a `expectNoLoginAttempt:87`). Escribir T1 en `login.spec.ts` invocándolo antes de implementarlo — falla por ausencia del método. ✅ VERIFICADO EN VIVO (2026-08-07, backend real, 31 passed). El rojo de ausencia del método NO se observó como paso separado: el método se implementó en el mismo work unit, sin corrida intermedia posible por falta de backend en la sesión de apply.
- [x] 1.2 GREEN: implementar `expectMeRequestCount` derivando de `events` (`:194`, filtro `kind === 'me' && phase === 'request'`), sin tocar el listener existente. Implementado. ✅ T1 verde en la corrida en vivo del 2026-08-07.
- [x] 1.3 Crear `frontend-react/e2e/support/auth-storage.ts` (D6) con helpers de mutación: leer `AUTH_MODEL`, escribir `AUTH_MODEL.authToken`, mutar la clave `token` por separado (D3: NO son la misma clave — `token` la lee `api-client.ts:37` vía `storage-keys.ts:4`, distinta de `AUTH_MODEL.authToken` en `:5`), y escribir un valor crudo/malformado.
- [x] 1.4 T2: mutar SOLO `AUTH_MODEL.authToken` (vía helper de 1.3) → `page.reload()` → `expectMeRequestCount(1)` → usuario sigue autenticado (rama best-effort, `auth-store.ts:140-149`).
- [ ] 1.5 Verificación de mordida (no TDD literal, ver nota Strict TDD): invertir T1/T2 en el árbol de trabajo, confirmar rojo, revertir sin commitear. ⚠️ NO EJECUTADO. El backend ya está disponible y la suite corre verde, pero el ciclo invertir-ver-rojo-revertir NO se hizo: el bloque es `describe.serial`, así que al primer rojo Playwright saltea el resto y las 6 exigen 6 corridas separadas, a 4 logins reales cada una. Ver "Estado de la mordida" al final.
- [x] 1.6 Compuerta: correr `login.spec.ts` y `login-rate-limit.spec.ts` completos, verdes sin diff propio. ✅ CUMPLIDA — Corrida en vivo 2026-08-07 contra backend real: **31 passed**. Ningún test preexistente fue modificado por este cambio: `git diff` sobre `login.spec.ts` da 263 líneas agregadas y **0 borradas**, y `login-rate-limit.spec.ts` no aparece en el diff. (Los selectores `#email` → `#login` de un commit POSTERIOR y fuera de alcance sí tocaron esos ficheros, con autorización explícita del usuario — ver `docs/contracts/login-is-not-email.md`.)
- [x] 1.7 Commit work-unit 1 (`e33115b`).

## Fase 2: Resiliencia — T3, T5, T10, T11 (WU-2)

- [x] 2.1 T3: mismatch de `AUTH_MODEL.authToken` (helper 1.3) + `page.route()` abortando `GET /v1/auth/me` → reload → `AUTH_MODEL` intacto, sin rebote a `/login`.
- [x] 2.2 T5: mismo mismatch + `page.route()` respondiendo 500 a `/me` → afirmar el diálogo `showBlockingError` visible (D5), cerrarlo, luego afirmar sesión intacta.
- [x] 2.3 T10 (D4): cargar online → `context.setOffline(true)` → navegación interna (click, no `reload()`) a ruta protegida → sesión best-effort retenida, `AUTH_MODEL` presente, sin `/login`.
- [x] 2.4 T11: escribir `{"foo":1}` crudo en la clave de `AUTH_MODEL` (helper 1.3) → reload **desde `/login`** (ver nota de diseño en el propio test: reload desde una ruta protegida dispararía `authLoader`'s `denyAccess()`, que TAMBIÉN llama `logout()` y removería `AUTH_MODEL` — un código distinto al que REQ-11 pinea) → `AUTH_MODEL` sigue presente en `localStorage`, `logout()` no corrió (afirmado SOLO esto).
- [ ] 2.5 Verificación de mordida de los 4 pins (invertir, ver rojo, revertir). ⚠️ NO EJECUTADO. El backend ya está disponible y la suite corre verde, pero el ciclo invertir-ver-rojo-revertir NO se hizo: el bloque es `describe.serial`, así que al primer rojo Playwright saltea el resto y las 6 exigen 6 corridas separadas, a 4 logins reales cada una. Ver "Estado de la mordida" al final.
- [x] 2.6 Commit work-unit 2 (`2ab4d64`).

## Fase 3: T4 — 401 real (WU-3)

- [x] 3.1 Corromper AMBAS claves — `AUTH_MODEL.authToken` (JWT inválido, `expiresIn` futuro) Y `token` (D3: mismatch fuerza `/me`, header inválido fuerza 401 real del backend) → reload → backend responde 401 → `logout()` corre → aterriza en `/login`.
- [ ] 3.2 Verificación de mordida: invertir, confirmar rojo, revertir. ⚠️ NO EJECUTADO. El backend ya está disponible y la suite corre verde, pero el ciclo invertir-ver-rojo-revertir NO se hizo: el bloque es `describe.serial`, así que al primer rojo Playwright saltea el resto y las 6 exigen 6 corridas separadas, a 4 logins reales cada una. Ver "Estado de la mordida" al final.
- [x] 3.3 Commit work-unit 3 (`da06945`).

## Fase 4: T6 — límite inclusivo (WU-4)

- [x] 4.1 Instalar `page.clock` congelado ANTES de la primera navegación (R3, alcance mínimo del congelamiento). Escribir `AUTH_MODEL.expiresIn` igual al instante congelado exacto → reload → sesión tratada como expirada, `logout()` dispara.
- [ ] 4.2 Verificación de mordida: invertir, confirmar rojo, revertir. ⚠️ NO EJECUTADO. El backend ya está disponible y la suite corre verde, pero el ciclo invertir-ver-rojo-revertir NO se hizo: el bloque es `describe.serial`, así que al primer rojo Playwright saltea el resto y las 6 exigen 6 corridas separadas, a 4 logins reales cada una. Ver "Estado de la mordida" al final.
- [x] 4.3 Commit work-unit 4 (`1a52267`).

## Fase 5: T7 + T8 — logout() (WU-5)

- [x] 5.1 T7: sesión autenticada con las 3 claves presentes → clic real en "Salir" → `AUTH_MODEL` ausente, `token` y `currentUser` siguen presentes (obsoletos a propósito, no se limpian).
- [x] 5.2 T8 (G2 declarada por diseño): escribir `AUTH_MODEL` vencido estando en `/login` → `goto('/login')` → `initialize()` dispara `logout()` → afirmar CERO navegaciones adicionales vía `framenavigated` (R4, no URL). Comentario en el test citando G2: la mitad de la guarda por `pathname` no queda pineada en navegador (`authRedirect` es `undefined` en evaluación de módulo, `root.tsx:89-91` vs `auth-store.ts:388`); cobertura discriminante vive en `auth-store.test.ts:297-315`.
- [ ] 5.3 Verificación de mordida de ambos. ⚠️ NO EJECUTADO. El backend ya está disponible y la suite corre verde, pero el ciclo invertir-ver-rojo-revertir NO se hizo: el bloque es `describe.serial`, así que al primer rojo Playwright saltea el resto y las 6 exigen 6 corridas separadas, a 4 logins reales cada una. Ver "Estado de la mordida" al final.
- [x] 5.4 Commit work-unit 5 (`d1748c2`).

## Fase 6: T9 — 401 fuera de /me (WU-6)

- [x] 6.1 Restaurar `owner-admin` → navegar a `/profile/edit` → `page.route()` interceptando `PUT /v1/users/{id}` para responder 401 → afirmar sesión intacta, `AUTH_MODEL` presente, ruta protegida sigue accesible.
- [ ] 6.2 Verificación de mordida: invertir, confirmar rojo, revertir. ⚠️ NO EJECUTADO. El backend ya está disponible y la suite corre verde, pero el ciclo invertir-ver-rojo-revertir NO se hizo: el bloque es `describe.serial`, así que al primer rojo Playwright saltea el resto y las 6 exigen 6 corridas separadas, a 4 logins reales cada una. Ver "Estado de la mordida" al final.
- [x] 6.3 Commit work-unit 6 (`40c347b`).

## Fase 7: Documentación del invariante (WU-7, después de 1-6 verdes)

- [x] 7.1 `docs/testing/README.md`: agregar sección hermana con la lista cerrada de 6 disparadores de logout y la superficie que no cierra sesión (tabla de proposal.md §4), sin pisar la frase existente sobre offline puro (`:20`).
- [x] 7.2 `docs/testing/e2e-stage-1/README.md`: actualizar fila S1-04 (`:33`, de PENDIENTE al estado real — PARCIAL con brecha G1/404 nombrada, resolviendo P3), conteo de tests (`:73`, ahora 31), confirmar presupuesto de logins 4/5 (`:75`, sin cambios — T1-T11 no acuñan personas nuevas). Nota agregada: la corrida en vivo contra backend real sigue pendiente (no hecha en esta sesión de `sdd-apply`).
- [x] 7.3 Commit work-unit 7 (`4f1b5d9`).

## Fase 8: Citas de línea de S1-04.md (WU-8, independiente)

- [x] 8.1 Aplicar las 13 correcciones de la tabla de proposal.md §4 Bloque E a `docs/testing/e2e-stage-1/S1-04.md`.
- [x] 8.2 Verificado por lectura directa: `:44` (comentario `auth-store.ts:29-33`) — correcto, sin cambios. `:64` (`auth-store.test.ts:321,338,360`) — **estaba desfasado**: esas 3 líneas son del describe `updateUser` (STORE-1..4), sin relación con el test citado; el test real ("does NOT call authHttpService.getMe when a valid cached session exists") vive en `:440`. Corregido a `auth-store.test.ts:440`. `auth-store.session-rejected.test.ts:68-124` — verificado correcto, sin cambios.
- [x] 8.3 Commit work-unit 8 (`6aeb042`).

## Estado de la mordida (lo único que sigue abierto)

`sdd-apply` corrió SIN backend .NET, así que escribió el código sin poder ejecutar
Playwright ni una vez. Esa deuda se pagó **parcialmente** el 2026-08-07.

### Verificado en vivo — backend real, 2026-08-07

- **`pnpm test:e2e` → 31 passed.** T1-T11 pasan contra el backend .NET real, y la
  compuerta 1.6 quedó cumplida: `login.spec.ts` +263/-0 y `login-rate-limit.spec.ts`
  intacto en el diff de este cambio.
- `npx turbo run test --force` — 179 archivos / 2377 tests vitest, verde, typecheck
  limpio. Ningún fichero de producción fue tocado por S1-04, así que esto es una
  confirmación de no-regresión.

### NO verificado — las 6 verificaciones de mordida (1.5, 2.5, 3.2, 4.2, 5.3, 6.2)

El ciclo invertir-la-aserción / ver-el-rojo / revertir **no se ejecutó para ninguna**.
Bajo Strict TDD esto no se puede maquillar: un test que nunca se vio fallar no demostró
que muerde.

Por qué no es una corrida y ya: el bloque es `describe.serial`, así que al primer rojo
Playwright saltea los tests siguientes. Las 6 exigen 6 corridas separadas, y cada corrida
gasta los 4 logins reales que el diseño puso como techo — 24 logins contra el backend.

Contrapeso, que es evidencia real pero **no sustituye** la mordida caso por caso: durante
el desarrollo estos tests se vieron rojos por causas genuinas, no artificiales.

| Test | Rojo genuino observado |
|---|---|
| T10 | Timeout de 120s: cortaba la red antes de que el módulo de ruta llegara (dev server de Vite, service worker bloqueado) |
| T8 | Falló 3 corridas seguidas por una navegación de más en el arranque con `logout()` |
| `smoke.spec.ts`, `register.spec.ts` | Rojos al renombrar el selector `#email` → `#login`, probando que afirman el form real |

Eso cubre T8 y T10 de forma incidental. **T1-T7, T9 y T11 nunca se vieron fallar.**

### Riesgo abierto: T8 es un flake latente

T8 falló tres corridas seguidas reportando `["/login","/login"]` contra `["/login"]`, y en
la cuarta pasó **sin que se arreglara su causa**. Lo único que cambió entre medio fueron
selectores de otros ficheros y un contador de documentos agregado al propio T8. Leer el
código no explica la navegación extra: el redirect de `logout()` está guardado en `/login`
(`auth-store.ts:366-369`), `guestOnlyLoader` devuelve `null` para un no autenticado
(`loaders.ts:42-58`), y ambas corridas dejan el store en el mismo estado. El test quedó
instrumentado para que el próximo rojo diga si la navegación es same-document (la empujó
el router) o una recarga dura.

## Reconciliaciones aplicadas (no re-abrir)

- T4 usa DOS mutaciones (`AUTH_MODEL.authToken` + `token`), corrigiendo al proposal §4 por evidencia de diseño D3 (`api-client.ts:37` lee `token`, no `AUTH_MODEL.authToken`).
- T8/REQ-8 hereda P2 resuelta por diseño D7: se afirma lo observable (cero navegaciones) y se declara G2 por escrito en el propio test, sin forzar la mitad de `/` que es inalcanzable.
- La capability nueva `e2e-session-hydration` (no delta sobre `e2e-login-ui`) queda como decisión del spec, no se revierte acá.
