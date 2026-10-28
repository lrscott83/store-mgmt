# 7. web-catalog.spec.ts:77 — dos locators genéricos quedaron ambiguos en la vista Catálogo Web

## Qué prueba el test

`web-catalog.spec.ts:77:7` — *"crear el producto en el POS, sincronizar, ponerle imagen y verlo publicado
en /catalog/<slug>"*. Recorre el flujo completo del Catálogo Web: crea categoría y producto en el POS,
sincroniza, le pone la imagen principal y comprueba que se ve publicado.

## Qué fallaba

Primero, al subir la imagen (línea 127):

```
Error: locator.setInputFiles: Error: strict mode violation: locator('input[type="file"]') resolved to 4 elements:
    1) data-testid="brand-logo-upload"   2) data-testid="showcase-carousel-upload"
    3) data-testid="showcase-daily-upload"   4) data-testid="catalog-upload-<productId>"
```

Y, al corregirlo, apareció un SEGUNDO locator ambiguo (línea 140):

```
Error: locator.click: Error: strict mode violation: getByRole('button', { name: 'Guardar' }) resolved to 2 elements:
    1) data-testid="brand-save"   2) data-testid="catalog-save-all-button"
```

## Evidencia

- Corrida completa del 2026-10-13 y **reproducido en aislamiento** (`--workers=2 --retries=0`). El segundo
  locator solo se ve tras corregir el primero (el test muere en el primero).
- Snapshots: `test-results\web-catalog-…-chromium\error-context.md`.

## Causa raíz — CONFIRMADA

**Defecto del test.** La vista Catálogo Web creció y hoy tiene **varios** controles que casan con los
locators genéricos del spec:
- **4** `<input type="file">` (logo de marca, carrusel, imágenes del día y la imagen del producto);
- **2+** botones con nombre accesible "Guardar…" (guardar marca y guardar por lotes del catálogo).

Los locators se escribieron cuando cada uno casaba con **un** elemento. La app es correcta (varios
controles de archivo y de guardado son legítimos).

## Clasificación

**Defecto del test** (locators sin acotar).

## Aplicación y verificación

**APLICADA (2026-10-13, autorizada).**
- El input de la imagen principal: `locator('input[type="file"]')` → `locator('[data-testid^="catalog-upload-"]')`.
- El botón de guardado del lote: `getByRole('button', { name: 'Guardar' })` → `getByTestId('catalog-save-all-button')`.

**Prueba de mutación:** la forma vieja de cada locator es el fallo observado (el RED de arriba), así que
el arreglo es real y no un falso verde.
Verificación: `pnpm exec playwright test e2e/web-catalog.spec.ts --workers=1 --retries=0` → **1 passed**.

## Estado final

✅ **Resuelto** — 2026-10-13.
