# 6. En el carrito mayorista la cantidad se recalcula pero el precio no se muestra

**Qué prueba el test.**
wholesale-cart-floor.spec.ts, línea 179, con el nombre "cruza de rango y el precio de la línea se
recalcula al rango aplicable". El test lleva una línea del carrito mayorista al otro lado de un
umbral de paquetes y exige dos cosas: que la cantidad vuelva a 12 y que el **precio** de esa
línea se recalcule al rango nuevo, que en este caso son 120 CUP. El caso espejo, en la línea 152
del mismo archivo, prueba el extremo inferior.

**Qué falla.**
La cantidad **sí** se recalcula bien: la comprobación de la línea 190 pasa. Lo que **no** aparece
es el precio. La línea 191 busca el texto del precio de 120 CUP junto a la línea del carrito y no
lo encuentra. La línea que falla es la 191 del archivo.

Falla en los tres intentos, incluidos los dos reintentos.

**Causa raíz: CONFIRMADA. Es un defecto del test, no de la aplicación.**

El precio sí se recalcula y sí se muestra. Lo que falta es la palabra que el test busca delante.
El registro de la página que Playwright guardó al fallar muestra las dos líneas de texto que la
aplicación escribe junto al producto:

- "Paquetes: 12 · 120 CUP"
- "1 440 CUP"

El precio del paquete, 120 CUP, está escrito en la primera línea. El total de la línea, que es el
resultado de multiplicar 12 paquetes por 120 CUP, está en la segunda: 1 440 CUP. Las dos cuentas
salen bien, así que el recálculo por rango funciona.

El problema es que el test busca el texto "Precio: 120 CUP", con la palabra Precio delante y dos
puntos. Esa palabra ya no se escribe en ninguna parte de la línea del carrito. Se quitó a
propósito el 2 de octubre de 2026, cuando se pidió que la línea se leyera sola porque la palabra
repetida en cada fila solo ocupaba espacio. Queda escrito en un comentario junto al código que
arma ese texto, con la fecha del pedido. La aplicación hoy arma la línea en el formato "Paquetes:
12 · 120 CUP" y esa es la forma esperada desde entonces.

Queda además una sobra: en el archivo de textos de la interfaz sigue existiendo la traducción de
la palabra Precio, pero ningún componente la usa. Es la huella de lo que se quitó.

**Evidencia (2026-10-04).**
Corrida completa de la suite E2E del frontend con 4 navegadores en paralelo, 21 minutos 36
segundos: 336 aprobados, 7 fallidos, 3 inestables y 8 sin ejecutar. Este test aparece entre los 7
fallidos y falla en los 3 intentos.

La evidencia que faltaba quedó fijada en el archivo de contexto del último reintento, que guarda
la imagen de la página en el momento del fallo. Ahí se leen las dos líneas citadas, que contestan
de una vez a la pregunta que el registro anterior dejaba abierta: el precio no está con otro
formato ni con otro símbolo de moneda, está bien calculado y bien escrito, solo que sin la palabra
que el test exige.

Se descartó además la sospecha de un fallo de formato por espacios o por el símbolo de la moneda:
el separador de miles y el símbolo CUP están tal cual el test los espera. Lo único que cambió es
la palabra del encabezado.

**Estado de la causa raíz:** confirmada. Defecto del andamiaje de pruebas, con la aplicación
funcionando como se pidió.

**Propuesta de arreglo (pendiente de autorización — no se aplicó nada).**
Que el test busque el precio en la forma en que la aplicación lo escribe hoy, que es la de la
línea de paquetes, en lugar de la forma antigua con la palabra Precio delante. También conviene
retirar del archivo de textos de la interfaz la traducción que quedó sin uso. No hace falta tocar
la aplicación. **No se tocó nada.**