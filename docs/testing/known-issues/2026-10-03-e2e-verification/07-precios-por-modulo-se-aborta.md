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

**Causa raíz: NO CONFIRMADA.**

Lo que **sí** está confirmado es dónde está el problema: los datos que prepara el test no
cumplen la precondición que el propio test documenta. Lo que **no** se investigó es por qué queda
una sola fila activa — si la instantánea que restaura el test quedó desactualizada, si la
aplicación devuelve todos los módulos inactivos salvo uno, o si es el criterio de "no incluido en
el precio" el que deja fuera al resto. Sin eso no hay una solución que proponer.

**Estado de la causa raíz:** el fallo es **del test, no de la aplicación**. Eso está confirmado por
la comprobación interna del propio test, que existe justamente para no reportar un fallo falso.
La causa de por qué los datos quedan así, no está confirmada.

**Evidencia (2026-10-03).**

Corrida aislada de este único archivo, con un solo navegador: **1 fallido y 7 aprobados**, en 1
minuto 24 segundos. Los otros 7 tests del archivo pasan; solo este se detiene. También aparece
entre los fallidos de la corrida completa con 4 navegadores en paralelo. **No es falta de
recursos.**

La lista de filas que imprime el propio mensaje es lo que permite ver que solo Statistics queda
activa.

**Estado de la causa raíz:** no confirmada en cuanto al origen de los datos. Confirmado que no es
un defecto de la aplicación.

**Propuesta de diagnóstico (pendiente de autorización — no se aplicó nada).**
Ninguna aplicada. Cuando se investigue, el primer paso es comprobar si esa lista de filas es
estable o depende del estado de la base de datos. Una posible mejora sería que la comprobación
interna dijera cómo habilitar la segunda fila, pero eso **modifica un test existente** y requiere
autorización explícita uno a uno. **No se tocó nada.**