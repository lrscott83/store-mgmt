# 7. web-catalog.spec.ts:77 — el locator genérico `input[type="file"]` casa con 4 inputs de archivo (strict mode)

## Qué prueba el test

`web-catalog.spec.ts:77:7` — *"crear el producto en el POS, sincronizar, ponerle imagen y verlo
publicado en /catalog/<slug>"*. Recorre el flujo completo del Catálogo Web: crea categoría y producto
en el POS, sincroniza el catálogo, le pone la imagen principal al producto y comprueba que se ve
publicado en el catálogo público.

En negocio: publicar un producto con su foto desde la vista Catálogo Web.

## Qué falla (en simple)

Falla en el paso de subir la imagen, en la **línea 127** del spec:

```
Error: locator.setInputFiles: Error: strict mode violation: locator('input[type="file"]') resolved to 4 elements:
    1) <input type="file" … data-testid="brand-logo-upload"/>
    2) <input multiple type="file" … data-testid="showcase-carousel-upload"/>
    3) <input multiple type="file" … data-testid="showcase-daily-upload"/>
    4) <input type="file" … data-testid="catalog-upload-42e5f0b9-…"/>

> 127 |     await page.locator('input[type="file"]').setInputFiles({ … });
```

Playwright **rehúsa** operar sobre un locator que casa con más de un elemento (strict mode), así que
el `setInputFiles` nunca llega a elegir el input correcto.

## Evidencia

- Corrida completa del **2026-10-13** (`pnpm test:e2e --workers=4`): 304 passed / 17 failed / 12 flaky;
  este test entre los fallidos.
- **Reproducido en aislamiento** el 2026-10-13 (`--workers=2 --retries=0`): 11 passed / **3 failed** —
  este es uno. **Sin reintentos** → determinista.
- Snapshot: `test-results\web-catalog-Catálogo-Web-m-5f3c0--publicado-en-catalog-slug--chromium\error-context.md`.

## Causa raíz — CONFIRMADA

La vista **Catálogo Web** hoy renderiza **cuatro** `<input type="file">` a la vez:

| # | `data-testid` | Qué es |
| --- | --- | --- |
| 1 | `brand-logo-upload` | Logo de la marca (sección Marca) |
| 2 | `showcase-carousel-upload` | Imágenes del carrusel (showcase) |
| 3 | `showcase-daily-upload` | Imágenes del día (showcase) |
| 4 | `catalog-upload-<productId>` | Imagen principal del producto |

El spec usa el locator **genérico** `page.locator('input[type="file"]')`, que casó con **uno** cuando el
spec se escribió y hoy casa con **cuatro**. El error de Playwright prueba el conteo exacto (los cuatro
`data-testid`), así que no es un problema de la app: la vista tiene varios controles de archivo
legítimos.

## Clasificación

**Defecto del test** (locator obsoleto, no acotado). La app es correcta.

## Propuesta de solución — NO APLICADA

Acotar el locator al input de la **imagen del producto**, que es el que el paso quiere usar. Opciones:
- `page.locator('[data-testid^="catalog-upload-"]')` (un solo producto en este test → 1 elemento), o
- el input dentro de la tarjeta del producto / del editor que el flujo tenga a mano.

Requiere **autorización 1 a 1** (toca un test E2E existente). **Prueba de mutación** al aplicarlo:
volver al locator genérico y comprobar que vuelve a caer en la misma aserción.

## Aplicación y verificación

No aplicada.

## Estado final

🔴 **Abierto** — 2026-10-13.
