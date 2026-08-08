# Design: [S1-03] Playwright — login offline en dispositivo aprovisionado

## Enfoque técnico

Approach 1 del explore, con **tres módulos nuevos de soporte y un refactor API-preserving** de los dos observers existentes. Ningún `*.spec.ts` existente cambia una línea (frontera re-verificada abajo, leyendo los 5 call sites).

El hallazgo que ordena todo el diseño y que **corrige al explore**: el spec entero cuesta **cero peticiones HTTP, incluso en la recarga**. `getUserByToken` corta en `auth-store.ts:102` cuando no hay `AUTH_MODEL`, y con caché válida retorna en `auth-store.ts:127-139` **sin llamar al backend** (comentario OFFLINE-FIRST, `:133-137`). Como `setUser` (`auth-store.ts:194-201`) escribe `currentUser.authToken === AUTH_MODEL.authToken` (el `OFFLINE_SESSION_TOKEN` de `offline-session.ts:6`), la recarga del escenario de unlock cae en esa rama de caché: cero `/me`. Por eso el observer genérico se instala **una vez al principio del test** y se afirma al final, sin ventanas.

## Decisiones de arquitectura

### D1 — Núcleo compartido: `e2e/support/network-observer-core.ts`

**Elección**: extraer solo lo *idéntico byte a byte*, con el núcleo **genérico sobre el tipo de captura** y ciego a umbrales y clases de error.

| Se mueve al núcleo | Evidencia de identidad |
|---|---|
| Cola de outcomes de un solo consumidor (`pushOutcome` + `waiters`) y el `shift() ?? await` | `network-observer.ts:119-126,192-198` ≡ `login-network-observer.ts:166-173,268-274` |
| `createDeferred<T>` | `login-network-observer.ts:47-53` (único consumidor hoy; genérico por construcción) |
| Matcher de sufijo de pathname con `try/catch` | `network-observer.ts:54-64` ≡ `login-network-observer.ts:102-118` |
| `wrongBackendMessage(subject, url)` — `subject` = `'registro'` \| `'login'` | `network-observer.ts:87-97` vs `login-network-observer.ts:136-145`: idénticos salvo ese sustantivo. Incluye el typo **`Parná`**, que se preserva tal cual (lo cita `e2e/README.md:99`) |
| Mensaje de backend caído | `network-observer.ts:151-155` ≡ `login-network-observer.ts:211-216` (texto idéntico) |
| Diagnóstico 404 de base de API | `network-observer.ts:222-227` ≡ `login-network-observer.ts:294-299` (idéntico) |
| Lectura inmediata del body en `response` | `network-observer.ts:158-174` ≡ `login-network-observer.ts:238-246` |
| Mensaje de `expectNo*Attempt` (parametrizado por sufijo + `subject`) | `network-observer.ts:183-189` ≡ `login-network-observer.ts:342-348` |
| `resolveCapture(outcome, { subject, rateLimitError })` — orden `failed → 429 → origen equivocado → 404` | mismo orden en `network-observer.ts:199-229` y `login-network-observer.ts:275-299` |

**Se queda en cada módulo**: los sufijos de path; `RegisterAttempt.postData`; los `ObservedEvent`/`expectLoginThenMe`/`expectMeRequestCount`/`expectNoProductApiCall`; las interfaces `RegisterResponseCapture`/`LoginResponseCapture` **declaradas verbatim** (3 campos, cero riesgo de identidad de tipo); y **las dos clases de error con sus umbrales**.

`resolveCapture` recibe `rateLimitError: () => Error` y cada módulo pasa `() => new RegisterRateLimitError('...10 registros/10min...')` / `() => new LoginRateLimitError('...5 intentos/1min...')`. Esto es **load-bearing, no estético**: `login-rate-limit.spec.ts:53` y `register-rate-limit.spec.ts:54` hacen `err instanceof <Clase>`, así que la identidad de clase y el módulo que la exporta no se pueden mover. Y `login-network-observer.ts:22-26` prohíbe explícitamente juntar los números — el núcleo **no contiene ni un umbral**.

**Rechazado**: mover las clases al núcleo y re-exportarlas (`export { X } from './core'` preservaría la identidad, pero pondría los dos juegos de constantes lado a lado: exactamente la trampa documentada).

