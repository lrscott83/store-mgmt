# Test E2E `owner-plan-change-dialog` — Grupo B (fechas)

> Entrada autocontenida. **Fuente:** `docs/testing/known-issues.md` → Grupo B — Defecto del test: comparar fechas con el comparador equivocado. Los tests E2E existentes no se tocan sin autorización explícita del usuario (regla innegociable del proyecto).

## Qué prueba

Que el cambio de plan de una tienda se hace por el camino correcto (cambio de plan, **nunca una edición directa**) y que la fecha ancla del plan (de donde se calcula la fecha de vencimiento) **queda intacta** después del cambio.

## Qué falla

La comparación de la fecha dice "esperado: `2026-09-23T04:00:00.000Z` / recibido: serializa al mismo string" — es decir, **las dos fechas son la misma**, pero el test las compara con el comparador más estricto, que para fechas dice "diferentes" aunque el valor sea idéntico. La lógica de negocio funciona; el test no puede verlo.

## Causa raíz

✅ **Confirmada** — el test guarda la fecha antes y la lee después, y las compara con `toBe` (igualdad estricta de objeto); dos objetos de fecha con el mismo valor nunca pasan esa comparación. La base de datos devuelve fechas como objetos, no como texto, y el test las declara como texto.

## Propuesta de solución (requiere permiso)

Comparar el **texto** de la fecha (`toISOString()` de ambos lados). Zero cambios en la app — 2 líneas por test.

## Estado

⏸ **Pendiente de decisión** — requiere autorización explícita (test E2E intocable).

- *Actualizado: 2026-09-24.*
