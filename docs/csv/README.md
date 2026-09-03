# Productos más vendidos en Cuba (CSV de importación)

Dos ficheros listos para importar con el importador CSV de productos (modal de importar
productos). Ambos usan cabeceras en español, tal como exige el importador:

- `productos-mas-vendidos-cuba.csv` — surtido principal (45 productos).
- `productos-segunda-importacion.csv` — parte del mismo surtido con precios de
  costo/venta distintos + 5 productos nuevos (ver sección al final).

```
categoria,nombre,precio,costo,cantidad
```

## Contenido

45 productos de consumo masivo en Cuba, agrupados en categorías:

- **Carnes**: cerdo, pollo, picadillos, salchichas, jamón, mortadella.
- **Granos y pastas**: arroz, frijoles, garbanzo, chícharo, espaguetis, harina de maíz.
- **Lácteos y huevos**: huevos, leche en polvo, yogur, queso blanco.
- **Aceites y grasas**: aceite comestible, manteca de cerdo.
- **Verduras y hortalizas**: tomate, cebolla, ajo, ají cachucha, calabaza, boniato, yuca, plátano macho.
- **Frutas**: frutabomba, guayaba, mango, piña, manzana, limón.
- **Despensa**: azúcar, sal, café.
- **Bebidas**: cerveza Cristal (lata 355 ml).
- **Aseo e higiene**: pasta dental, jabón de baño, detergente en polvo y líquido, champú.

El peso de cada fila está en la unidad que se indica entre paréntesis en el nombre
(libra, unidad, cartón, litro, gramos, etc.). `cantidad` es el stock inicial de ejemplo.

## Precios

- **Moneda:** pesos cubanos (CUP).
- **Referencia:** precios de mercado minorista de junio–julio de 2026, según
  listados publicados por la prensa cubana independiente y ofertas de comercios:
  - Listado de precios de alimentos por categorías en mercados cubanos
    (14yMedio vía Directorio Cubano, lista actualizada de precios en Cuba).
  - Precios de aseo e higiene (publicaciones de venta minorista, 2026).
  - Cerveza Cristal: precio de venta al detalle en CUP (caja de 24 ≈ 10 000 CUP).
- Los precios reales varían por provincia, por canal (agro, Mipymes, MLC) y con el
  tiempo (alta inflación). Este fichero es una **referencia realista**, no una lista
  oficial; ajusta los valores al surtidor de tu negocio.

## Supuestos (costo y cantidad)

- `costo` es un **estimado del precio de compra/adquisición**, aproximadamente 15–22 %
  por debajo del precio de venta minorista (margen típico de una tienda/agro).
- `cantidad` es un **stock inicial de ejemplo** y debe sustituirse por el inventario real.
- Cuando la fuente daba un rango de precios (p. ej. tomate 50–300 CUP/lb) se usó un
  valor intermedio representativo.

## Cómo usar

1. Abre el modal de importar productos y pulsa **Descargar Ejemplo** para ver el formato,
   o usa directamente este fichero como plantilla.
2. Importa `productos-mas-vendidos-cuba.csv` (o copia las filas a tu propia hoja de cálculo
   y expórtala como CSV) — las cabeceras deben quedar exactamente:
   `categoria,nombre,precio,costo,cantidad`.
3. Si tu negocio vende en USD/MLC en vez de CUP, divide `precio` y `costo` por la tasa de
   cambio que uses antes de importar.

## Fichero alternativo: `productos-segunda-importacion.csv`

Segundo fichero de ejemplo para practicar importaciones con datos distintos:

- Repite **18 productos** del primer fichero pero con **precio de venta y costo
  diferentes** (escenario de otro proveedor/zona: la mayoría algo más caros, unos
  pocos en promoción por debajo del precio del primer fichero). Sirve para comprobar
  que una importación independiente funciona aunque las filas compartan nombres con
  otra anterior.
- Incluye **5 productos nuevos simples** (pan de agua, pan dulce, galletas, agua
  embotellada y refresco) que no están en el primer fichero.
- Los precios de los productos nuevos (pan, galletas, agua, refresco) son
  **aproximados**: los precios reales del pan y las galletas en panaderías privadas
  reportaron valores de hasta 550 CUP por 500 g (agosto 2026) y fluctúan mucho;
  ajústalos a tu surtidor antes de importar.

## Limitaciones

- El primer fichero no incluye productos sin referencia de precio confiable en CUP
  (rones añejos, artículos de ferretería); el segundo añade pan, galletas, agua y
  refresco solo como **aproximados** para practicar, marcados en su sección.
- Las categorías se crean tal cual aparecen en la columna `categoria` (ortografía en español).
