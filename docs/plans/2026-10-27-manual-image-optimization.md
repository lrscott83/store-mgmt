# Optimización de las imágenes del manual (en la generación de la ayuda)

**Fecha:** 2026-10-27 · **Estado:** implementado (medición en la sección final)
**Alcance:** SOLO la salida generada (`backend/src/SMCA.WebApi/help/`). Las imágenes fuente de
`docs/manual/img/` **no se tocan**.

## Problema medido

| Artefacto | Peso | Detalle |
| --- | --- | --- |
| `docs/manual/img` | **10,62 MB** | 73 archivos · PNG 8,88 MB (67) · JPG 1,75 MB (6) |
| `backend/src/SMCA.WebApi/help/images` | **10,62 MB** | Copia idéntica de las 73 imágenes |
| `manual-usuario-pos.pdf` | **9,39 MB** | Imágenes embebidas |
| `help/index.html` | 65 KB | Referencia las 73 imágenes |

- **55 de 73** imágenes son `1170×1992` (captura con `devices['iPhone 13']`, DPR 3:
  `capture-manual.mjs`).
- La más pesada: `41-catalogo-publico.jpg` = **1,15 MB** (`1170×7065`).
- Los tutoriales (`45`–`54`) suman ~1,5 MB.
- El contenedor del manual es de **820 px** (`manual-template.html:38-39`): se sirven más píxeles
  de los que se muestran, sobre todo en móvil.

### Causas

1. `manual-template.html:82-90` dimensiona con `max-width:100%` pero **no** usa
   `loading="lazy"`, `decoding="async"`, `width`/`height` ni `srcset`. Al abrir el manual se
   descargan **10,62 MB** aunque solo se vea la primera sección.
2. `build-manual.mjs:59-66` (`copyImages`) copia los archivos **tal cual** (`copyFileSync`); no
   hay conversión ni compresión en ningún punto del pipeline.
3. `capture-manual.mjs` captura PNG sin `type`/`quality`.
4. Hay espacio muerto al final de capturas de una sola pantalla (p. ej. `58-salida.png`: ~400 px
   de fondo uniforme bajo el pie).

## Decisión

Aplicar las mejoras **al generar la ayuda** (`pnpm generate:manual`), no sobre las fuentes:

- `docs/manual/img/*` sigue siendo la fuente de verdad, sin modificar, y el Markdown sigue
  referenciando `img/*.png` (GitHub y cualquier visor del `.md` siguen funcionando).
- `build-manual.mjs` produce `help/images/*.webp` optimizados y un `index.html` que los referencia.
- El PDF se genera del mismo HTML, así que también baja de peso.

## Las tres mejoras

### 1. Carga diferida y dimensiones (cero pérdida)

En el HTML generado, cada `<img>` recibe `loading="lazy" decoding="async"` y `width`/`height`
reales (obtenidos de la imagen ya optimizada). Con `max-width:100%; height:auto` el navegador
mantiene la proporción y reserva el espacio: menos transferencia inicial y sin salto de layout.

### 2. WebP sin pérdida (cero pérdida de píxeles)

Los PNG se convierten a **WebP lossless** (`sharp`, `lossless: true`). Los JPG también se prueban
en lossless y, si el resultado pesa más que el original (pasa con los catálogos públicos, que ya
venían comprimidos), **se conserva el JPG original**. No hay recompresión con pérdida en ningún
caso: se elige siempre el archivo más pequeño entre el WebP lossless recortado y la fuente.

### 3. Recorte del espacio muerto inferior (cero pérdida)

Se toma el **color dominante de la última fila** (ignorando 4 px de borde, donde la captura puede
traer sombra o scrollbar) y se recortan las filas inferiores **uniformes** hasta la última fila con
contenido, dejando 24 px de margen. Solo actúa sobre bordes inferiores vacíos, nunca sobre
contenido, y no recorta más del 55 % del alto.

## Implementación

