# Manual de usuario — VendeDTo

**Versión:** 1.0 · **Fecha:** 2026-10-15
**Dirigido a:** el **Dueño** (Administrador de tienda) y sus **Empleados** (Usuario de tienda).

**Cómo leerlo.** La **Parte 1** es la puesta en marcha: se hace una vez, cuando montas la
tienda. Las **Partes 2 a 6** son el uso del día a día. Cada sección termina con una
**Imagen sugerida**: la captura del POS que conviene poner y qué debe mostrar.

---

## Antes de empezar: cómo funciona el sistema

- **Dos roles importan aquí.** El **Dueño** (Administrador de tienda) monta y configura todo.
  El **Empleado** (Usuario de tienda) opera: vende, cobra, registra. Hay funciones que solo
  ve el Dueño (configurar el catálogo web, los pedidos, los empleados…).
- **Funciona sin conexión.** Salvo el Catálogo Web y los Pedidos, que van contra el servidor,
  casi todo el POS trabaja con los datos guardados en el propio dispositivo. Por eso conviene
  instalar la app en el equipo y activarle el **acceso sin conexión** (Parte 1, paso 7).
- **Los módulos activan funciones.** La tienda tiene un plan, y según los módulos activos
  aparecen unas pantallas u otras (multi-moneda, créditos, gastos, multi-tienda, catálogo web,
  pedidos de WhatsApp…). Si en tu menú no ves un apartado, es que esa función no está activa.
- **Un dato vive en la tienda seleccionada.** Todo lo que registras (ventas, inventario,
  gastos…) pertenece a la tienda que tienes seleccionada en ese momento.
- **El carrito es global.** El ícono del carrito vive en el encabezado de la app y se comparte
  entre las pantallas de venta: armas la venta y la confirmas desde ahí (Parte 2).

---

# Parte 1 — Puesta en marcha (el Dueño, una sola vez)

## 1. Crear la cuenta e instalar la app

**Qué es.** El alta del propietario: crea tu cuenta y tu primera tienda a la vez, y deja el POS
instalado en el dispositivo.

**Cómo se hace.**
1. Entra en la pantalla de **Creación de cuenta**.
2. Rellena: **Nombre completo**, **Nombre de la tienda**, **Usuario**, **Contraseña**,
   **Confirmar contraseña**, **Teléfono celular** y **Email** (el único opcional).
3. La contraseña debe tener al menos **8 caracteres, una mayúscula y un número**.
4. Marca la casilla de **términos y condiciones** (hay un enlace para leerlos).
5. Pulsa **Registrar**. La cuenta se crea, **entra automáticamente** y te lleva a tu **página
   de inicio** (el catálogo **Productos**, todavía vacío porque aún no has cargado nada).
6. **Instala la app en el dispositivo.** En tu **página de inicio** verás el botón flotante
   **INSTALAR APP**: púlsalo. El dispositivo **añade el ícono de la app automáticamente**;
   espera a verlo aparecer en la pantalla de inicio (o en el escritorio) y abre la app desde
   ahí a partir de ahora — así trabaja **sin conexión**. Cuando la app queda instalada, el
   botón **desaparece** (ya no hace falta).

**A tener en cuenta.** Todo es obligatorio salvo el email. Si el alta se interrumpe justo al
final, la cuenta ya puede existir: se te avisa y se te lleva a la pantalla de acceso.

**📷 Imagen sugerida.**

![Creación de cuenta — formulario relleno con datos de ejemplo y el botón INSTALAR APP visible](img/01-crear-cuenta.png)

![Página de inicio tras registrarse — el catálogo Productos, aún vacío](img/02-inicio.png)

## 2. Primer acceso

**Qué es.** Entrar con usuario y contraseña y llegar a la pantalla de inicio.

**Cómo se hace.**
1. En **Inicia sesión en tu cuenta**, escribe **Usuario** y **Contraseña** (el ojo muestra u
   oculta la contraseña).
2. Pulsa **Iniciar sesión**. Verás un aviso de carga mientras se resuelve tu sesión.
3. Aterrizas en tu pantalla de inicio: la venta si la tienda ya tiene productos vendibles, o el
   catálogo de productos si aún no.

**A tener en cuenta.** Si la cuenta está desactivada, o fallas muchas veces seguidas, se te
avisa con un mensaje claro. Una sesión ya iniciada que vuelve a la pantalla de acceso se
redirige sola a su inicio.

