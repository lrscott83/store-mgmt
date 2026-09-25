# Test E2E `wholesale-cart-floor` — Grupo C (spec obsoleto)

> Entrada autocontenida. **Fuente:** `docs/testing/known-issues.md` → Grupo C — Spec obsoleto por una feature nueva. Los tests E2E existentes no se tocan sin autorización explícita del usuario (regla innegociable del proyecto).

## Qué prueba

En la venta mayorista, el precio por escalones de cantidad **nunca debe bajar** del precio del escalón más bajo (protección del piso de precio en el carrito).

## Qué falla

La vista de venta mayorista ya **no aparece** para la persona que usa el test, así que "Ventas Mayoristas" nunca se encuentra en pantalla.

## Causa raíz

✅ **Confirmada** — la feature "mayoristas solo para planes Superior/VIP" (módulo 12, traída de dev) dejó fuera a la persona del test, que fue creada **antes** de esa regla. No es un bug de la app: la app hace exactamente lo que la nueva regla dice.

## Solución aplicada

El spec usa la persona privada Superior del fixture `store-wholesale-fixture.ts` (módulo 12 + feature 39, minteada una vez y replicada por snapshot), igual que los specs nuevos que llegaron de dev. De paso, dos aserciones internas quedaron alineadas al formato real del carrito (`Precio: 144/120 CUP`) — el spec viejo nunca las había ejercido porque moría antes en el gate del menú.

## Estado

✅ **Resuelto 2026-09-24** — con autorización explícita del usuario. Verificado: 2/2 en verde contra el backend real (`:5019`, BD `smca_test`).

- _Actualizado: 2026-09-24 (cierre)._
