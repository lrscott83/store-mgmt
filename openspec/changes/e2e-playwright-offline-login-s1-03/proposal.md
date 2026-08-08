# Proposal: [S1-03] Playwright — login offline en dispositivo aprovisionado

## Intent

S1-03 es **la última CRÍTICA del Bloque A sin cobertura frontend**: `PENDIENTE` en Playwright y `N/A` en .NET (`docs/testing/e2e-stage-1/README.md:32`, cero HTTP). La cobertura que existe hoy es `vitest`/`jsdom` — sin navegador, sin red real (`S1-03.md:58`) —, así que la aserción central de la US, **cero peticiones HTTP durante el submit offline exitoso** (`S1-03.md:33`), hoy no la afirma nadie a nivel de red. Este cambio escribe la capa Playwright que falta y, de paso, paga una deuda declarada en el propio código de soporte.

## El insight estructural que se arrastra de la exploración

**El interruptor de modo es el ARCHIVO de roster, nunca la conectividad.** Verificado por lectura: `login.tsx:109-110` importa `roster-store` y ramifica sobre `isRosterProvisioned()`; la rama offline **retorna en `:123`**, antes del `ConnectivityService.isOnline()` de `:128`. `isRosterProvisioned` = `getRoster(now) !== null` (`roster-store.ts:170-172`) y `getRoster` es `getRawRoster()` + una comparación de expiry (`:146-150`).

Consecuencia de diseño: **11 de las 12 aserciones de `S1-03.md` corren con el navegador ONLINE**. La única que necesita cortar la red de verdad es *"offline + bundle vencido ⇒ banner `AUTH.OFFLINE_LOGIN`"* (`S1-03.md:39`), y para esa ya hay patrón probado en este repo: `login.spec.ts:68-84` (REQ-5) hace `goto()` online → `fill()` → `setOffline(true)` → `submit()`, sin navegar tras el corte, que es exactamente lo que esquiva el gotcha de módulos de Vite.

## Presupuesto de rate limit: **cero logins reales**

`authenticateOffline` no hace red (`offline-auth-service.ts:91-146`), y el roster se siembra por escritura directa a `localStorage`, precedente ya aceptado en `e2e/support/session.ts:132-143` (`applySnapshot`) y en `login.offline.e2e.test.tsx:53-64`. La única aserción que debe demostrar que **se tomó la rama online** (bundle vencido) usa `page.route()` para interceptar antes de que la petición salga: no gasta cupo del `LoginPolicy` de 5/min (**H-12**, `README.md:265-278`), que `login.spec.ts` ya consume 4/5 (`README.md:90`). Todo el spec nuevo cuesta **0 logins**.

## Scope

### En alcance

| # | Entregable | Archivo | Estado |
|---|---|---|---|
| 1 | Spec Playwright de S1-03 (las 12 aserciones) | `frontend-react/e2e/login-offline.spec.ts` | **NUEVO** |
| 2 | Fixture de roster (bundle válido, verifier PBKDF2, expiry configurable, wrap-DEK opcional del KAT) | `frontend-react/e2e/support/roster-fixture.ts` | **NUEVO** |
| 3 | Observer genérico "cero peticiones a CUALQUIER endpoint" | `frontend-react/e2e/support/any-request-observer.ts` (nombre a fijar en design) | **NUEVO** |
| 4 | Núcleo compartido de observers (regla de tres) | `frontend-react/e2e/support/network-observer-core.ts` | **NUEVO** |
| 5 | Reescritura sobre el núcleo, **API idéntica** | `frontend-react/e2e/support/network-observer.ts` | **MODIFICADO — helper de soporte, no test** |
| 6 | Ídem | `frontend-react/e2e/support/login-network-observer.ts` | **MODIFICADO — helper de soporte, no test** |
| 7 | Documentar el spec nuevo y el núcleo | `frontend-react/e2e/README.md`, `docs/testing/e2e-stage-1/S1-03.md` + `README.md:32` (estado a CUBIERTO) | **MODIFICADO — docs** |

**Ningún archivo `*.spec.ts` existente se modifica.** Los ítems 5 y 6 son los dos únicos módulos que el usuario autorizó tocar (decisión 5) y son helpers, no tests.

### Fuera de alcance