**📷 Imagen sugerida.**

![Pantalla de acceso — Usuario y Contraseña, botón Iniciar sesión, enlace Crear cuenta y el botón Activar acceso sin conexión](img/03-iniciar-sesion.png)

## 3. Configurar la tienda (monedas, métodos de pago y tasas)

**Qué es.** Dejar lista la forma de cobrar antes de vender: con qué monedas trabajas, qué métodos
aceptas y a qué tasa cambias.

**Cómo se hace.**
1. Ve a **Gestión → Configuraciones**.
2. (Solo multi-tienda) En **Tienda activa**, elige la tienda que vas a configurar.
3. (Solo con el módulo de múltiples monedas) En **Monedas de compra y venta** elige la
   **Moneda de Compra** y la **Moneda de Venta**.
4. En **Métodos de pago**, activa o desactiva los métodos con su interruptor. Los canales en
   **Efectivo están siempre activos** y su interruptor no se puede apagar.
5. (Solo con el módulo de múltiples monedas) Si necesitas cambiar valores, ve a **Tasas de
   Cambio** (ver la sección 30) y registra la tasa de cada moneda por método de pago.

**A tener en cuenta.** El catálogo de **categorías de producto** no está aquí: se gestiona en
**Productos**. Esta pantalla guarda al instante (verás **Guardado**).

**📷 Imagen sugerida.** Configuraciones con los tres bloques visibles: **Tienda activa**, **Monedas
de compra y venta** y **Métodos de pago** (con algunos métodos activos y el de efectivo fijo).

## 4. Cargar el catálogo de productos

**Qué es.** Dar de alta tus productos y organizarlos por categorías. Es la base de todo: sin
productos no se puede vender.

**Cómo se hace.**
1. Ve a **Ventas → Catálogo Productos** (título de la tarjeta: **Productos**).
2. Crea una **categoría** con el botón **Categoría** de la cabecera.
3. Con el engranaje de la categoría, añade productos: **Productos** para un alta rápida de varios,
   o **Producto** para un alta individual.
4. En el formulario del producto rellena **Nombre**, **Precio** (y su moneda si tienes varias),
   **Cantidad**, **Orden**, y marca **Activo**, **Disponible para Vender** y, si corresponde,
   **Descuenta del Inventario**. Puedes añadir **Código de barras** y la configuración mayorista.
5. Para cargas grandes, usa **Importar Productos** (CSV): descarga el ejemplo, rellénalo y súbelo.

**A tener en cuenta.** Si registras un producto con costo y cantidad, se crea además una
**entrada de inventario** del día. Desactivar un producto **no lo borra**: queda listado y
atenuado como inactivo, y puede reactivarse.

**📷 Imagen sugerida.** El catálogo con 2–3 categorías expandidas, productos de ejemplo con su
precio, y el engranaje abierto mostrando *Categoría / Productos / Producto*.

## 5. Registrar las primeras entradas de inventario

**Qué es.** Meter el stock inicial de los productos.

**Cómo se hace.**
1. Ve a **Inventario → Entradas del día**.
2. Pulsa **Entrada**, elige el **producto**, la **cantidad** y el **costo**, y guarda.
3. Repite por cada producto que tenga existencias.

**A tener en cuenta.** La **fecha la pone el sistema** (es del día): no se puede registrar una
entrada con fecha pasada. Corregir el costo de una entrada **se propaga** a las ventas ya hechas
de ese producto.

**📷 Imagen sugerida.** El modal de **Entrada** con producto, cantidad y costo, y detrás la lista
del día con un par de entradas.

## 6. Crear los empleados y sus roles

**Qué es.** Dar de alta a la gente que usará el POS y decidir qué puede hacer cada uno.

**Cómo se hace.**
1. Ve a **Gestión → Usuarios** (título: **Empleados**).
2. Pulsa **Crear** y rellena los datos del empleado.
3. Asígnale su rol y las funcionalidades que puede usar.
4. Con las tarjetas de cada empleado puedes **Editar**, **Activar** o **Desactivar**.

**A tener en cuenta.** Esta pantalla necesita **conexión**. Los datos del empleado pertenecen a
la tienda que tengas seleccionada.

**📷 Imagen sugerida.** La lista de **Empleados** con 3 tarjetas (una inactiva) y los botones de
acción visibles.

## 7. Activar el acceso sin conexión en los equipos

