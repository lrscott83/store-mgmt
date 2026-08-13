import type { Page } from '@playwright/test';
import { test, expect } from './support/test';
import { LoginPage } from './support/login-page';
import { buildRosterBundle, KAT_PASSWORD, ROSTER_STORAGE_KEY } from './support/roster-fixture';
import { serializeRoster } from '../apps/web-store-pos/app/shared/lib/offline/roster-serializer';

/**
 * Activación y desactivación del acceso sin conexión DESDE la pantalla de
 * login (`auth/components/offline-access-panel.tsx` +
 * `auth/components/import-roster-modal.tsx`).
 *
 * Qué lo diferencia de `login-offline.spec.ts`: ese spec siembra el roster
 * escribiendo directo a `localStorage` (`plantRoster()`, que su propio
 * comentario describe como "never `importRoster()`, never the
 * `provision.tsx` round-trip"). Este es el PRIMER spec que recorre el
 * round-trip real: el archivo exportado entra por el `<input type="file">`
 * del diálogo, `importRosterFile` lo desencripta, y recién ahí el dispositivo
 * queda aprovisionado. `plantRoster()` no se usa acá justamente porque
 * saltearía la UI que este spec existe para probar.
 *
 * SIN BACKEND Y SIN FILAS EN LA BD. Igual que `login-offline.spec.ts`, este
 * spec no necesita `dotnet run` en otra terminal: el roster es sintético
 * (`buildRosterBundle`), el login toma la rama offline, y no se registra
 * ningún usuario. Todo lo que siembra vive en el `localStorage` del contexto
 * efímero de Playwright, que muere con el test — no hay nada que limpiar en
 * `smca` ni en `smca_test` (trampa documentada en `e2e/README.md:81-97`: el
 * backend de dev escribe en `smca`). Ojo igual: `globalTeardown`
 * (`playwright.config.ts:73`) SIEMPRE se conecta a Postgres al final de la
 * corrida y falla ruidoso si no puede — eso es de la config, no de este spec.
 *
 * Copias literales del castellano tomadas de
 * `apps/web-store-pos/app/shared/lib/i18n/es.ts` — nunca importadas: el
 * navegador es la caja negra bajo prueba, el source de la app no (misma
 * política que `login.spec.ts:14-17` y `login-offline.spec.ts:30-33`).
 */

const ENABLE_BUTTON = 'Activar acceso sin conexión'; // es.ts:119 (OFFLINE_ACCESS.ENABLE_BUTTON)
const DISABLE_BUTTON = 'Desactivar acceso sin conexión'; // es.ts:120
const MODAL_TITLE = 'Activar acceso sin conexión'; // es.ts:112 (mismo texto que el botón, a propósito)
const FILE_LABEL = 'Archivo de activación'; // es.ts:115
const PASSWORD_LABEL = 'Contraseña de activación'; // es.ts:116
const MODAL_SUBMIT = 'Activar'; // es.ts:117
const MODAL_CANCEL = 'Cancelar'; // es.ts:7 (GENERAL.CANCEL)
const DISABLE_TITLE = '¿Desactivar el acceso sin conexión?'; // es.ts:123
const DISABLE_CONFIRM = 'Sí, desactivar'; // es.ts:128

/** Los cinco fallos que `rosterImportErrorMessageId` puede mostrar dentro del
 * diálogo (`roster-import.ts:63-78` -> es.ts:105-110). Solo se leen para
 * DIAGNOSTICAR un fallo: si el diálogo no cierra, decir cuál de los cinco
 * apareció convierte un timeout mudo en una causa nombrada. */
const IMPORT_ERROR_TEXTS = [
  'La contraseña de activación es incorrecta.', // es.ts:105 WRONG_PASSWORD
  'El archivo está dañado o no tiene un formato válido.', // es.ts:106 CORRUPT_FILE
  'Este archivo de activación ya venció. Pedile uno nuevo al administrador.', // es.ts:107 EXPIRED
  'Este archivo ya se usó en este equipo. Pedile uno nuevo al administrador.', // es.ts:108 REPLAY
  'No pudimos reconocer el archivo. Usalo tal como te lo pasaron, sin cambiarle el nombre.', // es.ts:109 UNKNOWN_FILE
];

/**
 * La contraseña del ARCHIVO, distinta a propósito de la del usuario
 * (`KAT_PASSWORD`, la que verifica el verifier del roster). El diálogo pide
 * la del archivo — `serializeRoster` deriva la clave del zip como
 * `${master}${storeId}` (roster-serializer.ts:43-48), nada que ver con la
 * contraseña de login. Usar dos valores distintos es lo que hace que este
 * test lo demuestre en vez de asumirlo: si el diálogo estuviera pidiendo la
 * contraseña equivocada, con una sola constante compartida pasaría igual.
 */
