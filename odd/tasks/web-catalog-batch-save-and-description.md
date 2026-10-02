# Web Catalog: descripción editable + guardado por lotes

## Objetivo

En la vista **Catálogo Web** (`/sales/web-catalog`) volver a mostrar la descripción de cada
producto como campo editable, sustituir el botón «Guardar» por producto por **un único botón al
final de la página** que aplique todos los cambios pendientes enviando **solo los campos que
cambiaron**, y en la **tarjeta del catálogo público** poner nombre y precio en la misma fila con
fuente menor y la descripción debajo, recortada a 3 líneas con puntos suspensivos.

## Problema

Hoy la vista Catálogo Web solo deja cambiar la imagen: los campos editables (descripción, % de
descuento, precio rebajado, «Nuevo») están **comentados** desde la decisión del owner del
2026-09-29. El botón `catalog-save-{id}` vive dentro de cada tarjeta y guarda solo esa tarjeta.

En el catálogo público la tarjeta gasta tres bloques verticales (nombre / descripción / precio) con
`text-lg` para nombre y precio: la información clave del producto queda dispersa y la descripción
larga empuja el precio fuera de la vista rápida.

## Por qué

El dueño edita el catálogo por lotes: recorre producto por producto revisando y corrigiendo
descripciones. Un botón por producto obliga a un `PUT` por tarjeta y deja al owner sin una noción
de «qué falta por guardar». Un único botón que aplica el diff hace visible el estado pendiente y
reduce las escritura al mínimo.

## Alcance

### Autorizado

- `frontend-react/apps/web-store-pos/app/sales/components/catalog-product-editor.tsx`
- `frontend-react/apps/web-store-pos/app/sales/routes/web-catalog.tsx`
- `frontend-react/apps/web-store-pos/app/catalog/routes/public-catalog.tsx`
- `frontend-react/apps/web-store-pos/app/shared/lib/i18n/es.ts`
- `frontend-react/apps/web-store-pos/app/sales/routes/__tests__/web-catalog.test.tsx`

### Fuera de alcance (decidido por el owner 2026-10-01)

- **Solo la descripción** vuelve a ser editable. `% de descuento`, `precio rebajado` y el switch
  `Nuevo` **siguen comentados**: no se restauran.
- **No** se toca backend: `UpdateProductCatalogFieldsCommand` ya acepta campos opcionales y solo
  escribe los que llegan (`Description != null`, etc.). El «solo lo modificado» se resuelve en el
  cliente mirando qué difiere del `product` original.
- **No** se toca el modal de detalle del catálogo público: sigue mostrando la descripción completa.
- **No** se toca ningún E2E existente (`frontend-react/e2e/`, `backend/src/SMCA.WebApi.E2ETests/`).

## Decisiones del owner (2026-10-01)

| Decisión | Respuesta |
| --- | --- |
| Campos editables | Solo la descripción |
| Botón Guardar | Uno único al final de toda la página |
| Imágenes | El botón único también sube las imágenes pendientes |
| Precio tachado (público) | Junto al precio final, a la derecha |

## Restricciones

- **Angular es legacy**: `frontend/` no se lee, no se cita y no se compara. Todo sale de React.
- **E2E intocable**: solo se permiten tests unitarios nuevos/ajustados en `__tests__/`.
- La descripción se pinta como **texto plano** (decisión D9): nunca HTML.
- Límite de descripción: `MAX_DESCRIPTION_LENGTH` (4000, espejo de `ProductEntityLimits`).
- `data-testid` existentes que el E2E/los tests usan se conservan; los que se reorganizan se
  actualizan en el mismo commit.

## Tareas

- [x] **T1** — `catalog-product-editor.tsx`: restaurar SOLO el `textarea` de descripción (label,
  placeholder, contador, validación de longitud), quitar el botón Guardar por producto y reportar
  los cambios al padre. Definir la constante `INPUT_CLASSES` (hoy solo existe comentada).
- [x] **T2** — `web-catalog.tsx`: estado pendiente en el padre (descripciones, imágenes
  seleccionadas, eliminación de imagen marcada), diff contra el producto original, **un único
  botón «Guardar cambios» al final de la página** deshabilitado sin cambios, guardado secuencial
  con reporte de éxito parcial.
- [x] **T3** — `es.ts`: claves nuevas del guardado por lotes y del aviso «sin guardar».
- [x] **T4** — `web-catalog.test.tsx`: ajustar los 3 tests que pulsan `catalog-save-{id}` al botón
  único y cubrir el diff (solo se envía lo modificado).
- [x] **T5** — `public-catalog.tsx`: tarjeta con nombre izquierda + precio derecha en la misma fila
  con fuente menor, y debajo la descripción en `text-xs` con `line-clamp-3` (puntos suspensivos).
- [x] **T6** — Verificación: `typecheck`, `lint` y los dos archivos de test afectados.
- [x] **T7** — El `textarea` de la descripción ocupa todo el ancho disponible. Decisión del owner
  (2026-10-01): el control se estira a lo ancho de la tarjeta. **Sin borrar el código comentado**
  (galería, descuentos, grid de actualización) — sigue intacto y comentado.

## Criterios de aceptación

1. La tarjeta de producto de `/sales/web-catalog` muestra un `textarea` con la descripción actual.
2. No existe ningún botón «Guardar» dentro de una tarjeta de producto.
3. Hay exactamente un botón «Guardar cambios», al final de la vista, deshabilitado mientras no haya
   cambios pendientes.
