# Test E2E `warehouses` (StoreUser sin Almacenes) — Grupo G (flaky en corridas completas)

> Entrada autocontenida. **Fuente:** `docs/testing/known-issues.md` → Flaky recurrentes de las corridas completas del 2026-09-25. Los tests E2E existentes no se tocan sin autorización explícita del usuario (regla innegociable del proyecto).

## Qué prueba

Que un usuario de tienda (StoreUser) no ve el módulo Almacenes —el enlace no está en su menú— y que si escribe la dirección de Almacenes a mano, la ruta lo desloguea. Es el control de acceso del módulo visto desde la pantalla.

## Qué pasa

Falló en **3 de las 5 corridas completas** del 2026-09-25 (corridas 2, 4 y 5) y **pasó al reintento** siempre. En solitario nunca falló.

**El problema en simple (medido en los logs, idéntico en las 3 corridas):** el test entra con el usuario de tienda a la pantalla de inicio y espera a que aparezca el enlace "Catálogo Productos" del menú. Desecha la espera a los **15 segundos** sin encontrarlo. No es la preparación de la sesión (esa no falló en ninguna de las 3 corridas) — es que el menú no terminó de pintar a tiempo. Al reintentar el test, el menú sí aparece y todo pasa.

## Causa probable

Espera corta del test (15 s) sobre un menú que, con la suite a full, a veces tarda más en pintar. También cabe que el menú tenga una condición de carrera propia (el rol del usuario de tienda llega tarde y el enlace se descarta). Hace falta distinguirlo: si el enlace nunca llega (no está en el HTML al vencer el timeout), es lógica; si llega tarde, es tiempo.

## Tiempos que usa

- Preparación de la sesión (dueño + usuario de tienda): presupuestada con los **120 s** del test (nunca venció).
- La espera que vence: **15 s** — la aserción del enlace "Catálogo Productos" (`getByRole('link', { name: 'Catálogo Productos' })`, `toBeVisible` con el default de 15 s).
- Reintento: 2 (config); en las 3 corridas pasó al primero.

## Cómo verificarlo

1. Correrlo solo: `pnpm exec playwright test e2e/warehouses.spec.ts --workers=1` → debe pasar.
2. En la próxima corrida completa, capturar el **HTML del menú** al vencer los 15 s (trace ya queda con `trace: 'on-first-retry'`): si el enlace NO está en el HTML es lógica/condición de carrera (requeriría permiso para tocar el test); si el menú estaba incompleto por tiempo, es la espera corta.

## Propuesta de solución (si se confirma)

Si fue tiempo: alargar esa espera puntual a 30 s (una línea, con tu permiso). Si fue lógica: decidir primero qué debe pasar. En ambos casos es cambio de test E2E y requiere tu permiso explícito.

## Estado

⏸ **En observación** — el reintento lo absorbe; se sigue en la próxima corrida completa.

- _Actualizado: 2026-09-25._
