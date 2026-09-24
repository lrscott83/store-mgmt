# Test E2E `configurations` — FC-B2 — Grupo D (locator frágil)

> Entrada autocontenida. **Fuente:** `docs/testing/known-issues.md` → Grupo D — Locator frágil del test. Los tests E2E existentes no se tocan sin autorización explícita del usuario (regla innegociable del proyecto).

## Qué prueba

Que el selector "Tienda activa" de la pantalla de configuración lista las tiendas cuando hay varias (MultiStores).

## Qué falla

El test afirma que la **opción** dentro del selector "es visible". Los navegadores consideran las opciones de un desplegable "ocultas" por definición (solo son visibles al abrir el desplegable), así que Playwright lo rechaza siempre — el log confirma 13 veces que la opción existe y tiene el nombre correcto de la tienda.

## Causa raíz

✅ **Confirmada** — la app está bien; el locator del test elige un tipo de aserción (visibilidad de una `<option>`) que Playwright no concede.

## Propuesta de solución (requiere permiso)

Afirmar por **valor/selección** (`toHaveValue` / `selectOption`) en vez de visibilidad de la opción.

## Estado

⏸ **Pendiente de decisión** — requiere autorización explícita (test E2E intocable).

- *Actualizado: 2026-09-24.*
