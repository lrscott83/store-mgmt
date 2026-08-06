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

  Backend levantado a mano, en otra terminal, con PostgreSQL en `127.0.0.1:5432` (base `smca`):

  ```bash
  dotnet run --project backend/src/SMCA.WebApi --launch-profile http
  ```

  **Nunca** `--launch-profile https`: `app.UseHttpsRedirection()` (`Program.cs:138`) redirigiría
  al puerto HTTPS con un certificado autofirmado que un navegador real rechaza; esta suite no
  configura `ignoreHTTPSErrors`.

## Cómo correr

Desde `frontend-react/`:

| Comando | Qué hace |
| --- | --- |
| `pnpm test:e2e` | Corre la suite por defecto (smoke + register REQ-1..REQ-8 + login A1-A7/D1-D6), **excluye** ambos specs de rate-limit. Consume 2 registros + 4 logins reales — ver la advertencia de cuota de login más abajo. |
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

## Dónde van los tests de features

Los tests viven en `e2e/` (carpeta configurada en `testDir`). Crea un archivo por feature, p.ej.:

- `e2e/stores.spec.ts` — crear tienda en `/management/stores/create`
- `e2e/products-import.spec.ts` — importar productos en `/sales/products`

Nota: esas rutas son autenticadas, así que los tests de features probablemente necesiten un flujo de login o seeding. Los tests de humo (`e2e/smoke.spec.ts`) no tocan auth ni backend.
