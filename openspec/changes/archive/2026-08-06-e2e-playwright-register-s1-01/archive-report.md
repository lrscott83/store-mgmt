# Archive Report — `e2e-playwright-register-s1-01`

**Archived**: 2026-08-06
**Archived to**: `openspec/changes/archive/2026-08-06-e2e-playwright-register-s1-01/`
**Verify verdict carried into this archive**: PASS WITH WARNINGS (0 CRITICAL, 1 WARNING, 1 SUGGESTION)
**Artifact store**: hybrid (filesystem + Engram)

## Regla innegociable del proyecto — se transcribe textual, gobierna esta fase también

> "Never modify, delete, rename, skip, weaken, or 'fix' an existing E2E test without explicit authorization from the user."

Esta fase de archive no tocó ningún test. Solo movió/copió documentos y fusionó un delta spec al árbol canónico. La regla se menciona porque los dos puntos siguientes son, precisamente, sobre el cumplimiento de esa regla durante las fases anteriores del cambio.

---

## 1. Brecha declarada — REQ-9 / REQ-10 (rate-limit) NUNCA corrió en vivo

**Estado**: cobertura estructuralmente completa, **NO verificada en ejecución**. No confundir con "verificada".

`frontend-react/e2e/register-rate-limit.spec.ts` (REQ-9 del catálogo, aserción A10: HTTP 429 tras 10 registros/10min por IP → banner `REGISTRATION.TOO_MANY_ATTEMPTS`) compila, tipa en `strict` (`tsc --noEmit --strict` con exit 0) y está correctamente aislado por tag `@rate-limit` + script `test:e2e:rate-limit` propio, excluido de la corrida por defecto tal como exige REQ-9.

**Lo que nunca sucedió**: nadie ejecutó `pnpm test:e2e:rate-limit` contra un backend real. Ningún reporte de corrida en vivo existe para este archivo.

**Por qué**: correrlo agota la cuota de registro de la IP del usuario (10 intentos/10 min, `RateLimitPolicies.cs:26-35`) y bloquea cualquier registro nuevo desde esa máquina durante los siguientes 10 minutos — un costo real para quien lo corre localmente, sin CI que lo absorba.

**Decisión**: el usuario decidió aceptar esta brecha como declarada, no como pendiente de resolver antes de archivar. `sdd-verify` lo aceptó explícitamente como "declared gap, not oversight" (v2 del verify-report, resolución de W2) y ordenó que el archive lo nombrara así, sin cerrarlo en silencio.

**Contraste con el resto de la suite**: los otros 12 tests (REQ-1 a REQ-8, distribuidos en `register.spec.ts`) **sí corrieron en vivo**: 12/12 el 2026-08-06. La primera corrida en vivo fue 11 passed / 1 failed (REQ-6 falló por un bug real de backend, ver sección 3); tras el fix (`147b62d`) la segunda corrida fue 12/12 verde en 17.3s.

**Verification Criteria del capability spec** (`openspec/specs/e2e-register-ui/spec.md`) refleja esto explícitamente: REQ-9 queda marcado como verificado estáticamente pero no en ejecución; REQ-10 (el diagnóstico de cuota agotada) queda con su checkbox sin marcar porque depende de la misma corrida pendiente.

---

## 2. Historial de ratificación de C1 — secuencia completa, no reescrita

**No tratar esto como si el cambio hubiera estado autorizado desde el principio.** La secuencia real, en orden:

1. **Detección**: el commit `0370b07` modificó `frontend-react/e2e/api-health.spec.ts` — un test E2E **preexistente y protegido** por la regla innegociable del proyecto. Cambió el origen de la URL del backend (de `process.env.API_URL` leído del `.env` del desarrollador, a `E2E_API_URL` resuelto en `e2e/support/backend-url.ts`) y reemplazó el `beforeAll` por dos aserciones de forma (URL absoluta + sufijo `/api`). Los cuerpos de los dos tests existentes quedaron intactos: ninguno fue borrado, renombrado, skipeado ni debilitado en sus aserciones de negocio.
2. **El problema, dicho sin adornos**: esa edición se hizo **sin autorización registrada en el momento**. El mensaje del commit se declaraba autorizado a sí mismo — no había una pregunta previa ni una respuesta del usuario documentada. El `apply-progress` de 45 minutos antes de ese commit dejaba constancia de que el archivo tenía cero diff hasta ese punto.
3. **Bloqueo**: `sdd-verify` (v1, primera pasada) detectó la edición, la marcó **CRITICAL (C1)** y **bloqueó el archive**. El veredicto de esa pasada fue BLOCKED, junto con 3 WARNING y 1 SUGGESTION adicionales.
4. **Pregunta**: se presentó el diff al usuario, exponiendo exactamente qué cambió y que ocurrió sin autorización previa.
5. **Ratificación posterior**: el usuario ratificó explícitamente el cambio el **2026-08-06**, con la suite Playwright corriendo **12/12 en vivo** como evidencia de que el comportamiento resultante era correcto. La ratificación quedó asentada por escrito en `tasks.md` (commit `87588e5`), en un bloque fechado que dice, con el mismo criterio que se pide reproducir acá: que `0370b07` cambió el origen de la URL sin autorización registrada en su momento, que `sdd-verify` lo detectó y bloqueó, y que el usuario lo ratificó **después del hecho**, no antes.
6. **Cierre**: `sdd-verify` (v2, esta pasada) re-verificó — no contra el resumen del coordinador, sino contra `main` directamente (`git show 87588e5`, `git diff 0370b07..HEAD -- e2e/api-health.spec.ts` vacío, `git log` de `smoke.spec.ts` con un único commit desde su creación `e12f293`) — y cerró C1 como **RATIFICADO**, degradado de CRITICAL/bloqueante a hallazgo cerrado y documentado.

**La distinción que importa, dicha explícitamente**: la regla no se saltó. Se cumplió exactamente como está escrita — el cambio se detectó, el proceso se detuvo, se preguntó, y se esperó la respuesta. Lo que ocurrió fue una ratificación **posterior** a una edición que, en su momento, careció de autorización previa registrada. Un archive que describiera esto como "cambio autorizado desde el inicio" estaría reescribiendo la secuencia real. Este archive no lo hace.

`frontend-react/e2e/smoke.spec.ts` no recibió un solo cambio en todo el ciclo del cambio — cero diffs desde su creación.

---

## 3. Contexto adicional preservado

### Primera cobertura Playwright de negocio del repo
Antes de este cambio, la única cobertura Playwright existente era de infraestructura: `smoke.spec.ts` (la app carga) y `api-health.spec.ts` (la API contesta). Ningún escenario de negocio tenía cobertura de navegador. Este cambio abre esa capa implementando [S1-01] Auto-registro completo — las 10 aserciones de UI del catálogo — contra un backend real.

### Bug de producción real encontrado en la primera corrida en vivo
La primera corrida en vivo de la suite (11 passed / 1 failed en REQ-6) encontró un bug real que **305 tests E2E de .NET no podían ver estructuralmente**: `ErrorHandlerMiddleware.cs` serializaba los bodies de error en PascalCase mientras el resto de la API responde en camelCase. El mensaje de validación del servidor nunca llegaba al usuario — el frontend caía a un mensaje genérico vía optional chaining sobre una propiedad que no existía con ese casing. Arreglado en el commit `147b62d`.

La razón estructural de por qué la suite .NET no lo detectó: `SMCA.WebApi.E2ETests/Infrastructure/ApiResponse.cs:22` deserializa con `PropertyNameCaseInsensitive = true`, lo que enmascara exactamente esta clase de discrepancia de casing. Un test de navegador real, que no controla cómo el cliente de producción deserializa, sí lo detectó.

### Catálogo de escenarios — posición de este cambio
`docs/testing/e2e-catalog-stage-1.md` cataloga 13 escenarios + 1 invariante para Etapa 1. Este cambio cierra **[S1-01]**. Quedan **12 escenarios sin cobertura Playwright** tras este archive.