**Qué es.** Preparar un equipo para que el empleado pueda entrar y trabajar **sin internet**.
Esto se hace con el **roster** (la lista de empleados con contraseña).

**Cómo se hace.**
1. En el equipo del Dueño, ve a **Gestión → Usuarios** y pulsa **Exportar roster**; ponle una
   contraseña maestra y confirma. Obtienes un **archivo de activación**.
2. Lleva ese archivo al equipo del empleado (por ejemplo con **Compartir** por hotspot).
3. En el equipo de destino, abre el **Acceso sin conexión** en la pantalla de acceso, elige el
   **Archivo de activación** y escribe la **Contraseña de activación**, y pulsa **Activar**.
4. Desde entonces, ese equipo puede iniciar sesión aunque no haya internet.

**A tener en cuenta.** Para **desactivar** el acceso sin conexión se pide confirmación; si el
dispositivo tiene datos cifrados y no hay otra copia de la clave, se te avisa del riesgo de
pérdida.

**📷 Imagen sugerida.** El panel de **Acceso sin conexión** abierto con sus dos opciones
(*Activar* / *Desactivar*) y, si se puede, el modal de activación con el archivo y la contraseña.

---

# Parte 2 — El día a día del empleado

## 8. Vender

**Qué es.** Armar una venta normal y confirmarla.

**Cómo se hace.**
1. Ve a **Ventas → Vender** (**Productos para vender**).
2. Encuentra el producto: escríbelo en el buscador, usa el **escáner** de código de barras, o
   navega por categorías (el interruptor **Todos** muestra todas).
3. En la fila del producto, indica la **Cantidad** y pulsa **Añadir**. La disponibilidad aparece
   entre paréntesis junto al nombre.
4. Repite con el resto de líneas. El **carrito** (ícono del encabezado) va sumando.
5. Abre el carrito, revisa la **Venta actual** y pulsa **Registrar**.

**A tener en cuenta.** Si un producto descuenta del inventario y no hay stock suficiente, el
sistema te lo dice antes de dejarlo añadir. Tras registrar, las cantidades se refrescan solas.

**📷 Imagen sugerida.** La pantalla **Vender** con el buscador, un par de categorías y dos filas de
producto con su cantidad y botón **Añadir**.

## 9. Cobrar (método de pago, crédito y vuelto)

**Qué es.** Elegir cómo paga el cliente y confirmar la venta desde el carrito.

**Cómo se hace.**
1. Abre el **carrito**.
2. Elige la **moneda** de la venta (si tienes varias).
3. Elige el **método de pago** (Efectivo, Transferencia, Zelle…).
4. En **efectivo**, escribe *con cuánto paga* y la app calcula el **Vuelto**.
5. Si la venta es **a crédito**, activa el interruptor **Crédito** y escribe el **Cliente**.
6. Pulsa **Registrar**.

**A tener en cuenta.** No se puede registrar un carrito **vacío**, ni cobrar **menos** que el
total, ni dejar un **crédito sin cliente**. No se pueden mezclar ventas normales y mayoristas en
el mismo carrito.

**📷 Imagen sugerida.** El panel del carrito abierto con la línea de un producto, el selector de
moneda, los métodos de pago, el campo *con cuánto paga* y el **Vuelto**.

## 10. Vender al mayor (por paquetes)

**Qué es.** Vender por paquetes, con precio por unidad según el tamaño de la compra.

**Cómo se hace.**
1. Ve a **Ventas → Vender Mayorista**.
2. Busca o escanea el producto; pulsa el **?** de la fila para ver los **rangos** de precio.
3. Escribe la **cantidad de paquetes** (el mínimo es el primero del rango) y **añade**.
4. La fila muestra la cotización (*paquetes × tamaño × precio = total*).
5. Confirma desde el carrito igual que una venta normal.

**A tener en cuenta.** Solo aparecen los productos configurados como mayoristas. En el carrito,
**+** y **−** mueven **paquetes** (no unidades), y bajar por debajo del primer rango elimina la
línea.

**📷 Imagen sugerida.** **Ventas Mayoristas** con un producto, el popup de **rangos** abierto y una
fila con la cotización calculada.

## 11. Cobrar un crédito

**Qué es.** Marcar como pagada una venta que se dejó a crédito.

**Cómo se hace.**
1. Ve a **Ventas → Créditos de hoy** (o al **Historial de créditos** para días anteriores).
2. Localiza al cliente en la lista.
3. Pulsa **Pagar** en la fila del crédito y confirma.

