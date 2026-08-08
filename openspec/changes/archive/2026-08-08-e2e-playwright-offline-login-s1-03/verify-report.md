# Verification Report — `e2e-playwright-offline-login-s1-03`

**Change**: [S1-03] Login offline en dispositivo aprovisionado — cobertura Playwright + refactor de núcleo compartido de observers
**Modo de persistencia**: hybrid (engram + este fichero)
**Rama verificada**: `feat/e2e-playwright-offline-login-s1-03`, 6 commits sobre `main`, working tree limpio
**Commits**: `d5e5d99` (WU1 refactor) → `e57edea` (WU2 fixtures) → `6fed989` (WU3 spec) → `c1b80c2` (WU4 docs) → `bf01105` (planning artifacts) → `97d6761` (H-14)

## Veredicto final: **PASS WITH WARNINGS**

CRITICAL: 0 · WARNING: 1 · SUGGESTION: 1 · Open authorization item (no defecto): 1

---

## 1. Frontera de autorización — VERIFICADO independientemente

`git diff --stat main..HEAD -- 'frontend-react/e2e/*.spec.ts' frontend-react/e2e/support/test.ts frontend-react/e2e/support/session.ts` da:

```
frontend-react/e2e/login-offline.spec.ts | 370 +++++++++++++++++++++++++++++++
1 file changed, 370 insertions(+)
```

`test.ts` y `session.ts`: diff vacío. `git diff --name-status main..HEAD -- 'frontend-react/e2e/*.spec.ts'` → `A  frontend-react/e2e/login-offline.spec.ts` (única entrada, **A**dded, no **M**odified). Ningún `register.spec.ts`, `register-rate-limit.spec.ts`, `login.spec.ts`, `login-rate-limit.spec.ts` tiene una sola línea tocada.

Los dos módulos autorizados a editar (`network-observer.ts`, `login-network-observer.ts`) más `auth-storage.ts` (comentario) y 3 docs son los únicos archivos pre-existentes modificados. Todo lo demás es archivo nuevo. **La frontera se sostuvo.**

## 2. Refactor byte-a-byte — VERIFICADO por lectura de diff + código vigente

- **`network-observer-core.ts`** (nuevo, 215 líneas): extrae cola de outcomes (`createOutcomeQueue`), `createDeferred`, `matchesPathSuffix`, `wrongBackendMessage(subject, url)`, `backendUnreachableMessage`, `apiBaseMissingMessage`, `expectNoAttemptMessage`, `resolveCapture(outcome, {subject, rateLimitError})`. **Cero umbrales, cero clases de error** dentro del núcleo — confirmado por lectura completa del archivo.
- **Typo `Parná` preservado byte a byte**: el texto de `wrongBackendMessage` en `network-observer-core.ts:116-126` es idéntico carácter por carácter al bloque eliminado de `network-observer.ts` en el diff (verificado comparando ambos strings completos).
- **`RegisterRateLimitError`** sigue declarada y **construida** en `network-observer.ts`, y **`LoginRateLimitError`** sigue declarada y construida en `login-network-observer.ts` con su propio texto de umbral. El núcleo recibe `rateLimitError: () => Error` como factory — nunca construye ni importa ninguna de las dos clases. `network-observer-core.ts` no tiene ni una constante de umbral.
- **Call sites `instanceof` intactos**: `register-rate-limit.spec.ts:54` y `login-rate-limit.spec.ts:53`, ambos sin modificar (confirmado por el diff vacío de specs).
- **API pública exportada** (`installRegisterNetworkObserver`, `RegisterNetworkObserver`, `RegisterAttempt`, `RegisterResponseCapture`, `RegisterRateLimitError`; `installLoginNetworkObserver`, `LoginNetworkObserver` con sus 7 métodos, `LoginRateLimitError`) — nombres y firmas verificados presentes en el código post-refactor, sin renombres.
- **`auth-storage.ts:14`** corregido: la cita ahora apunta a "Debt PAID" en `login-network-observer.ts:15-19`, verificado que ese comentario existe ahí.

**Riesgo declarado en `design.md`** ("el refactor cambia un texto sin querer") **no se materializó** — verificado, no asumido.

## 3. Mapeo aserción → test — VERIFICADO, aritmética reconciliada

`docs/testing/e2e-stage-1/S1-03.md` tiene **12 checkboxes** en su sección "Aserciones — Playwright (UI)" (líneas 33-44, recontado por lectura directa). `login-offline.spec.ts` tiene **11 tests** (T1-T11). La reconciliación exacta:

