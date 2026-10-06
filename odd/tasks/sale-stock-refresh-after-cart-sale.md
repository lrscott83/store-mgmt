# sale-stock-refresh-after-cart-sale

## Objetivo

Cuando se registra una venta desde el carrito global, la vista actual (`/sales/new` y `/sales/wholesale`) debe reflejar el inventario descontado y los datos de esa venta, sin necesidad de recargar o cambiar de tienda.

## Problema

El aviso de "algo cambió" sí viaja: la venta dispara el bump de revisión de datos y las dos vistas se suscriben a él. Pero la vista vuelve a leer el inventario desde una caché que pertenece a su propia instancia del servicio, y esa caché nunca se invalida. Resultado: la venta persiste bien, la vista se re-renderiza, recalcula, y muestra el número viejo.

## Causa raíz (verificada en código)

`InventoryOfflineService` mantiene el mapa de entradas en caché por instancia. Solo lo recarga cuando el mapa está vacío o cuando cambia la tienda. `OrderOfflineService` descuenta el stock con otra instancia del mismo servicio y escribe en almacenamiento; la instancia que usa la vista nunca se entera. Cambiar de tienda "lo arregla" porque ends en una recarga completa de la aplicación.

Los tests unitarios existentes no lo detectan porque sustituyen el servicio de inventario por un doble de prueba, con lo que la caché desaparece por construcción. Solo prueban que la vista se re-renderiza, no que vuelva a leer el dato.

## Alcance

- Test de integración (jsdom + DEK real + servicios reales + vistas reales + botón real del carrito). Sin Playwright, sin E2E.
- El test debe fallar hoy y pasar después del arreglo.
- El arreglo no está autorizado todavía: primero se fija el fallo en rojo.

## Tareas

- [x] T1 - Causa raíz reconstruida y verificada en el código fuente.
- [x] T2 - Test de integración que exige el comportamiento correcto (stock descontado visible en la vista). **ROJO observado:** 2 failed / 1 passed; `Expected "(8)" Received "(10)"`.
- [x] T3 - Arreglo de la invalidación de caché (opción A, autorizada por el owner). La caché por实例 se invalida cuando cambia la revisión global de datos.
- [x] T4 - El test pasa en verde + typecheck + suite enfocada.

## Criterios de aceptación

- Tras registrar la venta desde el carrito, la vista montada muestra el stock descontado.
- El mismo comportamiento en `/sales/new` y `/sales/wholesale`.
- El guardado persiste (una instancia nueva del servicio lee el stock nuevo).

## Comprobaciones

- Test de integración focalizado (vitest).
- `pnpm typecheck`.
- Suite enfocada de vistas de venta.

## Evidencia

- Causa raíz: caché por instancia de `InventoryOfflineService` que solo se invalida con mapa vacío o cambio de tienda.
- El canal de notificación (`bumpDataRevision` → `useDataRevisionStore` → `useMemo` de las vistas) está completo y funciona.
- RED antes del arreglo: 2 failed / 1 passed, `Expected "(8)" Received "(10)"`.
- VERDE después: 3/3. Suite enfocada de servicios: 382 tests verdes. Tests de refresco existentes: 6 verdes. `pnpm typecheck` 5/5.
- Comprobación de mutación hecha por el escritor: quitando solo la cláusula de revisión, 7 de 8 tests nuevos fallan.
- Diff: 24 líneas añadidas en 2 ficheros de producción. Sin backend, sin E2E, sin `frontend/`.

## Deuda abierta (no autorizada)

- La invalidación depende de que el escritor dispare la revisión. `data-synchronizer-service.ts` NO la dispara hoy, así que una sincronización de inventario puede dejar vistas obsoletas por el mismo motivo. Mismo estilo de defecto, otra ruta de escritura.
- `ProductRepository` quedó arreglado por el mismo motivo, pero cualquier caché futura con la misma forma repetirá el problema si no se invalida por revisión.