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

## Cómo correr

Desde `frontend-react/`:

| Comando | Qué hace |
| --- | --- |
| `pnpm exec playwright test` | Corre todos los tests (smoke) |
| `pnpm exec playwright test --ui` | Modo interactivo (UI) con el test runner |
| `pnpm exec playwright test e2e/smoke.spec.ts` | Corre solo el archivo indicado |
| `pnpm exec playwright show-report` | Abre el reporte HTML generado |

## Cómo se levanta el servidor

`webServer` en `playwright.config.ts` ejecuta `pnpm dev` (turbo) automáticamente antes de correr los tests y espera a que `http://localhost:3333` responda (timeout 120s).

Con `reuseExistingServer: true`, si ya hay un dev server corriendo en el puerto 3333, Playwright lo reutiliza en lugar de levantar otro. Útil para iterar contra un server ya levantado a mano.

## Service worker

La app usa `vite-plugin-pwa` con `devOptions.enabled: true`, así que en dev se registra un service worker que cachea respuestas. Los tests lo bloquean (`contextOptions: { serviceWorkers: 'block' }` en la config) para evitar resultados falsos por respuestas cacheadas.

## Dónde van los tests de features

Los tests viven en `e2e/` (carpeta configurada en `testDir`). Crea un archivo por feature, p.ej.:

- `e2e/stores.spec.ts` — crear tienda en `/management/stores/create`
- `e2e/products-import.spec.ts` — importar productos en `/sales/products`

Nota: esas rutas son autenticadas, así que los tests de features probablemente necesiten un flujo de login o seeding. Los tests de humo (`e2e/smoke.spec.ts`) no tocan auth ni backend.
