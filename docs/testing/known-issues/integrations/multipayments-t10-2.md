# Test E2E `multipayments` — T10.2 — Anotado

> Entrada autocontenida. **Fuente:** `docs/testing/known-issues.md` — entrada `multipayments` T10.2. Los tests E2E existentes no se tocan sin autorización explícita del usuario (regla innegociable del proyecto).

## Qué prueba

Con el módulo de multipagos activo, pagar una venta en dos partes por canales distintos (p. ej. mitad efectivo y mitad transferencia): que el total y el vuelto se recalculan bien, y que **no te dejan registrar** una venta pagada de menos (bloqueo por subpago).

## Qué falla

Antes de llegar al carrito, el test tiene que registrar una tasa de cambio en la pantalla de "tasas de cambio"; el **formulario nunca aparece** (el campo donde se escribe la tasa no se dibuja) y el test muere ahí.

## Causa raíz

⏸ **Anotada, no confirmada** — dos motivos para no concluir todavía:
1. El spec fue **reescrito en dev el 23/09** ("currency block and popup flow"); la versión que falló en esta corrida ya no existe en el repo. Hay que correr la versión nueva antes de decir nada definitivo.
2. La pantalla de tasas también lee datos guardados; si esa lectura se hace al pintar, sería el **mismo bug del Grupo A** (la app lee datos cifrados durante el render). Pero hay que verificarlo con la corrida del spec nuevo.

## Propuesta de solución

Correr una vez el spec reescrito (requiere aprobación de corrida). Si el formulario sigue sin aparecer, aplicar el mismo arreglo del Grupo A y re-verificar.

## Estado

⏸ **Pendiente de decisión** — hay que correr la versión nueva del spec antes de concluir.

- *Actualizado: 2026-09-24.*