**A tener en cuenta.** En el historial (**Créditos**), el filtro arranca en **Por Pagar**. Puedes
filtrar por rango de fechas y por estado (**Todos / Por Pagar / Pagados**).

**📷 Imagen sugerida.** **Créditos del día** con tres clientes (uno pagado en verde, dos impagos en
ámbar) y el botón **Pagar** visible.

## 12. Cierre de caja

**Qué es.** Cuadrar el **efectivo** del día y cerrar la caja: la apertura, el conteo por
denominaciones y la diferencia.

**Cómo se hace.**
1. Ve a **Ventas → Cierre Caja** (**Cierre Efectivo**).
2. Escribe el valor de la **Apertura** (el efectivo con el que arranca la caja).
3. En la tarjeta **Conteo**, escribe cuántos billetes/monedas hay de cada **denominación**. Si
   necesitas una denominación que no está, usa **Nueva denominación** y **Agregar**.
4. Revisa las tarjetas **Esperado**, **Contado** y **Diferencia** (roja si falta, verde si sobra).
5. Pulsa **Cerrar Caja** y confirma. Si la **Diferencia no es cero**, el **Comentario** es
   obligatorio.

**A tener en cuenta.** Cuadra **solo el efectivo** (no transferencias ni Zelle). Mientras el día
está **Abierta** puedes seguir llenándolo; al cerrar, todo queda bloqueado. Si tienes varias
monedas, hay un registro por **día y moneda** (usa el filtro de moneda).

**📷 Imagen sugerida.** **Cierre Efectivo** con la **Apertura** puesta, la tarjeta **Conteo** con
varias denominaciones y cantidades, y las tres tarjetas de **Esperado / Contado / Diferencia**.

## 13. Ver tus ventas y el cuadre del día

**Qué es.** Consultar lo vendido hoy y cómo va la caja.

**Cómo se hace.**
- **Ventas del día** (**Ventas → Pedidos de hoy**): lista de las ventas de hoy con filtro por
  **método de pago**, por estado (**Todas / Pagadas / Créditos**) y por moneda. Desde el engranaje
  de una venta puedes **Editar** o **Eliminar/Cancelar**.
- **Cuadre del día** (**Ventas → Cuadre del día**): paneles colapsables con **Resumen Efectivo**
  (ventas en efectivo + créditos pagados − gastos), **Pago por Transferencia**, **Gastos**,
  **Créditos por cobrar**, **Créditos pagados** y **Ventas por categoría**.

**A tener en cuenta.** El **Cuadre del día** es una foto de control; el cierre formal del efectivo
es la sección 12.

**📷 Imagen sugerida.** **Cuadre del día** con el panel **Resumen Efectivo** abierto y los demás
paneles colapsados.

---

# Parte 3 — Inventario

> El inventario de la tienda es **local**: se consulta sin conexión y refleja lo que se ha
> registrado en el dispositivo.

## 14. Inventario disponible y conteo físico

**Qué es.** Consultar el stock por categoría y producto, su costo y su valor, y **contar** para
comparar lo que hay contra lo que dice el sistema.

**Cómo se hace.**
1. Ve a **Inventario → Disponible** (título: **Inventario**). Verás las categorías colapsadas.
2. Expande la categoría y revisa cada producto: nombre, **cantidad del sistema** entre paréntesis,
   costo unitario y valor total.
3. Usa el buscador (**Buscar producto**) para localizar uno.
4. Para contar: en la fila de cada producto escribe la cantidad **Contada**. La app muestra la
   **Diferencia** (contada − sistema): **rojo** si no coincide, **verde** si coincide, **—**
   mientras no has escrito nada.

**A tener en cuenta.** El conteo es **solo visual**: **no ajusta el stock** ni se guarda. Si
recargas o cambias de categoría, se pierde. (El sistema de referencia ajusta al confirmar; aquí
deliberadamente no.)

**📷 Imagen sugerida.** La categoría expandida con dos productos, el campo **Contada** con un
número en uno, y la **Diferencia** en rojo mostrando la falta.

## 15. Entradas: del día e historial

**Qué es.** Registrar y consultar las entradas de mercancía.

**Cómo se hace.**
- **Entradas del día** (**Inventario → Entradas del día**): pulsa **Entrada**, elige producto,
  cantidad y costo, y guarda. Con el menú de la fila puedes **Editar** o **Eliminar**.
