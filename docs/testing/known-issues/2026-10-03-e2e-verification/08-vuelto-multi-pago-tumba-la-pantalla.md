# 8. Al pagar de más en una venta con varios canales, la pantalla se cae entera

**Estado: abierto. Es un defecto de la APLICACIÓN, no de la prueba.** No se ha tocado ningún archivo de
la aplicación.

**Qué prueba el test.**
multipayments.spec.ts, la prueba T10.2, con el nombre "fila por defecto, segundo canal por el popup,
recálculo y bloqueo por subpago". Es la segunda mitad de ese archivo, encadenada a la primera: la T10.1
registra la tasa de cambio y deja la tienda lista, y la T10.2 vuelve a entrar y trabaja el bloque de
pago en varios canales. Su último tramo es el del **vuelto**: con una venta de 0,10 USD, el cajero
escribe 0,15 USD en la fila de efectivo y la aplicación debe mostrar un vuelto de 0,05 USD.

**Qué falla.**
La pantalla no se queda esperando ni falla una comprobación: **se cae**. Aparece la pantalla de error
de la aplicación, con el mensaje "El monto del pago debe ser mayor que cero" y una referencia interna
al cálculo del resumen de pagos. Todo lo que había alrededor desaparece, incluido el selector de
moneda y el bloque de pagos.

Es un fallo visible de punta a punta, no un problema de temporización: pasa en los tres intentos.

**Causa raíz: CONFIRMADA en la aplicación. Es una excepción que nadie captura.**

El resumen de pagos **lanza una excepción** cuando un importe llega a cero o negativo, y esa excepción
se propaga sin filtro hasta el dibujado de la pantalla, que la convierte en la página de error:

- El archivo de cálculo de pagos del dominio, en sus líneas 27 a 32, lanza un error si el importe que
  se aplica no es positivo. Lo hace a propósito: el comentario de las líneas 43 a 47 dice que un pago
  no positivo debe rechazarse con ese error y nunca ignorarse en silencio.
- El archivo que liquida los pagos en varios canales, en sus líneas 90 a 95, pasa la lista de importes
  ya convertidos a ese resumen **sin ningún try/catch**.
- El componente del carrito llama a esa liquidación dentro de un cálculo memorizado, en sus líneas
  159 y 334, también **sin try/catch**.

El resultado es que un solo pago que convierta a cero centavos —un importe tan pequeño que al
redondearlo a centavos desaparece, o un pago que no llega a dinamitar bien— **tumba la venta entera**
en vez de marcar esa fila con un error y dejar cobrar el resto.

**Por qué llevaba tiempo escondido.** Esta prueba nunca había llegado hasta aquí. Registra la tasa de
cambio en la vista de Tasas de Cambio, y esa vista solo existe con el módulo MultiMonedas, que la
tienda de prueba no tenía: el test moría mucho antes, en la línea 205, sin acercarse al vuelto. El
mismo muro que escondió los otros tres fallos de la corrida escondía este cuarto, que es de otra
clase.

**Una pista sin verificar.** La ficha 4 —la venta repartida en dos canales que se queda colgada— se
atascó justo en la ventana de alta de tasa de canal, que es esta misma pantalla. **No se comprobó**
que las dos cosas tengan el mismo origen: aquí el fallo está claro y ocurre en el cálculo
mientras que allí el síntoma era un clic que nunca termina. Queda como relación sospechada, no
como hecho.

**Evidencia (2026-10-03).**

Corrida aislada de multipayments.spec con un solo navegador: la prueba T10.1 pasó y la T10.2 falló
en sus tres intentos, siempre en la misma línea, la que comprueba el vuelto de 0,05 USD. El estado
de la página en el momento del fallo muestra la pantalla de error con la referencia interna al cálculo
del resumen.

**Estado de la causa raíz:** confirmada. El defecto de la aplicación quedó corregido el 2026-10-04.

**Arreglo aplicado en la aplicación (autorizado).**
Había dos llamadores del resumen de pagos y solo uno estaba protegido. El componente que dibuja las
filas filtra los importes que no son positivos antes de llamar al resumen, y su comentario lo dice
expresamente. El archivo que liquida los pagos no lo hacia: empujaba toda conversión correcta sin
mirar su importe. Ahí se colaba el cero.

Se replicó el filtro que ya tenia el otro archivo. La fila se sigue guardando entre los pagos de la
venta; lo que se descarta es su aporte al calculo, y la venta queda sin saldar y bloqueada, que es
justo lo que el otro archivo ya producia. Una fila diminuta ya no tumba la pantalla.

**Arreglo aplicado en el test (autorizado).**
Al arreglar lo anterior aparecio un segundo problema, que era del test: escribia un monto corto en
una fila expresada en la moneda local, cuando las cuentas que despues comprueba son en dolares. Al
convertir, ese monto daba cero centavos y la venta quedaba sin saldar en lugar de dar el vuelto
esperado. La fila se pone ahora en dolares, que es la moneda de la venta, y con eso las cuentas del
test cuadran.

**Verificación.** El archivo entero pasa en 30 segundos con un solo navegador, las dos pruebas. Antes
la segunda tumbaba la pantalla en los tres intentos. Tambien se comprobaron los tipos y el estilo,
que si cubren esta parte del codigo.

