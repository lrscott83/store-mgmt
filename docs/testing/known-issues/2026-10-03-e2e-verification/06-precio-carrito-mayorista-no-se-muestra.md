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

**Por qué este detalle es el más útil de los siete.** Es el único de los siete en el que la mitad
"fácil" del caso funciona. El recorrido llega al umbral, cruza el rango, y la línea **sí** se
actualiza — pero el precio que debería acompañarla no se pinta. Eso acota el problema a la
representación del precio en pantalla, no a la lógica que recalcula el precio por rango. **No se
investigó más.**

**Causa raíz: NO CONFIRMADA.**

Sin confirmar. No se comprobó si el precio sí se recalculó pero se muestra con otro formato del
que el test espera —por ejemplo un separador de miles o el símbolo de otra moneda activa— o si
simplemente no se recalculó. El texto que el test busca es estricto en cuanto a los espacios
entre el número y la moneda, lo que deja abierta la posibilidad de un fallo por formato, pero
**no se verificó contra la página real**.

**Evidencia (2026-10-03).**

Corrida completa de la suite E2E del frontend, con 4 navegadores en paralelo, 19 minutos 54
segundos: 328 aprobados, 9 fallidos, 8 inestables y 9 sin ejecutar. Este test aparece entre los 9
fallidos. En esa misma corrida, su hermano de la línea 152 fue **inestable** (pasó al reintentar).

Corrida aislada de este único archivo, con un solo navegador: **1 fallido y 1 aprobado**, en 1
minuto 48 segundos. El test de la línea 152 pasó en los 2 intentos, el de la línea 179 falló en los
3. **No es falta de recursos.**

**Estado de la causa raíz:** no confirmada.

**Propuesta de diagnóstico (pendiente de autorización — no se aplicó nada).**
Ninguna. El registro de contexto del último reintento guarda la imagen de la línea del carrito tal
como se vio y permite responder de una vez a la pregunta de si el precio está con otro formato o
si no está. **No se tocó nada.**