- Dependencia de build: **`sharp`** (`devDependency` del workspace `frontend-react`). Es la única
  incorporación; el runtime del POS no la usa.
- `build-manual.mjs`:
  - `optimizeImages()` reemplaza a `copyImages()`: recorta, convierte, elige el menor y devuelve
    un mapa `fuente → salida` + dimensiones.
  - `renderMarkdown(markdown, map)` reescribe `img/<fuente>` → `images/<salida>`.
  - `injectImageAttributes(html, dims)` añade `loading`, `decoding`, `width` y `height`.
  - `assertImagesExist()` se mantiene: falla si el `.md` referencia una fuente inexistente.
- El PDF sigue generándose con Playwright desde el HTML (Chromium soporta WebP).

## Verificación

1. `pnpm generate:manual` sin errores; 73 imágenes de salida.
2. Comparar peso antes/después (total, PNG vs WebP, top 10) y el PDF.
3. Confirmar que las fuentes `docs/manual/img` no cambiaron (`git status`).
4. Confirmar que el HTML contiene `loading="lazy"` y `width`/`height` en todas las `<img>`.
5. Abrir el HTML generado y comprobar que las imágenes se ven (sin rutas roas).

## Riesgos

- **`sharp` como dependencia de build** (alta fidelidad pero nativa): si el entorno de CI no
  instala binarios nativos, `generate:manual` falla; el manual no se regenera en runtime, así
  que no afecta al POS.
- **Recorte automático**: solo filas 100 % uniformes; una captura con fondo degradado no se
  recorta (queda igual, no se rompe).
- **Lossless WebP en JPG**: puede salir mayor que el JPG; el código conserva el original.
- **Navegadores**: WebP está soportado por todos los navegadores objetivo y por Chromium en la
  impresión del PDF.

## Medición antes/después

Corrida real de `pnpm generate:manual` (2026-10-27):

| Métrica | Antes | Después | Cambio |
| --- | --- | --- | --- |
| Imágenes servidas (`help/images`) | 10,62 MB | **5,17 MB** | **−51,3 %** |
| PNG (67 archivos) | 8,88 MB | 3,42 MB (WebP) | −61,5 % |
| JPG (6 archivos) | 1,75 MB | 1,75 MB | 0 % (lossless no compensa) |
| PDF del manual | 9,39 MB | 9,06 MB | −3,5 % |

- **75/75** `<img>` llevan `loading="lazy"`, `decoding="async"` y `width`/`height`.
- La carga inicial ya no baja 10,6 MB: el navegador solo pide las imágenes visibles.
- `docs/manual/img/` **no cambió** (las fuentes siguen intactas).
- Ejemplo de recorte: `58-salida` pasó de `1170×1992` a `1170×1270` (−36 % de alto) y de 123 KB a
  52 KB, conservando el pie completo.
- Los 6 JPG se quedaron como JPG porque su WebP lossless pesaba más (el mayor,
  `41-catalogo-publico.jpg`, es 1,15 MB y su WebP lossless daba 5,2 MB).

### El PDF y la carga diferida

`loading="lazy"` es correcto para la web pero **rompe la impresión**: al generar el PDF, Chromium
solo rasteriza las imágenes ya cargadas y el manual salía con 3 imágenes (0,72 MB). `emitPdf()`
ahora fuerza `loading="eager"` en todas las `<img>` y espera a que terminen antes de imprimir; el
PDF vuelve a llevar sus **73 imágenes** (9,06 MB). El PDF no es parte de la carga de la página: se
descarga aparte, así que su peso no afecta al peso web del manual.

## Pendiente / siguientes opciones

- **`srcset`** con variantes de 800/1600 px para el JPG grande, si se acepta servir una versión
  redimensionada en pantallas pequeñas (el PDF seguiría usando la fuente).
- Evaluar **AVIF lossless** para los PNG si en el futuro se quiere bajar más el total.