| Ítem S1-03.md | Test | Verificado |
|---|---|---|
| #1 cero HTTP, #2 online=offline, #10 localStorage, #11a sin productos | T1 | sí — T1 hace las 4 aserciones |
| #11b con productos | T2 | sí |
| #3 login ausente ≡ password incorrecta | T3 | sí — 2 sub-escenarios en un test |
| #4 `isActive:false` | T4 | sí |
| #9 orden verifier→password→isActive | T5 | sí |
| #5 verifier malformado | T6 | sí |
| #6 `DekUnwrapError` | T7 | sí |
| #7a vencido→online | T8 | sí |
| #7b vencido+offline | T9 | sí |
| #8 recarga→unlock | T10 | sí |
| #12 offline aterriza igual | T11 | sí |

Ningún ítem quedó sin cubrir. Los ítems #7 y #11 se dividen en dos tests cada uno (online/offline, con/sin productos); T1 absorbe 4 ítems. Aritmética: 12 ítems, 11 tests, sin brecha.

**Precondición pineada antes de cada aserción** — VERIFICADO en código, no solo en diseño: `plantRoster()` de `roster-fixture.ts` (líneas 289-329) escribe a `localStorage`, **relee la clave**, y lanza error explícito si `bundleId`/`expiresAt` no coinciden con lo recién escrito, ANTES de devolver control al test (líneas 298-326). Es exactamente la disciplina que pide el `CLAUDE.md` raíz ("afirmá la precondición antes de culpar al comportamiento"). Cada uno de los 11 tests llama `plantRoster()` antes de `fill`/`submit`.

## 4. Gates ejecutados en la sesión de verify — evidencia real

```
$ cd frontend-react && pnpm exec playwright test e2e/login-offline.spec.ts
Running 11 tests using 6 workers
...
11 passed (2.2s)
```

Confirmado sin proceso `dotnet` activo.

```
$ cd frontend-react && npx turbo run test --force
@store-mgmt/web-store-pos:test:  Test Files  179 passed (179)
@store-mgmt/web-store-pos:test:       Tests  2392 passed (2392)
@store-mgmt/web-store-pos:test: Type Errors  no errors
```

Ambos corridos en esta sesión, no citados de memoria.

## 5. Gates DIFERIDOS — NO corridos, requieren backend real

- ⚠️ NO VERIFICADO — `pnpm test:e2e` (esperado 42 = 31+11, aritmética no observada). Diferido al usuario.
- ⚠️ NO VERIFICADO — `pnpm test:e2e:rate-limit` (esperado 2 verdes, sin cambio de umbral). Diferido al usuario.
- ⚠️ NO VERIFICADO — línea base WU0 (31+2 verdes ANTES del refactor). Documentada al 2026-08-07, **no re-corrida** en esta rama ni en esta sesión. Es una limitación declarada de esta verificación, no un pass.

## 6. Citas `archivo:línea` — VERIFICADAS por lectura directa del código vigente

Verificadas una por una contra el código actual, no contra `design.md`:

- `login.tsx:109-110` (rama), `:116` (home path offline), `:123` (return offline), `:128` (chequeo de conectividad), `:140` (home path online), `:37-52` (bloque `offlineErrorMessageId`), `:63` (`isUnlockRequired`), `:205-209` (banner unlock) — **todas correctas**.
- `auth-store.ts:194-201` (`setUser`) — correcta.
- `roster-store.ts:148` (`if (!bundle || bundle.expiresAt <= now) return null;`) — correcta.
- `loaders.ts:29-32` (`unlockGate`) — correcta.
- `unlock-gate.ts:10-22` (`needsUnlock`) — correcta.
- `user-home.ts:19-26` (`resolveUserHomePath`, sin referencia a conectividad) — correcta.
- `offline-auth-service.ts:102` (`OfflineUserNotFoundError`), `:105-112` (verifier malformado), `:114-121` (orden password→isActive), `:117` (`OfflineInvalidPasswordError`), `:119-121` (`OfflineUserInactiveError`) — **todas correctas**.
- `es.ts:82` INVALID_CREDENTIALS, `:83` ACCOUNT_INACTIVE, `:84` SERVER_ERROR, `:85` TOO_MANY_ATTEMPTS, `:87` OFFLINE_LOGIN, `:90` UNLOCK_REQUIRED, `:91-92` UNLOCK_FAILED — **las 7 constantes verificadas exactas**.
- `roster-store.ts:19` (`ROSTER_KEY = 'lizoft.offline-roster'`) === `ROSTER_STORAGE_KEY` de `roster-fixture.ts` — idéntico.
- `offline-roster-dek-kat.json:2` (`"password": "Password123"`) === `KAT_PASSWORD` — idéntico.
- `package.json:26` (`"node": ">=22"`) — respalda el uso de `webcrypto` de `node:crypto`.

**Ninguna cita quedó desfasada.** REQ-14 de `e2e-offline-login-ui` se cumple.

