import type { Page } from '@playwright/test';
import { test, expect } from './support/test';
import { LoginPage } from './support/login-page';
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
 * SIN BACKEND Y SIN FILAS EN LA BD, igual que `login-offline.spec.ts` y
 * `offline-access-panel.spec.ts`: el roster es sintético (`plantRoster`), el
 * login toma siempre la rama offline, y no se registra ningún usuario. Ojo
 * igual con `globalTeardown` (`playwright.config.ts`), que SIEMPRE se conecta a
 * Postgres al final de la corrida — eso es de la config, no de este spec.
 *
 * Copias literales del castellano tomadas de
 * `apps/web-store-pos/app/shared/lib/i18n/es.ts` — nunca importadas: el
 * navegador es la caja negra bajo prueba, el source de la app no (misma
 * política que `login.spec.ts:14-17`, `login-offline.spec.ts:30-33` y
 * `offline-access-panel.spec.ts:31-34`).
 *
 * ------------------------------------------------------------------------
 * POR QUÉ TODOS LOS ROSTERS DE ESTE ARCHIVO LLEVAN `wrap: 'kat'`
 * ------------------------------------------------------------------------
 * `isEncryptionProvisioned()` (roster-store.ts:158-161) exige
 * `formatVersion >= 2` Y al menos un `wrappedDek`. Un roster v1 (el default de
 * `plantRoster`) NO provisiona cifrado: las entidades se guardan en texto
 * plano y ninguna aserción sobre `enc:v1:` podría pasar. Todo este spec habla
 * de bytes cifrados, así que todo roster acá lleva el vector KAT
 * (`docs/contracts/offline-roster-dek-kat.json`), que es además el único wrap
 * que abre con `KAT_PASSWORD`.
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
