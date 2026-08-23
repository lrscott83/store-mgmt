import type { Page } from '@playwright/test';
import { test, expect } from './support/test';
import { LoginPage } from './support/login-page';
import { RegisterPage } from './support/register-page';
import { newTestIdentity, type TestIdentity } from './support/identity';
import { readSelectedStoreId } from './support/session';
import { matchesPathSuffix } from './support/network-observer-core';
import { plantRoster, KAT_PASSWORD, ROSTER_STORAGE_KEY } from './support/roster-fixture';
import { seedCategoryAndProduct } from './support/store-seed';
import { readEntityBytes } from './support/entity-storage';

/**
 * Las cuatro reglas de negocio que motivaron `dek-independent-of-auth-mode`,
 * probadas de punta a punta:
 *
 *   1. El cifrado es independiente del modo de autenticación.
 *   2. Los datos NUNCA se borran — ni ante una lectura fallida, ni ante un
 *      desbloqueo fallido.
 *   3. Los datos siempre son recuperables — importando un roster nuevo, o
 *      autenticándose con conexión.
 *   4. Los fallos se anuncian; un dispositivo que no puede abrir sus propios
 *      datos no entra.
 *
 * El archivo tiene DOS bloques, y se diferencian justo en esto:
 *
 *   - `recuperación por roster, bytes intactos y rechazo del login`
 *     (E2E 1, 4, 5, 6) corre SIN BACKEND Y SIN FILAS EN LA BD, igual que
 *     `login-offline.spec.ts` y `offline-access-panel.spec.ts`: el roster es
 *     sintético (`plantRoster`), el login toma siempre la rama offline, y no
 *     se registra ningún usuario. Ojo igual con `globalTeardown`
 *     (`playwright.config.ts`), que SIEMPRE se conecta a Postgres al final de
 *     la corrida — eso es de la config, no de este spec.
 *
 *   - `el cifrado no depende del modo de autenticación (backend real)`
 *     (E2E 2 y E2E 3) corre CONTRA EL BACKEND REAL, a propósito y sin
 *     alternativa: prueba que un login ONLINE entrega la clave que el
 *     SERVIDOR derivó para esta tienda. Un roster sintético lleva la clave del
 *     vector KAT, que ningún servidor derivó nunca, así que construir estas
 *     dos pruebas sobre él no probaría nada de la regla 1 ni de la mitad
 *     online de la regla 3. Ver el comentario del bloque para el costo en
 *     logins y por qué el único roster que aparece ahí va SIN wrap.
 *
 * Copias literales del castellano tomadas de
 * `apps/web-store-pos/app/shared/lib/i18n/es.ts` — nunca importadas: el
 * navegador es la caja negra bajo prueba, el source de la app no (misma
 * política que `login.spec.ts:14-17`, `login-offline.spec.ts:30-33` y
 * `offline-access-panel.spec.ts:31-34`).
 *
 * ------------------------------------------------------------------------
 * POR QUÉ TODOS LOS ROSTERS DEL PRIMER BLOQUE LLEVAN `wrap: 'kat'`
 * ------------------------------------------------------------------------
 * `isEncryptionProvisioned()` (roster-store.ts:158-161) exige
 * `formatVersion >= 2` Y al menos un `wrappedDek`. Un roster v1 (el default de
 * `plantRoster`) NO provisiona cifrado POR SÍ SOLO: en un equipo que no tiene
 * otra fuente de clave, `encryptEntity` cae en su rama de texto plano
 * (entity-crypto.ts:74) y ninguna aserción sobre `enc:v1:` podría pasar. El
 * primer bloque arranca siempre de equipos así, con el roster como única
 * fuente, y por eso todo roster suyo lleva el vector KAT
 * (`docs/contracts/offline-roster-dek-kat.json`), que es además el único wrap
 * que abre con `KAT_PASSWORD`.
 *
 * El roster de E2E 3 es la excepción, y lo es por la MISMA regla leída al
 * revés: ahí el equipo ya tiene un wrap de dispositivo real (`getDek()` no es
 * null, así que `encryptEntity` ni llega a mirar el roster), y lo que el
 * roster tiene que hacer es exactamente nada respecto de la clave. Ver el
 * comentario de ese test.
 */

// -------------------------------------------------------------------------
// Copia castellana literal (es.ts)
// -------------------------------------------------------------------------
const INVALID_CREDENTIALS_TEXT = 'Usuario o contraseña inválidos'; // es.ts:82
const UNLOCK_FAILED_TEXT =
  'No se pudieron desbloquear los datos de este dispositivo. Si cambiaste tu contraseña, pedí una nueva activación.'; // es.ts:94-95
const DISABLE_BUTTON = 'Desactivar acceso sin conexión'; // es.ts:123 (OFFLINE_ACCESS.DISABLE_BUTTON)
const ENABLE_BUTTON = 'Activar acceso sin conexión'; // es.ts:122 (OFFLINE_ACCESS.ENABLE_BUTTON)
const DISABLE_TITLE = '¿Desactivar el acceso sin conexión?'; // es.ts:126
const DISABLE_CONFIRM = 'Sí, desactivar'; // es.ts:131
const KEY_UNAVAILABLE_TEXT =
  'No se pudo abrir la información de esta tienda. Inicie sesión con conexión o importe un roster para recuperarla.'; // es.ts:843-844

// -------------------------------------------------------------------------
// Literales de producción espejados (nunca importados), por la misma razón
// -------------------------------------------------------------------------
/** entity-crypto.ts:23 — marca de sobre en disco. Un valor guardado empieza
 * con esto SI Y SOLO SI `encryptEntity` corrió con un DEK no nulo. */
const ENTITY_ENVELOPE_PREFIX = 'enc:v1:';

/** device-dek-table.ts:16 (`DEVICE_DEK_KEY`) — la tabla de wraps de ESTE
 * dispositivo. Es la segunda fuente de clave, independiente del roster:
 * `clearRoster()` no la toca (offline-access-panel.tsx, `handleDisable`). */
const DEVICE_DEK_KEY = 'lizoft.device-dek';

/**
 * TRAMPA de locators verificada en el copy (misma que documenta
 * `offline-access-panel.spec.ts:144-152`): "Desactivar acceso sin conexión"
 * CONTIENE "activar acceso sin conexión". `getByRole` matchea por substring y
 * sin distinguir mayúsculas, así que `exact: true` es lo único que separa
 * activar de desactivar.
 */