### D2 — Observer genérico: `e2e/support/any-request-observer.ts`

**Elección**: `installAnyRequestObserver(page)` con `requests()` y `expectNoRequests(context?)`. **No** reusa la cola del núcleo (no espera respuestas; solo afirma un negativo).

**Discriminador** — "cualquier endpoint" no puede ser "cualquier request": el dev server de Vite sirve los módulos ES por HTTP (`playwright.config.ts:79` `baseURL: http://localhost:3333`; `login.spec.ts:400-407`). Se cuenta una request si y solo si:

1. `new URL(url).origin !== 'http://localhost:3333'` (origen ajeno — el backend vive en `http://localhost:5019/api`, `backend-url.ts:24`), **o**
2. mismo origen **pero** el pathname matchea `/(^|\/)(api|v1)\//` — la request mal dirigida al dev server, el caso que `network-observer.ts:56-60` filtra por path a propósito.

Se excluyen `data:`/`blob:` (`origin === 'null'`). El service worker está bloqueado (`playwright.config.ts:84`), así que no hay ruido de caché. Los WebSockets de HMR no emiten `request` (⚠️ NO VERIFICADO en este repo: es semántica de la API de Playwright, `page.on('websocket')` es un evento aparte). Buscado en `apps/web-store-pos/app`: **cero** URLs externas (fuentes/CDN), así que la regla 1 no tiene fuente conocida de falsos positivos.

`resourceType()` y `method()` se **reportan** en el mensaje de fallo, nunca se usan como filtro: filtrar por `xhr|fetch` dejaría pasar una navegación `document` al backend, que es justo lo que este observer existe para cazar.

### D3 — Fixture de roster: `e2e/support/roster-fixture.ts`

```ts
export const ROSTER_STORAGE_KEY = 'lizoft.offline-roster'; // roster-store.ts:19
export const KAT_PASSWORD = 'Password123';                 // offline-roster-dek-kat.json:2

export interface RosterUserSpec {
  login: string;
  password?: string;                       // default KAT_PASSWORD
  isActive?: boolean;                      // default true
  verifier?: 'valid' | 'malformed' | null; // default 'valid'
  wrap?: 'none' | 'kat' | 'tampered';      // default 'none'
  isOwnerAdmin?: boolean;                  // default true
}
export interface RosterSpec {
  users: RosterUserSpec[];
  expiresInMs?: number;   // default +86_400_000; negativo ⇒ vencido
  formatVersion?: 1 | 2;  // default 1; 'kat'/'tampered' fuerzan 2
  storeId?: string;       // default el storeId del KAT
}
export async function buildRosterBundle(spec: RosterSpec): Promise<OfflineRosterBundle>;
export async function plantRoster(page: Page, spec: RosterSpec): Promise<OfflineRosterBundle>;
```

- **Verifier en Node, no en el browser.** `webcrypto.subtle` de `node:crypto` (Node ≥22, `package.json:26`) reproduce los 2 pasos de `offline-crypto.ts:81-88` (SHA-256 → PBKDF2-HMAC-SHA256, `PBKDF2_KEY_BYTES=32`), con base64 vía `Buffer`. Razones: se **memoiza** por `password|salt|iterations` a nivel de módulo, así el worker paga **una** derivación de 210k y no doce dentro del presupuesto de timeout de cada test; no necesita una página cargada; y es la MISMA Web Crypto API. Se mantiene `iterations: 210_000` (el default de `offline-crypto.ts:14`) porque `verifyOfflinePassword` lee `verifier.iterations` del bundle — bajarlo sería válido pero perdería fidelidad con lo que emite el backend.
- **Tripwire del propio fixture**: `sha256Base64('Password123')` debe dar `AIxwOS46v70PpHu8LtlqqZvUnhWXJ/y6Dy5qvrOp1gE=` (`offline-roster-dek-kat.json:3`, `provenance: dotnet-backend`). Pinea el paso 1 contra un valor verificado contra el backend real; el paso 2 lo pinea el propio test de éxito (T1) y el desenvuelto de DEK (T10).
- **Wrap de DEK**: `wrap: 'kat'` copia `wrapSalt`/`wrapIv`/`wrappedDek` del KAT y fija `storeId` al del KAT — obligatorio, porque `DEK_WRAP_ITERATIONS` está **hardcodeada** en `dek-unwrap.ts:25` y no viaja en el bundle, así que solo el vector comprometido desenvuelve. `wrap: 'tampered'` invierte un byte de `wrappedDek` ⇒ `DekUnwrapError` **después** de que el verifier pasó (`offline-auth-service.ts:127-132`).
- **Lectura del KAT**: `readFileSync(resolve(__dirname, '../../../docs/contracts/offline-roster-dek-kat.json'))`, mismo precedente que `playwright.config.ts:18-32`. Si `__dirname` no estuviera disponible en un módulo de soporte (⚠️ NO VERIFICADO; `playwright.config.ts:34-35` solo lo afirma para la config), el fallback es relativo a `process.cwd()` (= `frontend-react/`).
- `plantRoster` escribe con `page.evaluate` y **afirma la precondición**: relee la clave, compara `bundleId` y valida que `expiresAt > Date.now()` coincida con lo que el escenario pretende. Nunca pasa por `importRoster` (no hace falta el `REPLAY_KEY`: solo lo lee `roster-store.ts:99`).