| Excluido | Razón |
|---|---|
| Round-trip real por `provision.tsx` (`.smcabundle`, `deserializeRoster`, ZIP cifrado) | Es el alcance de **S3-01**, hoy `PENDIENTE`; acoplarlo aquí junta dos US y consume login real |
| `plan-frontend.md` F-2..F-5 | Ninguno intersecta S1-03 (F-2 es post-registro; F-3/F-4/F-5 son `logout()` / `login.spec.ts`) |
| `e2e/support/session.ts` y `createPersonaCache` | El propio archivo declara (`:40-45`) que ninguna persona importa roster jamás; tocarlo convertiría ese cambio en S1-03 por la puerta de atrás |
| Capa .NET | `N/A` por la US: cero HTTP. **No se corre `dotnet` en este cambio** |
| Tag `@rate-limit` | El spec nuevo no gasta cupo; corre en la suite por defecto (`package.json:11`, `--grep-invert @rate-limit`) |

## El refactor del núcleo compartido — restricción dura

`login-network-observer.ts:129-134` lleva escrita la deuda: *"extract a shared core when a THIRD observer appears (rule of three), gated on `register.spec.ts` staying green."* El observer del ítem 3 es ese tercero, así que la deuda se paga acá.

**Restricción no negociable del diseño**: el refactor es **behavior-preserving y API-preserving**. Todo nombre exportado, firma y comportamiento observable de `network-observer.ts` y `login-network-observer.ts` queda **compatible byte-a-byte**, de modo que **ningún spec existente cambia una sola línea**.

Al núcleo se mueve solo lo genuinamente idéntico: la cola `Outcome`/`pushOutcome` de entrega-a-un-solo-consumidor (`network-observer.ts:119-126` ≡ `login-network-observer.ts:166-173`), el `createDeferred`, el matcher de sufijo de pathname, el guard de backend equivocado y los diagnósticos 404/`requestfailed`. `wrongBackendMessage` se parametriza por un solo sustantivo — los dos textos son idénticos salvo *"de registro"* vs *"de login"* (`network-observer.ts:87-97` vs `login-network-observer.ts:136-145`) —, así que el mensaje resultante sigue siendo el mismo string. Las dos clases de error y sus umbrales distintos (`RegisterRateLimitError` 10/10min vs `LoginRateLimitError` 5/1min) **se quedan cada una en su módulo**: la trampa ya documentada en `login-network-observer.ts:22-26` prohíbe unificarlas.

### Verificación de la frontera de autorización (call sites leídos)

| Call site | ¿Es test? | Qué consume | ¿Necesita cambiar? |
|---|---|---|---|
| `e2e/support/test.ts:3-9,58-74` | No — helper | `installRegisterNetworkObserver`, `installLoginNetworkObserver` + ambos tipos; los expone como fixtures `auto` | **No**, si se conservan nombres y firmas |
| `e2e/register-rate-limit.spec.ts:4,54` | **Sí** | `RegisterRateLimitError` importada de `./support/network-observer` | **No** — la clase sigue exportada de ese mismo módulo |
| `e2e/login-rate-limit.spec.ts:4,53` | **Sí** | `LoginRateLimitError` importada de `./support/login-network-observer` | **No** — ídem |
| `e2e/register.spec.ts:36,49,82,99,118,133,145,163,174,177` | **Sí** | Solo la fixture `registerNetwork` (`attempts()`, `expectNoAttempt()`, `waitForResponse()`) — no importa el módulo | **No** |
| `e2e/login.spec.ts:55,65,70,83,116-160,174-181,242-260,309-317,323-335,343-353,365-373,450-465` | **Sí** | Solo la fixture `loginNetwork` (7 métodos) — no importa el módulo | **No** |

Además: **ningún spec afirma sobre el texto** de los mensajes del observer (`rg 'La petición\|quota exhausted\|wrongBackend' e2e/*.spec.ts` → cero coincidencias). El único acoplamiento spec↔módulo son las dos clases de error, y quedan donde están.

**Veredicto: la extracción es alcanzable sin tocar un solo test. No hay pregunta bloqueante.**

## Capabilities

### New Capabilities

- `e2e-offline-login-ui`: las 12 aserciones de S1-03 en Playwright — cero HTTP, online-igual-va-offline, mensajes indistinguibles, `isActive:false`, verifier malformado, `DekUnwrapError`, bundle vencido, `?unlock=1`, orden verifier→password→isActive, hidratación de `localStorage`, destino post-login.
- `e2e-network-observer-core`: núcleo compartido de observers de red (cola de outcomes, deferreds, guard de backend, diagnósticos) con la garantía de compatibilidad byte-a-byte de las dos superficies públicas ya existentes.

### Modified Capabilities

- Ninguna. `e2e-register-ui` y `e2e-login-ui` no cambian ningún requisito: el refactor es interno y su superficie queda idéntica.

## Approach