const ACTIVATION_MASTER_PASSWORD = 'ActivacionE2E123';

/** El shape de nombre que `deriveStoreIdFromFilename` exige
 * (`roster-import.ts:14-15`): GUID, o `UnknownFileError`. Verificado en Node
 * ANTES de adjuntar nada — un id que no matchee produce "No pudimos reconocer
 * el archivo..." en la UI, un fallo que se lee como bug de la app y no lo es. */
const GUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Un login de roster único por corrida. No se registra nada real (el roster
 * es sintético), así que solo necesita evitar colisiones dentro de la misma
 * corrida — mismo criterio que `login-offline.spec.ts:49-51`. */
function uniqueLogin(prefix: string): string {
  return `e2e-offline-panel-${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

interface ActivationFile {
  name: string;
  buffer: Buffer;
  bundleId: string;
  storeId: string;
}

/**
 * Produce el archivo de activación EXACTAMENTE como lo produce la exportación
 * real: `serializeRoster` (el mismo módulo que usa
 * `management/users/components/roster-export-panel.tsx`) sobre un bundle
 * genuino de `buildRosterBundle`, y el nombre `roster-<storeId>.smcabundle`
 * del que el diálogo recupera el storeId (design D1) — nunca un zip armado a
 * mano.
 *
 * `serializeRoster` corre acá en Node, no en el navegador: necesita `Blob`,
 * `crypto` y Web Streams globales (Node >= 18). Si el runtime no los tuviera,
 * el `catch` lo dice con esas palabras en vez de dejar un stack de zip.js
 * indescifrable.
 */
async function buildActivationFile(login: string): Promise<ActivationFile> {
  const bundle = await buildRosterBundle({ users: [{ login, wrap: 'kat' }] });

  if (!GUID_PATTERN.test(bundle.storeId)) {
    throw new Error(
      `El storeId del bundle ('${bundle.storeId}') no tiene forma de GUID, así que el nombre ` +
        '`roster-<storeId>.smcabundle` no va a matchear ROSTER_FILENAME_PATTERN ' +
        '(roster-import.ts:14-15) y el diálogo va a responder UnknownFileError ("No pudimos ' +
        'reconocer el archivo..."). Eso sería un problema de ESTE fixture, no de la app.'
    );
  }

  let bytes: Uint8Array;
  try {
    bytes = await serializeRoster(
      // El bundle del fixture declara `roles: unknown[]` a propósito
      // (roster-fixture.ts:6-12 refleja el shape a mano en vez de importar
      // `roster-types.ts`); `OfflineRosterBundle` lo tipa como
      // `StoreModuleFeatures[]`. `serializeRoster` solo hace
      // `JSON.stringify(bundle)`, así que el cast no oculta ningún riesgo real.
      bundle as unknown as Parameters<typeof serializeRoster>[0],
      ACTIVATION_MASTER_PASSWORD,
      bundle.storeId
    );
  } catch (cause) {
    throw new Error(
      'serializeRoster falló en Node al armar el archivo de activación: ' +
        `${cause instanceof Error ? cause.message : String(cause)}. zip.js necesita Blob, ` +
        'crypto y Web Streams globales (Node >= 18) — si tu runtime no los expone, el problema ' +
        'es el entorno, no la app.'
    );
  }

  return {
    name: `roster-${bundle.storeId}.smcabundle`,
    buffer: Buffer.from(bytes),
    bundleId: bundle.bundleId,
    storeId: bundle.storeId,
  };
}

/**
 * TRAMPA de locators, verificada en el copy: "Desactivar acceso sin conexión"
 * CONTIENE "activar acceso sin conexión" (Des-*activar*). El matcher de
 * `getByRole` es, por defecto, case-insensitive y por SUBSTRING, así que un
 * `{ name: ENABLE_BUTTON }` suelto matchea los dos botones y Playwright tira
 * strict-mode violation. `exact: true` no es cosmético acá — es lo único que
 * distingue activar de desactivar. (El test unitario del panel ya usaba
 * `/^activar acceso sin conexión$/i` por la misma razón.)
 */
function enableButton(page: Page) {
  return page.getByRole('button', { name: ENABLE_BUTTON, exact: true });
}

function disableButton(page: Page) {
  return page.getByRole('button', { name: DISABLE_BUTTON, exact: true });
}

/** El `<h3>` del diálogo. Mismo texto que el botón de activar (es.ts:112 vs
 * :119), así que el rol `heading` es lo que los separa. */
function modalTitle(page: Page) {
  return page.getByRole('heading', { name: MODAL_TITLE, exact: true });
}

/** Lee el bundle crudo del `localStorage` del dispositivo. `ROSTER_STORAGE_KEY`
 * es la MISMA clave que lee la app (`roster-store.ts:19`). */
async function readStoredRoster(page: Page): Promise<{ bundleId?: string } | null> {
  const raw = await page.evaluate(
    (key) => window.localStorage.getItem(key),
    ROSTER_STORAGE_KEY
  );
  if (raw === null) return null;
  return JSON.parse(raw) as { bundleId?: string };
}

/**
 * Espera a que el diálogo CIERRE, que es la única señal de que
 * `importRosterFile` no tiró. Si no cierra, el diálogo sigue abierto con su
 * `InfoBox` de error (import-roster-modal.tsx:53-58), así que este helper
 * busca cuál de los cinco mensajes conocidos está en pantalla y lo nombra.
 * Un timeout mudo acá se lee como "la app está rota"; casi siempre es el
 * nombre del archivo o la contraseña del zip.
 */
async function expectActivationAccepted(page: Page): Promise<void> {
  try {
    await expect(modalTitle(page)).toHaveCount(0, { timeout: 20_000 });
  } catch {
    const shown: string[] = [];
    for (const text of IMPORT_ERROR_TEXTS) {
      if ((await page.getByText(text, { exact: true }).count()) > 0) shown.push(text);
    }
    throw new Error(
      'El diálogo de activación no cerró tras enviar el archivo. ' +
        (shown.length > 0
          ? `Mensaje visible: "${shown.join('" | "')}". `
          : 'No hay ninguno de los cinco mensajes de error conocidos en pantalla. ') +
        'Recordá: "No pudimos reconocer el archivo..." significa que el NOMBRE del archivo no ' +
        'matchea `roster-<GUID>.smcabundle`, y "La contraseña de activación es incorrecta" ' +
        'significa que el master usado al serializar no coincide con el tipeado.'
    );
  }
}

test.describe('acceso sin conexión desde el login — activación y desactivación', () => {
  test('activa con el archivo exportado, entra sin red y después lo desactiva', async ({
    page,
    loginNetwork,
  }) => {
    const loginPage = new LoginPage(page);
    const login = uniqueLogin('arco');
    const activation = await buildActivationFile(login);

    // ---------------------------------------------------------------------
    // 1. Dispositivo sin roster: solo se ofrece activar.
    // ---------------------------------------------------------------------
    await loginPage.goto();

    // El panel resuelve su estado con un `import()` dinámico
    // (offline-access-panel.tsx:25-36) y NO renderiza nada hasta que resuelve
    // — por eso esta es una espera (`toBeVisible`), no una lectura inmediata.
    // Y por eso el `toHaveCount(0)` de abajo va DESPUÉS: recién con el botón
    // de activar en pantalla, "no hay botón de desactivar" significa algo.
    await expect(enableButton(page)).toBeVisible();
    await expect(disableButton(page)).toHaveCount(0);
    expect(await readStoredRoster(page)).toBeNull();

    // ---------------------------------------------------------------------
    // 2. El diálogo pide exactamente dos cosas: archivo y contraseña.
    // ---------------------------------------------------------------------
    await enableButton(page).click();

    await expect(modalTitle(page)).toBeVisible();
    // `exact: true` también acá: el párrafo introductorio (es.ts:113-114)
    // dice "...necesitás el archivo de activación y su contraseña...", que un
    // `getByText` por substring matchearía junto con el `<label>`.
    await expect(page.getByText(FILE_LABEL, { exact: true })).toBeVisible();
    await expect(page.getByText(PASSWORD_LABEL, { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: MODAL_SUBMIT, exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: MODAL_CANCEL, exact: true })).toBeVisible();
    // NO se pide identificador de tienda: el storeId sale del nombre del
    // archivo (design D1). Comparar contra el label de `/auth/provision`
    // (es.ts:100) es lo que hace verificable esa diferencia.
    await expect(page.getByText('Identificador de tienda', { exact: true })).toHaveCount(0);

    // ---------------------------------------------------------------------
    // 3. Adjuntar el archivo real, tipear la contraseña, enviar.
    // ---------------------------------------------------------------------
    // `FileInput` esconde el `<input type="file">` detrás de un botón
    // estilado (`className="hidden"`, file-input.tsx:53-62), así que un
    // enfoque por click NO lo alcanza: `setInputFiles` va contra el input
    // nativo, localizado por el `id` que el `<label htmlFor>` ya usa
    // (import-roster-modal.tsx:74-84) — sin agregar ningún `data-testid` a
    // producción.
    await page.locator('#offline-access-file').setInputFiles({
      name: activation.name,
      mimeType: 'application/octet-stream',
      buffer: activation.buffer,
    });
    await page.locator('#offline-access-password').fill(ACTIVATION_MASTER_PASSWORD);
    await page.getByRole('button', { name: MODAL_SUBMIT, exact: true }).click();

    await expectActivationAccepted(page);

    // El roster guardado es EL DEL ARCHIVO, no cualquier cosa: comparar el
    // `bundleId` es lo que separa "importó lo que le dimos" de "escribió algo".
    const stored = await readStoredRoster(page);
    expect(stored?.bundleId).toBe(activation.bundleId);

    // ---------------------------------------------------------------------
    // 4. El botón se dio vuelta.
    // ---------------------------------------------------------------------
    await expect(disableButton(page)).toBeVisible();
    await expect(enableButton(page)).toHaveCount(0);

    // ---------------------------------------------------------------------
    // 5. Entrar CON LA RED CORTADA — la prueba de que la importación habilitó
    //    autenticación offline de verdad, y no solo cambió una etiqueta.
    // ---------------------------------------------------------------------
    // TRAMPA (verificada, `login-offline.spec.ts:575-584`): el dev server de
    // Vite sirve los chunks de ruta como fetches HTTP bajo demanda. Cortar la
    // red ANTES de la primera navegación a una ruta que este contexto nunca
    // visitó deja ese fetch colgado para siempre. Así que primero se calienta
    // `/sales/products` con un submit CON red (que ya toma la rama offline —
    // `isRosterProvisioned()` es true desde el paso 3, login.tsx:110-111), y
    // recién después se repite sin red.
    await loginPage.fill({ login, password: KAT_PASSWORD });
    await loginPage.submit();
    await page.waitForURL(/\/sales\/products$/);

    await page.getByRole('button', { name: 'Menú de usuario' }).click();
    await page.getByRole('button', { name: 'Salir' }).click();
    await page.waitForURL(/\/login$/);

    // El corte va DESPUÉS de llenar el formulario y sin ninguna navegación
    // posterior (mismo orden que `login-offline.spec.ts:596-599`).
    await loginPage.fill({ login, password: KAT_PASSWORD });
    await page.context().setOffline(true);
    await loginPage.submit();
    await page.waitForURL(/\/sales\/products$/);

    // Cero `POST /v1/auth/login` en todo el test: la sesión salió del roster
    // importado por la UI, nunca del backend.
    loginNetwork.expectNoLoginAttempt();

    // Se restaura la red antes de la segunda mitad: la afirmación de REQ
    // offline ya está hecha, y seguir sin red solo agrega el riesgo de chunk
    // colgado descrito arriba a un flujo que no lo está probando.
    await page.context().setOffline(false);

    // ---------------------------------------------------------------------
    // 6. Volver al login y desactivar.
    // ---------------------------------------------------------------------
    // Hay que desloguear para volver a `/login`: con sesión activa el
    // `guestOnlyLoader` rebota a la home del usuario.
    await page.getByRole('button', { name: 'Menú de usuario' }).click();
    await page.getByRole('button', { name: 'Salir' }).click();
    await page.waitForURL(/\/login$/);

    // Precondición del paso: el roster SIGUE ahí (logout borra AUTH_MODEL, no
    // el roster). Sin pinear esto, "quedó en cero" después de desactivar no
    // distingue "lo borró la desactivación" de "nunca estuvo".
    await expect(disableButton(page)).toBeVisible();
    expect((await readStoredRoster(page))?.bundleId).toBe(activation.bundleId);

    await disableButton(page).click();

    // Confirmación de SweetAlert2 (`confirmDialog`, blocking-alert.ts:60-71).
    await expect(page.getByText(DISABLE_TITLE, { exact: true })).toBeVisible();
    await page.getByRole('button', { name: DISABLE_CONFIRM, exact: true }).click();

    await expect(enableButton(page)).toBeVisible();
    await expect(disableButton(page)).toHaveCount(0);
    // El toast de éxito (es.ts:122) se cierra solo a los 1000ms
    // (root.tsx:63 `autoClose={1000}`), así que la prueba dura de la
    // desactivación es el estado, no la notificación: el roster ya no está.
    expect(await readStoredRoster(page)).toBeNull();
  });
});