### D4 — Secuencia de siembra (el orden ES el diseño)

```
1. installAnyRequestObserver(page)   // antes de navegar: el documento es same-origin, no cuenta
2. loginPage.goto()                  // ONLINE: Vite sirve el bundle SPA y los módulos de ruta
3. plantRoster(page, spec)           // localStorage es origin-scoped: no hay origen antes del goto
4.   ↳ precondición releída          // un roster ausente toma la rama ONLINE en silencio
5. loginPage.fill(...)
6. context.setOffline(true)          // SOLO T9/T11 — y jamás una navegación después
7. loginPage.submit()                // handler client-side ya cargado
8. aserciones
```

Paso 3 después del 2: mismo motivo que `session.ts:135-141` (`goto('/login')` antes del `evaluate`). Paso 4 antes del 7: la trampa de `CLAUDE.md` ("afirmá la precondición antes de culpar al comportamiento"). Paso 6 al final y sin navegar después: patrón probado en `login.spec.ts:74-80` (REQ-5) y su fundamento en `login.spec.ts:396-407` (REQ-10) — `setOffline(true)` rompe la carga de módulos ES del dev server, `page.goBack()` conserva el registro de módulos y `goto()` lo tira. **La recarga de T10 corre ONLINE**, nunca combinada con un corte.

**Rechazado**: plantar con `page.addInitScript` — se re-ejecuta en cada navegación y re-plantaría el roster tras un logout/recarga, contaminando T8/T9/T10 (mismo motivo ya registrado en `session.ts:453-455` para `AUTH_MODEL`). **Rechazado**: fingir `navigator.onLine` en vez de cortar la red — solo simula conectividad, así que una petición real fugada pasaría inadvertida justo en la aserción que debe cazarla.

#### Addendum post-archive — el paso 0 que esta secuencia le faltaba

> Agregado el 2026-08-08, después de archivar, para cerrar la SUGGESTION del `verify-report.md` §8. No formaba parte del diseño original: se descubrió implementando T11 y hasta ahora solo vivía inline en `login-offline.spec.ts:341-350`.

La secuencia de arriba asume que el chunk de la ruta **destino** ya se pidió alguna vez en ese contexto de navegador. Cuando no es así, el paso 6 no falla: **cuelga el fetch para siempre**. Es una variante más fina del gotcha que fundamenta el paso 6 — `goBack()` vs `goto()` resuelve el caso de *volver* a una ruta ya cargada, pero no dice nada sobre *llegar por primera vez* a una con la red cortada, que es lo que T11 necesita (`/sales/products`).

Por eso T11 antepone un paso 0: un submit **con conexión** que aterriza en `/sales/products` —y por lo tanto carga su chunk—, después logout, y solo entonces la secuencia de arriba con el corte real. Notar que ese primer submit **no cuesta un login real**: con roster plantado toma la vía offline igual, por la razón estructural de todo este cambio (`login.tsx:109-110` retorna en `:123`, antes del chequeo de conectividad de `:128`). Es el mismo patrón de dos submits que T2 ya usaba por otro motivo.

**Regla para el próximo escenario que corte la red**: calentar la ruta **destino**, no solamente la actual.

