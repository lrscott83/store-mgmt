# Corrida del 2026-10-03 — verificación de tests E2E (rama test)

**Nota de cierre.** Tres de los cuatro fallos del grupo de monedas quedaron resueltos y sus fichas se
retiraron. Este README conserva lo que hay que saber para que no vuelva a pasar; las fichas que
siguen abiertas están al final.

## Qué salió de la corrida

Siete de los nueve fallos E2E eran nuevos. Los checks de código, en cambio, estaban todos en verde:
compilación del backend sin errores, 105 de 105 tests del dominio, 586 de 586 de la aplicación, 683
de 683 E2E del backend, revisión de tipos y análisis de estilo del frontend, y 5037 tests unitarios
del frontend. La suite E2E del frontend terminó con 328 aprobados, 9 fallidos, 8 inestables y 9 sin
ejecutar, en 19 minutos 54 segundos con 4 navegadores en paralelo.

Los nueve eran fallos reales: los siete nuevos se corrieron uno por archivo y con un solo navegador, y
**los siete siguieron fallando**. Eso descarta la saturación de la máquina como explicación.

## El hallazgo que explica cuatro de los nueve fallos: el módulo 15 no es el módulo 16

Cuatro pruebas de la corrida fallaban por lo mismo, y ninguna era un defecto de la aplicación.

**MultiMonedas y MultiPayments son dos módulos distintos.** MultiMonedas (identificador 15) es el que
da sentido a todo lo que tiene monedas: la vista de Tasas de Cambio, el selector de moneda del carrito
y la sección de monedas de la pantalla de configuración. MultiPayments (identificador 16) reparte una
venta entre varios canales de pago. **Una tienda que tiene el 16 y no el 15 no ve nada de lo
anterior.**

Está escrito en el frontend en tres sitios por cada pantalla, y en los tres se dice lo mismo: la
definición del enlace en el archivo de configuración del menú pide MultiMonedas de forma explícita, el
filtro de la barra lateral esconde cualquier entrada cuyo módulo no esté en la tienda, y la protección
de la propia página exige ese módulo antes de dejarla abrir.

Y en el backend está la razón de fondo: una tienda que se registra sola nace en el plan **Pago**, que
deja fuera a propósito los módulos de los planes superiores, entre ellos el 15 y el 16. El 15 está
asignado solo a los planes Superior y VIP. La corrida lo confirmó empíricamente: la sesión de la
tienda de prueba tenía los módulos 2 a 11, ni el 15 ni el 16.

**De dónde salió el error.** El archivo de apoyo que preparaba esas pruebas sembraba el módulo 16 y
nada más. Su comentario justificaba esa decisión con una premisa que ya era falsa: que la tienda
nace en el plan Superior con los módulos 2 a 15 y por eso le falta el 16. El backend había cambiado a
Pago como plan de nacimiento y nadie actualizó el comentario. Cuatro pruebas se escribieron sobre esa
suposición y nunca pudieron pasar.

**Por qué la aplicación no tiene la culpa.** El test unitario de la pantalla de Tasas de Cambio pasa en
verde y comprueba lo contrario de lo que hacían esas pruebas E2E: admite al administrador de la tienda
con el módulo 15 y lo rechaza sin él. Está entre los 5037 tests unitarios que pasaron todos.

## Lo que se corrigió el 2026-10-03

Solo dos archivos, ambos de pruebas: el archivo de apoyo, que gana el módulo 15 y funciones genéricas
para sembrar y comprobar cualquier módulo, y tres pruebas que ahora siembran exactamente los módulos
que ejercitan.

Tres de las cuatro quedaron en verde (2 + 1 + 1 pruebas, todas por debajo de 20 segundos cada una).
**No se tocó ningún archivo de la aplicación.**

Para descartar que fueran falsos verdes, en cada una se quitó el módulo 15 de la preparación y se
comprobó que la prueba caía **en la aserción que exige que el elemento esté visible**, no antes. Con
la línea de vuelta, vuelven a pasar.

### Un patrón que se repitió: el defecto tapado

Tres veces seguidas, al destapar una puerta apareció otro fallo detrás:

1. Corregido el módulo, la vista de Tasas de Cambio llegó por fin a su catálogo y falló porque la
   prueba elegía la moneda **USD** y esperaba tres canales. La aplicación **no ofrece USD a
   propósito**: una tasa en USD sería el pivote sintético 1 USD = 1 USD y nunca convertiría nada. La
   prueba llevaba meses con una expectativa vieja que nadie había visto fallar.
2. Corregido eso, la prueba del selector del carrito llegó a su último paso y falló porque afirmaba
   que la moneda elegida a mano sobrevive a una recarga. **Ya no es así por diseño**: el cambio manual
   dura una sesión y al volver a montar el carrito manda la moneda de venta de la tienda.
3. Corregido eso, la prueba de la venta en varios canales llegó por fin al cálculo del vuelto y **la
   pantalla se cayó entera**. Ese tercero no es un defecto de la prueba sino de la aplicación, y es la
   ficha 8 de esta carpeta.

La lección que sale de aquí es incómoda: un fallo puede llevar meses escondido detrás de otro, y
conformarse con «ya pasa» no es haber arreglado nada. Merece la pena llegar hasta el final del
recorrido y no solo hasta donde la prueba se quedó atascada.

## Fichas que siguen abiertas

| # | Ficha | Estado |
| --- | --- | --- |
| 4 | [04 — La venta repartida en dos canales se queda colgada](04-venta-dos-canales-se-cuelda.md) | Abierto — causa raíz **no confirmada** |
| 5 | [05 — El menú del almacén no ofrece la opción de desactivar](05-menu-almacen-no-ofrece-desactivar.md) | Abierto — causa raíz **no confirmada** |
| 6 | [06 — En el carrito mayorista la cantidad se recalcula pero el precio no se muestra](06-precio-carrito-mayorista-no-se-muestra.md) | Abierto — causa raíz **no confirmada** |
| 7 | [07 — La prueba de precios por módulo se aborta a sí misma](07-precios-por-modulo-se-aborta.md) | Abierto — **no es un defecto de la aplicación** |
| 8 | [08 — Al pagar de más con varios canales, la pantalla se cae](08-vuelto-multi-pago-tumba-la-pantalla.md) | Abierto — **defecto de la aplicación, causa raíz confirmada** |

La ficha 4 usa el mismo archivo de apoyo que las recién corregidas, pero su síntoma es distinto (un
clic que no termina, no un elemento que falta) y **no se comprobó** que comparta su origen. La 8 sí es
un defecto de la aplicación: una excepción que el propio código lanza y nadie captura.

## Tests inestables de la corrida completa (8)

Administración de rutas, CRUD de categorías, cambio de contraseña, creación de usuario de tienda,
seguridad en la creación de tienda, dos tests del carrito mayorista y dos del escáner mayorista. Los
tres últimos ya figuraban como inestables el 1 de octubre. **No se diagnosticaron**, no era lo pedido.

## Estado al cerrar

- El backend de pruebas **quedó corriendo** en el puerto 5019 (proceso 2400). Para detenerlo hay que
  terminar el proceso 2400.
- El árbol de trabajo tiene los cambios de pruebas y los documentos, sin commitear.