# Las vistas deben suscribirse solas al aviso de cambios

> **Estado: PLAN. No implementado.** Decidido el 2026-10-06 junto con
> `odd/tasks/invalidation-universal-write-through.md`, que resuelve solo los movimientos 1 y 2.

## El problema que queda

Hoy, cuando algo cambia, el aviso sube un contador (`data-revision-store`). Eso **no refresca a nadie por sí solo**. Solo se refrescan las pantallas que se suscribieron a mano.

Solo hay dos: la vista de venta y la de mayorista. Cualquier otra pantalla —gastos, almacenes, tasas, ventas a crédito, entradas, créditos— aunque sus datos estén al día en la memoria, **no se vuelve a pintar** porque nadie la despertó.

Hay un segundo problema asociado: si una pantalla se suscribe tal cual, tiene que acordarse de leer el contador y ponerlo en la lista de dependencias de cada cálculo. Eso es exactamente el error que se puede olvidar: se olvida en el siguiente cálculo nuevo.

## Qué se quiere

Un gancho único que devuelva el dato **ya fresco**, sin que la pantalla tenga que acordarse de nada.

La forma sería: un gancho que se suscribe al aviso internamente y, al cambiar, invalida la foto de los servicios de esa pantalla y devuelve el valor recalculado. La pantalla pide el dato y listo. Si el aviso nunca llega, el dato nunca cambia.

## Por qué no se hizo ahora

Con los movimientos 1 y 2, el sistema ya no miente: ninguna foto puede mostrar algo viejo. Lo que falta es el confort de no tener que declarar la dependencia a mano, y el riesgo de una pantalla que se queda congelada.

Es deuda real, no un detalle. Un dia una pantalla nueva con datos vivos se monte y nadie la suscriba, y el fallo vuelve. Pero vuelve como fallo de invalidacion, no como dato corrupto: la diferencia es que ahora el dato es viejo a proposito, no por accidente de ciclo de vida.

## Riesgo conocido al hacerlo

Cada pantalla suscrita recalcula al recibir el aviso, y recalcular significa releer y descifrar. Con muchas pantallas suscritas y una importacion grande, eso se nota. Por eso `invalidation-universal-write-through` agrupa los avisos por rafaga: ese agrupamiento es la condicion para que este plan sea seguro, no un extra.

## Trabajo cuando se aborde

1. Definir la API del gancho: que devuelve, cuando recalcula, que hace con la foto.
2. Migrar `sale.tsx` y `wholesale.tsx` al gancho y borrar su suscripcion manual.
3. Migrar el resto de pantallas con datos vivos, una por una, empezando por gastos y almacenes.
4. Anadir un test que falle si una pantalla con datos vivos no esta suscrita, para que no vuelva a olvidarse.

## Referencias

- `odd/tasks/invalidation-universal-write-through.md` — movimientos 1 y 2, en marcha.
- `odd/tasks/sale-stock-refresh-after-cart-sale.md` — el caso original que destapo esto.
- `app/shared/lib/stores/data-revision-store.ts` — el canal de aviso.