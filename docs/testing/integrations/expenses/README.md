# Integración — Gastos

> Specs E2E cubiertos: `expense-crud.spec.ts`, `register-expense.spec.ts` (6 tests).
>
> **Leyenda**
> - ✅ **Total** — toda la afirmación es lógica de negocio y vive en servicios/repositorios/dominio.
> - ⚠️ **Parcial** — la lógica es probable sin navegador, pero el test además prueba algo que exige
>   render/router/red (se indica qué).
> - ❌ **No** — la afirmación depende del navegador o del backend real.
>
> **Regla del proyecto:** los specs E2E no se tocan sin autorización explícita del usuario.

| Test | Qué prueba | Clasificación | Ya cubierto en |
|---|---|---|---|
| `register-expense` — registrar un gasto aparece en la lista | Que un gasto creado desde el formulario queda guardado y visible | ⚠️ **Parcial** — `ExpenseOfflineService.create` es del servicio (29 tests en vitest); **visual:** el modal, el toast y la fila | `expenses/lib/services/__tests__/expense-offline-service.test.ts`, `expense-offline-service.crypto.test.ts` |
| `register-expense` — gasto sin monto muestra error de validación | Que el monto es obligatorio | ⚠️ **Parcial** — el error tipado es de dominio; **visual:** el mensaje en el formulario | ídem + dominio `expense-errors` |
| `register-expense` — la operación funciona correctamente en modo offline | Que el registro funciona sin red | ❌ **No** — prueba el modo offline del navegador | Lógica equivalente en `expenses/lib/services/__tests__/` |
| `expense-crud` S4-A1 — editar un gasto cambia el monto | Que la edición persiste el monto nuevo | ⚠️ **Parcial** — `update` del servicio; **visual:** el modal pre-cargado y la lista | `expenses/lib/services/__tests__/` |
| `expense-crud` S4-A2 — eliminar un gasto lo remueve de la lista | Que eliminar es un soft-delete y desaparece de la lista | ⚠️ **Parcial** — `deleteExpense` del servicio; **visual:** el diálogo de confirmación y la lista | ídem |
| `expense-crud` S4-A3 — historial muestra gastos agrupados por día | Que el historial agrupa por día | ⚠️ **Parcial** — los agregados (`getExpensesInDay` y compañía) son del servicio; **visual:** los acordeones por día | `expenses/lib/services/__tests__/expense-offline-service.test.ts` (agregadores) |

**Ninguno es ✅ Total**: los seis asertan, además de la regla, algo del modal o de la lista
renderizada. El 100% de los métodos de `expense-offline-service` ya está cubierto en vitest, así que
no hace falta moverlos a tests de integración nuevos.

- *Actualizado: 2026-09-24.*