- **Historial** (**Inventario → Historial de entradas**, título **Entradas**): consulta por rango
  de fechas, agrupado por día. Es **solo lectura**.

**A tener en cuenta.** Solo el **Dueño** ve la columna de costo y las acciones del día. Una entrada
que ya se vendió no se puede anular. La fecha siempre es la del día.

**📷 Imagen sugerida.** **Entradas del día** con el modal de **Entrada** abierto y un par de filas en
la lista.

## 16. Cantidades del día

**Qué es.** Reconciliar, por producto, cómo se movió el inventario hoy.

**Cómo se hace.**
1. Ve a **Inventario → Cantidades del día**.
2. Revisa la tabla por producto: **Inicio · Entradas · Disponible · Vendido · Final**.

**A tener en cuenta.** Es **solo lectura**, sin filtros. Los valores negativos y los movimientos se
resaltan con color para que salten a la vista.

**📷 Imagen sugerida.** La tabla de **Cantidades del Día** con 4–5 productos y las cinco columnas.

## 17. Ganancias del día

**Qué es.** El margen real del día: a qué precio se vendió y a qué costo.

**Cómo se hace.**
1. Ve a **Inventario → Ganancias del día**.
2. Revisa por producto el **Vendido**, **Precio**, **Costo** y la **Ganancia**, con el **Total**
   abajo.

**A tener en cuenta.** El costo sale del desglose **grabado en el momento de la venta** (no se
recalcula). La ganancia total se pinta en verde si es positiva y en rojo si es negativa.

**📷 Imagen sugerida.** **Ganancias del Día** con 3–4 productos, sus costos, y la fila **Total**.

## 18. Salida

**Qué es.** La pantalla **Salida** abre la venta con un **selector de tipo de pedido** (por defecto
Mayorista) sobre las categorías de productos. Comparte el carrito de la venta.

**Cómo se hace.**
1. Ve a **Inventario → Salida**.
2. Elige el **tipo** en el selector de la esquina superior, navega por categorías y añade lo que
   corresponda.
3. Confirma desde el carrito, igual que cualquier venta.

**A tener en cuenta.** La etiqueta del menú invita a pensar en *mermas o salidas no de venta*, pero
la pantalla funciona como una **venta** con tipo de pedido seleccionable. **Confirmar con el
Dueño** si el uso previsto es ese antes de documentarlo con más detalle.

**📷 Imagen sugerida.** La pantalla **Salida** con el selector de **tipo** arriba y una categoría con
sus productos.

---

# Parte 4 — Catálogo Web y Pedidos WhatsApp

> A diferencia del resto del POS, estas pantallas **necesitan internet**: el catálogo publicado y
> los pedidos viven en el servidor.

## 19. Catálogo Web: publicar y presentación

**Qué es.** Publicar tu catálogo en internet para que tus clientes lo vean, y darle tu marca.

**Cómo se hace.**
1. Ve a **Ventas → Configuración** (**Catálogo Web**). Solo lo ve el **Dueño**.
2. Pulsa **Sincronizar Catálogo**: se publican tus categorías y productos (creados, actualizados y
   los desactivados). Verás el resultado de la sincronización.
3. Copia la **dirección pública** (botón **Copiar**) o ábrela con **Ver catálogo** para compartirla.
4. En la tarjeta **Marca**: sube tu **Logo** y elige **Productos por fila en móvil**
   (uno o dos). Pulsa **Guardar marca**.
5. En **Carrusel** e **Imágenes del día**: **Elegir imágenes** (hasta 10), opcionalmente un
   **Pie de foto**, y **Subir imágenes**. Puedes reordenar (subir/bajar) o quitar cada una.

**A tener en cuenta.** **Editar un producto no lo republica**: publicar es el acto explícito de
**Sincronizar Catálogo**. El logo del banner ya no se edita aquí. Los contadores de la cabecera te
dicen cuántas categorías, productos, publicados y sin imagen tienes.

**📷 Imagen sugerida.** **Catálogo Web** con la tarjeta principal (dirección pública + métricas), la
tarjeta **Marca** con un logo de ejemplo, y los bloques **Carrusel** e **Imágenes del día**.

## 20. Editar los productos del catálogo (descripción e imagen)

**Qué es.** Completar el detalle que ve el cliente en el catálogo público.