function enableButton(page: Page) {
  return page.getByRole('button', { name: ENABLE_BUTTON, exact: true });
}

function disableButton(page: Page) {
  return page.getByRole('button', { name: DISABLE_BUTTON, exact: true });
}

/** Un login único por corrida. No se registra nada real (el roster es
 * sintético), así que solo necesita evitar colisiones dentro de la misma
 * corrida — mismo criterio que `login-offline.spec.ts:43-51`. */
function uniqueLogin(prefix: string): string {
  return `e2e-roster-recovery-${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Lee el bundle crudo del `localStorage`. `ROSTER_STORAGE_KEY` es la MISMA
 * clave que lee la app (`roster-store.ts:19`). Copia local a propósito: el
 * helper homónimo de `offline-access-panel.spec.ts:169` no está exportado y
 * ese archivo es intocable. */
async function readStoredRoster(page: Page): Promise<{ bundleId?: string } | null> {
  const raw = await page.evaluate((key) => window.localStorage.getItem(key), ROSTER_STORAGE_KEY);
  if (raw === null) return null;
  return JSON.parse(raw) as { bundleId?: string };
}

async function readDeviceDekTableRaw(page: Page): Promise<string | null> {
  return page.evaluate((key) => window.localStorage.getItem(key), DEVICE_DEK_KEY);
}

/**
 * Borra la tabla de wraps de dispositivo, afirmando ANTES que existía.
 *
 * Sin esta afirmación previa, "el dispositivo perdió su material de clave" no
 * se distingue de "el dispositivo nunca lo tuvo", y las dos pruebas que
 * dependen de esto (E2E 1: el roster nuevo es lo que recupera; E2E 6: no queda
 * ninguna fuente de clave) pasarían por el motivo equivocado.
 */
async function destroyDeviceKeyMaterial(page: Page): Promise<void> {
  const before = await readDeviceDekTableRaw(page);
  expect(
    before,
    `Precondición: se esperaba una tabla de wraps en localStorage['${DEVICE_DEK_KEY}'] ` +
      'creada por el login anterior (dek-provisioning.ts, paso 5). Si es null, el login no la ' +
      'escribió y borrarla no prueba nada.'
  ).not.toBeNull();

  await page.evaluate((key) => window.localStorage.removeItem(key), DEVICE_DEK_KEY);
  expect(await readDeviceDekTableRaw(page)).toBeNull();
}

/**
 * Polla (no lee una sola vez) hasta que la entidad esté presente Y con prefijo
 * `enc:v1:`. El `await` de `seedCategoryAndProduct` solo garantiza que el
 * último click se resolvió, que es un evento de UI, no que la escritura a
 * localStorage ya aterrizó — mismo razonamiento que
 * `login-offline.spec.ts:105-119`.
 */
async function expectEntityEncrypted(page: Page, entity: string, storeId: string): Promise<void> {
  await expect
    .poll(async () => {
      const raw = await readEntityBytes(page, entity, storeId);
      return raw?.startsWith(ENTITY_ENVELOPE_PREFIX) ?? false;
    })
    .toBe(true);
}

/**
 * Afirma que un nombre de producto se renderiza dentro del panel de su
 * categoría, expandiéndolo si está cerrado.
 *
 * `products.tsx` renderiza la lista solo bajo `{isExpanded && ...}` y
 * `expandedCategoryIds` arranca vacío en cada montaje, así que un
 * `getByText(name)` pelado no prueba nada sobre los datos guardados: puede
 * matchear el header de la categoría con la lista cerrada. Pasar por el panel
 * es lo que convierte esto en prueba de descifrado — la fila solo puede venir
 * de `decryptEntity` funcionando sobre la entidad de productos.
 *
 * Copia local del helper de `login-offline.spec.ts:161-196` (no exportado, y
 * ese archivo es intocable).
 */
async function expectProductVisibleInCategory(page: Page, name: string): Promise<void> {
  const panelToggle = page.locator('[data-testid^="category-panel-toggle-"]');
  if ((await panelToggle.getAttribute('aria-expanded')) !== 'true') {
    await panelToggle.click();
  }
  // Scopeado al panel expandido, NO a la página: `seedCategoryAndProduct`
  // nombra la categoría Y el producto con el MISMO string (store-seed.ts:33,44),
  // así que un `getByText` global viola el modo estricto de Playwright.
  const expandedPanel = page.locator('div:has(> [data-testid^="category-panel-toggle-"]) + div');
  await expect(expandedPanel.getByText(name)).toBeVisible();
}

async function signOut(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Menú de usuario' }).click();
  await page.getByRole('button', { name: 'Salir' }).click();
  await page.waitForURL(/\/login$/);
}

/**
 * Deja el dispositivo con datos cifrados y CERO fuentes de clave, sin tocar un
 * solo byte de esos datos: se va el roster (única fuente de wrap por
 * contraseña) y se va la tabla de wraps de dispositivo (única fuente
 * silenciosa). El DEK en memoria vive en un `let` de módulo
 * (`data-key-store.ts`), así que el `page.reload()` que hace el llamador lo
 * pierde solo.
 *
 * Esta combinación es la que hace que `needsUnlock()` devuelva FALSE
 * (unlock-gate.ts:18-31: sin DEK, sin `hasDeviceDekWrap()`, sin roster v2) y
 * por lo tanto que `authLoader` NO redirija a `/login?unlock=1`. Es la única
 * forma de que una ruta autenticada llegue a leer una entidad cifrada sin
 * clave — que es exactamente el fallo bajo prueba. Con la tabla de dispositivo
 * presente, el gate de desbloqueo se lleva al usuario antes y no hay lectura
 * fallida que observar.
 */
async function stripEveryKeySource(page: Page): Promise<void> {
  expect(
    await readStoredRoster(page),
    'Precondición: el roster tiene que estar presente antes de borrarlo.'
  ).not.toBeNull();
  await page.evaluate((key) => window.localStorage.removeItem(key), ROSTER_STORAGE_KEY);
  expect(await readStoredRoster(page)).toBeNull();

  await destroyDeviceKeyMaterial(page);
}

// -------------------------------------------------------------------------
// Helpers del SEGUNDO bloque (backend real)
// -------------------------------------------------------------------------

/** `POST .../v1/auth/login` — la misma constante que
 * `login-network-observer.ts:20`, copiada acá porque no está exportada. */
const LOGIN_PATH_SUFFIX = '/v1/auth/login';

/**
 * Cuenta los `POST .../v1/auth/login` que salieron de verdad.
 *
 * `loginNetwork.expectNoLoginAttempt()` no sirve en el segundo bloque: esos
 * tests SÍ hacen logins online reales, y lo que hay que afirmar no es "cero"
 * sino "exactamente estos y ni uno más". La afirmación importa: sin ella, "el
 * login del medio entró sin conexión" descansa en que `isRosterProvisioned()`
 * haya elegido la rama offline, que es precisamente lo que el test quiere
 * probar en vez de suponer.
 *
 * Se instala al principio del test, no en un fixture: `page.on('request')` solo
 * ve lo que ocurre después de engancharse, y estos tests navegan desde la
 * primera línea.
 */
function installLoginPostCounter(page: Page): () => number {
  let count = 0;
  page.on('request', (request) => {
    if (request.method() === 'POST' && matchesPathSuffix(request.url(), LOGIN_PATH_SUFFIX)) {
      count += 1;
    }
  });
  return () => count;
}

/**
 * Registro real + primer login ONLINE real contra el backend de la corrida.
 * Es el mismo camino que ya recorren `login.spec.ts` (test REQ-1) y el
 * fallback de `session.ts` (`mintOwnerAdmin`) — página de registro, aceptar
 * términos, enviar, y recién ahí el formulario de login.
 *
 * Cuesta 1 registro + 1 login del presupuesto por IP (ver el comentario del
 * bloque). Un usuario recién registrado queda como OwnerAdmin de su propia
 * tienda nueva y vacía, sin ningún otro paso de preparación.
 *
 * Aterriza en `/sales/products` y no en `/sales/new` porque la tienda es nueva
 * y todavía no tiene ningún producto vendible que haga que
 * `resolveUserHomePath` elija la pantalla de venta (user-home.ts:24-25).
 */
async function registerAndLoginOnline(page: Page): Promise<TestIdentity> {
  const identity = newTestIdentity();

  const registerPage = new RegisterPage(page);
  await registerPage.goto();
  await registerPage.fillValidForm(identity);
  await registerPage.acceptTerms.check();
  await registerPage.submit();
  await page.waitForURL(/\/login$/);

  const loginPage = new LoginPage(page);
  await loginPage.fill(identity);
  await loginPage.submit();
  await page.waitForURL(/\/sales\/products$/);

  return identity;
}

/**
 * Precondición compartida por los dos tests del bloque: el login ONLINE dejó
 * una tabla de wraps de dispositivo.
 *
 * Es la evidencia de que el backend mandó de verdad los campos
 * `wrappedDek`/`wrapSalt`/`wrapIv` y de que `resolveDekForLogin` los abrió: sin
 * ninguna clave que persistir, el paso 5 (dek-provisioning.ts:405-454) no
 * escribiría nada. Se afirma acá, temprano, para que un contrato de backend
 * roto se lea como lo que es y no como un fallo de descifrado tres pasos
 * después.
 */
async function expectDeviceKeyMaterialPresent(page: Page, when: string): Promise<void> {
  expect(
    await readDeviceDekTableRaw(page),
    `Precondición (${when}): se esperaba una tabla de wraps en ` +
      `localStorage['${DEVICE_DEK_KEY}']. Si es null, el login no resolvió ninguna clave — ` +
      'revisá que la respuesta de login traiga wrappedDek/wrapSalt/wrapIv no vacíos ' +
      '(LoginCommand.cs, TryBuildLoginDekWrapAsync).'
  ).not.toBeNull();
}

/**
 * Crea un producto más dentro de la ÚNICA categoría que ya existe, por la UI
 * real, con los mismos `data-testid` de producción que usa
 * `seedCategoryAndProduct` (store-seed.ts:40-46).
 *
 * Existe porque `seedCategoryAndProduct` crea SIEMPRE una categoría nueva, y su
 * `[data-testid^="category-actions-toggle-"]` sin scopear asume que hay
 * exactamente una en la tienda (store-seed.ts:36-40). Llamarlo dos veces en el
 * mismo store rompería en modo estricto de Playwright en el segundo llamado.
 * Mantener UNA sola categoría también es lo que deja usar
 * `expectProductVisibleInCategory` tal cual para los dos productos.
 */
async function seedProductInOnlyCategory(page: Page, name: string): Promise<void> {
  await page.locator('[data-testid^="category-actions-toggle-"]').click();
  await page.getByTestId('add-product-button').click();
  await page.getByTestId('product-name-input').fill(name);
  await page.getByTestId('product-price-input').fill('10');
  await page.getByTestId('create-product-submit').click();
}

test.describe('recuperación por roster, bytes intactos y rechazo del login', () => {
  /**
   * E2E 1 — REGLA 3 (los datos siempre son recuperables), mitad roster.
   *
   * El swap: se activa el acceso sin conexión, se crean datos, se DESACTIVA
   * desde la pantalla de login (botón + confirmación de SweetAlert, la UI real
   * de `offline-access-panel.tsx`), se importa un roster NUEVO para la misma
   * tienda y se vuelve a entrar. Los datos siguen ahí.
   *
   * Dos precondiciones pineadas antes de importar el segundo roster, cada una
   * cerrando una lectura falsa distinta del resultado:
   *   - el primer roster REALMENTE se fue (`readStoredRoster` -> null). Sin
   *     esto, "entró y vio el producto" no distingue recuperación de "el
   *     roster nunca se borró".
   *   - la tabla de wraps de dispositivo TAMBIÉN se fue. `clearRoster()` no la
   *     toca (offline-access-panel.tsx, `handleDisable`), así que sin borrarla
   *     el DEK vuelve solo por `bootstrapDeviceDek()` y el segundo roster no
   *     recupera nada: el test pasaría sin que el roster hiciera absolutamente
   *     nada. Borrarla es lo que convierte al roster en la ÚNICA vía de vuelta.
   */
  test('E2E 1: importar un roster nuevo para la misma tienda recupera los datos que quedaron en el equipo', async ({
    page,
    loginNetwork,
  }) => {
    const loginPage = new LoginPage(page);
    const login = uniqueLogin('e1');

    await loginPage.goto();
    const first = await plantRoster(page, { users: [{ login, wrap: 'kat' }] });
    await loginPage.fill({ login, password: KAT_PASSWORD });
    await loginPage.submit();
    await page.waitForURL(/\/sales\/products$/);

    const name = `E2E Roster Swap ${login}`;
    await seedCategoryAndProduct(page, name);
    await expectProductVisibleInCategory(page, name);
    await expectEntityEncrypted(page, 'products', first.storeId);

    // Los bytes que tienen que sobrevivir a todo lo que sigue.
    const productsBefore = await readEntityBytes(page, 'products', first.storeId);
    const categoriesBefore = await readEntityBytes(page, 'product-categories', first.storeId);

    await signOut(page);

    // Precondición del paso: el logout borra AUTH_MODEL, no el roster.
    await expect(disableButton(page)).toBeVisible();
    expect((await readStoredRoster(page))?.bundleId).toBe(first.bundleId);

    // Desactivación por la UI real: botón + confirmación de SweetAlert2
    // (`confirmDialog`, blocking-alert.ts). El título y el botón de confirmar
    // son los mismos con o sin la variante DISABLE_MESSAGE_DATA_LOSS del
    // mensaje (es.ts:127-130), así que estas dos aserciones no dependen de
    // cuál de los dos textos eligió el panel.
    await disableButton(page).click();
    await expect(page.getByText(DISABLE_TITLE, { exact: true })).toBeVisible();
    await page.getByRole('button', { name: DISABLE_CONFIRM, exact: true }).click();

    await expect(enableButton(page)).toBeVisible();
    expect(await readStoredRoster(page)).toBeNull();

    // Y ahora sí, el equipo queda sin ninguna fuente de clave.
    await destroyDeviceKeyMaterial(page);

    // REGLA 2, de paso: desactivar el acceso sin conexión NO borró un byte de
    // los datos. Quedaron ilegibles (que es justo lo que avisa
    // OFFLINE_ACCESS.DISABLE_MESSAGE_DATA_LOSS), no borrados.
    expect(await readEntityBytes(page, 'products', first.storeId)).toBe(productsBefore);
    expect(await readEntityBytes(page, 'product-categories', first.storeId)).toBe(
      categoriesBefore
    );

    // El roster NUEVO: otro bundle (otro `bundleId`), misma tienda, mismo
    // usuario, y el mismo wrap KAT — es decir, la misma clave que el servidor
    // deriva para esta tienda. Eso es lo que hace que los datos vuelvan a
    // abrirse: no se "restauran", se vuelven legibles.
    const second = await plantRoster(page, { users: [{ login, wrap: 'kat' }] });
    expect(second.bundleId).not.toBe(first.bundleId);
    expect(second.storeId).toBe(first.storeId);

    await loginPage.fill({ login, password: KAT_PASSWORD });
    await loginPage.submit();

    // NO `/sales/products`: la tienda ya tiene un producto vendible, así que
    // `resolveUserHomePath` (user-home.ts:24-25) resuelve a la pantalla de
    // venta — y aterrizar ahí ya es evidencia de que el DEK volvió, porque esa
    // rama llama a `hasAnyAvailableToSaleProduct()`, que tiene que DESCIFRAR
    // la entidad de productos para contestar. Mismo razonamiento que
    // `login-offline.spec.ts` F4 (:537-543).
    await page.waitForURL(/\/sales\/new$/);

    // Precondición del `goto` de abajo: el login volvió a dejar una tabla de
    // wraps de dispositivo, así que un documento nuevo puede recuperar el DEK
    // con `bootstrapDeviceDek()`. Sin esto, un `/login?unlock=1` inesperado se
    // leería como "los datos no volvieron" cuando en realidad sería otra cosa.
    expect(await readDeviceDekTableRaw(page)).not.toBeNull();

    await page.goto('/sales/products');
    await page.waitForURL(/\/sales\/products$/);
    await expectProductVisibleInCategory(page, name);

    // Cero `POST /v1/auth/login` en todo el test: las dos sesiones salieron
    // del roster, nunca del backend (regla 1 — el cifrado no depende del modo
    // de autenticación).
    loginNetwork.expectNoLoginAttempt();
  });

  /**
   * E2E 4 — REGLA 2 (los datos NUNCA se borran), y la única aserción del spec
   * que la prueba de verdad.
   *
   * Se compara el STRING crudo de localStorage, nunca "el producto se sigue
   * viendo": el bug que esto pinea escribía un valor vacío ENCIMA de la
   * entidad ilegible (`fac5cfcd`), y una pantalla vacía después de una lectura
   * fallida se ve igual con o sin ese sobreescrito.
   *
   * DESVIACIÓN DECLARADA respecto del código del brief (task-6-brief.md,
   * paso 1), por tres motivos verificados en el source, no por gusto:
   *   1. El brief planta un roster v1 (`{ users: [{ login }] }`). Un roster v1
   *      no provisiona cifrado (roster-store.ts:158-161), así que su propia
   *      precondición `before.startsWith('enc:v1:')` no puede pasar.
   *   2. Con el mint local eliminado (`0ab67b37`), un login offline contra un
   *      roster v1 en un equipo sin tabla de wraps ya ni siquiera entra:
   *      `resolveDekForLogin` tira `DekUnwrapError` (dek-provisioning.ts:165-172).
   *   3. El disparador del brief (salir y hacer `goto('/sales/products')`) NO
   *      fuerza ninguna lectura: el logout borra AUTH_MODEL, así que
   *      `authLoader` deniega y redirige a `/login` (loaders.ts:44-48) antes de
   *      que la ruta monte. Los bytes quedarían iguales porque nadie los leyó
   *      — un test que no distingue "se preservaron" de "no pasó nada".
   *
   * El disparador real está en `stripEveryKeySource` + `reload`, y el fallo se
   * pinea ANTES de comparar bytes: si el diálogo no aparece, no hubo lectura
   * fallida y la comparación no probaría nada.
   */
  test('E2E 4: un fallo de descifrado no toca un solo byte de lo guardado', async ({
    page,
    loginNetwork,
  }) => {
    const loginPage = new LoginPage(page);
    const login = uniqueLogin('e4');

    await loginPage.goto();
    const bundle = await plantRoster(page, { users: [{ login, wrap: 'kat' }] });
    await loginPage.fill({ login, password: KAT_PASSWORD });
    await loginPage.submit();
    await page.waitForURL(/\/sales\/products$/);

    await seedCategoryAndProduct(page, `E2E Bytes ${login}`);

    // La precondición, pineada: hay bytes guardados y están cifrados. Sin
    // esto, "los bytes no cambiaron" no distingue "se preservaron" de "nunca
    // hubo nada".
    await expectEntityEncrypted(page, 'products', bundle.storeId);
    await expectEntityEncrypted(page, 'product-categories', bundle.storeId);
    const productsBefore = await readEntityBytes(page, 'products', bundle.storeId);
    const categoriesBefore = await readEntityBytes(page, 'product-categories', bundle.storeId);

    await stripEveryKeySource(page);
    await page.reload();

    // Segunda precondición: el fallo OCURRIÓ. `/sales/products` carga sus
    // categorías con `void loadData()` (products.tsx:87-91, deliberadamente
    // sin guarda), la lectura tira `MissingDataKeyError`, y la política
    // app-wide (decryption-failure-policy.ts) lo anuncia una sola vez y cierra
    // la sesión.
    await expect(page.getByText(KEY_UNAVAILABLE_TEXT)).toBeVisible();
    await page.waitForURL(/\/login$/);

    // La afirmación del test. Comparación exacta de strings, sobre las DOS
    // entidades: `product-categories` es la que la lectura fallida alcanza de
    // verdad (es la primera de `loadData`), y `products` es la que el bug
    // original vaciaba desde el propio repositorio de productos.
    expect(await readEntityBytes(page, 'product-categories', bundle.storeId)).toBe(
      categoriesBefore
    );
    expect(await readEntityBytes(page, 'products', bundle.storeId)).toBe(productsBefore);

    loginNetwork.expectNoLoginAttempt();
  });

  /**
   * E2E 5 — REGLA 4 (los fallos se anuncian), con la sesión abierta.
   *
   * Mismo disparador que E2E 4; lo que se afirma acá es lo que el usuario ve y
   * dónde queda. `ENCRYPTION.KEY_UNAVAILABLE` es la copia recuperable — nombra
   * las DOS vías de vuelta (entrar con conexión, o importar un roster), que son
   * exactamente las dos que E2E 1 y el modelo de claves garantizan. Es una
   * copia distinta de `AUTH.UNLOCK_FAILED` (la del banner offline del login,
   * pineada por `login-offline.spec.ts` T7) y se afirma acá por primera vez.
   */
  test('E2E 5: un fallo de descifrado con la sesión abierta se anuncia y termina la sesión en /login', async ({
    page,
  }) => {
    const loginPage = new LoginPage(page);
    const login = uniqueLogin('e5');

    await loginPage.goto();
    const bundle = await plantRoster(page, { users: [{ login, wrap: 'kat' }] });
    await loginPage.fill({ login, password: KAT_PASSWORD });
    await loginPage.submit();
    await page.waitForURL(/\/sales\/products$/);

    await seedCategoryAndProduct(page, `E2E Aviso ${login}`);
    // Precondición: hay datos cifrados que abrir. Sin bytes `enc:v1:` no hay
    // nada que falle al leer, y el silencio posterior sería correcto en vez de
    // ser el bug.
    await expectEntityEncrypted(page, 'product-categories', bundle.storeId);

    await stripEveryKeySource(page);
    await page.reload();

    await expect(page.getByText(KEY_UNAVAILABLE_TEXT)).toBeVisible();
    // La sesión termina donde viven las dos vías de recuperación que el propio
    // mensaje nombra (decryption-failure-policy.ts:61-86: anunciar y desloguear).
    await page.waitForURL(/\/login$/);
    await expect(page).toHaveURL(/\/login$/);
  });

  /**
   * E2E 6 — REGLA 4 (un equipo que no puede abrir sus datos no entra).
   *
   * Es la rama nueva de `fb40366d`/`0ab67b37`: antes, un equipo sin ninguna
   * fuente de clave se inventaba una (mint local) y entraba tan contento,
   * escribiendo desde ese momento datos que ni el roster ni un login online
   * podían recuperar jamás. Ahora se rechaza. Rechazar no destruye nada;
   * inventar destruía en silencio — de ahí la tercera aserción sobre los bytes.
   *
   * El estado se construye con una CONTRASEÑA CORRECTA a propósito: el
   * verifier del roster pasa, y recién después falla la resolución del DEK. Un
   * rechazo con contraseña equivocada no probaría nada, porque el login habría
   * fallado igual con o sin este cambio. Por eso además se afirma que el
   * mensaje de credenciales inválidas NO está en pantalla.
   *
   * SOBRE LA COPIA: la rama offline de `login.tsx` mapea TODO `DekUnwrapError`
   * a `AUTH.UNLOCK_FAILED` (login.tsx:58-60); `ENCRYPTION.KEY_UNAVAILABLE` solo
   * es alcanzable desde la rama ONLINE (login.tsx:179-181), que exige un
   * backend real y un usuario registrado. Esto NO duplica la cobertura de T7:
   * T7 planta un wrap ADULTERADO (hay material de clave, y está roto); acá no
   * hay material de clave de ninguna clase, que es el dead-end D2 que este
   * cambio introdujo. Mismo texto, disparador distinto y rama de producción
   * distinta. La copia `ENCRYPTION.KEY_UNAVAILABLE` queda pineada por E2E 5.
   */
  test('E2E 6: un equipo sin ninguna fuente de clave es rechazado, se queda en /login y conserva los bytes', async ({
    page,
    loginNetwork,
  }) => {
    const loginPage = new LoginPage(page);
    const login = uniqueLogin('e6');

    await loginPage.goto();
    const bundle = await plantRoster(page, { users: [{ login, wrap: 'kat' }] });
    await loginPage.fill({ login, password: KAT_PASSWORD });
    await loginPage.submit();
    await page.waitForURL(/\/sales\/products$/);

    await seedCategoryAndProduct(page, `E2E Rechazo ${login}`);
    await expectEntityEncrypted(page, 'products', bundle.storeId);

    await signOut(page);

    const productsBefore = await readEntityBytes(page, 'products', bundle.storeId);
    const categoriesBefore = await readEntityBytes(page, 'product-categories', bundle.storeId);

    // Se va la tabla de wraps de dispositivo...
    await destroyDeviceKeyMaterial(page);
    // ...y el roster v2 se reemplaza por uno v1 para la MISMA tienda y el
    // MISMO usuario: un archivo de activación viejo, sin wrap. El equipo sigue
    // aprovisionado para autenticar sin conexión (el login toma la rama
    // offline, cero HTTP) pero ya no tiene de dónde sacar la clave. Es el caso
    // que el comentario de `auth-store.ts:360-362` describe palabra por
    // palabra: "un roster v1 no lleva wrap, así que un login offline contra él
    // ahora requiere un equipo que este login ya haya aprovisionado".
    const downgraded = await plantRoster(page, { users: [{ login }] });
    expect(downgraded.storeId).toBe(bundle.storeId);
    expect(downgraded.formatVersion).toBe(1);

    await loginPage.fill({ login, password: KAT_PASSWORD });
    await loginPage.submit();

    await expect(page.getByText(UNLOCK_FAILED_TEXT)).toBeVisible();
    // No es un "usuario o contraseña inválidos": la contraseña ES la correcta,
    // el verifier la aceptó, y lo que falta es la clave de datos.
    await expect(page.getByText(INVALID_CREDENTIALS_TEXT)).not.toBeVisible();
    await expect(page).toHaveURL(/\/login$/);

    // Y el rechazo no tocó un byte.
    expect(await readEntityBytes(page, 'products', bundle.storeId)).toBe(productsBefore);
    expect(await readEntityBytes(page, 'product-categories', bundle.storeId)).toBe(
      categoriesBefore
    );

    loginNetwork.expectNoLoginAttempt();
  });
});

/**
 * ==========================================================================
 * SEGUNDO BLOQUE — CONTRA EL BACKEND REAL
 * ==========================================================================
 *
 * E2E 2 prueba la mitad ONLINE de la REGLA 3 (los datos siempre son
 * recuperables); E2E 3 prueba la REGLA 1 entera (el cifrado es independiente
 * del modo de autenticación) él solo.
 *
 * POR QUÉ NO ALCANZA UN ROSTER SINTÉTICO
 * --------------------------------------
 * El primer bloque nunca toca el backend porque no lo necesita: prueba
 * afirmaciones sobre bytes y sobre rechazos, y para eso el vector KAT sirve
 * igual. Acá la afirmación es otra: que la clave que entrega un login ONLINE
 * es la que el SERVIDOR derivó para esta tienda
 * (`StoreDataKeyProvider.GetDek` = `HKDF(masterSecret, storeId)`, envuelta por
 * `LoginCommand.TryBuildLoginDekWrapAsync`). El vector KAT es un valor fijo de
 * `docs/contracts/offline-roster-dek-kat.json`; ningún servidor lo derivó
 * nunca para ninguna tienda. Una prueba de recuperación montada sobre él
 * probaría que dos copias del mismo literal coinciden, que es cierto y no
 * dice nada.
 *
 * Por eso acá TODO el material de clave tiene una sola procedencia, y es la
 * real: respuesta de un login online real -> wrap de dispositivo -> recuperado
 * en un login posterior. En ningún punto de la cadena entra un byte de clave
 * sintético.
 *
 * COSTO Y PRESUPUESTO (leer antes de agregar un test acá)
 * -------------------------------------------------------
 * Este bloque gasta 2 registros y 4 `POST /v1/auth/login` REALES. Los límites
 * son por IP (`RateLimitPolicies.cs:15-34`): login 5 por minuto (ventana
 * deslizante de 3 segmentos), registro 10 cada 10 minutos. `login.spec.ts` ya
 * gasta 4 logins por corrida, y con `fullyParallel: true` los tests de un
 * mismo archivo también corren en paralelo entre sí — de ahí el
 * `mode: 'serial'` de abajo, que al menos evita que estos dos disparen sus
 * cuatro logins a la vez. NO es una garantía de que la corrida completa entre
 * en el presupuesto: es un riesgo declarado (ver el informe de la tarea).
 * Un 429 se manifiesta como `LoginRateLimitError` y NO es un defecto de la
 * app.
 */
test.describe('el cifrado no depende del modo de autenticación (backend real) @rate-limit', () => {
  // Serial y con presupuesto amplio, por el mismo criterio que
  // `login.spec.ts:96-105`: cada test acá paga un registro completo, DOS
  // logins reales y dos siembras por la UI antes de su última aserción. No se
  // parten en tests más chicos justamente porque partirlos gastaría más
  // logins, que es el recurso escaso.
  //
  // Tagged @rate-limit: these two tests do 2 real logins each (4 total)
  // and run serially — separate from the default suite to avoid exceeding
  // LoginPolicy's ceiling of 15/min under parallel load. Run with
  // `pnpm test:e2e:rate-limit` or `--grep @rate-limit`.

  /**
   * E2E 2 — REGLA 3 (los datos siempre son recuperables), mitad ONLINE.
   *
   * SIN ROSTER EN NINGÚN MOMENTO. Es la diferencia con E2E 1 y lo que hace
   * que esta prueba sea sobre la otra vía de vuelta: se registra un usuario
   * real, entra con conexión, escribe datos, sale, se le destruye a mano todo
   * el material de clave del equipo, y vuelve a entrar con conexión. Cuando
   * vuelve, lo único que queda para abrir esos bytes es la clave que trae la
   * respuesta del login (dek-provisioning.ts:265-295, la rama "no hay tabla en
   * este equipo").
   *
   * Las precondiciones pineadas, cada una cerrando una lectura falsa del
   * resultado:
   *   - el primer login dejó una tabla de wraps (`expectDeviceKeyMaterialPresent`):
   *     si el backend no mandó el wrap, no hay nada que destruir después y el
   *     test estaría probando otra cosa.
   *   - los bytes guardados son `enc:v1:` ANTES de destruir nada: sin esto,
   *     "volvió a ver el producto" no distingue descifrado de texto plano que
   *     nunca se cifró.
   *   - NO hay roster (`readStoredRoster` -> null): es la afirmación de que la
   *     recuperación no puede venir de ahí, porque no hay ahí.
   *   - `destroyDeviceKeyMaterial` afirma por su cuenta que la tabla existía
   *     antes de borrarla.
   *
   * OJO con lo que NO se destruye: la mitad de la clave de dispositivo que
   * vive en IndexedDB (`device-key-store.ts`) sigue ahí, porque es una
   * `CryptoKey` no extraíble y ningún fixture puede tocarla (session.ts:129-146
   * documenta el mismo límite). No importa para esta prueba: sin la mitad de
   * `localStorage`, `readDeviceDekTable()` devuelve null y
   * `bootstrapDeviceDek()` no tiene qué desenvolver
   * (dek-bootstrap.ts:69-70) — la clave de dispositivo sola no abre nada.
   */
  test('E2E 2: autenticarse con conexión recupera los datos de un equipo que perdió todo su material de clave', async ({
    page,
  }) => {
    const loginPosts = installLoginPostCounter(page);

    const identity = await registerAndLoginOnline(page);
    const storeId = await readSelectedStoreId(page);
    await expectDeviceKeyMaterialPresent(page, 'después del primer login online');

    const name = `E2E Online Recovery ${identity.login}`;
    await seedCategoryAndProduct(page, name);
    await expectProductVisibleInCategory(page, name);
    await expectEntityEncrypted(page, 'products', storeId);
    await expectEntityEncrypted(page, 'product-categories', storeId);

    // Los bytes que tienen que sobrevivir a la destrucción de las claves.
    const productsBefore = await readEntityBytes(page, 'products', storeId);
    const categoriesBefore = await readEntityBytes(page, 'product-categories', storeId);

    await signOut(page);

    // La afirmación central del test, pineada antes de destruir nada: acá no
    // hay ningún roster que pueda explicar la recuperación de más abajo.
    expect(
      await readStoredRoster(page),
      'Precondición: este test no importa NINGÚN roster. Si hay uno, la recuperación de abajo ' +
        'podría venir de él y el test dejaría de probar la vía online.'
    ).toBeNull();

    // El equipo se olvida de todo. Después de esto no queda ninguna fuente
    // local de clave: ni tabla de wraps, ni roster, ni DEK en memoria (el
    // `logout` de `signOut` llama a `clearDek()`, auth-store.ts:411-421).
    await destroyDeviceKeyMaterial(page);

    // REGLA 2, de paso: perder las claves no borró un byte de los datos.
    expect(await readEntityBytes(page, 'products', storeId)).toBe(productsBefore);
    expect(await readEntityBytes(page, 'product-categories', storeId)).toBe(categoriesBefore);

    // Y ahora la vía de vuelta: el MISMO usuario real, con conexión.
    const loginPage = new LoginPage(page);
    await loginPage.fill(identity);
    await loginPage.submit();

    // NO `/sales/products`: la tienda ya tiene un producto vendible, así que
    // `resolveUserHomePath` (user-home.ts:24-25) resuelve a la pantalla de
    // venta. Aterrizar ahí ya es evidencia de que la clave volvió, porque esa
    // rama llama a `hasAnyAvailableToSaleProduct()`, que tiene que DESCIFRAR
    // la entidad de productos para contestar — mismo razonamiento que E2E 1.
    await page.waitForURL(/\/sales\/new$/);

    // Dos logins reales, ni uno más: el registro no cuenta como login y no
    // hubo ningún intento extra escondido.
    expect(loginPosts()).toBe(2);

    // Precondición del `goto` de abajo: el login volvió a dejar una tabla de
    // wraps, así que un documento nuevo puede recuperar el DEK con
    // `bootstrapDeviceDek()` sin volver a pedir contraseña.
    await expectDeviceKeyMaterialPresent(page, 'después del login online de recuperación');

    await page.goto('/sales/products');
    await page.waitForURL(/\/sales\/products$/);
    await expectProductVisibleInCategory(page, name);

    // NO se vuelve a comparar bytes acá, a propósito. La comparación que
    // importa ya se hizo arriba, en el único punto donde nada pudo haber
    // tocado el almacenamiento: entre destruir las claves y volver a entrar.
    // Repetirla después de una sesión normal afirmaría algo que este test no
    // reclama —que ninguna ruta de lectura reescribe nunca su entidad— y la
    // pondría a fallar por un motivo ajeno a la recuperación.
  });

  /**
   * E2E 3 — REGLA 1 (el cifrado es independiente del modo de autenticación).
   *
   * Ida y vuelta completa sobre UNA sola clave, la real:
   *   online (escribe) -> sin conexión (lee lo anterior y escribe más) ->
   *   online (lee las dos cosas).
   *
   * POR QUÉ EL ROSTER VA SIN WRAP, Y POR QUÉ ESO ES MÁS ESTRICTO
   * ------------------------------------------------------------
   * El roster acá cumple UNA función y solo una: hacer que
   * `isRosterProvisioned()` sea true para que `login.tsx:119-120` tome la rama
   * offline. Es lo que dice el contrato de `login-offline.spec.ts` y el spec
   * de modo offline: la rama la decide el ARCHIVO de roster, nunca la
   * conectividad.
   *
   * Si ese roster llevara `wrap: 'kat'`, `authenticateOffline`
   * (offline-auth-service.ts:127-133) pondría el DEK del vector KAT ANTES de
   * que `resolveDekForLogin` corra, y el paso 1 de éste
   * (`bootstrapDeviceDek`, dek-bootstrap.ts:68) hace `return` apenas ve
   * `getDek() !== null`. Resultado: la sesión offline quedaría con una clave
   * que no es la de la tienda, y los datos escritos online no abrirían. El
   * test fallaría, y por el motivo equivocado.
   *
   * Sin `wrap` (el default de `plantRoster`, roster-fixture.ts:239) el roster
   * no toca la clave en absoluto: `authenticateOffline` salta el desenvolvido
   * y deja el DEK en null, y `resolveDekForLogin` lo recupera del wrap de
   * dispositivo que dejó el login ONLINE. El roster sigue trayendo su verifier
   * (default `'valid'`), que es lo que verifica la contraseña sin conexión —
   * una preocupación genuinamente distinta de la clave de datos.
   *
   * El precio de esa elección es que el roster queda en `formatVersion: 1`, y
   * un roster v1 NO provisiona cifrado por sí solo. Acá no importa y se afirma
   * por qué: el equipo tiene wrap de dispositivo, así que `getDek()` no es
   * null y `encryptEntity` cifra en su PRIMERA rama, sin llegar nunca a mirar
   * el roster (entity-crypto.ts:64-77).
   *
   * EL `storeId` DEL ROSTER NO ES DECORATIVO
   * ---------------------------------------
   * `plantRoster` usa por defecto el `storeId` del KAT, que no es la tienda
   * real de este usuario. `authenticateOffline` copia `selectedStoreId` del
   * roster al `UserModel` (offline-auth-service.ts:74), y `products.tsx:42`
   * scopea TODA lectura por ese id. Con el default, la sesión offline miraría
   * las entidades de otra tienda — vacías — y el test fallaría sin que nada
   * estuviera roto. Por eso el roster se planta con el `storeId` REAL, leído
   * de `currentUser` con `readSelectedStoreId`.
   */
  test('E2E 3: lo escrito con conexión se lee sin conexión y lo escrito sin conexión se lee con conexión, con la misma clave', async ({
    page,
  }) => {
    const loginPosts = installLoginPostCounter(page);

    // --- Tramo 1: ONLINE, se crea el producto #1 ---------------------------
    const identity = await registerAndLoginOnline(page);
    const storeId = await readSelectedStoreId(page);
    await expectDeviceKeyMaterialPresent(page, 'después del primer login online');

    const onlineName = `E2E Online ${identity.login}`;
    await seedCategoryAndProduct(page, onlineName);
    await expectProductVisibleInCategory(page, onlineName);
    await expectEntityEncrypted(page, 'products', storeId);
    const productsAfterOnlineWrite = await readEntityBytes(page, 'products', storeId);

    await signOut(page);

    // --- Tramo 2: SIN CONEXIÓN, se lee el #1 y se crea el #2 ---------------
    const roster = await plantRoster(page, {
      storeId,
      users: [{ login: identity.login, password: identity.password }],
    });
    // Las tres propiedades del roster de las que depende el razonamiento de
    // arriba, afirmadas en vez de asumidas.
    expect(roster.storeId, 'el roster tiene que apuntar a la tienda REAL').toBe(storeId);
    expect(roster.users[0].wrappedDek, 'el roster NO puede traer clave').toBeUndefined();
    expect(roster.formatVersion, 'sin wrap, `plantRoster` produce un v1').toBe(1);

    const loginPage = new LoginPage(page);
    await loginPage.fill(identity);
    await loginPage.submit();
    // Misma lectura que en E2E 2: aterrizar en la pantalla de venta ya exige
    // haber descifrado la entidad de productos.
    await page.waitForURL(/\/sales\/new$/);

    // La afirmación que convierte a esto en un login SIN CONEXIÓN: el contador
    // sigue en 1, el del tramo anterior. Este login no le habló al servidor.
    expect(
      loginPosts(),
      'el login del medio tiene que salir por la rama offline: cero HTTP al backend'
    ).toBe(1);

    await expectDeviceKeyMaterialPresent(page, 'después del login sin conexión');
    await page.goto('/sales/products');
    await page.waitForURL(/\/sales\/products$/);

    // Regla 1, primera mitad: lo escrito CON conexión se lee SIN conexión.
    await expectProductVisibleInCategory(page, onlineName);

    const offlineName = `E2E Offline ${identity.login}`;
    await seedProductInOnlyCategory(page, offlineName);
    await expectProductVisibleInCategory(page, offlineName);

    // La escritura offline ocurrió de verdad Y salió cifrada, afirmado sobre
    // UNA MISMA lectura de los bytes. Que sea una sola lectura es el punto
    // entero de esta forma, no un detalle de estilo:
    //
    //   - `expectEntityEncrypted` acá sería un no-op. La entidad `products`
    //     lleva el prefijo `enc:v1:` desde la escritura ONLINE de más arriba,
    //     así que su predicado ya es verdadero antes de que la escritura
    //     offline aterrice: el poll puede volver en su primera lectura sin
    //     haber esperado nada.
    //   - Y un `not.toBe` posterior contra el snapshot online solo prueba que
    //     los bytes cambiaron, nunca que los bytes NUEVOS siguen cifrados.
    //
    // Encadenadas, dejaban abierto un falso positivo: si una regresión hiciera
    // que la escritura offline emitiera texto plano, y ese texto plano cayera
    // entre la primera lectura del poll y la comparación, el test pasaba en
    // verde sobre ciphertext viejo. Pidiendo las dos condiciones a la vez, la
    // única forma de satisfacerlas es que el valor almacenado EN ESE INSTANTE
    // sea distinto del de la escritura online Y empiece por el sobre — que es
    // exactamente la afirmación. De paso desaparece la carrera entre la
    // escritura a disco y el repintado del DOM que se esperó unas líneas antes.
    await expect
      .poll(async () => {
        const raw = await readEntityBytes(page, 'products', storeId);
        return {
          changed: raw !== productsAfterOnlineWrite,
          encrypted: raw?.startsWith(ENTITY_ENVELOPE_PREFIX) ?? false,
        };
      })
      .toEqual({ changed: true, encrypted: true });
    expect(loginPosts(), 'crear datos sin conexión tampoco habla con el backend').toBe(1);

    await signOut(page);

    // --- Tramo 3: ONLINE otra vez, se leen los DOS ------------------------
    // Se desactiva el acceso sin conexión por la UI real (mismo camino que
    // E2E 1: botón + confirmación de SweetAlert2). No es cosmético: mientras
    // el roster exista, `login.tsx:119-120` vuelve a elegir la rama offline y
    // el tramo 3 no sería un login online. La tabla de wraps de dispositivo
    // sobrevive a esto a propósito (`clearRoster()` no la toca), que es lo
    // correcto acá: lo que se prueba es la lectura cruzada entre modos, no
    // otra vez la recuperación de un equipo pelado — eso es E2E 2.
    //
    // La visibilidad se pinea antes de clickear (igual que E2E 1) porque el
    // panel arranca en `rosterState: 'unknown'` y no renderiza NINGÚN botón
    // hasta que su `useEffect` resuelve el import dinámico: si acá apareciera
    // el botón de ACTIVAR, el roster no se habría plantado y todo el tramo 2
    // habría sido otra cosa.
    await expect(disableButton(page)).toBeVisible();
    await disableButton(page).click();
    await expect(page.getByText(DISABLE_TITLE, { exact: true })).toBeVisible();
    await page.getByRole('button', { name: DISABLE_CONFIRM, exact: true }).click();
    await expect(enableButton(page)).toBeVisible();
    expect(await readStoredRoster(page)).toBeNull();

    await loginPage.fill(identity);
    await loginPage.submit();
    await page.waitForURL(/\/sales\/new$/);
    expect(loginPosts(), 'el tercer tramo SÍ es un login online real').toBe(2);

    await page.goto('/sales/products');
    await page.waitForURL(/\/sales\/products$/);

    // Regla 1, segunda mitad y cierre: con conexión se ven los DOS productos —
    // el que se escribió online y el que se escribió sin conexión. Una sola
    // cadena de clave, sin cortes, en los dos sentidos.
    await expectProductVisibleInCategory(page, onlineName);
    await expectProductVisibleInCategory(page, offlineName);
  });
});
