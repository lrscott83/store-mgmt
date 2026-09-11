# Plan: Fallos E2E preexistentes — diagnóstico y resolución

**Status**: pendiente de diagnóstico profundo
**Created**: 2026-09-11
**Origin**: detectados durante la verificación de no-regresión del trabajo CSP (flip Step 2), **probados preexistentes** — el mismo `store-plan-activation.spec.ts` falla en el commit baseline `83b7de69` (verificado en worktree aislado, sin ningún commit del trabajo CSP).

## Los 3 specs que fallan

| Spec | Test | Síntoma observado |
|---|---|---|
| `e2e/store-plan-activation.spec.ts:62` | "OwnerAdmin activa el plan pago una sola vez" | Aserción línea 143: el PUT de activación llega con `moduleIds` vacío (Expected 2, Received 0) — el panel no envía módulos |
| `e2e/store-update.spec.ts:49` | "la vista Update guarda datos sin tocar el plan y el menú ya no muestra el enlace Plan" | Fallo consistente en corrida completa |
| `e2e/users-crud.spec.ts:121` | "activar y desactivar usuario desde la lista" | Fallo consistente en corrida completa; el describe serial arrastra "did not run" en cascada |

### Síntomas en el baseline (sin trabajo CSP)

`store-plan-activation` en `83b7de69` falla ANTES de llegar a la aserción del PUT:
- `Expected localStorage.currentUser to be populated after a real login, found none` (session.ts:102)
- `page.evaluate: Execution context was destroyed, most likely because of a navigation`

Esto apunta a un problema en la cadena login → redirect → hidratación, no solo en el payload del plan.

## Hipótesis (a verificar, no confirmadas)

1. **Merges de qa del 2026-09-10**: `b0d35aa0` (merge origin/qa and dev into main) y `83a9d6b1` (merge origin/qa) son los últimos cambios relevantes. El código de la app no cambió entre baseline y HEAD del trabajo CSP — el fallo ya estaba.
2. El PUT sin `moduleIds` puede ser sintoma del panel de plan que no carga sus datos (¿el fetch de planes falla silenciosamente en la vista re-mergeada?).
3. El fallo de sesión del baseline puede ser la misma causa raíz manifestándose antes en la cadena.

## Pasos de diagnóstico

1. `git log` fino entre `921ab960` y `b0d35aa0` — qué entró por qa que toca: stores/plan panel, update store view, users list, auth-store hydration.
2. Correr cada spec aislado con `--trace on` y leer el trace (los fallos son consistentes, no flaky — 3 reintentos fallan igual):
   ```bash
   npx playwright test e2e/store-plan-activation.spec.ts --trace on
   npx playwright test e2e/store-update.spec.ts --trace on
   npx playwright test e2e/users-crud.spec.ts --trace on
   ```
3. Para `store-plan-activation`: inspeccionar en el trace la respuesta del GET de planes y el payload del PUT — ¿el panel carga módulos pero no los envía, o no carga nada?
4. Para el síntoma de sesión del baseline: reproducir login manual contra dev server y observar `localStorage.currentUser` tras el redirect.

## Reglas del proyecto (innegociables)

- Los specs E2E existentes NO se tocan — el fix va en código de producción (frontend app o backend).
- Código de producción backend requiere notificación + aprobación explícita antes de tocar.
- Un fallo E2E es información: si la corrección requiere cambiar un spec, parar y preguntar.

## Contexto de la corrida completa (2026-09-11, HEAD 54cd8b33)

- 258 passed, 0 fallos nuevos, 8 flaky (absorbidos por `retries: 2`, fenómeno de contención documentado en playwright.config.ts).
- Los 3 specs de arriba fallan en los 3 intentos.
- Suite CSP enforcing (config dedicado): 3/3 passed — no relacionada.

## Otros pendientes ya registrados

- Imagen nginx del frontend NO reconstruida/desplegada: el error de actualización del SW y el error MIME del bootstrap (`bootstrap-0-46a81289.js` con src relativo del build viejo) persisten en producción hasta re-build + re-deploy.
- 3 cambios UI en Movimientos (quitar texto "Movimientos", margen lateral, alinear iconos) — sin empezar.
- Test backend pinneando `Plan.id` == `StorePlanType` (1–4) en activación de plan.
