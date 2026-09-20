# Feature: plans-consolidation (auditoría y consolidación de `docs/plans`)

Workflow: **ODD** (Organic Driven Development). Rama: `qa` (no es la default `main` → se trabaja aquí).
Entrega: commits por unidad de trabajo; push/PR = decisión del usuario.

## Objetivo

Auditar los 40 documentos de `docs/plans/`, verificar contra el código real cuáles
están implementados (evidencia archivo:línea / commits, sin asumir), eliminar los
completados y seguros, y consolidar el trabajo pendiente en
`docs/plans/plan-resumen.md` como índice único y evolutivo.

## Problema / Por qué

`docs/plans/` acumuló 40 documentos (planes, diseños, trackers) sin un índice
central; muchos ya están implementados en el código y generan ruido, y el trabajo
pendiente quedó disperso entre varios archivos sin orden de prioridad.

## Alcance

- Solo documentación (`docs/plans/`, `odd/tasks/`).
- **Sin cambios** de código de producción ni de tests E2E (regla AGENTS.md).
- Verificación por evidencia; los planes con trabajo pendiente **no** se tocan.

## Tareas

- [x] **T1** Auditar los 40 planes contra el código (8 exploradores read-only, agrupados por área).
- [x] **T2** Clasificar cada plan: IMPLEMENTED / PARTIAL / NOT_IMPLEMENTED / DESIGN_ONLY / SUPERSEDED / LIVING_TRACKER.
- [x] **T3** Verificar referencias externas antes de borrar (código, `openspec/` no-archive, `odd/`, otros planes).
- [x] **T4** Eliminar los planes implementados y seguros (`git rm`).
- [x] **T5** Ordenar el trabajo pendiente por prioridad (P0→P3).
- [x] **T6** Crear `docs/plans/plan-resumen.md` (índice evolutivo).

## Verificación

- Evidencia por plan: archivo:línea o commit (detalle en `plan-resumen.md`).
- `git status` muestra las eliminaciones staged; ningún archivo de código o E2E tocado.

## Decisión pendiente

- Commit de esta consolidación (work-unit commit) — pendiente de autorización del usuario.
