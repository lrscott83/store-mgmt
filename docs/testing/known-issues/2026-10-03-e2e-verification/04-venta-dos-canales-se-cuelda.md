# 4. La venta repartida en dos canales de pago se queda colgada

**Qué prueba el test.**
multipayments-cart-v2.spec.ts, línea 171, con el nombre "fila Efectivo por defecto, popup de
canales, papelera, recálculo y venta en dos canales". Es el recorrido más largo de los tests de
MultiPayments (el módulo que permite repartir una venta en varios canales de pago): parte de una
línea de Efectivo por defecto, abre la ventana de canales de pago, mueve líneas a la papelera,
recalcula importes y cierra una venta partida entre dos canales. El archivo tiene **un solo
test**.

**Qué falla.**
El recorrido se atasca en el clic de la línea 200 y agota el tiempo máximo del test: **3
minutos**. Ese clic busca el botón de alta de tasa de canal y ese botón no llega a existir nunca:
la espera del registro de Playwright no muestra ninguna línea de "elemento encontrado", solo la
espera. Por eso el clic no falla en una comprobación, sino que se queda esperando hasta que se
acaba el tiempo.

**Causa raíz: CONFIRMADA. Es un defecto del test, no de la aplicación.**

El archivo siembra un módulo y luego abre una pantalla que depende de otro módulo distinto. En la
línea 186 el test pide activar el módulo de multi-pago, que es el número 16. En la línea 197 navega
a la vista de tasas de cambio, y esa vista está condicionada al módulo de multi-monedas, que es el
número 15. Son dos módulos distintos y el archivo solo siembra el 16.

La propia aplicación lo dice por escrito en un comentario junto a la pantalla: sin el módulo 15 la
página no existe y la ruta no es alcanzable ni escribiéndola a mano en la barra de direcciones.
Cuando el test navega a esa dirección, la aplicación no tiene nada que mostrar y manda a la
persona a la pantalla de inicio de sesión.

La imagen de la página que Playwright guardó al fallar lo confirma: en el momento del fallo la
dirección es la del inicio de sesión, con el título "Inicia sesión en tu cuenta" y el botón
"Iniciar sesión". No hay ninguna pantalla de tasas de cambio, y por eso el botón que el test
busca nunca aparece. El atascamiento no está en la venta de dos canales ni en la ventana de
canales: ocurre mucho antes, en el primer paso que necesita la pantalla de tasas.

Este es el mismo error de siembra que ya se corrigió en otros tres archivos el 3 de octubre. Este
archivo quedó fuera de aquel arreglo y por eso sigue cayendo en lo mismo.

**Evidencia (2026-10-04).**
Corrida completa de la suite E2E del frontend con 4 navegadores en paralelo, 21 minutos 36
segundos: 336 aprobados, 7 fallidos, 3 inestables y 8 sin ejecutar. Este test aparece entre los 7
fallidos, y falla en los 3 intentos.

La evidencia que faltaba quedó fijada en el archivo de contexto del último reintento, que guarda
la imagen de la página en el momento exacto del fallo: allí se ve la pantalla de inicio de
sesión. Junto a ella, el registro de la espera del clic, que no muestra ninguna coincidencia
encontrada. Los dos datos juntos cierran la causa: el elemento no faltaba porque la pantalla
estuviera mal, sino porque nunca se llegó a esa pantalla.

Antes de este diagnóstico se sospechaba que el atasco estaba en la ventana de alta de tasa de
canal, por la cercanía de las líneas del archivo. Se descartó: el clic que se cuelga es el
anterior y la ventana ni siquiera llega a abrirse.

**Estado de la causa raíz:** confirmada. Defecto del andamiaje de pruebas.

**Propuesta de arreglo (pendiente de autorización — no se aplicó nada).**
Que el archivo siembre también el módulo 15, que es el que abre la pantalla de tasas, con el mismo
auxiliar que ya usan los otros tres archivos corregidos. No hace falta tocar la aplicación ni el
texto del test. **No se tocó nada.**