import { test, expect } from './support/test';

/**
 * [S2-03] Seguridad — un OwnerAdmin en `/management/stores/create` no puede
 * crear una tienda (`docs/testing/e2e-stage-1/S2-03.md` — revisado 2026-09-25,
 * autorización del usuario: cambio de spec Y de app).
 *
 * Comportamiento NUEVO de la app: un owner SIN el módulo MultiStores (14) que
 * entra a la URL de creación es redirigido a `/management/my-stores` por el
 * loader `ownerStoresGate` (loaders.ts) — SIN cerrar la sesión. Desde ahí no
 * puede crear nada (la creación vive en el modal que exige el módulo), así que
 * lo único que hay que probar es el aterrizaje en esa vista con la sesión
 * viva y cero requests de creación.
 *
 * El owner de la persona compartida se auto-registra SIN MultiStores (el
 * registro entrega los módulos del plan Pago, no el 14), así que el Test 1 es
 * exactamente el caso del gate.
 *
 * ESTRUCTURA (corregida 2026-09-25 con sonda de personas): cada test vive en
 * SU PROPIO `test.describe` con el `test.use` DENTRO del describe. Los
 * `test.use` a nivel de fichero se ACUMULAN (el último gana para TODOS los
 * tests del fichero): con el layout anterior, el Test 1 corría como
 * `store-user` y nunca probó el camino del owner — el spec "pasaba" por la
 * rama de deslogueo sin ejercitar jamás el flujo del owner.
 *
 * This spec verifies that:
 * 1. The OwnerAdmin without MultiStores lands on /management/my-stores with
 *    the session alive, and NO create/edit request is ever emitted.
 * 2. A StoreUser is logged out entirely (adminLoader denies access).
 *
 * Login budget: 1 real login for `owner-admin` + 1 for `store-user` (each
 * minted once per worker), well within LoginPolicy's ceiling of 15/1min
 * (RateLimitPolicies.cs:15-24).
 */

test.describe.configure({ timeout: 120_000 });

// ── Test 1: OwnerAdmin sin MultiStores ───────────────────────────────

test.describe('OwnerAdmin sin MultiStores', () => {
  test.use({ persona: 'owner-admin' });

  test('OwnerAdmin sin MultiStores en /management/stores/create aterriza en my-stores sin poder crear', async ({
    signedInPage,
  }) => {
    const { page, selectedStoreId } = signedInPage;

    // Navegar a la URL de creación — el mecanismo de seguridad bajo prueba.
    // ownerStoresGate (loaders.ts): admin ok, pero el owner de la persona
    // compartida se auto-registra SIN MultiStores (el registro entrega los
    // módulos del plan Pago, no el 14) → redirect a my-stores SIN logout.
    await page.goto('/management/stores/create');

    // Aserción 1: aterriza en la vista de mis tiendas — donde no puede crear
    // nada (la creación vive en el modal que exige el módulo MultiStores).
    await expect(page).toHaveURL(/\/management\/my-stores$/);

    // Captura DESDE AQUÍ (la página ya aterrizó): si algún intento de
    // creación/edición saliera desde my-stores, quedaría registrado.
    const capturedRequests: Array<{ method: string; url: string }> = [];
    await page.route('**/v1/stores**', (route) => {
      capturedRequests.push({ method: route.request().method(), url: route.request().url() });
      route.continue();
    });

    // Aserción 2: la sesión SIGUE viva — ni denyAccess ni el gate la cerraron.
    // La vista my-stores pinta la card de la tienda del owner con su plan.
    await expect(page.getByTestId(`owner-store-body-${selectedStoreId}`)).toBeVisible();

    // Aserción 3: cero requests de creación/edición tras aterrizar.
    const mutationRequests = capturedRequests.filter(
      (r) => r.method === 'POST' || r.method === 'PUT',
    );
    expect(mutationRequests).toHaveLength(0);

    // Aserción 4 (el corazón de S2-03): el formulario de creación NUNCA se
    // montó — ni el input de nombre ni el título "Crear una tienda".
    await expect(page.locator('#store-name')).toHaveCount(0);
    await expect(page.getByText('Crear una tienda')).toHaveCount(0);
  });
});

// ── Test 2: StoreUser ─────────────────────────────────────────────────

test.describe('StoreUser', () => {
  test.use({ persona: 'store-user' });

  test('StoreUser en /management/stores/create es deslogueado y redirigido a /login', async ({
    signedInPage,
  }) => {
    const { page } = signedInPage;

    // ownerStoresGate (loaders.ts) → adminLoader: un StoreUser no es
    // SuperAdmin ni OwnerAdmin → denyAccess() → logout() + redirect a /login.
    // H-8: "Un fallo de autorización desloguea, no muestra 'no autorizado'".
    await page.goto('/management/stores/create');

    // Aserciones: la URL es /login y el formulario de login es visible.
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('button', { name: 'Iniciar sesión' })).toBeVisible();
  });
});
