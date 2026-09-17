# Dashboard POS para dueño del negocio

## Objetivo

Ver cómo se comporta el negocio de forma general, sin ranking, sin tablas y sin desgloses horarios.  
El dashboard debe ser mobile friendly, con cards apiladas, útil para tomar decisiones rápidas.

---

## KPIs clave

### Card: Ventas totales
- **Qué muestra:** Dinero total cobrado en el periodo.
- **Cómo se calcula:** Suma de importes cobrados.
- **Para qué sirve:** Saber si el negocio está vendiendo más o menos.
- **Nota:** No restar devoluciones ni descuentos.

### Card: Margen bruto
- **Qué muestra:** Ganancia bruta después del costo de lo vendido.
- **Cómo se calcula:** Ventas totales − costo de productos vendidos.
- **Para qué sirve:** Saber si realmente ganas dinero.
- **Nota:** Sin restar devoluciones ni descuentos.

### Card: Margen %
- **Qué muestra:** Porcentaje de ganancia sobre ventas.
- **Cómo se calcula:** Margen bruto ÷ Ventas totales × 100.
- **Para qué sirve:** Comparar rentabilidad entre periodos o entre POS.

### Card: Transacciones
- **Qué muestra:** Cantidad de ventas realizadas.
- **Cómo se calcula:** Contar transacciones.
- **Para qué sirve:** Medir flujo de clientes.
- **Nota:** En lugar de “tickets”, usar “Transacciones” o “Ventas realizadas”.  
  “Ventas” solo puede confundir con el monto.

### Card: Promedio por transacción
- **Qué muestra:** Valor promedio de cada venta.
- **Cómo se calcula:** Ventas totales ÷ Transacciones.
- **Para qué sirve:** Ver si los clientes compran más o menos por visita.

### Card: Unidades por transacción
- **Qué muestra:** Cantidad de productos por venta.
- **Cómo se calcula:** Unidades vendidas ÷ Transacciones.
- **Para qué sirve:** Medir ventas complementarias y cross-selling.

### Card: Crecimiento
- **Qué muestra:** Variación porcentual vs periodo anterior.
- **Cómo se calcula:** (Actual − anterior) ÷ anterior × 100.
- **Para qué sirve:** Saber si el negocio mejora o empeora.

### Card: Distribución por método de pago
- **Qué muestra:** Porcentaje de ventas por efectivo, tarjeta, transferencia, etc.
- **Cómo se calcula:** Monto por método ÷ Ventas totales × 100.
- **Para qué sirve:** Conciliación, comisiones y seguridad.

### Card: Distribución por categoría
- **Qué muestra:** Composición de las ventas por categoría de producto.
- **Cómo se calcula:** Ventas de categoría ÷ Ventas totales × 100.
- **Para qué sirve:** Entender qué pesa más en el negocio, sin ranking.

---

## Diseño mobile-first

- Una sola columna.
- Cards apiladas verticalmente.
- Header fijo con filtros.
- Tipografía grande para valores.
- Colores semáforo: verde positivo, rojo negativo, gris neutro.
- Sin tablas.
- Sin ranking.
- Navegación inferior con pestañas.

---

## Estructura de pantalla

### 1. Header
- Nombre del negocio.
- Selector de periodo: Hoy, Semana, Mes, Personalizado.
- Selector de POS: Todos, POS 1, POS 2, etc.

### 2. Resumen general
Cards principales:
- Ventas totales.
- Margen bruto.
- Transacciones.
- Promedio por transacción.

Cada card muestra:
- Valor grande.
- Variación vs periodo anterior.
- Sparkline simple.
- Texto corto de cálculo.
- Icono.

### 3. Comparación
Chips con variaciones:
- Ventas: +8.2%
- Margen: −2.1%
- Transacciones: +5.0%
- Promedio: +3.1%

### 4. Tendencia
Gráfico de línea simple.
- Sin desglose por hora ni por día.
- Solo evolución general del periodo.

### 5. Composición
- Donut de métodos de pago.
- Donut de categorías.

### 6. Comportamiento por POS
Cards por cada POS.
- Nombre del POS.
- Ventas totales.
- Margen %.
- Transacciones.
- Promedio por transacción.
- Variación vs periodo anterior.
- Sparkline.
- Sin ordenar por mejor o peor. Orden alfabético o por ubicación.

### 7. Alertas e insights
Cards con mensajes automáticos:
- “Margen bajó 2.1% vs mes anterior.”
- “Transacciones subieron, pero el promedio por venta bajó.”
- “POS Centro cayó 12% en ventas.”

### 8. Navegación inferior
- Resumen
- Tendencias
- Productos
- POS
- Alertas

---

## Features

- Filtros por periodo y POS.
- Comparación automática vs periodo anterior.
- Sparklines en cada card.
- Insights en lenguaje natural.
- Alertas configurables por umbral.
- Modo offline.
- Exportar resumen.
- Notificaciones push.
- Seguridad por roles.
- Tap en card para ver detalle.

---

## Ejemplo de card