4. Con una sola descripción editada, el `PUT` envía `{ description }` y nada más.
5. Con un producto intacto, no se envía ningún `PUT` para él.
6. Una imagen seleccionada se sube al pulsar el botón único, y la principal anterior se borra
   después del guardado (orden que exige `RemoveProductImageCommand`).
7. La tarjeta pública muestra nombre y precio en la misma fila; la descripción va debajo, con
   máximo 3 líneas visibles y puntos suspensivos cuando la excede.

## Comandos de verificación

```bash
cd frontend-react/apps/web-store-pos
pnpm typecheck
pnpm lint
pnpm vitest run app/sales/routes/__tests__/web-catalog.test.tsx app/catalog/routes/__tests__/public-catalog.test.tsx
```

## Ruta y disparadores de delegación

Ruta ODD: **directa delegada** (un escritor). Disparadores cumplidos: 5 archivos no triviales
(regla de escritura), preparación de la escritura con lectura previa (regla de preparación).
Verificación: el escritor corre los comandos de arriba; la puerta parental hace una relectura
estructural y una comprobación de un comando reportado.

## Progreso

- 2026-10-01 — Feature creado. Decisiones del owner resueltas con `question` (sin supuestos).
  Línea base medida: 23 tests verdes en los dos archivos afectados, 0 errores de tipo.
- 2026-10-01 — T1–T6 cerradas. Escritura delegada a un solo escritor (disparadores de mapeo,
  escritura y preparación cumplidos: 6 archivos).
- 2026-10-01 — Dos defectos corregidos por el padre en la relectura del diff: el `textarea` de
  descripción quedaba en media columna por un `md:grid-cols-2` cuyo segundo hijo pasó a estar
  comentado (se eliminó la grid), y el escritor dejó el archivo sin salto de línea final.
- 2026-10-01 — Tres ramas que el escritor dejó sin cubrir, cerradas por el padre: marcado de
  borrado de imagen, exclusividad imagen↔borrado, y bloqueo por descripción demasiado larga.
- 2026-10-01 — T7 cerrada (inline, 1 archivo ya entendido). El `textarea` usaba solo
  `INPUT_CLASSES`, que no trae ninguna clase de ancho, y siendo `inline-block` se quedaba en su
  ancho por defecto (~20 columnas) aunque la caja padre es `block`. Se añadió `w-full` **en el
  `textarea`** y no en `INPUT_CLASSES`: esa constante guarda a propósito solo la parte visual
  compartida, y el input del catálogo público hace lo mismo (`w-full` por fuera de las clases
  comunes). Código comentado intacto.
- 2026-10-01 — Causa raíz del bug de imagen fantasma en el popup público diagnosticada y
  documentada en `odd/tasks/catalog-image-single-source.md` (aún sin arreglar en esta feature).

## Evidencia de verificación

| Comando | Resultado |
| --- | --- |
| `pnpm lint` | exit 0 |
| `pnpm vitest run <los 2 archivos>` | 31 passed (31), 0 fallos. Línea base era 23 → +8 tests |
| `pnpm typecheck` | 69 errores, **0 en los 6 archivos tocados** |

Los 69 errores de `typecheck` son preexistentes y viven en `app/sync/**` (`ChannelRate.buyValue` /
`sellValue` ausentes en el tipo de dominio) y `messages-realtime-service.ts`
(`Cannot find module '@microsoft/signalr'`). Ninguno de esos archivos aparece en el diff.
`pnpm typecheck` NO estaba verde antes de este cambio; queda como deuda ajena a esta feature.

### T7 (2026-10-01)

| Comando | Resultado |
| --- | --- |
| `pnpm exec turbo run typecheck --force --filter=@store-mgmt/web-store-pos` | 5 successful, 0 cached, 43.7s |
| `pnpm exec turbo run lint --force --filter=@store-mgmt/web-store-pos` | 4 successful, 0 cached, 1m14.654s |
| `pnpm --filter @store-mgmt/web-store-pos exec vitest run app/sales/routes/__tests__/web-catalog.test.tsx` | 21 passed (21), 0 fallos |

Con `--force` a propósito: sin él turbo devuelve `FULL TURBO` (replay de caché, cero ejecución real)
y el exit 0 no probaría nada.

## Decisiones que quedaron dentro de la feature

- **"Quitar imagen" pasa a ser un cambio pendiente**, no una acción inmediata. Es la consecuencia
  directa del botón único: si el borrado se aplicara al instante, la vista quedaría con medio
  estado guardado y el dueño perdería la noción de qué falta. Seleccionar una imagen cancela el
  borrado marcado, y viceversa: son intenciones opuestas y gana la última.
- El aviso de descripción demasiado larga aparece **dos veces**: junto al campo que hay que
  corregir y en la barra del botón (para verlo con la categoría plegada). El botón queda
  deshabilitado mientras haya alguna descripción larga, aunque su categoría esté plegada.
- Cada producto con cambios muestra un badge **«Sin guardar»**: sin él, el guardado por lotes es
  invisible y el owner no sabe qué está esperando al botón.

## Pendiente reportado, no bloqueante

- `WEB_CATALOG.UPLOAD_ERROR` quedó **huérfana** en `es.ts`: el paso por lotes ya no abre un modal
  por producto (reporta una sola vez al final, con `WEB_CATALOG.SAVE_PARTIAL`). La clave se deja en
  su sitio; borrarla es una línea cuando se decida.

## Siguiente paso

Nada pendiente en esta feature. Sin commit: el árbol de trabajo está limpio respecto al alcance y
la entrega (commit/push/PR) es decisión del owner.