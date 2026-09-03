import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { LoginPage } from './support/login-page';
import { plantRoster, KAT_PASSWORD } from './support/roster-fixture';
import { readAuthModel } from './support/auth-storage';

// NUEVA VERSIÓN EN SESIÓN OFFLINE — el diálogo "¡Nueva versión disponible!"
// (y su hard refresh) funciona igual cuando la sesión nació del roster.
//
// CÓMO CORRER (desde frontend-react/):
//   pnpm --filter @store-mgmt/web-store-pos build
//   npx playwright test --config=playwright.pwa.config.ts
//
// Por qué este spec existe:
//
// La verificación de nueva versión es un diff a nivel de navegador del script
// del service worker (vite-plugin-pwa / workbox-window) — NO pasa por
// `apiClient`, no lleva header `Authorization` y no depende del modo de
// autenticación. Pero esa independencia estaba solo razonada, nunca probada
// contra el SW REAL: el SW con precache solo existe en el build (en dev se
// registra con `globPatterns: []`, vite.config.ts design D10), y todos los
// specs del config general corren contra el dev server CON service workers
// bloqueados. Este spec cierra el hueco: sesión nacida del roster (sentinel
// en AUTH_MODEL) → el SW se registra igual → al aparecer una versión nueva
// el diálogo se muestra → "Actualizar ahora" hace hard refresh → la sesión
// offline sobrevive al recargo.
//
// Por qué contra `vite preview` (misma razón que offline-shell.spec.ts): se
// necesita el `service-worker.js` real del build (`scripts/build-sw.mjs`),
// no el worker vacío del dev server.
//
// Cómo se fuerza la "versión nueva" sin un segundo build:
//
// El navegador detecta una versión nueva comparando bytes del script del SW.
// `registration.update()` (el mismo mecanismo del poll de 15 minutos) vuelve
// a descargar `service-worker.js` y lo compara contra el SW ACTIVO. Para que
// esa descarga traiga bytes distintos se muta el archivo en disco que sirve
// `vite preview` (servidor estático: lee de disco por petición) — el mismo
// gesto del procedimiento manual de aceptación ("rebuild con un cambio
// trivial"), automatizado: se agrega un comentario al final del script antes
// del update() y se restaura el byte original al terminar (try/finally).
//
// ⚠️ Por qué NO se usó `context.route` para diff-ear el script: verificado
// empíricamente, la ruta intercepta el fetch del `register()` inicial (lo
// inicia la página) pero NO el del `registration.update()` (lo inicia el
// mecanismo de service workers del navegador, fuera de cualquier target que
// Playwright pueda enrutar). El diff real en disco es la única vía
// determinista.
//
// Cero backend y cero HTTP de API: el roster es sintético (`plantRoster`), el
// login toma la rama offline y las llamadas de API del dashboard fallan por
// red (offline-first: la sesión se retiene; nunca un 401/404 que desloguee).
// Copias literales del castellano tomadas de es.ts / blocking-alert.ts, nunca
// importadas (el navegador es la caja negra, misma política que los demás
// specs E2E).

const SIGN_IN_TITLE = 'Inicia sesión en tu cuenta'; // es.ts AUTH.SIGN_IN_TITLE
const UPDATE_DIALOG_TITLE = '¡Nueva versión disponible!'; // blocking-alert.ts:115
const UPDATE_BUTTON_TEXT = 'Actualizar ahora'; // blocking-alert.ts:129

// build-sw.mjs: build/client/service-worker.js — el archivo que `vite
// preview` sirve y que el `registerSW` de vite-plugin-pwa registra.
function swScriptPath(): string {
  let base: string;
  try {
    base = __dirname;
  } catch {
    base = resolve(process.cwd(), 'e2e');
  }
  return resolve(base, '../apps/web-store-pos/build/client/service-worker.js');
}