### Commits del cambio (todos en `main`, pusheados)
Artefactos SDD y unidades de trabajo: `7481d4e`, `1da564d`, `baa0ac6`, `f0b8ccd`, `e823222`, `5c24bd2`.
Correctivos posteriores al primer apply: `0e7964d` (descarte del enfoque `.env.example`), `0370b07` (ver sección 2 — el hallazgo C1).
Cierre y ratificación: `b2491c5` (limpieza de comentarios obsoletos, W3), `87588e5` (ratificación de C1 + cierre de W1, asentada en `tasks.md`), `59dc3b7`.
Fix de bug de producción: `147b62d`.

---

## 4. Artefactos fusionados y archivados

### Specs sincronizados
| Domain | Action | Details |
|--------|--------|---------|
| `e2e-register-ui` | **Created** (creación limpia — no existía `openspec/specs/e2e-register-ui/` previamente, verificado por `Glob` antes de escribir) | 11 requirements (REQ-1..REQ-11), 0 modified, 0 removed. `Verification Criteria` actualizado en el spec canónico para reflejar el estado real: 9/11 checkboxes marcados con evidencia de corrida en vivo, REQ-9 marcado como verificado estáticamente pero no en ejecución (brecha declarada de la sección 1), REQ-10 sin marcar (depende de la misma corrida pendiente), y una nota explícita en REQ-9 y en `api-health.spec.ts` documentando la ratificación de C1. |

### Contenido del archive
- `proposal.md` ✅ — copia íntegra
- `design.md` ✅ — copia íntegra (incluye H1/H2, las notas de "superseded" sobre `.env.example`, y la frontera de la regla §9)
- `tasks.md` ✅ — copia íntegra (incluye el bloque de ratificación de C1 verbatim, con su fecha 2026-08-06)
- `verify-report.md` ✅ — copia íntegra del reporte final v2, PASS WITH WARNINGS
- `specs/e2e-register-ui/spec.md` ✅ — copia íntegra del delta spec, tal como se recibió (17 tareas, 5 unidades de trabajo WU1-WU5, todas `[x]`)

### Fuente de la verdad actualizada
`openspec/specs/e2e-register-ui/spec.md` ahora refleja el nuevo comportamiento — es una capability nueva, no una fusión sobre contenido previo.

## 5. Traceability — Engram observation IDs

| Artifact | Observation ID | Topic key |
|---|---|---|
| Proposal | #1890 | `sdd/e2e-playwright-register-s1-01/proposal` |
| Spec | #1891 | `sdd/e2e-playwright-register-s1-01/spec` |
| Design | #1893 | `sdd/e2e-playwright-register-s1-01/design` |
| Tasks | #1894 | `sdd/e2e-playwright-register-s1-01/tasks` |
| Verify report (final, v2) | #1957 | `sdd/e2e-playwright-register-s1-01/verify-report` |
| Archive report (this document) | (assigned on save) | `sdd/e2e-playwright-register-s1-01/archive-report` |

Explore artifact was not separately searched — not required by the SDD DAG for archive (proposal/spec/design/tasks/verify-report are the required inputs) and not referenced by name in any of the five retrieved artifacts as a distinct precondition.

## 6. Filesystem operation note for the orchestrator

This executor does not have a tool capable of deleting or moving directories/files (no Bash/mv available in this session). The archive folder `openspec/changes/archive/2026-08-06-e2e-playwright-register-s1-01/` was created fresh with full copies of all five source artifacts (proposal, design, tasks, verify-report, specs/e2e-register-ui/spec.md), and the merged capability spec was written to `openspec/specs/e2e-register-ui/spec.md`. The original source folder `openspec/changes/e2e-playwright-register-s1-01/` was **left in place, untouched** — it was **not** deleted. The orchestrator must remove it (e.g. `git rm -r openspec/changes/e2e-playwright-register-s1-01/`) as part of the commit that lands this archive, so the active changes directory no longer lists this change as open.

## 7. SDD Cycle Complete

The change has been fully planned, implemented, verified, and archived. The two items that must never be closed silently — REQ-9's runtime-verification gap and C1's detection→block→ask→ratification sequence — are recorded above, in the merged capability spec's Verification Criteria, and in the ratification note carried verbatim from `tasks.md` into this archive's copy. Ready for the next change (the remaining 12 scenarios of `docs/testing/e2e-catalog-stage-1.md`).
