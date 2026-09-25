# Test E2E `warehouses` (StoreUser sin Almacenes) — Grupo G (flaky en corridas completas)

> Entrada autocontenida. **Fuente:** `docs/testing/known-issues.md` → Flaky recurrentes de las corridas completas del 2026-09-25. Los tests E2E existentes no se tocan sin autorización explícita del usuario (regla innegociable del proyecto).

## Qué prueba

Que un usuario de tienda (StoreUser) no ve el módulo Almacenes —el enlace no está en su menú— y que si escribe la dirección de Almacenes a mano, la ruta lo desloguea. Es el control de acceso del módulo visto desde la pantalla.

## Qué pasa

Falló en **3 de las 5 corridas completas** del 2026-09-25 (corridas 2, 4 y 5) y **pasó al reintento** siempre. Es el flaky residual más recurrente. En solitario nunca falló.

**El problema en simple:** el test necesita preparar la sesión de dos usuarios (dueño y usuario de tienda) antes de empezar. Con toda la suite corriendo a la vez, esa preparación a veces se pasa del tiempo máximo (120 segundos) y el test aborta antes de hacer nada; al reintentarlo, el entorno ya está caliente y pasa. Lo que el test verifica (el deslogueo y el menú) nunca falló por sí mismo.

## Causa probable

Contención del arranque: la preparación de la persona compartida compite con todos los demás tests por el mismo servidor. No es rate-limit (cero 429 en las cinco corridas) ni un defecto del gate de Almacenes.

## Cómo verificarlo

1. Correrlo solo: `pnpm exec playwright test e2e/warehouses.spec.ts --workers=1` → debe pasar.
2. En la próxima corrida completa, anotar **dónde** falla si vuelve: en la preparación (mensaje "while setting up \"signedInPage\"") o en una aserción de la pantalla. Son causas distintas: la primera es del entorno; la segunda apuntaría al test y requeriría decidir con tu permiso.

## Propuesta de solución (si se confirma el modo de preparación)

El mismo tratamiento que ya funcionó en el Grupo F: más tiempo a la preparación de la persona o menos workers. Si el modo fuera de aserción, se propondría el ajuste puntual de esa espera (con tu permiso).

## Estado

⏸ **En observación** — el reintento lo absorbe; se sigue en la próxima corrida completa.

- _Actualizado: 2026-09-25._
