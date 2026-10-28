# multi-store-backup — export/import de TODAS las tiendas del Owner

Fecha: 2026-10-22 · Estado: implementado y verificado

## Intención

Hoy el backup (export/import) de un Owner con varias tiendas trabaja **solo sobre
la tienda activa**. El Owner pide que exporte e importe **todas sus tiendas**, y
que siga aceptando los archivos ya exportados (v1 y v2 de una sola tienda).

## Alcance

- Export: todas las tiendas del Owner con datos locales en este dispositivo
  (las que tienen DEK propia en la tabla de dispositivo) + la seleccionada.
  Un StoreUser no cambia: solo su tienda.
- Import: escribe **cada tienda del archivo** para la que este usuario tiene
  acceso y DEK local; el resto se ignora. Archivo con una sola tienda → una
  sola tienda (incluye archivos v2 y v1 existentes, sin cambios).
- Sin cambios en backend ni en tests E2E.

## Formato v3 (aditivo, no destructivo)

`meta.json` (texto plano, primera entrada): `formatVersion: 3`, `salt`,
`iterations`, `exportedAt`, `stores: [{ storeId, name? }]`.
Datos: `stores/<storeId>/<archivo>.json`, cada entrada cifrada con la misma
clave PBKDF2(password, salt) que ya usa v2.

Detección antes de escribir nada: `peekBackupFormatVersion` lee `meta.json`.
- `3` → ruta multi-tienda.
- `2` o ausente (v1) → ruta de una sola tienda, **código actual intacto**.

## Claves por tienda

Cada tienda se lee/escribe con SU DEK, obtenida con `unwrapStoreDekForStore`.
Para escribir se reutiliza la ruta de escritura de una tienda (misma validación,
mismos servicios) con la pareja (storeId, DEK) activa dentro de
`withStoreDek(...)`, que restaura la pareja anterior en `finally`. No se agrega
`encryptEntityWithDek`: la clave y la tienda siguen moviéndose juntas.

## Pruebas

Unit (vitest): formato v3 (ida y vuelta, contraseña incorrecta, entradas de
tiendas no listadas), compatibilidad v2/v1 (siguen importando por la ruta
única), selección de tiendas (Owner con/sin MultiStores, tienda inactiva,
StoreUser), export que omite tiendas sin DEK, e import que escribe todas las
tiendas autorizadas y solo esas.

## Prueba observada

- `pnpm exec vitest run app/sync` → **27 archivos, 307 tests, 0 fallos**
  (43 tests nuevos: 14 de formato v3/compatibilidad, 18 del servicio, 11 del
  despacho de importación).
- `pnpm exec vitest run app/sync app/shared/lib/storage` → 45 archivos, 472 tests.
- `pnpm typecheck` → sin errores. `eslint app/sync ...` → sin errores.
- Sin cambios en backend ni en E2E.

## Límite conocido

Una versión anterior de la app no lee un archivo v3: lo rechaza con
"Unsupported backup format version" en vez de importar una sola tienda en
silencio. La compatibilidad exigida (código nuevo leyendo archivos viejos v1 y
v2) sí se cumple y está cubierta por tests.