**Cómo se hace.**
1. Dentro de **Catálogo Web**, expande una categoría.
2. En cada producto edita la **Descripción** (hay un contador de caracteres) y sube su **Imagen**.
3. Verás etiquetas como **Sin publicar**, **Nuevo** o **Sin guardar** según el estado.
4. Al terminar, pulsa **Guardar cambios** (arriba hay un resumen de pendientes).

**A tener en cuenta.** Hoy, en esta pantalla, se editan la **descripción y una imagen** por
producto; el porcentaje de descuento, el precio rebajado y la galería múltiple **no** están
disponibles aunque la ayuda del menú los mencione. Los cambios se guardan **por lotes** y lo que
falle se queda pendiente para reintentar.

**📷 Imagen sugerida.** Una categoría expandida con un producto cuyo editor muestra la **Descripción**
y la **Imagen**, y el resumen de pendientes con **Guardar cambios**.

## 21. Configurar los Pedidos WhatsApp

**Qué es.** Encender el pedido online y decir a dónde llega y cómo se entrega.

**Cómo se hace.**
1. Ve a **Ventas → Pedidos WhatsApp** (**Pedidos WhatsApp**). Solo lo ve el **Dueño**.
2. Activa el interruptor **Pedidos online**. Al encenderlo se muestra el resto.
3. Escribe el **Número de WhatsApp** donde quieres recibir los pedidos (obligatorio).
4. Activa **Recogida en la tienda** y/o **Envío a domicilio** (al menos una).
5. Rellena **Horario de atención** y **Zonas de reparto**, y pulsa **Sincronizar**.

**A tener en cuenta.** Una tienda nueva arranca con **Recogida** encendida. El precio y la moneda
del pedido salen del catálogo. Si el guardado va bien pero falla la recarga, se te avisa sin
perder lo escrito.

**📷 Imagen sugerida.** **Pedidos WhatsApp** con el interruptor encendido y el panel completo
(número, recogida y envío, horario y zonas).

## 22. Atender los pedidos

**Qué es.** La cola de pedidos que llegan por WhatsApp, para gestionarlos hasta la entrega.

**Cómo se hace.**
1. Ve a **Ventas → Pedidos** (**Pedidos**). Puede usarlo el Dueño y el Empleado.
2. Filtra por **Estado**, **Pago**, **Entrega**, **Repartidor** y **Desde/Hasta**; o busca por
   **código o teléfono**.
3. En cada fila: **Cambiar estado** (Nuevo → Aceptado → En preparación → Listo → Entregado /
   Cancelado), **Marcar pagado / pendiente** y **Asignar repartidor**.

**A tener en cuenta.** Los estados finales (Entregado, Cancelado) ya no muestran el selector de
estado. Todo va contra el servidor: tras cada acción la pantalla se recarga. La lista se pagina de
20 en 20 (**Anterior / Siguiente**).

**📷 Imagen sugerida.** La tabla de **Pedidos** con varios pedidos en distintos estados, los filtros
arriba y los controles de una fila visibles.

## 23. Repartidores

**Qué es.** La lista de personas que reparten, para asignarlas a los pedidos.

**Cómo se hace.**
1. Ve a **Ventas → Repartidores**.
2. Pulsa **Nuevo repartidor** y rellena **Nombre** y **Teléfono**; guarda.
3. Para editar, abre el repartidor, ajusta los datos y usa el interruptor **Activo**.

**A tener en cuenta.** Desactivar un repartidor es una **baja lógica** (no lo borra) para no romper
los pedidos ya repartidos: por eso los inactivos siguen apareciendo, tachados. Aquí solo se
gestionan personas; **asignar** repartidores se hace en **Pedidos**.

**📷 Imagen sugerida.** **Repartidores** con el formulario de alta abierto y una tabla con un
repartidor activo y otro inactivo (tachado).

## 24. Ventas de pedidos

**Qué es.** Las métricas del periodo y el histórico de pedidos (sin acciones).

**Cómo se hace.**
1. Ve a **Ventas → Ventas** (**Ventas**).
2. Ajusta los filtros (**Estado, Pago, Entrega, Desde, Hasta**): las métricas cambian al vuelo.
3. Revisa las tarjetas: **Pedidos**, **Ventas totales**, **Ticket medio**, **Pagado** y
   **Pendiente de cobro**, más los desgloses **Por estado** y **Por entrega**.
4. Abajo tienes la tabla histórica, paginada de 20 en 20.