### D5 — Probar la rama online sin gastar cupo (H-12)

Bundle **vencido** ⇒ `isRosterProvisioned()` falso (`roster-store.ts:148`) ⇒ el submit cae al `login()` online (`login.tsx:128,133-135`). Se intercepta con `page.route('**/v1/auth/login', route => route.fulfill({ status: 429, ... }))` — precedente de `route.fulfill`/`route.abort` en `login.spec.ts:351,369`. La petición nunca sale del browser: **0 de los 5/min del `LoginPolicy`**.

Dos pruebas independientes de que se tomó la rama online: (a) el handler se ejecutó exactamente una vez, y `anyRequest.requests()` tiene exactamente 1 entrada al endpoint de login; (b) el banner es `AUTH.TOO_MANY_ATTEMPTS` ("Demasiados intentos. Esperá un momento antes de volver a intentar.", `es.ts:85`), **inalcanzable desde la rama offline**: `offlineErrorMessageId` (`login.tsx:37-53`) solo produce 4 ids y ninguno es ese. Un 401 habría dado el MISMO texto que la password offline incorrecta y no discriminaría nada.

### D6 — Escenarios de DEK y unlock

El DEK vive en un `let` de módulo (`data-key-store.ts:15`) y se pierde en cualquier recarga. `needsUnlock` exige `getDek() === null` **y** roster crudo con `formatVersion >= 2` y `wrappedDek/wrapSalt/wrapIv` no vacíos para ESE login (`unlock-gate.ts:10-22`).

- **T7 (`DekUnwrapError`)**: `wrap: 'tampered'` + password correcta ⇒ banner `AUTH.UNLOCK_FAILED` (`es.ts:91-92`), no credenciales inválidas.
- **T10 (recarga ⇒ unlock)**: `wrap: 'kat'` + `KAT_PASSWORD` ⇒ login offline exitoso (DEK seteado, `offline-auth-service.ts:133`) → `page.reload()` **online** → DEK en null → `authLoader` → `unlockGate` → `redirect('/login?unlock=1')` (`loaders.ts:29-32`) → banner `AUTH.UNLOCK_REQUIRED` (`login.tsx:63,205-209`; `es.ts:90`). Se afirma la query string y el banner. Sigue costando 0 HTTP por la rama de caché de `auth-store.ts:127-139`, y `runEntityMigration` (`offline-auth-service.ts:139`) no toca red — sus imports son solo storage/crypto/roster (`entity-migration.ts:19-21`).

## Mapa aserción → test (`e2e/login-offline.spec.ts`)

| # | Aserción (`S1-03.md`) | Test | Corte de red |
|---|---|---|---|
| 1,2,10,11a | cero HTTP · online-igual-offline · `localStorage` hidratado · destino `/sales/products` | T1 | no |
| 11b | con productos ⇒ `/sales/new` (siembra con `store-seed.ts`, logout UI, 2º submit) | T2 | no |
| 3 | login ausente ≡ password incorrecta (mismo string) | T3 | no |
| 4 | `isActive:false` ⇒ `AUTH.ACCOUNT_INACTIVE` | T4 | no |
| 9 | inactivo + password incorrecta ⇒ credenciales inválidas (orden verifier→password→isActive) | T5 | no |
| 5 | verifier malformado ⇒ `AUTH.SERVER_ERROR` | T6 | no |
| 6 | `DekUnwrapError` ⇒ `AUTH.UNLOCK_FAILED` | T7 | no |
| 7a | vencido ⇒ rama online (D5) | T8 | no |
| 7b | vencido + offline ⇒ `AUTH.OFFLINE_LOGIN` | T9 | **sí** |
| 8 | recarga + roster v2 ⇒ `?unlock=1` + `AUTH.UNLOCK_REQUIRED` | T10 | no |
| 12 | sin conexión aterriza en la misma ruta | T11 | **sí** |

**Corrección al explore/propuesta**: son **dos** escenarios con corte real, no uno. La aserción 12 (`S1-03.md:44`) leída literalmente exige el corte; resolverla "por lectura de código" (`user-home.ts:19-26` no mira conectividad) no sería una aserción E2E. Usa el mismo patrón probado, así que el costo es un test barato.

