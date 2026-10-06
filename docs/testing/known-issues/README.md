# Fichas de tests E2E — known issues

**Este es el primer lugar donde se mira cuando una corrida E2E no queda en verde.** Antes de
diagnosticar nada, busca acá si el fallo ya está documentado: casi siempre hay una ficha previa con
la causa raíz, la evidencia y lo que ya se intentó.

## Qué hay en esta carpeta

| Elemento | Qué es |
|---|---|
| [`../known-issues.md`](../known-issues.md) | **Índice maestro.** Cada corrida con su veredicto, el contrato detallado de una ficha y las decisiones pendientes |
| `2026-10-06-e2e-verification/` | Verificación **dirigida** del 2026-10-06 (nunca la suite completa): cerró las dos fichas del merge de qa, confirmó las causas documentadas y abrió una ficha nueva (SWR-2) |
| `2026-10-05-e2e-verification/` | Corrida completa del 2026-10-05: 351 aprobados, **0 fallidos**, 3 inestables documentados |
| `2026-10-03-e2e-verification/` | Corrida completa del 2026-10-03 (9 fallos); sus fichas se retiraron al cerrarse, queda el registro en su README |
| `2026-10-01-e2e-verification/` | Corrida del 2026-10-01 (backend + frontend); sus 6 fichas se retiraron al quedar verdes, queda el registro en su README |
| `qa-merge-2026-09-29/` | Fallos traídos por el merge de qa. **Sin fichas vivas**: las dos últimas (5 y 7) se cerraron y retiraron el 2026-10-06 |
| `funcionan-en-solitario/` | **Inventario** de los specs que la suite marca inestables y que pasan cuando se corren solos, con la medición y el comando exacto |
| `group-g/` | Flaky recurrentes de la serie de estabilidad del 2026-09-25 (cerrado) |

## Regla de la carpeta (obligatoria en cada corrida)

1. **Antes de correr**: leer el índice maestro [`../known-issues.md`](../known-issues.md) y estas
   fichas, para no re-diagnosticar lo ya sabido.
2. **Después de correr**:
   - Si un test falla o queda inestable (falla en su primer intento), **crear o actualizar su ficha**
     en la carpeta de esa corrida (`AAAA-MM-DD-e2e-verification/`), con el contrato de abajo.
   - Si un test que tenía ficha **ya no falla**, **retirar la ficha** y dejar el registro de cierre
     (fecha, commit, verificación) en el README de esa corrida.
   - Actualizar el índice maestro: veredicto de la corrida, estado de cada fallo y qué fichas quedan
     vivas.
   - Una corrida **en verde no cierra las fichas por sí sola**: cierra lo que efectivamente ejecutó
     (si un spec está en `testIgnore`, sigue sin verificar; eso se dice, no se asume).
3. **Autorización 1 a 1**: ver abajo.

## Elementos que debe tener cada ficha (contrato)

Contrato completo y con el ejemplo desarrollado en el índice maestro, sección
[Contrato de una ficha de test fallido](../known-issues.md#contrato-de-una-ficha-de-test-fallido).
Resumen de los elementos obligatorios:

1. **Nombre del archivo**: `NN-spec-slug-corto.md` (`NN` = orden dentro de la corrida).
2. **Título**: `# NN. spec.ts:línea — resumen en una frase del fallo`.
3. **Qué prueba el test**: spec y línea exactos, nombre literal del test, y qué verifica en términos
   de negocio (2 o 3 frases, sin jerga de código).
4. **Qué falla (en simple)**: el texto **literal** del error o timeout de Playwright, y **la línea
   del spec que revienta**.
5. **Evidencia**: el estado real de la página en el momento del fallo — snapshot del árbol de
   accesibilidad (`error-context.md`) o trace. Es lo que impide confundir un diagnóstico con una
   corazonada.
6. **Causa raíz**: hipótesis descartadas y causa confirmada, con archivo y línea del código
   implicado y el commit o cambio que la introdujo. **Si no está confirmada, se dice
   "NO CONFIRMADA"** y se listan solo los hechos que la evidencia sostiene.
7. **Clasificación**: defecto del test vs defecto de la aplicación vs inestable de entorno/carga.
   Es lo que decide quién arregla qué.
8. **Propuesta de solución**, marcada como **no aplicada** mientras no haya autorización.
9. **Aplicación y verificación** (si se aplicó): qué se tocó, **con el comando y su exit code**, y
   la fecha. Para un fix de un test, además **prueba de mutación** (volver el arreglo a su forma
   vieja y comprobar que el test cae en la aserción tocada): sin eso no se distingue un fix real de
   un falso verde.
10. **Estado final**: ✅ resuelto / 🟡 inestable documentado sin diagnóstico cerrado / 🔴 abierto /
    ⚪ sin verificar, con la fecha.

## Autorización 1 a 1 (regla innegociable)

Editar un test E2E existente o código de la aplicación **requiere autorización explícita del usuario,
ficha por ficha**. Mientras no exista esa autorización, la ficha documenta el diagnóstico y la
propuesta de solución, y **no se toca el test ni la app**. Una corrida completa en verde no autoriza
nada por sí sola.

## Comandos de una corrida completa (referencia)

Backend E2E aparte del frontend, nunca en paralelo (el reset borra filas vivas), y la suite del
frontend con `--workers=4` en esta máquina:

```
# 1) backend de pruebas (perfil http-e2e, puerto 5019, BD smca_test — el arranque imprime el guard)
dotnet run --project backend/src/SMCA.WebApi --launch-profile http-e2e
# 2) suite E2E del frontend, desde frontend-react/
pnpm test:e2e --workers=4
```

Detalle completo en el README del root, sección "Suite de tests — ejecución manual".