## 7. Hallazgo H-14 y su tratamiento — VERIFICADO en código

`login.tsx` llama `armTracking()` en **ambas** ramas de éxito: offline (`:114`) y online (`:140`), importada en `:11`. `store-usage-tracker.ts` y `use-store-usage-tracker.ts` **no tienen ninguna referencia** a `isOnline`, `ConnectivityService` ni `navigator.onLine`. Es decir: un login offline real SÍ arma un `POST /v1/usages/store-daily-usage` de fondo en el siguiente cambio de ruta — la afirmación "cero HTTP" no es literal.

La solución de `apply` (`expectOnlyKnownTelemetry()`, local a `login-offline.spec.ts:71-81`) tolera **únicamente** ese endpoint conocido, y solo en los 4 tests con login exitoso (T1, T2, T10, T11); los 6 tests que nunca completan un login (T3-T7, T9) siguen usando `anyRequest.expectNoRequests()` sin tolerancia. `any-request-observer.ts` se mantuvo genérico — la tolerancia vive en el spec, no en el observer, exactamente como documenta `design.md` D2. Declarado en: comentario del spec, `docs/testing/e2e-stage-1/S1-03.md`, la sección H-14 de `docs/testing/e2e-stage-1/README.md`, y `frontend-react/e2e/README.md`.

### WARNING — el delta spec `e2e-offline-login-ui/spec.md` no reflejaba el hallazgo H-14

REQ-1 decía literalmente: *"Un submit exitoso en un dispositivo aprovisionado MUST NOT emitir ninguna petición HTTP, ni siquiera a `/v1/auth/login` o `/v1/auth/me`"*, y su escenario: *"THEN no se observa ninguna petición HTTP durante todo el flujo"*. Eso dejó de ser cierto tal cual estaba escrito: T1, que cubre exactamente REQ-1, tolera una petición HTTP conocida. El carve-out estaba honestamente documentado en 4 lugares distintos, pero **el propio artefacto de spec nunca se corrigió** — quien leyera solo `spec.md` creería que la garantía es absoluta.

No es CRITICAL porque: (a) el hallazgo se declaró abiertamente en cuanto se descubrió, no se escondió; (b) el observer genérico se mantuvo sin debilitar — la tolerancia vive en el nivel correcto; (c) los tests que sí pueden ser estrictos lo son.

**Estado**: CERRADO tras este reporte. REQ-1 fue reescrito para hablar de peticiones de **autenticación**, con la excepción de telemetría declarada explícitamente por endpoint, más un escenario nuevo que fija que un submit fallido MUST seguir exigiendo cero peticiones sin excepción. REQ-2 pasó de "sin petición HTTP" a "sin ninguna petición de autenticación".

## 8. Notas — no son defectos

- **SUGGESTION**: T11 se implementó con un "warm-up" (un submit online antes del submit offline real) que no está en la secuencia D4 original del design — descubierto durante `apply` como gotcha del dev server de Vite: cortar la red antes de la primera navegación a una ruta nunca visitada cuelga el fetch de un chunk ES. Documentado inline en `login-offline.spec.ts:341-350` como "Verified gotcha (not in design.md)". No rompe REQ-12 ni ningún otro requirement — mismo patrón ya verde en T2. Vale reflejarlo en `design.md` §D4 si se retoma el change; no bloquea nada.
- **Open authorization item, NO defecto**: `login-rate-limit.spec.ts:6` cita `es.ts:83` para `AUTH.TOO_MANY_ATTEMPTS`; la línea real es `es.ts:85` (verificado). Es un `*.spec.ts` existente — **no tocado**, tal como exige la frontera de autorización. Requiere autorización explícita del usuario si se quiere corregir.

## 9. Lo que queda sin verificar — y quién debe correrlo

| Ítem | Estado | Responsable |
|---|---|---|
| `pnpm test:e2e` (42 esperados) | ⚠️ NO VERIFICADO — requiere backend real | Usuario |
| `pnpm test:e2e:rate-limit` (2 esperados) | ⚠️ NO VERIFICADO — requiere backend real | Usuario |
| Línea base WU0 (31+2 verdes antes del refactor, en ESTA rama) | ⚠️ NO VERIFICADO — solo existe la corrida documentada del 2026-08-07 | Usuario |
| REQ-1/REQ-2 de `e2e-network-observer-core` ("verdes antes y después del refactor") | ⚠️ NO VERIFICADO por corrida contra backend real | Usuario |

## Checklist de verificación

El checklist final de `tasks.md` ya distingue honestamente VERIFICADO vs ⚠️ NO VERIFICADO por ítem, y coincide con lo que este verify pudo confirmar independientemente. No hay contradicción entre lo que `apply` declaró y lo que `verify` pudo reproducir.