## Cambios de archivos

| Archivo | Acción | Descripción |
|---|---|---|
| `e2e/support/network-observer-core.ts` | Crear | Núcleo D1: cola, deferred, matcher, 4 mensajes, `resolveCapture`. Cero umbrales, cero clases de error |
| `e2e/support/any-request-observer.ts` | Crear | Observer genérico D2 |
| `e2e/support/roster-fixture.ts` | Crear | Fixture D3 |
| `e2e/login-offline.spec.ts` | Crear | 11 tests / 12 aserciones. Importa `test`/`expect` de `./support/test` (`README.md:81`) |
| `e2e/support/network-observer.ts` | Modificar | Reescrito sobre el núcleo. **Superficie idéntica** (autorizado) |
| `e2e/support/login-network-observer.ts` | Modificar | Ídem; su comentario de deuda (`:129-134`) pasa a "deuda pagada" |
| `e2e/README.md`, `docs/testing/e2e-stage-1/S1-03.md`, `docs/testing/e2e-stage-1/README.md:32` | Modificar | Docs: spec nuevo, núcleo, `PENDIENTE → CUBIERTO` con fecha real |
| `e2e/support/test.ts` | **NO se toca** | Ver alternativas rechazadas |
| Cualquier `*.spec.ts` existente | **NO se toca** | Frontera de autorización |

### Frontera de autorización — re-verificada leyendo los archivos

| Call site | Consume | ¿Cambia? |
|---|---|---|
| `support/test.ts:3-9,58-74` | `installRegisterNetworkObserver`/`installLoginNetworkObserver` + ambos tipos, como fixtures `auto` | No — nombres y firmas intactos |
| `register-rate-limit.spec.ts:4,54` | `RegisterRateLimitError` + `instanceof` | No — clase en su módulo, construida ahí |
| `login-rate-limit.spec.ts:4,45,53` | `LoginRateLimitError` + `instanceof` + `waitForLoginResponse().status` | No — ídem |
| `register.spec.ts` (13 líneas) | solo la fixture `registerNetwork` | No |
| `login.spec.ts` (24 líneas) | solo la fixture `loginNetwork` | No |

`rg 'network-observer\|RateLimitError' e2e/*.spec.ts` ⇒ los únicos imports desde specs son las **dos clases de error**. Ningún spec afirma sobre el texto de los mensajes. **Veredicto: la extracción cabe debajo de los 5 call sites sin tocar un test. Sin pregunta bloqueante.**

## Unidades de trabajo y gate de seguridad

Los comandos corren desde `frontend-react/` y **los corre el usuario** (los 31 tests preexistentes exigen backend levantado; el diseño no los ejecuta). Orden obligatorio: `pnpm test:e2e` **antes** que el de rate-limit — al revés choca por cupo (`e2e/README.md:179-181`).

| WU | Commit | Gate |
|---|---|---|
| WU0 | — | `pnpm test:e2e` ⇒ 31 verdes (línea base). Esperar ≥1 min. `pnpm test:e2e:rate-limit` ⇒ 2 verdes |
| WU1 | `refactor(e2e): extract shared network-observer core` | Los MISMOS dos comandos, mismos conteos. Commit **aislado y revertible** con `git revert`, sin tocar nada del spec nuevo |
| WU2 | `test(e2e): add roster fixture and any-request observer` | Aditivo, sin consumidor: `pnpm test:e2e` sigue en 31 |
| WU3 | `test(e2e): cover S1-03 offline login in Playwright` | `pnpm exec playwright test e2e/login-offline.spec.ts` **sin backend** (cero HTTP) y luego `pnpm test:e2e` con los 31 + los nuevos |
| WU4 | `docs(testing): mark S1-03 as covered` | Fecha de la corrida real de WU3 |

## Riesgos

