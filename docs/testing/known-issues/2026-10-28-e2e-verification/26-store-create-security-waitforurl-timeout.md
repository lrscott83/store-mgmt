# 26. store-create-security.spec.ts:161 — el StoreUser no llega a `/sales/products` dentro de 60 s (inestable)

## Qué prueba el test

`store-create-security.spec.ts:161:7` — *"StoreUser en /management/stores/create es deslogueado y
redirigido a /login"*. Un StoreUser que abre la ruta de creación de tiendas debe ser deslogueado y
enviado al login; el test necesita primero que ese usuario **entre** a su pantalla de inicio.

## Qué falla (en simple)

```
TimeoutError: page.waitForURL: Timeout 60000ms exceeded.
> 378 |   await storeUserPage.waitForURL(/\/sales\/products$/);
```

El login del StoreUser no completa la navegación a `/sales/products` dentro del `navigationTimeout` de
60 s.

## Evidencia

- Corrida completa del **2026-10-28**: falló en el **primer intento** y pasó en el **retry 1** → el
  runner lo reporta como **flaky**.
- Artifact: `frontend-react/test-results/store-create-security-Stor-0d832-*/error-context.md`
  (intento original + `-retry1`).

## Causa raíz — NO CONFIRMADA

Hechos: es una espera de **navegación** tras el login del StoreUser, no una aserción de permisos; pasó
al reintentar. Es la misma familia de la ficha 02 (`store-create-security` ya tenía documentado que el
setup de `signedInPage` crece bajo contención: 32 s en solitario → 63.6 s con 8 workers).

Hipótesis descartadas: no es el gate de `/management/stores/create` (el test nunca llega a esa
aserción); no es un 403 ni un cambio de contrato de la API.

## Clasificación

**Inestable de carga/entorno.** No hay evidencia de defecto de la aplicación.

## Propuesta de solución — NO APLICADA

Medir el tiempo real de `waitForURL` con `--workers=2` y `--trace on` (la ficha 02 ya tiene el método).
Si el presupuesto de 60 s se agota por suma de esperas, subir `navigationTimeout` de forma acotada o
reducir el trabajo del setup; si es una navegación que a veces no ocurre, capturar el snapshot y
reabrir la ficha como defecto. Requiere autorización 1 a 1.

## Aplicación y verificación

No aplicada.

## Estado final

🟡 **Inestable documentado** — 2026-10-28.
