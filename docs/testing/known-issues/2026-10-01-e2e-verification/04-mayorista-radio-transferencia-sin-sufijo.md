# 4. mayorista-sale:218 — el radio del filtro ya no se llama "Transferencia (CUP)" con MultiMonedas activo

**Qué prueba el test.**
`mayorista-sale.spec.ts:218` "venta mayorista con Transferencia (CUP) queda filtrable por
método de pago": registra una venta mayorista pagada con Transferencia, va a
`/sales/today-orders` y clickea el **radio del filtro dinámico** `Transferencia (CUP)`
(línea 240) para confirmar que la venta queda filtrable bajo ese método.

**Qué falla (en simple).**
El radio SÍ existe y la venta SÍ está, pero se llama **`Transferencia`, sin el sufijo
`(CUP)`**. El test busca el nombre viejo y el `locator.click` espera eternamente
(`Test timeout of 120000ms exceeded`), 3 veces. El snapshot del DOM en el fallo lo prueba:

```yaml
- heading "Ventas del día (24) 216 CUP"
- radio "Todas" [checked]
- radio "Transferencia"          ← el test busca "Transferencia (CUP)"
```

**Causa raíz (confirmada — cambio de UI intencional, no regresión).**
- `today-orders.tsx:160` renderiza el label con
  `paymentMethodKeyToLabel(key, !multiMonedas)`: **con MultiMonedas activo en la tienda,
  `withCurrency=false` y el sufijo de moneda se omite** (`payment-filter-options.ts:111`,
  `label.split(' (')[0]` → "Transferencia").
- Lo introdujo `8521d28e` "feat(sales,expenses): scope payment channel filter to the
  selected currency" (**2026-09-29**, traido por los merges de dev/qa), que lo documenta
  en su propio mensaje: *"the payment channel filters in sales/today-orders … now render
  the channel without the currency suffix (Transferencia, not Transferencia (CUP)) …
  The three views pass `!multiMonedas`"*.
- La tienda del snapshot de este test (`applyWholesaleSnapshot`) tiene MultiMonedas
  activo → la vista acota el filtro a la moneda y omite el sufijo → el nombre que el
  spec busca ya no existe.
- Los unit tests del filtro (`today-orders-payment-filter.test.tsx`) esperan
  `Transferencia (CUP)` y pasan porque corren con MultiMonedas OFF: ninguna cobertura
  unitaria de la combinación (MultiMonedas ON + hoy-orders) que este E2E sí ejercita.
- Primer registro del fallo: la corrida de `78f3d804` (2026-10-01) — post-merge del
  cambio. El comentario del propio spec (2026-09-19) es anterior al cambio.

**Evidencia (2026-10-01).**
1. Corrida completa: failed 3/3 intentos.
2. Spec aislado `pnpm test:e2e e2e/mayorista-sale.spec.ts --workers=1`: **failed 3/3
   intentos** (1 failed / 1 passed / 4 did-not-run por el `describe.serial`) —
   determinista, reproduce siempre en solitario.
3. `error-context.md` del retry #2: el snapshot del DOM citado arriba (radio
   `Transferencia` presente, venta 216 CUP en el header).

**Estado de la causa raíz:** confirmada con snapshot del DOM + diff del commit.

**Propuesta de solución (pendiente de autorización — no se aplicó nada).**
Actualizar el nombre esperado en el spec para cubrir ambos estados, p. ej.
`getByRole('radio', { name: /^Transferencia/ }` (con o sin sufijo) o elegir el nombre
según `multiMonedas` de la tienda. Cambio de 1 línea en un test E2E: requiere
autorización explícita 1 a 1 (regla de la sesión). **No se tocó nada.**