function uniqueLogin(): string {
  return `e2e-verchk-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

test.describe('nueva versión en sesión offline (nacida del roster)', () => {
  test.describe.configure({ timeout: 90_000 });

  test('el diálogo de actualización aparece y el confirm hace hard refresh conservando la sesión offline', async ({
    page,
  }) => {
    // ---------------------------------------------------------------------
    // 1. Sesión nacida del roster: login OFFLINE real (cero POST /v1/auth/
    //    login) contra un roster sintético plantado en localStorage.
    // ---------------------------------------------------------------------
    const login = uniqueLogin();
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: SIGN_IN_TITLE })).toBeVisible();

    await plantRoster(page, {
      users: [{ login, wrap: 'kat' }],
    });

    const loginPage = new LoginPage(page);
    await loginPage.fill({ login, password: KAT_PASSWORD });
    await loginPage.submit();
    await page.waitForURL(/\/sales\/products$/);

    // Precondición (CLAUDE.md: pin the state that triggers the behaviour):
    // la sesión es OFFLINE-born — AUTH_MODEL.authToken es el sentinel, no un
    // JWT de servidor.
    const auth = await readAuthModel(page);
    expect(auth?.authToken, 'la sesión debe haber nacido del roster (sentinel)').toBe(
      'offline-session'
    );

    // ---------------------------------------------------------------------
    // 2. El service worker real se registró y activó (root.tsx lo registra
    //    5s tras el boot, sin importar el modo de autenticación). Sin este
    //    estado no existe la maquinaria que detecta versiones nuevas.
    // ---------------------------------------------------------------------
    await expect
      .poll(
        () =>
          page.evaluate(async () => {
            if (!('serviceWorker' in navigator)) return 'no-support';
            const reg = await navigator.serviceWorker.getRegistration();
            return reg?.active?.state ?? 'no-active';
          }),
        { timeout: 30_000 }
      )
      .toBe('activated');

    // ---------------------------------------------------------------------
    // 3. Simular el deploy: mutar en disco el script servido (mismo gesto
    //    que el procedimiento manual "rebuild con un cambio trivial"),
    //    disparar registration.update() y esperar el diálogo. El finally
    //    restaura el byte original pase lo que pase.
    // ---------------------------------------------------------------------
    const swFile = swScriptPath();
    const originalSw = readFileSync(swFile);

    try {
      writeFileSync(swFile, Buffer.concat([originalSw, Buffer.from('\n// e2e-bumped-version\n')]));

      await page.evaluate(async () => {
        const reg = await navigator.serviceWorker.getRegistration();
        await reg?.update();
      });

      await expect(
        page.getByRole('heading', { name: UPDATE_DIALOG_TITLE }),
        'la sesión offline debe mostrar el diálogo de nueva versión igual que una online'
      ).toBeVisible({ timeout: 20_000 });

      // -----------------------------------------------------------------
      // 4. Confirmar → updateSW(true) (SKIP_WAITING) → window.location
      //    .reload() (hard refresh, service-worker-registration.ts:34-36).
      //    El marker se pierde con el recargo: esa es la prueba de que el
      //    refresh ocurrió.
      // -----------------------------------------------------------------
      await page.evaluate(() => {
        (window as unknown as Record<string, unknown>).__e2ePreUpdateMarker = 'pre-update';
      });

      await page.getByRole('button', { name: UPDATE_BUTTON_TEXT }).click();

      await expect
        .poll(
          () =>
            page.evaluate(() => {
              const marker = (window as unknown as Record<string, unknown>).__e2ePreUpdateMarker;
              return marker === undefined ? 'reloaded' : String(marker);
            }),
        { timeout: 20_000, intervals: [250] }
        )
        .toBe('reloaded');

      // -----------------------------------------------------------------
      // 5. La sesión OFFLINE sobrevivió al hard refresh: seguimos
      //    autenticados en /sales/products y AUTH_MODEL sigue siendo el
      //    sentinel (nada del recargo degradó la sesión del roster).
      // -----------------------------------------------------------------
      await expect(page).toHaveURL(/\/sales\/products$/);
      await expect(page.getByRole('heading', { name: SIGN_IN_TITLE })).not.toBeVisible();

      const authAfter = await readAuthModel(page);
      expect(authAfter?.authToken, 'la sesión offline debe sobrevivir al hard refresh').toBe(
        'offline-session'
      );
    } finally {
      // Restaurar el script original: el próximo test (offline-shell u otro
      // run) debe registrar el SW real, no la "v2" sintética.
      writeFileSync(swFile, originalSw);
    }
  });
});
