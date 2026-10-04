# 5. El menú del almacén vacío no ofrece la opción de desactivar

**Qué prueba el test.**
warehouses.spec.ts, línea 545, con el nombre "desactivar almacén con stock se bloquea y almacén
vacío sí se desactiva". El test intenta desactivar un almacén **con mercadería** —la aplicación
debe impedirlo— y después uno **vacío**, que sí debe poder desactivarse. En el segundo caso abre
el menú de acciones de la tarjeta del almacén y pulsa la opción **Desactivar**.

**Qué falla.**
Ese clic se queda esperando y agota el tiempo máximo del test: **2 minutos**. El registro de
Playwright muestra que el elemento buscado **sí se encuentra**: apunta al botón Desactivar y lo
describe con su identificador y sus clases. El problema no es que la opción falte en el menú.

**Causa raíz: CONFIRMADA. Es un defecto de la aplicación, no del test, y afecta a las personas usuarias.**

Un botón flotante de la aplicación se atraviesa en el camino del clic. Es el botón redondo
naranja que dice "Instalar App", el que ofrece instalar la aplicación en el dispositivo. Está
pegado a la esquina inferior derecha de la pantalla, por encima de todo lo demás, y ese botón de
instalar aparece en todas las pantallas porque se monta en la raíz de la aplicación.

Cuando el test abre el menú de la tarjeta del almacén y busca Desactivar, ese elemento queda justo
en la zona donde está el botón flotante. Playwright ve el botón Desactivar, intenta el clic, y el
botón de instalar app captura el evento en lugar de dejar pasar el clic. El registro es
inequívoco: el intento se repite más de doscientas veces, siempre con el mismo motivo, y el test
se queda sin tiempo. El elemento está visible, activo y estable; lo único que lo tapa es el botón
flotante.

Hay un detalle que refuerza el diagnóstico: el botón de instalar app aparece desactivado, porque
el navegador de las pruebas no ofrece la instalación. Aun así intercepta el clic. Es decir, el
problema ocurre con un botón que el usuario no puede pulsar, y ese botón sigue tapando el menú de
la tarjeta.

**Evidencia (2026-10-04).**
Corrida completa de la suite E2E del frontend con 4 navegadores en paralelo, 21 minutos 36
segundos: 336 aprobados, 7 fallidos, 3 inestables y 8 sin ejecutar. Este test aparece entre los 7
fallidos y falla en los 3 intentos.

La evidencia que faltaba quedó fijada en el archivo de contexto del último reintento. Ahí está
escrito, motivo de cada reintento, que el botón de instalar app intercepta los eventos de
puntero. Con eso queda descartada la hipótesis que tenía el registro anterior, que Era que el
menú no ofreciera la opción Desactivar: el registro nuevo dice lo contrario, la opción está y el
clic se pierde antes de llegar a ella.

La causa de fondo es que un botón flotante en la esquina inferior derecha tapa el contenido de
esa esquina. Cualquier elemento interactivo que caiga ahí es inclicable, no solo este test.

**Estado de la causa raíz:** confirmada. Defecto de la aplicación, con impacto real para las
personas usuarias.

**Arreglo aplicado en el test (2026-10-04, autorizado).**
El arreglo que se aplicó es del lado del test, no de la aplicación: antes de que arranque la app,
el test marca la PWA como ya instalada mediante una bandera en el almacenamiento local. Con esa
bandera puesta, el botón no se monta y el clic de Desactivar llega a su destino. El test no prueba
ese botón, así que no pierde nada que comprobar.

La bandera tiene que escribirse antes de cargar la página, no después. El gancho que calcula si el
botón se muestra lee la bandera una sola vez, al montarse; si se escribiera después de cargar la
página, el botón ya estaría en pantalla y no volvería a dibujarse. Por eso se usa un script que
corre antes de cualquier código de la aplicación en cada carga completa, que es lo que hace la
navegación del test.

Verificación: el test pasa en 35 segundos, con un solo navegador. Se comprobó además que el arreglo
es el que causes el cambio, desactivando solo la bandera: el test vuelve a fallar con el mismo
mensaje de que el botón de instalar app intercepta el clic.

**Lo que este arreglo NO resuelve.**
El defecto de la aplicación sigue vivo. El botón flotante sigue tapando la esquina inferior
derecha en todas las pantallas, así que cualquier control interactivo que caiga ahí sigue siendo
inclicable para quien usa la aplicación, y el único test que lo detectaba acaba de dejar de
detectarlo. Queda pendiente decidir si se arregla la aplicación, y entonces convendría devolver
este test a su forma original para que vuelva a vigilar el problema.