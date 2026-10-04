# 7. La prueba de precios por módulo se aborta a sí misma porque sus datos no alcanzan

**Qué prueba el test.**
store-module-pricing.spec.ts, línea 546, con el nombre "SMP8 — the browser total equals the server
total, percent before discount, clamped at zero". El test toma una fila de la lista de módulos de
una tienda, le aplica un descuento por encima del cien por ciento y verifica que el total que
muestra el navegador coincida con el que calcula el servidor y que **quede limitado en cero**.
Para poder comprobar ese límite necesita **dos filas activas**: la que se descuenta y una segunda
que siga viva.

**Qué falla.**
No falla la aplicación — falla la preparación del test. El test tiene su propia comprobación que
detecta que los datos no alcanzan y **se detiene a sí mismo**, con un mensaje explícito, en lugar
de correr una comprobación vacía.

El mensaje dice, en sus propios términos: que no hay ninguna fila activa y no incluida en el
precio que pueda servir como la fila sobre-discuentada, porque el límite en cero necesita una
segunda fila activa; que el total medido sobre ella valdría cero sin importar a qué precio se
ponga, y que toda comprobación construida sobre ella sería vacía.

El mismo mensaje incluye la lista de filas, que revisada da: de las 17 filas de módulos de la
tienda, **16 están inactivas** y la única activa es la del módulo **Statistics**. El límite en
cero necesita al menos dos activas, y solo hay una.

**Causa raíz: CONFIRMADA. Es una precondición que el propio test hace insatisfacible.**

No es la aplicación ni una instantánea desactualizada: es una contradicción entre las dos piezas
del test.

La prueba necesita dos filas y, para la segunda, exige que sea distinta de la primera y que no
esté incluida en el precio. El detalle que la vuelve imposible está en el auxiliar que las
busca: al elegir una fila descarta las que ya están incluidas en el precio, y entre las condiciones
de ese descarte está **que la fila esté activa**. O sea que la segunda fila tenía que estar activa.

Pero el auxiliar que arma los datos del archivo existe, por propósito, para dejar **una sola fila
activa**: desactiva todos los módulos menos uno. Con una sola activa, la segunda fila —que además
tiene que ser otra distinta— no puede aparecer nunca, y la prueba se detiene a sí misma.

El orden agrava el caso. Las dos búsquedas ocurren **antes** de que se armen los datos, y el armado
ocurre después. O sea que el test le pide dos filas activas y acto seguido se asegura de que quede
una.

La exigencia era además innecesaria. Más abajo la propia prueba **marca esa fila desde la ventana
de precios**, y marcarla es justamente lo que la activa: exigírsela antes pedía algo que el test
todavía no había hecho.

**Por qué se confundió con un problema de datos.** El mensaje de error lista las filas y muestra
que solo hay una activa, lo que parece un defecto de la base restaurada. La lista es la prueba del
síntoma, no de la causa: una sola fila activa es precisamente lo que ese archivo de preparacion se propone dejar.

**Evidencia (2026-10-03).**

Corrida aislada de este único archivo, con un solo navegador: **1 fallido y 7 aprobados**, en 1
minuto 24 segundos. Los otros 7 tests del archivo pasan; solo este se detiene. También aparece
entre los fallidos de la corrida completa con 4 navegadores en paralelo. **No es falta de
recursos.**

La lista de filas que imprime el propio mensaje es lo que permite ver que solo Statistics queda
activa.

**Estado de la causa raíz:** confirmada y **resuelta** el 2026-10-04. Es un defecto del test, no de
la aplicación.

**Arreglo aplicado (autorizado).**
Se agregó al archivo un auxiliar gemelo del que ya usaba, igual en todo salvo en un punto: el
anterior descarta las filas que ya vienen incluidas en el precio, y el nuevo descarta solo eso, sin
exigir además que estén activas. La prueba usa el gemelo para la segunda fila y el original sigue
sirviendo para la primera, que sí tiene que estar activa porque es la que sobrevive al armado.

**Verificación.** La prueba pasa en 30 segundos con un solo navegador. Antes se detenía a sí misma en
los tres intentos. No se tocó la aplicación.
