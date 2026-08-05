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

- **Solo para la suite de registro** (`register.spec.ts`, `register-rate-limit.spec.ts`,
  `api-health.spec.ts`) — pegan contra un backend real, no contra un mock:

  ```bash
  # Paso 0 — una sola vez
  cp .env.example .env
  ```

  `.env` no se commitea (`.gitignore` lo ignora); `.env.example` documenta `API_URL`
  con su valor esperado (`http://localhost:5019/api`, con el sufijo `/api`) y por qué.

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
| `pnpm test:e2e` | Corre la suite por defecto (smoke + register REQ-1..REQ-8), **excluye** el spec de rate-limit. Consume 2 registros reales. |
| `pnpm test:e2e:rate-limit` | Corre solo `register-rate-limit.spec.ts` (REQ-9). Agota la cuota de registro de tu IP por hasta 10 min — a demanda, no en la corrida por defecto. |
| `pnpm test:e2e:api` | Chequeo de conectividad con la API, sin navegador (`playwright.api.config.ts`). |
| `pnpm exec playwright test --ui` | Modo interactivo (UI) con el test runner |
| `pnpm exec playwright test e2e/smoke.spec.ts` | Corre solo el archivo indicado |
| `pnpm exec playwright show-report` | Abre el reporte HTML generado |

## Cómo se levanta el servidor

`webServer` en `playwright.config.ts` ejecuta `pnpm dev` (turbo) automáticamente antes de correr los tests y espera a que `http://localhost:3333` responda (timeout 120s).

Con `reuseExistingServer: true`, si ya hay un dev server corriendo en el puerto 3333, Playwright lo reutiliza en lugar de levantar otro. Útil para iterar contra un server ya levantado a mano.

## Service worker

La app usa `vite-plugin-pwa` con `devOptions.enabled: true`, así que en dev se registra un service worker que cachea respuestas. Los tests lo bloquean (`contextOptions: { serviceWorkers: 'block' }` en la config) para evitar resultados falsos por respuestas cacheadas.

## Suite de registro (`register.spec.ts`, `register-rate-limit.spec.ts`)

Cubre las 10 aserciones de UI de auto-registro (`docs/testing/e2e-catalog-stage-1.md`, [S1-01])
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
| `API_URL is not configured: the request went to the dev server...` | Falta `.env` | `cp .env.example .env` |
| `API_URL points at the wrong base — is /api missing?` | `API_URL` sin el sufijo `/api` | Revisar `.env` |

Ninguno de estos 4 es un defecto de la aplicación — son fallos de entorno, y por eso el mensaje
lo dice explícitamente en vez de dejarte adivinar.

### Advertencia de datos, sin alarma

Una corrida exitosa de `pnpm test:e2e` deja **2 filas permanentes** (`Owner` + `Store`) en tu base
`smca` local; `pnpm test:e2e:rate-limit` deja **1 fila más**. No hay teardown alcanzable desde el
navegador. Los logins llevan el prefijo `e2e-` + timestamp, así que son greppables y borrables a
mano cuando quieras limpiar (`smca`, no `smca_test` — no contamina la suite .NET).

## Dónde van los tests de features

Los tests viven en `e2e/` (carpeta configurada en `testDir`). Crea un archivo por feature, p.ej.:

- `e2e/stores.spec.ts` — crear tienda en `/management/stores/create`
- `e2e/products-import.spec.ts` — importar productos en `/sales/products`

Nota: esas rutas son autenticadas, así que los tests de features probablemente necesiten un flujo de login o seeding. Los tests de humo (`e2e/smoke.spec.ts`) no tocan auth ni backend.