**A tener en cuenta.** Los pedidos **cancelados** aparecen en el histórico pero **no** suman en las
métricas. Aquí solo se consulta: para operar un pedido se usa **Pedidos**.

**📷 Imagen sugerida.** **Ventas** con las cinco tarjetas de métricas, los dos desgloses y unas
líneas de la tabla histórica.

---

# Parte 5 — Gastos, Reportes y Estadísticas

## 25. Gastos

**Qué es.** Registrar los gastos operativos del día y consultarlos en el tiempo.

**Cómo se hace.**
1. **Gastos del día** (**Gastos → Gastos del día**): pulsa **Gasto**, elige el **Tipo**, escribe el
   **Total** (mayor que 0), la **moneda**, el **Tipo de pago** y una **Nota**, y guarda.
2. **Historial** (**Gastos → Gastos**): filtra por rango de fechas, por tipo de pago y por moneda;
   se agrupa por día.

**A tener en cuenta.** La **fecha la pone el sistema**. El historial es **solo lectura**. Los gastos
alimentan el **Cuadre del día** y las **Estadísticas**.

**📷 Imagen sugerida.** **Gastos del día** con el modal (`Tipo`, `Total`, `Moneda`, `Tipo de pago`,
`Nota`) y dos gastos listados.

## 26. Reportes

**Qué es.** El resumen de ventas del día y la generación de un PDF de inventario a precio de venta.

**Cómo se hace.**
1. Ve a **Reportes → Reportes de hoy**.
2. Revisa las tarjetas: **Pedidos**, **Ingresos**, **Costo** y **Ganancia bruta**.
3. (Opcional) Elige la **moneda** y pulsa **Inventario a precio de venta** para descargar el PDF.

**A tener en cuenta.** El PDF **respeta el filtro de moneda** (si eliges una, el archivo lleva solo
esa moneda; no convierte).

**📷 Imagen sugerida.** **Reportes de hoy** con las cuatro tarjetas y el botón **Inventario a precio
de venta**.

## 27. Panel de Control

**Qué es.** El tablero con la evolución del negocio en un rango de fechas.

**Cómo se hace.**
1. Ve a **Estadísticas → Dashboard** (**Panel de Control**).
2. Elige el **rango de fechas** (por defecto: los últimos **7 días**, terminando **ayer**).
3. Revisa los KPI y las gráficas de **Ventas** y **Ganancia**.

**A tener en cuenta.** Si tienes varias monedas, los importes se muestran **por moneda**, sin
conversión. Las secciones de **Gastos** y **Créditos** solo aparecen si esos módulos están activos.

**📷 Imagen sugerida.** El **Panel de Control** con el selector de rango, 3–4 tarjetas KPI y una
gráfica de ventas.

## 28. Cuadre por fechas

**Qué es.** El cuadre del periodo: ventas, gastos y ganancias entre dos fechas.

**Cómo se hace.**
1. Ve a **Estadísticas → Cuadre por fechas**.
2. Elige **Fecha inicio** y **Fecha fin** y pulsa **Generar**.
3. Revisa los cuatro KPI — **Ventas**, **Gastos**, **Ganancias Bruta** y **Ganancias** — y la
   tarjeta **Cuadre** con sus paneles colapsables.

**A tener en cuenta.** **Ganancias Bruta** es la ganancia **sin** restar gastos; **Ganancias** es
la bruta **menos** los gastos. La fecha de inicio debe ser anterior o igual a la de fin.

**📷 Imagen sugerida.** **Cuadre por fechas** con las dos fechas elegidas, los cuatro KPI y el panel
**Resumen Efectivo** del cuadre abierto.

---

# Parte 6 — Configuración y mantenimiento

## 29. Empleados y roster (resumen)

Ver la **sección 6** para crear empleados y la **sección 7** para el acceso sin conexión. Recuerda:
gestionar empleados **necesita conexión**, y el roster exportado es lo que habilita el equipo de un
empleado para trabajar sin internet.

**📷 Imagen sugerida.** El panel **Exportar roster** con el campo de contraseña maestra.

## 30. Tasas de Cambio

**Qué es.** Registrar cuántas unidades de cada moneda equivalen a **1 USD** para cada método de
pago. Solo aparece con el módulo de **múltiples monedas**.