| Riesgo | Mitigación |
|---|---|
| **La capa e2e no está type-checkeada.** No existe ningún `tsconfig.json` que incluya `frontend-react/e2e/` (solo `apps/web-store-pos/tsconfig.json`, scopeado a ese dir) y Playwright transpila sin chequear tipos ⇒ un quiebre de tipos en la extracción **no lo caza ningún gate** | Por eso D1 deja `RegisterResponseCapture`/`LoginResponseCapture` declaradas verbatim y el núcleo genérico: no queda nada de tipo que romper. Agregar un tsconfig para `e2e/` es infra nueva → pregunta abierta, fuera de alcance |
| El refactor cambia un texto sin querer (incluido el typo `Parná`, citado en `e2e/README.md:99`) | Los 4 mensajes se mueven **sin reescribir**; `subject` es el único parámetro nuevo |
| `instanceof` de las clases de error se rompe si el núcleo las construye | El núcleo recibe `rateLimitError: () => Error`; las clases se instancian en su módulo |
| "Cae a la rama online" es un negativo declarado: nunca se observa un 401/429 real | Documentado como decisión de presupuesto en el spec y en `S1-03.md`, no escondido |
| Comentarios cruzados con `archivo:línea` quedan desfasados tras mover código | Se actualizan en el commit de WU1: `login-network-observer.ts:130,235`, `backend-url.ts:20`, `playwright.config.ts:94`, `auth-storage.ts:14`. Todos son soporte/config |
| El verifier calculado en Node no coincide con el del browser | Tripwire contra el `passwordPreHash` del KAT + T1 y T10 como verificación de punta a punta |

## Migración / rollout

Sin migración. WU2-WU4 son archivos nuevos y docs (`git rm` y desaparecen). WU1 se revierte con `git revert` sin tocar el spec nuevo. Este cambio no toca `app/` ni `backend/`.

## Alternativas rechazadas (además de las de D1-D4)

| Alternativa | Motivo del rechazo |
|---|---|
| Cablear el observer genérico como fixture `auto` en `support/test.ts` | Fuera de la frontera de autorización (solo los dos módulos de observer) y le colgaría un tercer listener a los 31 tests existentes. Se instala dentro del spec nuevo |
| Reusar la cola de outcomes del núcleo en el observer genérico | Solo afirma un negativo; traería caminos muertos |
| Computar el verifier in-browser con `page.evaluate` | No se memoiza entre tests, quema 210k iteraciones dentro del timeout de cada test |
| Importar `offline-crypto.ts` de la app en el fixture | La capa e2e nunca importa el source de la app: "the browser is the black box under test, the app's own source is not" (`login.spec.ts:14-17`) |
| Round-trip real por `provision.tsx` | Alcance de S3-01; ya rechazado en la propuesta |

## Preguntas abiertas (ninguna bloqueante)

- [x] Nombre del observer genérico: **`any-request-observer.ts`** (confirmado; nombra la afirmación y ordena junto a sus hermanos). Spec: **`e2e/login-offline.spec.ts`**. Fixture: **`e2e/support/roster-fixture.ts`**.
- [ ] ¿Agregar un `tsconfig.json` para `e2e/` (o un `pnpm typecheck:e2e`)? Es infra nueva, fuera de este cambio. Hoy la capa e2e no se type-checkea.
- [ ] **Discrepancias docs↔código (gana el código; se corrigen en WU4 solo donde está permitido)**:
  - `S1-03.md` cita `login.tsx:105-120`, `:119`, `:124`, `:35-37`, `:38-40`, `:44-46`, `:47-48`, `auth-store.ts:291`, `login.tsx:59,201-205`. Real: rama en `:110`, `return` en `:123`, conectividad en `:128`, mapeo de errores en `:37-52` (`SERVER_ERROR` cae por el `return` final de `:52`, sin rama propia), seam de hidratación en `auth-store.ts:194-201`, banner de unlock en `login.tsx:63,205-209`. También `login.tsx:112` vs `:140` son en realidad `:116` vs `:144`. `roster-store.ts:146-150,170-172`, `loaders.ts:29-32`, `unlock-gate.ts:10-22`, `offline-auth-service.ts:102,105-121`, `user-home.ts:24` sí están correctos.
  - `e2e/support/auth-storage.ts:14` cita `login-network-observer.ts:123-129` para la deuda de la regla de tres; el comentario real está en `:129-134` (`:123-129` es el cuerpo de `isProductApiRequest`). Se corrige en WU1 (archivo de soporte).
  - `login-rate-limit.spec.ts:6` cita `es.ts:83` para `AUTH.TOO_MANY_ATTEMPTS`; la línea real es `es.ts:85`. **Es un archivo de test: se reporta, NO se toca.**
