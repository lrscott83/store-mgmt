# Archive Report — `e2e-playwright-offline-login-s1-03`

**Change**: [S1-03] Login offline en dispositivo aprovisionado — cobertura Playwright + refactor de núcleo compartido de observers
**Modo de persistencia**: hybrid (engram + este fichero)
**Rama**: `feat/e2e-playwright-offline-login-s1-03`, 8 commits sobre `main`, working tree limpio, ya pusheada
**Fecha de archive**: 2026-08-08

## Veredicto de verify heredado: **PASS WITH WARNINGS**

CRITICAL: 0 · WARNING: 1 (CERRADO por `610e794`) · SUGGESTION: 1 · Open authorization item (no defecto): 1. Ver `openspec/changes/e2e-playwright-offline-login-s1-03/verify-report.md` para el detalle completo — este archive no reabre ningún hallazgo, solo lo hereda y lo cierra formalmente.

## Trazabilidad de observaciones (engram, project `store-mgmt`)

| Artefacto | topic_key | Observation ID |
|---|---|---|
| Proposal | `sdd/e2e-playwright-offline-login-s1-03/proposal` | #2083 |
| Spec (delta) | `sdd/e2e-playwright-offline-login-s1-03/spec` | #2086 |
| Design | `sdd/e2e-playwright-offline-login-s1-03/design` | #2087 |
| Tasks | `sdd/e2e-playwright-offline-login-s1-03/tasks` | #2090 |
| Verify report | `sdd/e2e-playwright-offline-login-s1-03/verify-report` | #2092 |

(Explore no tiene entrada en engram propia para esta rama; solo existe como archivo `openspec/changes/.../explore.md`, leído directamente para este report.)

## Commits (8)

| SHA | Mensaje |
|---|---|
| `d5e5d99` | refactor(e2e) shared core |
| `e57edea` | test(e2e) roster fixture + any-request observer |
| `6fed989` | test(e2e) S1-03 coverage |
| `c1b80c2` | docs(testing) mark S1-03 covered |
| `bf01105` | docs(sdd) planning artifacts |
| `97d6761` | docs(testing) H-14 |
| `a741c71` | docs(sdd) verify report |
| `610e794` | docs(sdd) close REQ-1 warning |

## Specs sincronizadas al árbol canónico

Ambas capacidades eran nuevas — verificado con `Glob` que no existía `openspec/specs/e2e-offline-login-ui/` ni `openspec/specs/e2e-network-observer-core/` antes de este archive. Copia directa (no merge de delta), transcripción sin reescritura de prosa.

| Domain | Acción | Detalle |
|---|---|---|
| `e2e-offline-login-ui` | Creado | `openspec/specs/e2e-offline-login-ui/spec.md` — 14 requirements (REQ-1..REQ-14), copia íntegra del delta spec |
| `e2e-network-observer-core` | Creado | `openspec/specs/e2e-network-observer-core/spec.md` — 6 requirements (REQ-1..REQ-6), copia íntegra del delta spec |

### Ediciones estructurales deliberadas durante la transcripción (únicas, nombradas)

1. En ambos ficheros: `**Status**: Draft — nueva capability, sin spec previo` → `**Status**: Active`. Es el único campo que difiere entre un delta spec (en `openspec/changes/.../specs/`) y su forma canónica en `openspec/specs/`; los 4 specs hermanas ya archivadas (`e2e-login-ui`, `e2e-register-ui`, `e2e-session-fixture`, `e2e-session-hydration`) usan uniformemente `Status: Active` en el árbol canónico. Ningún otro carácter del cuerpo del documento fue tocado — verificado línea por línea contra el fichero fuente leído en esta misma sesión antes de escribir.

Nada más cambió: sin normalización de escaping, sin re-wrap de prosa, sin edición de tablas, sin renombrar requirements.

## Estado del folder de change

**No movido por este agente.** Por instrucción explícita del orquestador, `openspec/changes/e2e-playwright-offline-login-s1-03/` permanece en su ubicación original; el orquestador lo relocará con `git mv` para preservar los bytes exactos. Este report se escribió en esa misma ubicación (`archive-report.md`), y viajará con la carpeta cuando el orquestador la mueva a `openspec/changes/archive/2026-08-08-e2e-playwright-offline-login-s1-03/`.

## Gates — estado y quién los observó

| Comando | Resultado | Observado por | Cuándo |
|---|---|---|---|
| `pnpm exec playwright test e2e/login-offline.spec.ts` | 11/11 verdes, sin backend levantado | Agente (sesión de verify) | 2026-08-08 |
| `npx turbo run test --force` | 179 archivos / 2392 tests verdes, 0 errores de tipo | Agente (sesión de verify) | 2026-08-08 |
| `pnpm test:e2e` | **42 passed (55.3s), 8 workers** | **Usuario** | 2026-08-08 |
| `pnpm test:e2e:rate-limit` | ⚠️ **PENDIENTE** — corriendo del lado del usuario al momento de este archive, resultado aún no reportado | Usuario (aún sin reportar) | — |

