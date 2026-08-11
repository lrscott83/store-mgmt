# Pruebas E2E (Playwright)

Tests end-to-end del frontend React con [Playwright](https://playwright.dev/).

## Prerrequisitos

- `pnpm install` (ya trae `@playwright/test` como devDependency en la raíz).
- Instalar el navegador Chromium:

  ```
  pnpm exec playwright install chromium
  ```

  Si la descarga da **403** (bloqueo regional del CDN oficial), usar el mirror de npmmirror:

  ```
  PLAYWRIGHT_DOWNLOAD_HOST=https://npmmirror.com/mirrors/playwright pnpm exec playwright install chromium
  ```

- **Para los tests que pegan contra un backend real** (`register.spec.ts`,
  `register-rate-limit.spec.ts` y `api-health.spec.ts`):

  **No hace falta crear, copiar ni editar ningún `.env`.** Los tres resuelven el backend
  desde `E2E_API_URL` (`e2e/support/backend-url.ts`), calculado como
  `process.env.E2E_API_URL ?? 'http://localhost:5019/api'` — ese default apunta al
  backend local con cero configuración. `playwright.config.ts` lo inyecta además como
  `API_URL` al proceso `pnpm dev` que levanta (`webServer.env`), así que la app se
  compila contra el mismo backend que los tests interrogan.

  Si necesitás que peguen contra otro backend, exportá `E2E_API_URL` en tu shell antes de
  correr los tests (ej. `E2E_API_URL=http://localhost:5050/api pnpm test:e2e`).

  Esto es intencionalmente **distinto** de `frontend-react/.env`: ese archivo es tu
  configuración de desarrollo (la que usás normalmente con `pnpm dev` a mano) y la suite
  nunca lo lee para resolver el backend ni lo sobrescribe. La razón es concreta: cada
  corrida exitosa crea filas reales de Owner+Store, y heredar tu `API_URL` de desarrollo
  podría escribirlas en un backend compartido. No existe ningún `.env.example` que copiar,
  y no tener `.env` es un estado soportado.

  Backend levantado a mano, en otra terminal, con PostgreSQL en `localhost:5432` y la
  base `smca_test` creada:

  ```bash
  dotnet run --project backend/src/SMCA.WebApi --launch-profile http-e2e
  ```

  **`http-e2e`, no `http`.** Ese perfil existe exactamente para esto: ya trae la
  connection string a `smca_test`, así que no hay ninguna variable de entorno que
  exportar. El perfil `http` apunta a la base de desarrollo `smca` y la suite le deja
  filas `e2e-*` que nadie limpia — ver [Modo BD de test (`smca_test`)](#modo-bd-de-test-smca_test).

  **Nunca** `--launch-profile https`: `app.UseHttpsRedirection()` (`Program.cs:138`) redirigiría
  al puerto HTTPS con un certificado autofirmado que un navegador real rechaza; esta suite no
  configura `ignoreHTTPSErrors`.

## Cómo correr

Desde `frontend-react/`:

| Comando | Qué hace |
| --- | --- |
| `pnpm test:e2e` | Corre la suite por defecto (smoke + register REQ-1..REQ-8 + login A1-A7/D1-D6 + login offline S1-03), **excluye** ambos specs de rate-limit. Consume 2 registros + 4 logins reales — ver la advertencia de cuota de login más abajo. `login-offline.spec.ts` no agrega a ese costo: cero peticiones reales de red. |
| `pnpm test:e2e:rate-limit` | Corre AMBOS specs de rate-limit (`register-rate-limit.spec.ts` REQ-9 y `login-rate-limit.spec.ts` REQ-8), filtrados por el tag `@rate-limit`. Agota la cuota de registro (~10 min) y la de login (~1 min) de tu IP — a demanda, no en la corrida por defecto. |
| `pnpm test:e2e:api` | Chequeo de conectividad con la API, sin navegador (`playwright.api.config.ts`). |
| `pnpm exec playwright test --ui` | Modo interactivo (UI) con el test runner |
| `pnpm exec playwright test e2e/smoke.spec.ts` | Corre solo el archivo indicado |
| `pnpm exec playwright show-report` | Abre el reporte HTML generado |

## Cómo se levanta el servidor

`webServer` en `playwright.config.ts` ejecuta `pnpm dev` (turbo) automáticamente antes de correr los tests y espera a que `http://localhost:3333` responda (timeout 120s). Cuando Playwright es quien lo levanta, le inyecta `API_URL=E2E_API_URL` (default `http://localhost:5019/api`, override con la variable de shell `E2E_API_URL`) — así la suite de registro siempre habla con el backend correcto sin tocar tu `.env`.

Con `reuseExistingServer: true`, si ya hay un dev server corriendo en el puerto 3333, Playwright lo reutiliza en lugar de levantar otro. Útil para iterar contra un server ya levantado a mano — **pero con una trampa**:

> ⚠️ **Si tenías `pnpm dev` corriendo en :3333 desde ANTES de ejecutar Playwright**, el `API_URL` de arriba nunca llega a ese proceso — Playwright reutiliza el server tal cual está, con el `API_URL` que sea que tuviera (por ejemplo, tu `.env` de desarrollo apuntando a otro backend). La suite de registro lo detecta en runtime: en vez de escribir filas reales en el backend equivocado, falla con un mensaje que nombra el problema (`La petición de registro salió a ... pero el backend esperado es ...`) y la solución (parar ese dev server con `Ctrl+C` en su terminal y volver a correr la suite). Ver `e2e/support/network-observer.ts`.

## Service worker

La app usa `vite-plugin-pwa` con `devOptions.enabled: true`, así que en dev se registra un service worker que cachea respuestas. Los tests lo bloquean (`contextOptions: { serviceWorkers: 'block' }` en la config) para evitar resultados falsos por respuestas cacheadas.

## Modo BD de test (`smca_test`)

El perfil `http` apunta a la base de desarrollo `smca`. **Para Playwright hay un perfil propio, `http-e2e`**, que es igual pero con la connection string a `smca_test` ya puesta:

```bash
dotnet run --project backend/src/SMCA.WebApi --launch-profile http-e2e
```

Eso es todo: **no hay ninguna variable de entorno que exportar**. El perfil vive en `backend/src/SMCA.WebApi/Properties/launchSettings.json` y define `ConnectionStrings__Application`, que tiene prioridad sobre `appsettings.Development.json` (la misma técnica que usa `WebAppFixture.cs:21-22` para la suite .NET). Trae además `launchBrowser: false`, porque para una corrida de tests no hace falta que se abra Swagger.

Antes esto era una variable de entorno que había que exportar a mano en cada corrida, y nada en el repo lo forzaba. Olvidarla mandaba las filas `e2e-*` a `smca`, donde se acumulaban sin teardown hasta hacer fallar por timeout specs que estaban verdes en el mismo commit. El perfil existe para que ese olvido no sea posible.

Los tests no cambian nada: `E2E_API_URL` ya apunta al backend (`http://localhost:5019/api` por defecto).

> Si igual arrancás con `--launch-profile http`, la suite corre pero ensucia `smca`. La señal es el aviso del `globalTeardown` al final: **`0 filas e2e-* borradas`** (borra en `smca_test`, que en ese caso quedó vacía).

> ⚠️ **No uses `ASPNETCORE_ENVIRONMENT=Testing` para esto.** Ese entorno existe para la suite .NET y **apaga el rate limiter** (`Program.cs:112-121`): los specs `register-rate-limit.spec.ts` (REQ-9) y `login-rate-limit.spec.ts` (REQ-8) dependen de recibir 429 y se romperían. El modo correcto es **perfil `http` (Development) + env var de conexión**: rate limits ON, BD `smca_test`.

### Restricción de corrida paralela

La suite .NET E2E y Playwright **no deben correr en paralelo contra `smca_test`**: al iniciar, `WebAppFixture` ejecuta `ResetDataAsync` (`DbTestHelpers.cs:151`) que borra TODAS las filas de datos de la BD (en orden FK, preservando los seeds de migración). Ese borrado es la limpieza automática que se describe abajo, pero si corre a mitad de una corrida de Playwright, elimina las filas vivas que los tests del frontend están usando. Correrlas en secuencia es seguro.

### Limpieza automática

`smca_test` se limpia sola en cada corrida de la suite .NET: `WebAppFixture.InitializeAsync` (`WebAppFixture.cs:29-32`) corre `MigrateAsync` + `ResetDataAsync`, que borra filas de datos acumuladas (incluidas las `e2e-*` del Playwright) en orden FK, sin tocar los seeds ni hacer DROP. Requisito: PostgreSQL en `localhost:5432`, base `smca_test` (la suite .NET aplica las migraciones ella misma):

```bash
dotnet test backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj
```

### Limpieza automática de la propia suite (`globalTeardown`)

Playwright borra sus propias filas `e2e-*` al terminar la corrida, vía `globalTeardown` (`e2e/support/global-teardown.ts`, cableado en `playwright.config.ts`). No hay que hacer nada a mano.

Va **una sola vez al final**, y no por spec, a propósito: con `fullyParallel: true` un borrado per-spec eliminaría las filas vivas de los specs que siguen corriendo — el mismo peligro que el `ResetDataAsync` descrito arriba. `globalTeardown` corre cuando ya no queda ningún worker, así que es el único lugar seguro para un borrado por prefijo.

Se conecta a `postgresql://postgres:postgres@localhost:5432/smca_test` por defecto; sobreescribí con la variable `E2E_DB_URL` si tu backend apunta a otra base. Si **no puede conectarse**, la corrida falla con un mensaje explícito: no conectarse significa que la limpieza no ocurrió, y acumular en silencio es justamente lo que esto viene a evitar. Si conecta y borra **cero** filas, avisa por consola — normalmente eso significa que el backend está escribiendo en otra base.

### Limpieza manual (solo si necesitás limpiar fuera de una corrida)

Para borrar filas acumuladas sin correr Playwright ni los 320+ tests .NET — por ejemplo las que quedaron en `smca` de corridas viejas — borrá solo las filas con el prefijo `e2e-` en el **mismo orden FK** que `ResetDataAsync` (los FKs son `DeleteBehavior.Restrict`; children primero). Es el mismo orden que ejecuta `global-teardown.ts`. Ejemplo con `psql`:

```sql
-- Conectado a smca_test. Borra SOLO filas e2e-* (Owner/Store/User del Playwright)
-- y todos sus hijos, en el mismo orden FK que ResetDataAsync
-- (FKs DeleteBehavior.Restrict: children primero).
DELETE FROM "StoreUsage"     USING "Store" s, "Owner" o, "User" u
  WHERE "StoreUsage"."StoreId" = s."Id" AND s."OwnerId" = o."Id" AND o."UserId" = u."Id" AND u."Login" LIKE 'e2e-%';
DELETE FROM "StorePayment"   USING "Store" s, "Owner" o, "User" u
  WHERE "StorePayment"."StoreId" = s."Id" AND s."OwnerId" = o."Id" AND o."UserId" = u."Id" AND u."Login" LIKE 'e2e-%';
DELETE FROM "StoreModule"    USING "Store" s, "Owner" o, "User" u
  WHERE "StoreModule"."StoreId" = s."Id" AND s."OwnerId" = o."Id" AND o."UserId" = u."Id" AND u."Login" LIKE 'e2e-%';
DELETE FROM "StoreRoleFeature" USING "Store" s, "Owner" o, "User" u
  WHERE "StoreRoleFeature"."StoreId" = s."Id" AND s."OwnerId" = o."Id" AND o."UserId" = u."Id" AND u."Login" LIKE 'e2e-%';
DELETE FROM "StoreUser"      USING "Store" s, "Owner" o, "User" u
  WHERE "StoreUser"."StoreId" = s."Id" AND s."OwnerId" = o."Id" AND o."UserId" = u."Id" AND u."Login" LIKE 'e2e-%';
DELETE FROM "Store"          USING "Owner" o, "User" u
  WHERE "Store"."OwnerId" = o."Id" AND o."UserId" = u."Id" AND u."Login" LIKE 'e2e-%';
DELETE FROM "UserRole"       USING "User" u
  WHERE "UserRole"."UserId" = u."Id" AND u."Login" LIKE 'e2e-%';
DELETE FROM "Owner"          USING "User" u
  WHERE "Owner"."UserId" = u."Id" AND u."Login" LIKE 'e2e-%';
DELETE FROM "User" WHERE "Login" LIKE 'e2e-%';
```

Mismo criterio que la suite .NET: **son las filas `e2e-`** las que se borran; los seeds de migración (admin, roles, features) no matchean ese prefijo y quedan intactos. Si dudas del estado, corré la suite .NET (limpieza automática) y listo.

## Suite de registro (`register.spec.ts`, `register-rate-limit.spec.ts`)

Cubre las 10 aserciones de UI de auto-registro (`docs/testing/e2e-stage-1/S1-01.md`)
contra un backend real, no contra un mock. Capa de soporte en `e2e/support/`:

- `support/test.ts` — punto de entrada de la suite. Todo spec de registro importa `test`/`expect`
  de acá (nunca de `@playwright/test` directamente), porque trae cableado el fixture
  `registerNetwork`.
- `support/network-observer.ts` — observa toda petición `POST` que termine en
  `/v1/auth/register`; expone si salió una petición, si no salió ninguna, y el cuerpo de la
  respuesta. También es la fuente de los diagnósticos de la próxima sección.
- `support/register-page.ts` — page object de `/register`.
- `support/identity.ts` — genera una identidad única (login `e2e-{timestamp}-{random}`) por
  corrida, para no colisionar entre corridas ni entre workers paralelos.

### Diagnóstico legible vs. fallo de comportamiento

Si la suite choca con la cuota de registro agotada, con el backend caído, o con `API_URL` mal
configurada, el fallo lo dice así — no como un `expect` crudo indistinguible de un bug real:

| Mensaje que vas a ver | Qué significa | Qué hacer |
| --- | --- | --- |
| `Registration quota exhausted for this IP...` | Cuota de 10 registros/10min agotada | Esperar hasta 10 minutos |
| `The backend did not respond at ...` | El backend está caído | Levantarlo (paso 1, arriba) |
| `La petición de registro salió a ... pero el backend esperado es ...` | Había un dev server en :3333 levantado a mano ANTES de Playwright, con otro `API_URL` — `reuseExistingServer:true` lo reutilizó tal cual y la suite terminó hablando con el backend equivocado | Parar ese dev server (`Ctrl+C`) y volver a correr la suite |
| `API_URL points at the wrong base — is /api missing?` | `E2E_API_URL` (si lo overrideaste) no termina en `/api` | Revisar el valor exportado en tu shell |

Ninguno de estos 4 es un defecto de la aplicación — son fallos de entorno, y por eso el mensaje
lo dice explícitamente en vez de dejarte adivinar.

### Advertencia de datos, sin alarma

Una corrida exitosa de `pnpm test:e2e` deja **3 filas permanentes** (`Owner` + `Store` + `User`,
este último el StoreUser que la suite de login crea vía UI) en tu base `smca` local;
`pnpm test:e2e:rate-limit` deja **1 fila más** (la del spec de rate-limit de registro; el de login
no deja ninguna — ver más abajo). No hay teardown alcanzable desde el navegador. Los logins llevan
el prefijo `e2e-` + timestamp, así que son greppables y borrables a mano cuando quieras limpiar
(`smca`, no `smca_test` — no contamina la suite .NET).

## Suite de login (`login.spec.ts`, `login-rate-limit.spec.ts`)

Cubre las 14 aserciones de [S1-02] (`docs/testing/e2e-stage-1/S1-02.md`): las 8 de UI (A1-A8) y
las 6 de destino post-login (D1-D6), contra un backend real. Capa de soporte adicional en
`e2e/support/`:

- `support/login-page.ts` — page object de `/login`.
- `support/login-network-observer.ts` — observa `POST .../v1/auth/login` y `GET .../v1/auth/me`,
  prueba su **orden causal** (no solo que ambas ocurrieron), y expone `LoginRateLimitError` con
  los umbrales de `LoginPolicy`. Archivo propio, separado de `support/network-observer.ts` a
  propósito (evita cualquier riesgo de regresión sobre `register.spec.ts`).
- `support/store-seed.ts` — siembra una categoría + un producto activo/vendible navegando la UI
  real de `/sales/products`, cero peticiones a la API (servicio offline).
- `support/session.ts` — el motor detrás de la fixture `signedInPage` (ver abajo).

### `signedInPage` — sesiones autenticadas reutilizables

Diez de las catorce aserciones necesitan un usuario YA autenticado. En vez de loguear una vez por
escenario, `support/test.ts` expone la fixture opt-in `signedInPage` (nunca `auto`) más la opción
`persona`:

```ts
test.use({ persona: 'owner-admin-with-products' });

test('...', async ({ signedInPage }) => {
  // signedInPage.page === page (SIEMPRE el mismo objeto que la fixture `page`
  // del propio test — nunca un contexto/página nueva).
});
```

Las 4 personas disponibles:

| Persona | Estado de la tienda | Home resuelto |
| --- | --- | --- |
| `owner-admin` (default) | Recién registrada, sin categorías ni productos | `/sales/products` |
| `owner-admin-with-products` | +1 categoría activa, +1 producto activo/vendible | `/sales/new` |
| `store-user` | Empleado de la MISMA tienda, acuñado antes de sembrar | `/sales/products` |
| `store-user-with-products` | Snapshot de `store-user` + las claves de entidad sembradas | `/sales/new` |

Invariantes que la fixture garantiza siempre:

- **`signedInPage.page === page`** — nunca un `page`/contexto nuevo, así `registerNetwork`,
  `loginNetwork` y cualquier observador futuro siguen mirando lo mismo que el test.
- **Sin roster, jamás** — ninguna persona llama `importRoster`; `isRosterProvisioned()` queda
  falso, así que el login siempre toma la rama ONLINE. Un roster convertiría esta suite en la de
  [S1-03] (login offline) sin querer.

**Costo amortizado — la corrida por defecto gasta exactamente 4 logins reales**: 1 para acuñar
`owner-admin` (el mismo login que las aserciones de red/overlay observan en vivo), 1 para acuñar
`store-user`, 1 más de `REQ-3` (contraseña incorrecta) y 1 más de `REQ-9`/D1 (relogin real tras
`logout()`). Las variantes `*-with-products` no cuestan login extra — se derivan restaurando
`localStorage` que la propia app ya escribió minutos antes (nunca escrito a mano).

> ⚠️ **Margen de exactamente 1 login — no es una nota al pie.** El techo es **5 logins por minuto
> por IP** (`RateLimitPolicies.cs:15-24`). Dos corridas de `pnpm test:e2e` dentro del **mismo
> minuto** suman **8** logins y **se ponen rojas por cuota**, no por un defecto de la app. Si eso
> te pasa, esperá un minuto y volvé a correr — el mensaje de error lo va a decir con esas palabras
> (`Login quota exhausted...`), nunca como un `expect` mudo.

### `pnpm test:e2e:rate-limit` — costo del spec de login

`login-rate-limit.spec.ts` agota la cuota de login de tu IP en **~1 minuto** (no ~10 min como el
de registro) y **deja 0 filas nuevas** en la base — usa una identidad que nunca se registró; el
límite corre en el pipeline antes del endpoint, así que un intento fallido consume permiso igual.

**Orden inverso al del hermano de registro**: correr `pnpm test:e2e:rate-limit` justo ANTES de
`pnpm test:e2e` va a chocar — la ventana de login es corta pero la cuota queda agotada, y
`pnpm test:e2e` va a ver 429 donde esperaba 200. Dejá pasar el minuto entre uno y otro.

## Suite de login offline (`login-offline.spec.ts`)

Cubre las 12 aserciones de UI de [S1-03] (`docs/testing/e2e-stage-1/S1-03.md`): login contra un
roster provisionado localmente, sin red — `authenticateOffline` resuelve contra `bundle.users` en
`localStorage`, nunca contra el backend. Corre en la suite por defecto (`pnpm test:e2e`, sin el tag
`@rate-limit`) y **no necesita ningún backend levantado**: es el único spec de todo `e2e/` que puede
correrse solo, con `pnpm exec playwright test e2e/login-offline.spec.ts`, sin `dotnet run` en otra
terminal.

Capa de soporte:

- `support/network-observer-core.ts` — núcleo compartido (cola de outcomes, `createDeferred`,
  matcher de sufijo de pathname, mensajes de backend equivocado/caído/404, `resolveCapture`) que
  `network-observer.ts` y `login-network-observer.ts` importan ahora en vez de duplicar. Genérico
  por construcción, blindado de umbrales de rate-limit y de las clases de error (esas siguen
  viviendo, separadas, en cada observer).
- `support/any-request-observer.ts` — el tercer observer: afirma cero peticiones HTTP a
  **cualquier** endpoint (no solo login/me/product), la garantía que REQ-1 necesita y que los otros
  dos observers no dan por diseño (están scopeados a paths específicos).
- `support/roster-fixture.ts` — siembra el dispositivo aprovisionado escribiendo directo a
  `localStorage` (`ROSTER_STORAGE_KEY`, `plantRoster()`), nunca vía `importRoster()`. El verifier y
  el wrap de DEK se calculan en Node con `node:crypto`'s `webcrypto`, verificados contra
  `docs/contracts/offline-roster-dek-kat.json` (un tripwire falla ruidoso si la derivación se
  desvía del backend real, antes de sembrar nada).

Descubrimiento verificado al escribir este spec: `login.tsx` arma el store-usage tracker
(`armTracking()`) en sus dos ramas de éxito, offline y online — el tracker dispara un
`POST /v1/usages/store-daily-usage` de fondo en el siguiente cambio de ruta, ortogonal a la
autenticación. Ya pasaba en el login online (`login-network-observer.ts`'s `PRODUCT_API_PATTERN` ya
lo anticipaba), pero nunca se había afirmado antes contra un observer genuinamente genérico. Los
tests que completan un login exitoso toleran explícitamente esa única llamada conocida; el resto
del tráfico se sigue exigiendo en cero.

## Suite de activación de plan (`store-plan-activation.spec.ts`)

Cubre las 11 aserciones de UI de [S2-01] (`docs/testing/e2e-stage-1/S2-01.md`)
(DG-7 — el OwnerAdmin activa el plan pago una sola vez, en una sola dirección),
contra un backend real. Dos tests: uno continuo que recorre las 10 aserciones
DOM+red del plan (gratuito → activación → guardado → recarga en plan pago), y
uno independiente para el fallo de carga (aserción 11). Capa de soporte
adicional en `e2e/support/`:

- `support/store-fixture.ts` — siembra de SERVIDOR, no flujo de usuario:
  degrada la tienda de `owner-admin` al plan gratuito con un `PUT
  /v1/stores/{id}` real (los `moduleIds` salen del catálogo real
  `GET /v1/modules/ToStore`, nunca hardcodeados), y re-lee la tienda para
  pinear la precondición antes de devolver el control — mismo patrón que
  `roster-fixture.ts`'s `plantRoster()`. También expone `assertStoresFeature()`,
  la guarda temprana y ruidosa de `featureIds ⊇ {73}` (Stores).
- `support/store-network-observer.ts` — el cuarto observer: cuerpo + timestamp
  del `PUT /v1/stores/{id}` (parametrizado por `storeId`, no un regex
  genérico — un PUT a otra tienda se detecta, no se cuenta junto), un matcher
  local de `/me` (4 líneas, no importado de `login-network-observer.ts`) para
  el orden causal PUT→`/me`, y un contador de peticiones `resourceType() ===
  'document'` para medir la ausencia de recarga en vez de asumirla.

**Costo**: **0 logins nuevos** — reusa la persona `owner-admin` existente
(REQ-14). **4 peticiones de siembra reales** vía `page.request` (`GET
/v1/modules/ToStore`, `GET /v1/stores/{id}`, `PUT /v1/stores/{id}`, y un
re-`GET /v1/stores/{id}` para pinear la precondición) — ninguna lleva
`[EnableRateLimiting]` en `StoresController.cs`/`ModulesController.cs`, así
que no consumen ningún presupuesto de cuota.

> ⚠️ **Este spec SÍ necesita backend real levantado** — a diferencia de
> `login-offline.spec.ts`, que es el único de todo `e2e/` que corre sin
> `dotnet run` en otra terminal. Diez de las once aserciones dependen de la
> siembra por `PUT` y del guardado real contra la API.

Reachable únicamente porque el backend no tiene candado de dirección única
para el plan de una tienda — ver **H-15**
(`docs/testing/e2e-stage-1/README.md`). El selector de dueño no se renderiza
para un OwnerAdmin (no "deshabilitado", como decía una versión anterior de
`S2-01.md`) — ver **H-16**, misma nota.

**Sin teardown alcanzable, mismo criterio ya documentado para `Owner`/`Store`/
`User`** (`e2e/README.md:107-112`): la tienda de `owner-admin` termina el spec
en **plan pago**, con `PaymentStartDate` no-nulo y los módulos pagos
re-activos, y así queda para cualquier corrida posterior.

## Dónde van los tests de features

Los tests viven en `e2e/` (carpeta configurada en `testDir`). Crea un archivo por feature, p.ej.:

- `e2e/stores.spec.ts` — crear tienda en `/management/stores/create`
- `e2e/products-import.spec.ts` — importar productos en `/sales/products`

Nota: esas rutas son autenticadas, así que los tests de features probablemente necesiten un flujo de login o seeding. Los tests de humo (`e2e/smoke.spec.ts`) no tocan auth ni backend.
