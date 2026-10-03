# 5. El menú del almacén vacío no ofrece la opción de desactivar

**Qué prueba el test.**
warehouses.spec.ts, línea 545, con el nombre "desactivar almacén con stock se bloquea y almacén
vacío sí se desactiva". El test intenta desactivar un almacén **con mercadería** —la aplicación
debe impedirlo— y después uno **vacío**, que sí debe poder desactivarse. En el segundo caso abre
el menú de acciones de la tarjeta del almacén y pulsa la opción **Desactivar**.

**Qué falla.**
Ese clic nunca encuentra el elemento y agota el tiempo máximo del test: **2 minutos**. Es decir,
la opción no está en el menú, o el menú no llega a abrirse. El test se queda esperando un clic
que no va a llegar.

La línea que falla es la 573 del archivo, y la 574 es la comprobación de que la tarjeta quedó
marcada como inactiva.

**Causa raíz: NO CONFIRMADA.**

Sin confirmar. **No se aisló** cuál de las dos ramas del test es la que falla: la del almacén con
mercadería (donde se espera un bloqueo) o la del almacén vacío (donde se espera la desactivación).
El tiempo se agota en la línea 573, que corresponde a la rama del almacén vacío, así que esa es
la que se cuelga. Pero no se capturó el estado del menú en el momento del fallo, y por eso no se
puede distinguir si la opción no está por una razón de la aplicación o por el estado que dejó la
rama anterior.

**Evidencia (2026-10-03).**

Corrida completa de la suite E2E del frontend, con 4 navegadores en paralelo, 19 minutos 54
segundos: 328 aprobados, 9 fallidos, 8 inestables y 9 sin ejecutar. Este test aparece entre los 9
fallidos.

Corrida aislada de este único archivo, con un solo navegador: **1 fallido, 4 aprobados y 4 sin
ejecutar**, en 7 minutos 24 segundos. Falló en los 3 intentos. Los 4 que pasaron son los tests
que van antes en la serie, incluido el de crear un almacén, el de salida a tienda con stock
insuficiente y el de transferencia entre almacenes. Los 4 "sin ejecutar" son los que van
**después** del fallido en la misma serie —decimales, exportar e importar, el ítem de menú sin el
módulo activado, y la venta tras salida a tienda— y se recuperarían en cuanto este se resuelva.
**No es falta de recursos.**

**Estado de la causa raíz:** no confirmada.

**Propuesta de diagnóstico (pendiente de autorización — no se aplicó nada).**
Ninguna. El registro de contexto del último reintento guarda el estado del menú en el momento
del fallo y es el punto de partida. **No se tocó nada.**