# 5. store-create-security.spec.ts:51 — el OwnerAdmin sin MultiStores se queda en `/management/stores/create` en vez de aterrizar en my-stores

## Qué prueba el test

`store-create-security.spec.ts:51:7` — *"OwnerAdmin sin MultiStores en /management/stores/create
aterriza en my-stores sin poder crear"*. Con una sesión de OwnerAdmin cuya tienda **no** tiene el
módulo **MultiStores (14)**, abrir `/management/stores/create` debe **redirigir** a
`/management/my-stores` — donde no puede crear nada, porque la creación vive en el modal que exige ese
módulo.

En negocio: un dueño sin el módulo comprado no debe poder entrar a la pantalla de crear tienda.

## Qué falla (en simple)

```
Error: expect(page).toHaveURL(expected) failed
Expected pattern: /\/management\/my-stores$/
Received string:  "http://localhost:3333/management/stores/create"
Timeout: 5000ms
   13 × locator resolved to <html lang="es">…</html>
      - unexpected value "http://localhost:3333/management/stores/create"

  62 |     // Aserción 1: aterriza en la vista de mis tiendas — donde no puede crear
  63 |     // nada (la creación vive en el modal que exige el módulo MultiStores).
> 64 |     await expect(page).toHaveURL(/\/management\/my-stores$/);
```

La app **no redirige**: se queda en la ruta de creación.

## Evidencia

- Corrida completa del **2026-10-13** (`pnpm test:e2e --workers=4`): 304 passed / 17 failed / 12 flaky;
  este test entre los fallidos (y también en la primera corrida completa del 2026-10-13).
- **Reproducido en aislamiento** el 2026-10-13 (`pnpm exec playwright test <6 specs> --workers=2
  --retries=0`): 11 passed / **3 failed** — este es uno. **Sin reintentos**, así que es
  **determinista**, no un inestable de carga.
- Snapshot del fallo: `test-results\store-create-security-Owne-6cc90-n-my-stores-sin-poder-crear-chromium\error-context.md`.

## Causa raíz — NO CONFIRMADA

**Hechos que la evidencia sostiene:** con un OwnerAdmin sin el módulo 14, la URL permanece en
`/management/stores/create`; el spec espera el redirect a `my-stores`.

**Hipótesis por confirmar/descartar:**
- (a) la ruta `management/stores/create` dejó de estar gateada o de redirigir (loader/gate);
- (b) el gate que redirige depende del módulo y algo cambió en `/me` o en el loader de la ruta.

Falta inspeccionar el **loader de la ruta** y el gating por MultiStores (`storeModuleIds` / módulo 14).

## Clasificación

Por confirmar: **defecto de la app** (si el gate debe redirigir y ya no lo hace) **o defecto del test**
(si la expectativa quedó vieja). Se decide con la inspección del loader.

## Propuesta de solución — NO APLICADA

Inspeccionar el loader/gate de `/management/stores/create`. Si el diseño manda redirigir sin el módulo
14, **restaurar el gate**; si el diseño cambió a propósito, **alinear el spec**. Cualquiera de las dos
requiere **autorización 1 a 1** (toca un test E2E existente o código de la app).

## Aplicación y verificación

No aplicada.

## Estado final

🔴 **Abierto** — 2026-10-13.
