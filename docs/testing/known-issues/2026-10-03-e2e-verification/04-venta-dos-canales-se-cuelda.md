# 4. La venta repartida en dos canales de pago se queda colgada

**Qué prueba el test.**
multipayments-cart-v2.spec.ts, línea 171, con el nombre "fila Efectivo por defecto, popup de
canales, papelera, recálculo y venta en dos canales". Es el recorrido más largo de los tests de
MultiPayments (el módulo que permite repartir una venta en varios canales de pago): parte de una
línea de Efectivo por defecto, abre la ventana de canales de pago, mueve líneas a la papelera,
recalcula importes y cierra una venta partida entre dos canales. El archivo tiene **un solo
test**.

**Qué falla.**
El recorrido se atasca en un clic y agota el tiempo máximo del test: **3 minutos**. No es una
aserción corta como las de las fichas 1 a 3; es el clic el que nunca encuentra su destino, así
que el navegador espera hasta que se acaba el tiempo.

Las líneas que aparecen junto al fallo en el registro (201 a 203 del archivo) corresponden a la
comprobación de la ventana de alta de tasa de canal: el nombre de esa ventana y los dos campos de
valor de compra y de venta. **No se aisló cuál de ellas es el punto exacto del atasco.**

**Causa raíz: NO CONFIRMADA.**

Sin confirmar. Lo que sí consta: el archivo tiene un único test, así que no hay forma de comparar
contra un hermano del mismo archivo. El punto de atasco reportado está junto a la ventana de tasa
de canal, que es la misma pantalla que falla en las fichas 1 a 3, pero **no se comprobó** si lo
que no aparece es esa ventana o un elemento anterior del recorrido. La línea exacta del clic que
agota el tiempo no quedó fijada en esta corrida.

**Evidencia (2026-10-03).**

Corrida completa de la suite E2E del frontend, con 4 navegadores en paralelo, 19 minutos 54
segundos: 328 aprobados, 9 fallidos, 8 inestables y 9 sin ejecutar. Este test aparece entre los 9
fallidos. En la corrida del 1 de octubre figuraba como **inestable**: hoy pasó a ser un fallo
normal.

Corrida aislada de este único archivo, con un solo navegador: **1 fallido**, y el archivo entero
tardó unos 9 minutos porque el test agotó los 3 intentos de 3 minutos cada uno. **No es falta de
recursos.**

**Estado de la causa raíz:** no confirmada. Comparte pantalla con el grupo de MultiPayments, pero
sin evidencia que los una.

**Propuesta de diagnóstico (pendiente de autorización — no se aplicó nada).**
Ninguna. Si se investiga, el primer paso es averiguar **qué línea exacta** lanza el clic que se
queda esperando; el registro de contexto de los reintentos es donde está esa información y esta
corrida no la dejó fijada. **No se tocó nada.**