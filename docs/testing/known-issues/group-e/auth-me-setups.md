# Tests E2E `auth-me-*` (setups) — Grupo E (solo carga de la suite)

> Entrada autocontenida. **Fuente:** `docs/testing/known-issues.md` → Grupo E — Solo carga de la suite. Los tests E2E existentes no se tocan sin autorización explícita del usuario (regla innegociable del proyecto).

## Qué prueba

Los setups de la familia `auth-me-*` (preparación de sesión/autenticación del usuario en la suite).

## Qué falla

Nada en solitario — **pasan en solitario**. Eran timeouts por la **carga de la suite completa** (lentitud del entorno al correr todo junto).

## Causa raíz

⏸ **Anotada, sin acción** — defecto del entorno de ejecución de la suite, no de la app ni del test.

## Propuesta de solución

Ninguna — no requiere cambio.

## Estado

✅ **Sin acción** — pasan solos; no requiere permiso.

> **Re-verificado 2026-09-24:** en verde en solitario contra el backend real (`:5019`, BD `smca_test`) junto con `plan-catalog-superadmin` — **16/16 (~31 s)**.

- _Actualizado: 2026-09-24 (re-verificación)._