**Cómo se hace.**
1. Ve a **Gestión → Tasas de Cambio**.
2. Pulsa **Tasa**, elige la **moneda** y el **método**, escribe el **valor de compra** y el
   **valor de venta**, y la **fecha desde la que rige**; pulsa **Registrar**.
3. Consulta **Tasas Vigentes** (las activas) y el **Historial de tasas**.

**A tener en cuenta.** El sistema es **append-only**: cada cambio crea una fila nueva y las filas
históricas **no se editan ni se borran**. La papelera solo **desactiva** (la saca del cálculo pero
la deja en el historial). **USD no aparece** en el selector (es la referencia). El **método** se
limita a los válidos para la moneda elegida.

**📷 Imagen sugerida.** **Tasas de Cambio** con el modal (`Moneda`, `Método`, valores de compra y
venta, fecha) y debajo **Tasas Vigentes** con 2–3 monedas.

## 31. Configuraciones

Ver la **sección 3** (monedas y métodos de pago). En resumen, esta pantalla ofrece: **Tienda
activa** (solo multi-tienda), **Monedas de compra y venta** (solo con múltiples monedas) y
**Métodos de pago**. Guarda al instante.

**📷 Imagen sugerida.** Las tres tarjetas de **Configuraciones**, con el estado **Guardado** visible.

## 32. Mis tiendas

**Qué es.** Ver y gestionar todas tus tiendas (activas e inactivas).

**Cómo se hace.**
1. Ve a **Gestión → Mis tiendas**.
2. Con el engranaje de cada tarjeta puedes **Editar** (nombre, activar/desactivar) y **Editar el
   plan**.
3. Si tienes el módulo de multi-tienda, arriba hay un botón para **crear una tienda** nueva.

**A tener en cuenta.** Esta pantalla **necesita conexión**. Al crear una tienda, esta **nace en el
plan Superior** con su catálogo. Desactivar una tienda pide confirmación (puede ser la que tienes en
uso).

**📷 Imagen sugerida.** **Mis tiendas** con dos tarjetas (una activa, una inactiva), el plan y el
próximo cobro visibles, y el engranaje abierto.

## 33. Sincronización: exportar e importar

**Qué es.** Hacer una **copia de seguridad** cifrada de los datos de la tienda y **restaurarla**
(en el mismo u otro dispositivo).

**Cómo se hace — Exportar.**
1. Ve a **Sincronización → Exportar**.
2. Escribe la **Contraseña de cifrado**.
3. Pulsa **Exportar**: se descarga un archivo `.zip` (o compártelo por hotspot con **Compartir**).

**Cómo se hace — Importar.**
1. Ve a **Sincronización → Importar**.
2. Elige el **Archivo de respaldo (.zip)** (o recíbelo por hotspot) y escribe la contraseña.
3. Pulsa **Importar**.

**A tener en cuenta.** **Guarda la contraseña**: sin ella el respaldo no se puede abrir. La copia
incluye catálogo, inventario, ventas, gastos, créditos, métodos de pago, cierres de efectivo y más.
Al importar, los datos se **fusionan** con los del dispositivo (no se pisa a ciegas).

**📷 Imagen sugerida.** **Exportar datos** con el campo de contraseña y el botón **Exportar**, y al
lado **Importar datos** con el selector de archivo.

## 34. Diagnóstico

**Qué es.** Una pantalla de soporte con el registro de errores y eventos del dispositivo. Solo la
ven el **Dueño** y el administrador de la plataforma.

**Cómo se hace.**
1. Ve a **Gestión → Diagnóstico**.
2. Revisa **Información del dispositivo** (versión, conexión, navegador).
3. Filtra por **nivel** o **busca** en la lista; usa **Compartir / Descargar / Copiar** para
   enviarlo a soporte y **Limpiar** para vaciarlo.

**A tener en cuenta.** Se actualiza solo cada segundo. Es la pantalla que conviene abrir cuando algo
falla, para enviar el detalle.

**📷 Imagen sugerida.** **Diagnóstico** con la tarjeta de información del dispositivo y la lista con
una entrada de error y una de aviso.

---

## Anexo — Qué NO cubre este manual

Este manual se limita a los módulos del plan **Pago** más **Catálogo Web**, **Pedidos WhatsApp** y
las **configuraciones**. Quedan **fuera**: los módulos de **Almacenes** y **Elaboración** (plan
Superior) y todas las pantallas de **Administración de la plataforma** (SuperAdmin: tiendas, dueños,
comercializadores, módulos, cobros y comisiones).