Approach 1 de la exploración. Por test: `goto('/login')` (bundle SPA cargado) → `page.evaluate()` escribe el bundle bajo `ROSTER_KEY = 'lizoft.offline-roster'` (`roster-store.ts:19`), saltándose `importRoster()` igual que hace `session.ts` → llenar → enviar → afirmar. El verifier se computa con PBKDF2-HMAC-SHA256 210k (`offline-crypto.ts:81-88`) vía Web Crypto; los escenarios de DEK reusan el vector ya comprometido y verificado contra backend real `docs/contracts/offline-roster-dek-kat.json` (password `Password123`), sin autorear crypto nueva.

## Risks

| Riesgo | Prob. | Mitigación |
|---|---|---|
| El refactor rompe `register.spec.ts` / `login.spec.ts` por un cambio sutil de comportamiento | Media | Gate del propio comentario de la deuda: `pnpm test:e2e` (31 tests) verde **antes y después**, y `pnpm test:e2e:rate-limit` (2 tests) verde, como condición de cierre. Commit del refactor separado del commit del spec nuevo, para rollback quirúrgico |
| "Cae a la rama online" con `page.route()` es un negativo declarado: nunca se observa un 401/429 real de esa rama | Alta (por diseño) | Se documenta como decisión de presupuesto, no como hueco escondido, en el propio spec y en `S1-03.md` |
| Los comentarios cruzados con `archivo:línea` (`auth-storage.ts:14`, `backend-url.ts:20`, `login-network-observer.ts:235`, `playwright.config.ts:94`) quedan desfasados tras mover código | Alta | Se actualizan en el mismo commit; todos son archivos de soporte/config, ninguno es test |
| El verifier calculado a mano no coincide con lo que `verifyOfflinePassword` espera | Baja | Se valida contra el KAT ya comprometido antes de escribir aserciones de negocio |

## Rollback Plan

Los ítems 1-4 son archivos nuevos: `git rm` y desaparecen sin residuo. Los ítems 5-6 van en **un commit propio, aislado** (`refactor(e2e): extract shared network-observer core`) que se revierte con `git revert` sin tocar el spec nuevo. Ninguna migración, ningún estado persistido, ningún cambio de producción — este cambio no toca `app/` ni `backend/`.

## Dependencies

- Ninguna sobre S3-01. Para correr la suite completa hace falta el backend levantado (los otros specs lo exigen), pero **el spec nuevo no lo necesita**: cero HTTP.

## Success Criteria

- [ ] Las 12 aserciones de `S1-03.md:33-44` implementadas en `e2e/login-offline.spec.ts`, cada una con su `archivo:línea` de anclaje.
- [ ] `pnpm test:e2e` verde, con los 31 tests preexistentes intactos y sin una sola línea modificada en ningún `*.spec.ts` existente.
- [ ] `pnpm test:e2e:rate-limit` (2 tests) verde tras el refactor.
- [ ] Cero logins reales consumidos por el spec nuevo (verificable: no usa `signedInPage` ni deja salir ningún `POST /v1/auth/login`).
- [ ] `docs/testing/e2e-stage-1/README.md:32` pasa S1-03 de `PENDIENTE` a `CUBIERTO` con la fecha de la corrida real.

## Postura de autorización

- **Aditivo**: 4 archivos nuevos (ítems 1-4).
- **Helpers de soporte compartidos** (autorizado explícitamente por el usuario, decisión 5): ítems 5-6, con la restricción de compatibilidad byte-a-byte de arriba.
- **Docs**: ítem 7.
- **Tests existentes modificados: NINGUNO.** Verificado leyendo los 5 call sites de la tabla. Si durante `apply` apareciera un solo punto donde un `*.spec.ts` tuviera que cambiar, **se detiene y se pregunta** — no se debilita ni se "arregla" ningún test.

## Preguntas abiertas (no bloqueantes)

1. Nombre del observer genérico: se propone `any-request-observer.ts`; el design puede fijar otro.
2. **Discrepancia documental detectada** (`docs/` vs código, se reporta en vez de heredarse): `S1-03.md` cita `login.tsx:105-120`, `:119`, `:124` y `:35-37/:38-40/:44-46/:47-48`; el código real tiene la rama en `:110`, el `return` en `:123`, la comprobación de conectividad en `:128` y el mapeo de errores en `:37-52` (y `OfflineVerifierError → AUTH.SERVER_ERROR` cae por el `return` final de `:52`, no por una rama propia). El spec nuevo debe citar las líneas reales; corregir `S1-03.md` es un ítem menor a decidir en design.
