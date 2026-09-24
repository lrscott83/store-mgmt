# Test E2E `valid-session-navigation` — 10 (offline) — Anotado

> Entrada autocontenida. **Fuente:** `docs/testing/known-issues.md` — entrada "valid-session-navigation 10 y 11 (offline)". Los tests E2E existentes no se tocan sin autorización explícita del usuario (regla innegociable del proyecto).

## Qué prueba

Que ir a `/login` o `/register` con una sesión abierta **redirige al inicio** (nadie con sesión activa debe quedarse en el login/registro).

## Qué falla

El test espera la redirección de vuelta a la pantalla de inicio y muere por **timeout (15 s)** sin llegar a la aserción.

## Causa raíz

⏸ **Anotada, no confirmada** — el log de la corrida muestra que **la redirección SÍ ocurre** (la app se comporta bien); lo que se agota es la espera del test porque la página tarda más de 15 segundos (entorno: lentitud de carga bajo la suite completa).

## Propuesta de solución

Dejar anotado y decidir más adelante — la solución apunta a la **espera del test** (o al entorno), no a la app. Tocar el test requiere permiso.

## Estado

⏸ **Pendiente de decisión.**

- *Actualizado: 2026-09-24.*
