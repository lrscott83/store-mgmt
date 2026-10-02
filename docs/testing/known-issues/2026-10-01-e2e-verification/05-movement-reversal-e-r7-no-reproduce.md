# 5. movement-reversal:557 (E-R7) — falló en la corrida completa y NO reproduce en solitario

**Qué prueba el test.**
`movement-reversal.spec.ts:557` "E-R7: transferencia editada a otro destino": crea 3
almacenes, compra 10, transfiere 5 de A→B, edita la transferencia de destino B→C y
verifica el stock neto de los 3 almacenes (5/0/5).

**Qué falló (en la corrida completa del 2026-10-01).**
`expect(locator).toBeVisible() failed — element(s) not found` en la **línea 107**, el
helper `openWarehouses()`:

```ts
await page.goto('/inventory/warehouses');
await page.waitForLoadState('networkidle');
await expect(page.getByTestId('warehouses-page-title')).toBeVisible();   // ← falló aquí
```

Es decir: la página de almacenes no mostró su título dentro del timeout. Falló los 3
intentos (failed) y por el `describe.serial` arrastró los did-not-run del spec.

**Reproducción: NEGATIVA (estado honesto de la investigación).**
| Corrida | Resultado de E-R7 |
|---|---|
| Suite completa, 4 workers (la del fallo) | **failed** 3/3 intentos |
| Spec aislado, `--workers=1` | passed (spec 20/20, 3.8 m) |
| Spec aislado, `--workers=4` | passed (spec 20/20, 3.0 m) |
| Spec aislado, `--workers=4 --repeat-each=2` | passed (40/40, 3.3 m) — E-R7 2/2 |

E-R7 pasó **4/4 intentos en solitario** y falló **3/3 bajo la carga de la suite
completa**. No se pudo repetir el entorno exacto del fallo.

**Causa raíz: NO CONFIRMADA.** Lo que la evidencia permite afirmar:
- No es lógica del test ni de la app en condiciones normales: el flujo completo pasa
  siempre en solitario, con cualquier cantidad de workers del propio spec.
- El fallo es de **entorno/carga**: con la suite completa (4 workers + backend + dev
  server + PostgreSQL compartidos por todo), `openWarehouses` no vio el título a tiempo.
- **Limitación:** los artifacts de esa corrida (error-context.md con el snapshot del DOM
  y el trace) fueron borrados por las corridas aisladas posteriores (`test-results` se
  limpia al arrancar cada corrida), así que no se puede ver QUÉ página se renderizó en
  lugar de la de almacenes (¿login por sesión? ¿redirect de feature flag? ¿spinner de
  carga? ¿pantalla vacía?). Adivinar sería peor que no afirmar.

**Propuesta (pendiente de autorización — no se aplicó nada).**
1. **Cerrar la causa:** repetir la corrida completa y, si vuelve a fallar, **preservar
   `test-results/`** (no correr nada después) y leer el `error-context.md` + trace de
   E-R7 — eso revela qué vio el navegador.
2. Según lo que muestre el snapshot, endurecer `openWarehouses` (espera de estado real
   en vez de `networkidle`, que es conocido por ser frágil bajo carga) — decisión que
   depende del hallazgo. Tocar specs E2E requiere autorización 1 a 1: **no se tocó nada.**
