# Manual: historial de ventas multi-tienda, Salida corregida y 4 imágenes faltantes

Branch `qa` · delivery ask-on-risk · runner: `pnpm test` (vitest) + Playwright (`pnpm test:e2e`)

## Specs

- **S1 — Selector de Salida.** La pantalla `Salida` (`/inventory/egress`) deja de ofrecer
  `Normal` y `Mayorista` en el select `Tipo`. Solo ofrece `Merma`, `Ajuste` y `Otro`, con
  `Merma` como valor por defecto. Cita literal del owner: «quita esos 2 elementos».
- **S2 — Texto de Salida en el manual.** La sección 18 explica que Salida es para «una merma,
  ajuste u otro detalle» y que el select «no vamos a mostrar … ni el tipo Normal ni
  Mayorista». Cita literal: «en ma de salida que explique que sea por ejemplo para una merma,
  ajuste u otro detalle y no vamos a mostrar en el select ni el tipo Normal ni Mayorista».
- **S3 — Historial de ventas.** El manual documenta la entrada de menú `Ventas`
  (`/sales/orders`): qué es, filtros, acordeón por día, acciones del día, y el modo
  **multi-tienda** (paneles colapsables por tienda, filtros globales, totales). Cita literal:
  «de la seccion A hay que adicionar todo para el historial de ventas, incluso con mas de una
  tienda».
- **S4 — Sección B con imágenes.** Las cuatro entradas que tenían sección sin imagen pasan a
  tener captura: `Créditos` (historial), `Salida`, `Entradas` (historial) y `Gastos`
  (historial). Cita literal: «de la seccion B todas deben tener su imagen».
- **S5 — Capturar solo lo nuevo.** La corrida de captura genera únicamente las imágenes nuevas
  y no reescribe las existentes. Cita literal: «que solo genera las nuevas imagenes».
- **S6 — README raíz.** El `README.md` del root documenta el manual, sus imágenes, el script de
  captura y el modo de solo-nuevas. Cita literal: «dejalo documentado todo en el readme del
  root del proyecto».
- **S7 — Autorización E2E.** El owner autorizó actualizar los E2E que pinnean el contrato
  viejo: `e2e/wholesale-sale.spec.ts` (2 tests) y `e2e/inventory-egress.spec.ts` (1 test).

## Tasks

| ID | Specs | Qué | Route | Estado |
| --- | --- | --- | --- | --- |
| T1 | S1 | `egress.tsx`: selector solo Merma/Ajuste/Otro, default Merma | inline | ✅ |
| T2 | S1 | Tests unitarios de `EgressPage` al contrato nuevo | inline | ✅ 57/57 verdes |
| T3 | S7 | E2E `wholesale-sale.spec.ts` + `inventory-egress.spec.ts` al contrato nuevo | inline | ✅ 5/5 verdes |
| T4 | S2 | Manual §18 reescrita | inline | ✅ |
| T5 | S3 | Manual §13.1 Historial de ventas (simple + multi-tienda) | inline | ✅ |
| T6 | S4 | Manual: imágenes en §11, §15, §22 y §18 | inline | ✅ |
| T7 | S5 | `capture-manual.mjs`: modo solo-nuevas + 6 capturas nuevas | inline | ✅ |
| T8 | S5 | Correr la captura solo-nuevas y verificar los 6 archivos | inline | ✅ 14 archivos nuevos, 0 existentes tocados |
| T9 | S6 | README raíz: manual + captura + modo solo-nuevas | inline | ✅ |

**Commits.** `a670906f` (código + tests + E2E) · `docs(manual)` (manual, capturas, script, README).

## Log

**L1 (owner, verbatim).** "de la seccion A hay que adicionar todo para el historial de ventas,
incluso con mas de una tienda. de la seccion B todas deben tener su imagen, y en ma de salida
que explique que sea por ejemplo para una merma, ajuste u otro detalle y no vamos a mostrar en
el select ni el tipo Normal ni Mayorista. Alguna duda para que no asumas nada de nada"

**L2 (owner, verbatim).** "lo que quiero es que hagas ese arreglo en la pantalla y asi en la
imagen se vera bien, quita esos 2 elementos y despues haces la imagen"

**L3 (owner, verbatim).** "te autorizo, y que solo genera las nuevas imagenes. Vamos a hacerlo
de eso modo para que solo se genere las nuevas imagenes y dejalo documentado todo en el readme
del root del proyecto"

**L4 — implementación y evidencia.**
- `egress.tsx`: `EGRESS_ORDER_TYPE_VALUES = [Merma, Ajuste, Otro]` y default `Merma`.
- Unit: `inventory-routes.test.tsx` 57/57 verdes (`EgressPage` 6/6), `tsc` sin errores.
- E2E autorizados: `wholesale-sale.spec.ts` + `inventory-egress.spec.ts` → 5/5 verdes.
- Captura: `CAPTURE_ONLY=new` escribe SOLO `55`…`60` (14 archivos); la primera corrida tocó
  `02/03/05` porque el modo aún no existía; se restauraron con `git checkout` y la corrida
  siguiente ya no las tocó. `04`/`01` nunca cambiaron.
- Manual v1.2: §13.1 nueva (simple + multi-tienda), §18 reescrita, imágenes en §11/§15/§22,
  y el anexo declara el modo multi-tienda del historial.
- `pnpm generate:manual`: 75 imágenes referenciadas · 73 copiadas · PDF regenerado.
- Imágenes nuevas verificadas a ojo: `58-salida.png` muestra `Tipo: Merma`; la multi-tienda
  muestra `Todas las tiendas`, total 9 300 CUP y un panel por tienda.
- Prettier: código y E2E conformes. `manual-usuario-pos.md` y `README.md` ya fallaban
  Prettier en HEAD, así que NO se reformatearon (evita un diff masivo ajeno al cambio).
