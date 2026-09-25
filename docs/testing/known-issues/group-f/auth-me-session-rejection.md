# Test E2E `auth-me-session-rejection` (setup y escenarios) — Grupo F (flaky recurrente)

> Entrada autocontenida. **Fuente:** `docs/testing/known-issues.md` → Corrida completa del 2026-09-25 — verificación de estabilidad. Los tests E2E existentes no se tocan sin autorización explícita del usuario (regla innegociable del proyecto).

## Qué prueba

La familia `auth/me` — sesiones contra el backend real:

- **Setup (línea 114):** mintea un SuperAdmin y captura su sesión (1 registro + 1 login reales).
- Casos 3a/3b (owner inactivo), 4a/4b (token en lista negra), 1a/1b (usuario inactivo), 5 (token expirado), 6 (reactivar y re-entrar): que el logout online y la retención offline funcionan por cada escenario.

## Dónde y cuándo falló (corridas del 2026-09-25)

| Corrida | Workers | Test afectado                                    | Resultado                                           |
| ------- | ------- | ------------------------------------------------ | --------------------------------------------------- |
| 1       | 8       | setup: mint SuperAdmin (línea 114)               | Flaky — timeout de fixture setup; pasó al reintento |
| 3       | 3       | 3a — online + owner inactive: logout (línea 155) | Flaky — `toHaveURL` vencido; pasó al reintento      |

También fallaron en la corrida 1 (como parte de los 23 flaky) los setups gemelos de `auth-me-deleted-user` (línea 107) y el fixture `onlineLockedSnapshot` de `valid-session-navigation.spec.ts:95` — misma fase (arranque), mismos modos.

## Cómo verificar primero (en este orden)

1. **En solitario:** `cd frontend-react && pnpm exec playwright test e2e/auth-me-session-rejection.spec.ts --workers=1` → **ya verificado 2026-09-24: 16/16 en verde** junto con `plan-catalog-superadmin` y `auth-me-deleted-user` (~31 s) contra el backend real (`:5019`, BD `smca_test`).
2. **Backend correcto:** `:5019` con `smca_test` (guard de arranque `[E2E Guard] ... Database=smca_test`).
3. **Sin rate-limit de por medio:** cero 429 en los logs de las tres corridas completas (verificado por grep — las únicas menciones de "429" eran el flag `--grep-invert @rate-limit` y el contador de progreso).
4. **En la próxima corrida completa:** confirmar que el fallo repite SOLO en la fase de arranque (setup/mint/primera navegación) y que el reintento pasa.

## Modo de fallo (literal del log)

Corrida 1 — setup (y el fixture gemelo de otro spec, misma fase):

```
Fixture "onlineLockedSnapshot" timeout of 30000ms exceeded during setup.
    at valid-session-navigation.spec.ts:95:24
Error: page.waitForURL: Test ended.
    at registerAndLoginOnline (valid-session-navigation.spec.ts:69:14)
```

Corrida 3 — caso 3a:

```
Error: expect(page).toHaveURL(expected) failed
```

Patrón común: **todos los fallos ocurren en la fase de arranque** (mint de registro+login, setup de fixture, primera navegación tras el boot en frío), nunca en las aserciones de lógica de sesión.

## Qué NO es

- **No es rate-limit**: cero 429 en las tres corridas (cuotas 40 logins/min, 50 registros/10 min sin agotarse con la suite por defecto).
- **No es la lógica de sesión**: los 16 tests de la familia pasan en solitario y las aserciones de negocio nunca fallaron.
- **No es determinista**: el reintento pasa siempre.

## Hipótesis (por confirmar — contención de arranque en frío)

Los mints de registro+login en frío compiten con los primeros arranques del dev server (compilación de módulos pesados de Vite) y con el resto de workers contra el mismo backend + PostgreSQL. Los **30 s** del fixture setup y los timeouts de navegación quedan cortos justo en esa fase bajo contención. Evidencia: el fallo es siempre de SETUP/arranque, el reintento pasa (dev server ya caliente), y la familia pasa en solitario. La tendencia 23 → 4 → 2 flaky al bajar workers apunta a lo mismo.

**Para confirmar:** en la próxima corrida completa, verificar que ningún fallo de esta familia ocurra fuera de la fase de arranque; opcionalmente correr 2-3 veces seguidas con `--workers=4` y comprobar que los fallos (si los hay) son siempre de setup/arranque.

## Propuesta de solución (una vez confirmado; requiere permiso — test E2E)

Subir el timeout del fixture `onlineLockedSnapshot` de 30 000 a **60 000 ms** (una línea en `valid-session-navigation.spec.ts`, la constante `timeout` de la definición del fixture). No cambia nada del comportamiento en solitario; solo da aire al arranque bajo contención. Alternativa sin tocar tests: reducir workers (ya operativo, `--workers=4` documentado en el readme).

## Estado

⏸ **Hipótesis por confirmar** — el test queda intocable hasta confirmar el patrón de arranque en la próxima corrida completa.

- _Actualizado: 2026-09-25._
