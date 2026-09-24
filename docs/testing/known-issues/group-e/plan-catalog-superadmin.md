# Test E2E `plan-catalog-superadmin` (PCF2) — Grupo E (solo carga de la suite)

> Entrada autocontenida. **Fuente:** `docs/testing/known-issues.md` → Grupo E — Solo carga de la suite. Los tests E2E existentes no se tocan sin autorización explícita del usuario (regla innegociable del proyecto).

## Qué prueba

Junto con los setups de `auth-me-*`, verifica el catálogo de planes desde el rol superadmin.

## Qué falla

Nada en solitario — **pasa en solitario**. Era timeout por la **carga de la suite completa** (lentitud del entorno al correr todo junto).

## Causa raíz

⏸ **Anotada, sin acción** — defecto del entorno de ejecución de la suite, no de la app ni del test.

## Propuesta de solución

Ninguna — no requiere cambio.

## Estado

✅ **Sin acción** — pasa solo; no requiere permiso.

- *Actualizado: 2026-09-24.*
