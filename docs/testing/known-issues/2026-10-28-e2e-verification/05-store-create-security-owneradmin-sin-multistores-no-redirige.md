# 5. store-create-security.spec.ts:51 — el OwnerAdmin "sin MultiStores" ya NO existe: la tienda nueva nace en Superior con el módulo 14

## Qué prueba el test

`store-create-security.spec.ts:51:7` — *"OwnerAdmin sin MultiStores en /management/stores/create
aterriza en my-stores sin poder crear"*. Con una sesión de OwnerAdmin cuya tienda **no** tiene el módulo
**MultiStores (14)**, abrir `/management/stores/create` debe **redirigir** a `/management/my-stores`.

En negocio: un dueño sin el módulo comprado no debe poder entrar a la pantalla de crear tienda.

## Qué fallaba

```
Error: expect(page).toHaveURL(expected) failed
Expected pattern: /\/management\/my-stores$/
Received string:  "http://localhost:3333/management/stores/create"
```

La app se quedaba en la ruta de creación.

## Evidencia

- Corrida completa del 2026-10-13 y **reproducido en aislamiento** (`--workers=2 --retries=0`):
  11 passed / 3 failed — este es uno. Determinista.
- Snapshot: `test-results\store-create-security-Owne-6cc90-n-my-stores-sin-poder-crear-chromium\error-context.md`.

## Causa raíz — CONFIRMADA (2026-10-13)

No era el loader: **la tienda ya no nace sin MultiStores**. `RegisterService` → `CreateStoreService`
nace las tiendas en el plan **Superior** (commit `store-birth-superior`, 2026-10-11), que **incluye el
módulo 14**. La app hace lo correcto (el dueño CON el módulo puede entrar a crear); la premisa del test
("sin MultiStores") ya no la produce el plan de nacimiento.

## Clasificación

**Defecto del test** (premisa obsoleta por el cambio de plan de nacimiento). La app es correcta.

## Aplicación y verificación

**APLICADA (2026-10-13, autorizada).** El test pasó a **construir** su premisa: identidad privada +
`disableStoreModule(page, storeId, 14)` (el 14 se **desactiva**, no se asume ausente) + refresh de sesión,
y solo entonces se afirma el redirect. Header del spec reescrito.
Verificación: `pnpm exec playwright test e2e/store-create-security.spec.ts --workers=1 --retries=0` →
**2 passed**.

## Estado final

✅ **Resuelto** — 2026-10-13.