La corrida del usuario de `pnpm test:e2e` (42 verdes) confirma en ejecución la aritmética 31 (preexistentes) + 11 (nuevos) = 42 que hasta ahora solo estaba afirmada como aritmética en `tasks.md` (checklist WU3, "⚠️ NO VERIFICADO... es aritmética, no una corrida observada") y en `verify-report.md` §5. **No se debe registrar `pnpm test:e2e:rate-limit` como aprobado.** Queda ⚠️ PENDIENTE, expectativa 2 verdes, sin cambio de umbral respecto de antes del cambio.

**Limitación declarada, sin re-verificar en este archive**: la línea base WU0 (31+2 verdes antes del refactor) nunca se re-corrió en esta rama. Solo existe la corrida documentada el 2026-08-07 (`docs/testing/e2e-stage-1/README.md:88`), previa a este cambio. `verify-report.md` §9 ya lo declaraba como limitación, no como pass; este archive lo hereda sin reabrirlo ni disfrazarlo.

## La frontera de autorización — la columna vertebral del cambio

El usuario autorizó editar exactamente dos módulos de soporte preexistentes: `frontend-react/e2e/support/network-observer.ts` y `frontend-react/e2e/support/login-network-observer.ts`. `e2e/support/test.ts`, `e2e/support/session.ts` y todo `*.spec.ts` quedaron intocados.

`git diff --name-status main..HEAD -- 'frontend-react/e2e/*.spec.ts'` devolvió una única entrada `A` para el `login-offline.spec.ts` nuevo — verificado independientemente tanto por `sdd-verify` (`verify-report.md` §1) como por el orquestador.

## Hallazgo H-14 — cero-HTTP no es literal

Registrado en `docs/testing/e2e-stage-1/README.md`. Un login offline exitoso arma `armTracking()` (`login.tsx:114` rama offline, `:140` rama online) y ni `store-usage-tracker.ts` ni `use-store-usage-tracker.ts` consultan conectividad en ningún punto, así que un `POST /v1/usages/store-daily-usage` de background sí sale tras un login offline exitoso. El submit offline exitoso **no es literalmente cero-HTTP**.

La tolerancia por ese endpoint conocido vive exclusivamente en el spec de test (`expectOnlyKnownTelemetry()`), nunca dentro de `any-request-observer.ts`, que se mantuvo genérico — decisión de diseño D2, verificada en código por `sdd-verify` §7. `REQ-1`/`REQ-2` de `e2e-offline-login-ui`, tal como quedaron en el spec canónico recién sincronizado, ya reflejan esta excepción por endpoint (era precisamente el WARNING que `verify-report.md` §"WARNING" cerró en el commit `610e794`, previo a este archive).

## Dos ítems que se llevan al siguiente lector

1. **OPEN AUTHORIZATION (no defecto)**: `login-rate-limit.spec.ts:6` cita `es.ts:83` para `AUTH.TOO_MANY_ATTEMPTS`; la línea real es `es.ts:85`. Es un archivo de test — **no tocado**, tal como exige la frontera de autorización del cambio. Requiere autorización explícita del usuario si algún día se quiere corregir.
2. **SUGGESTION**: la técnica de "warm-up" de Vite en T11 (un submit online antes del submit offline real, porque cortar la red antes de que el chunk ES de una ruta se haya pedido cuelga el fetch del dev server indefinidamente) está documentada inline en `login-offline.spec.ts:341-350`, pero no está reflejada en `design.md` §D4. No bloquea nada; vale la pena incorporarla a `design.md` si el change se retoma alguna vez.

## Lo que S1-03 deja para el futuro

El round-trip real de `provision.tsx` (subida de archivo `.smcabundle`, `deserializeRoster`, ZIP cifrado) fue deliberadamente excluido de este cambio — es el alcance de **S3-01**, que sigue `PENDIENTE` en la capa Playwright. El fixture de roster construido acá (`frontend-react/e2e/support/roster-fixture.ts`) es reusable por S3-01 para verificar ese round-trip sin duplicar trabajo (`buildRosterBundle`/`plantRoster`, ya con verifier PBKDF2 y wrap-DEK basados en el KAT comprometido `docs/contracts/offline-roster-dek-kat.json`).

## SDD Cycle Complete

El cambio quedó completamente planeado (explore → proposal → spec → design → tasks), implementado, verificado (PASS WITH WARNINGS, warning cerrado) y ahora archivado. El árbol canónico de specs (`openspec/specs/e2e-offline-login-ui/spec.md`, `openspec/specs/e2e-network-observer-core/spec.md`) refleja el comportamiento nuevo, con la excepción de telemetría de H-14 ya incorporada al texto del requirement, no solo a comentarios sueltos.

**Pendiente fuera de este agente**: `pnpm test:e2e:rate-limit` (2 esperados) sigue sin resultado reportado por el usuario al momento de este archive. El orquestador debería confirmarlo antes de dar el cambio por cerrado en el sentido operativo completo (el ciclo SDD en sí ya está cerrado).
