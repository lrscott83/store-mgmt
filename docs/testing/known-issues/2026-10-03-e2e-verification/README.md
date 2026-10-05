# Corrida del 2026-10-03 — verificación de tests E2E (rama test)

**Estado: cerrado el 2026-10-04.** Las cinco fichas de esta carpeta están retiradas porque los cinco
tests que describían pasan hoy en la suite por defecto. No queda ninguna abierta aquí.

Este archivo se conserva a propósito: no es la ficha de un test que falla, es el registro de una
corrida y de lo que dejó enseñada. Las fichas retired eran el detalle; esto es lo que hay que saber
para que el mismo error no vuelva a comerse un mes entero de pruebas.

## Lo que cerró la carpeta

| Ficha retirada | Spec | Que fallo y por que |
| --- | --- | --- |
| 4 | multipayments-cart-v2 | Defecto del test: sembraba el modulo 16 y luego abria una pantalla condicionada al 15 |
| 5 | warehouses | Defecto de la aplicacion: el boton flotante "Instalar App" interceptaba el clic de "Desactivar" |
| 6 | wholesale-cart-floor | Defecto del test: buscaba una palabra que la aplicacion ya no escribe en la linea de precio |
| 7 | store-module-pricing | Defecto del test: su propia precondicion era insatisfacible con los datos que sembraba |
| 8 | multipayments | Defecto de la aplicacion: una excepcion sin capturar tumbaba la pantalla al calcular el vuelto |

Las cuatro primeras se resolvieron solo en el andamiaje de pruebas. La quinta (la 8) fue la unica que
llevo un arreglo en codigo de aplicacion, autorizado por separado.

## Verificacion que las cerro

Corrida completa del frontend el 2026-10-04 contra el backend con perfil http-e2e (base smca_test),
4 workers, 354 tests, 13.6 minutos: **346 aprobados, 2 fallidos, 2 inestables, 4 sin ejecutar**.

Los cinco tests de las fichas de arriba se ejecutaron una vez cada uno y ninguno aparece en las tres
listas de fallos: pasaron.

Los cuatro "sin ejecutar" no son un cuarto defecto: son los cuatro tests que quedan despues del
segundo, dentro del bloque serial de mayorista-sale. Cuando un test de un describe.serial falla, el
resto del bloque no corre. Por eso un solo fallo real puede-analyses cuatro pruebas y hacer creer
que hay cinco.

Los 2 fallidos de esa corrida no son de esta carpeta. Se investigaron y quedaron resueltos el mismo
dia; estan documentados en [known-issues.md](../../known-issues.md), filas 3 y 4.

El mismo dia, los tests E2E del backend dieron **685 de 685 en 2m24s**, sin fallos.

## El hallazgo que explicaba cuatro de los nueve fallos: el modulo 15 no es el modulo 16

Cuatro pruebas de la corrida fallaban por lo mismo, y ninguna era un defecto de la aplicacion.

**MultiMonedas y MultiPayments son dos modulos distintos.** MultiMonedas (identificador 15) es el que
da sentido a todo lo que tiene monedas: la vista de Tasas de Cambio, el selector de moneda del carrito
y la seccion de monedas de la pantalla de configuracion. MultiPayments (identificador 16) reparte una
venta entre varios canales de pago. **Una tienda que tiene el 16 y no el 15 no ve nada de lo
anterior.**

Esta distinctionsiguio vigente el 2026-10-04. La etiqueta "Transferencia (CUP)" del filtro de metodo
de pago de Ventas del dia depende del mismo modulo 15, por un motivo parecido: la pantalla la pinta
con paymentMethodKeyToLabel(key, !multiMonedas), asi que cuando la tienda tiene el modulo 15 el
sufijo de moneda se omite a proposito, porque el selector de moneda de la misma pantalla ya acota
ese eje. El sufijo solo aparece en tiendas sin el 15.

## De donde salio el error

El archivo de apoyo que preparaba esas pruebas sembraba el modulo 16 y nada mas. Su comentario
justificaba esa decision con una premisa que ya era falsa: que la tienda nace en el plan Superior
con los modulos 2 a 15 y por eso le falta el 16. El backend habia cambiado a Pago como plan de
nacimiento y nadie actualizo el comentario. Cuatro pruebas se escribieron sobre esa suposicion y
nunca pudieron pasar.

**Por que la aplicacion no tiene la culpa.** El test unitario de la pantalla de Tasas de Cambio pasa
en verde y comprueba lo contrario de lo que hacian esas pruebas E2E: admite al administrador de la
tienda con el modulo 15 y lo rechaza sin el.

## Un patron que se repitio: el defecto tapado

Tres veces seguidas, al destapar una puerta aparecio otro fallo detras:

1. Corregido el modulo, la vista de Tasas de Cambio llego por fin a su catalogo y fallo porque la
   prueba elegia la moneda **USD** y esperaba tres canales. La aplicacion **no ofrece USD a
   proposito**: una tasa en USD seria el pivote sintetico 1 USD = 1 USD y nunca convertiria nada. La
   prueba llevaba meses con una expectativa vieja que nadie habia visto fallar.
2. Corregido eso, la prueba del selector del carrito llego a su ultimo paso y fallo porque afirmaba
   que la moneda elegida a mano sobrevive a una recarga. **Ya no es asi por diseno**: el cambio manual
   dura una sesion y al volver a montar el carrito manda la moneda de venta de la tienda.
3. Corregido eso, la prueba de la venta en varios canales llego por fin al calculo del vuelto y **la
   pantalla se cae entera**. Ese tercero no es un defecto de la prueba sino de la aplicacion, y es la
   ficha 8 de esta carpeta.

La leccion que sale de aqui es incomoda: un fallo puede llevar meses escondido detrás de otro, y
conformarse con "ya pasa" no es haber arreglado nada. Merece la pena llegar hasta el final del
recorrido y no solo hasta donde la prueba se quedo atascada.

## La misma trampa, dos meses despues

La leccion se repitio casi tal cual el 2026-10-04, con el mismo par 15/16 pero en la etiqueta de otro
filtro. La ficha 4 de esta carpeta explicaba por que un archivo sembraba el 16 y no el 15; el fallo
que aparecio semanas despues en esa misma pantalla era el espejo: una prueba del plan Superior, que
si tiene el 15, esperaba el texto que se escribe cuando no lo tiene. Un module presente produce el
texto "sin sufijo"; su ausencia, el texto "con sufijo". Las dos formas son correctas ydependen de la
tienda, no del modulo.

## Tests inestables que no se diagnosticaron

La corrida completa marco 2 inestables (auth-me-session-rejection, channel-rates-catalogue) y la
corrida aislada de los dos archivos fallo, marco uno mas. **No se diagnosticaron**: no era lo pedido,
y los reintentos del config los absorben. Queda abierto para quien quiera atacarlo.