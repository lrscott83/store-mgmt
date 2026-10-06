# Snapshot de venta: hallazgos de la revisión nativa (RDD)

> **Estado:** hallazgos registrados. **No implementado.** Nada de este documento se ha escrito en código.
> **Fecha:** 2026-10-06 · **Origen:** revisión nativa RDD del candidato `54007a17..d77947b7`
> (feature `sale-snapshot-completeness`), que salió **aprobada**.
> **Lineage:** `review-0ad703bb5a59aea3` · **Lente:** `review-reliability` · **Riesgo:** `medium`.
> **Consumido:** `sha256:c06545e34263c464125f00c667789e7e011198d4b8ac49647a18cb9db4e44f3f`.

## Por qué este documento existe

La revisión aprobó el cambio y **quemó su autoridad**. Los cinco hallazgos de abajo son
**NO bloqueantes**: ninguno abrió una corrección, ninguno reabre la revisión, y la propia revisión
declara que **no** hay que volver a revisar ese candidato por ellos. Son trabajo posterior.

**No son un veredicto mío.** Salen del envelope nativo de la revisión. Donde discrepo del revisor, lo
digo explícitamente y con la evidencia.

## Resumen

| ID | Severidad | Ubicación | En una línea |
| --- | --- | --- | --- |
| `R3-READ-WRITE-BACK` | **WARNING** | `order-offline-service.ts:843-846` | Una **lectura** ahora escribe; si esa escritura falla, la lectura que antes funcionaba revienta. **Es el que hay que arreglar.** |
| `R3-WHOLESALE-PACKS` | WARNING | `order-offline-service.ts:470-481` | `packs = quantity / packSize` sin guarda → paquete fraccionario; y el escalón se **deriva** al registrar, no se captura al agregar. |
| `R3-BACKFILL-IDEMPOTENCE` | SUGGESTION | `order-offline-service.backfill.test.ts:148` | Falta el test de que una segunda lectura de un store ya saneado **no** vuelve a escribir. |
| `R3-E2E-NOT-RUN` | SUGGESTION | `odd/tasks/sale-snapshot-completeness.md:200` | El contrato guardado cambió y **no se ejecutó ningún E2E**. |
| `R3-HEALED-MIRROR` | SUGGESTION | `order-offline-service.test.ts:197` | Los tests comparan contra una forma «sanada» reimplementada localmente, que espeja la regla de producción. |

---

## F1 · `R3-READ-WRITE-BACK` — la lectura escribe sin red de seguridad (WARNING)

**El código, hoy:**

```ts
// order-offline-service.ts:843-846
if (stored) {
  // sale snapshot (2026-10-06): persist the backfilled defaults once.
  if (changed) this.setOrdersLocalStorage(stored);
  return stored;
}
```

**Qué cambió.** `getOrdersFromLocalStorage` era **solo lectura**. Con el backfill
(user-mandated: *«en memoria y se salvan así mismo»*) la primera lectura de una orden vieja la sanea
**y la vuelve a escribir**. El comportamiento es el pedido; el problema es **cómo falla**.

**Qué pasa si esa escritura falla.** Antes la lectura devolvía las órdenes sin problema; ahora
**propaga la excepción** y la lectura completa se cae. Dos caminos reales:

1. **Cuota de `localStorage` llena.** `setItem` lanza `QuotaExceededError`.
2. **La clave de cifrado (DEK) no está en memoria.** `setOrdersLocalStorage` cifra con
   `encryptEntity`; si la clave no está disponible — por ejemplo antes del desbloqueo — lanza.
   Esto convierte cualquier pantalla que lea órdenes en un fallo duro durante el arranque.

**Por qué importa.** El diseño original era explícito al respecto:

> `design D4: an unreadable store propagates and is never written over.`

Esa cautela se aplicaba a las escrituras. Ahora una **lectura** escribe, y perdió la cautela.

**Arreglo propuesto (best-effort persist).** Que la persistencia sea opcional y la lectura nunca
falle:

```ts
if (stored) {
  if (changed) {
    try {
      this.setOrdersLocalStorage(stored);
    } catch {
      // Best-effort: la cura se devuelve igual; se reintentará en la próxima lectura.
    }
  }
  return stored;
}
```

El saneado en memoria se devuelve siempre; la escritura deja de ser un punto de fallo. Si se quiere
ser más estricto: registrar el fallo (telemetría/consola) y **no** marcarlo como persistido.

**Verificación que falta.** Un test que haga fallar `setOrdersLocalStorage` y afirme que la lectura
**devuelve las órdenes saneadas igual** (hoy no existe: solo se prueba el camino feliz).

---

## F2 · `R3-WHOLESALE-PACKS` — paquete fraccionario y escalón derivado (WARNING)

**El código, hoy:**

```ts
// order-offline-service.ts:470-481
if (wholesaleConfig) {
  const packs = quantity / wholesaleConfig.packSize;
  const applicableTier = [...wholesaleConfig.tiers]
    .filter((tier) => tier.minPacks <= packs)
    .sort((a, b) => b.minPacks - a.minPacks)[0];
  wholesaleFields = {
    wholesalePackSize: wholesaleConfig.packSize,
    wholesalePacks: packs,
    wholesaleTierMinPacks: applicableTier?.minPacks ?? null,
    wholesaleTierUnitPrice: applicableTier?.pricePerUnit ?? null,
  };
}
```

### Corrección al revisor: `packSize = 0` NO es alcanzable

El revisor afirma que `packSize` 0 produce `Infinity`/`NaN` que serializan a `null`. **Eso no puede
pasar.** `getWholesaleConfig` descarta el producto antes:

```ts
// sales/lib/wholesale.ts:73-81
if (
  !product.wholesaleEnabled ||
  !product.wholesalePackSize ||
  product.wholesalePackSize <= 0 ||
  !product.wholesaleTiers ||
  product.wholesaleTiers.length === 0
) return undefined;
```

Si `getWholesaleConfig` devuelve `undefined`, el bloque `if (wholesaleConfig)` **no se ejecuta** y
`packs` nunca se calcula. La mitad `Infinity`/`NaN` del hallazgo queda **descartada**.

### Lo que sí queda

**(a) Paquete fraccionario.** Si `quantity` no es múltiplo de `packSize`, `wholesalePacks` queda
fraccionario (25 ÷ 24 = 1.0416…). Se guarda *«vendiste 1.04 paquetes»*, que no es un dato limpio.
**Alcanzabilidad:** baja pero real. En venta mayorista el carrito avanza con `step = packSize`
(`cart-shell.tsx:433`), así que lo normal es múltiplo exacto. Se rompe si el `packSize` del producto
se edita **entre agregar al carrito y registrar**, porque la cantidad en unidades del carrito ya
está fijada y el divisor es el nuevo.

**(b) El escalón se DERIVA al registrar, no se captura al agregar.** Este es el hueco conceptual,
y es más importante que el fraccionario: `applicableTier` se recalcula con la config **actual** del
producto. Si la config cambió entre agregar y registrar, el escalón documentado **no es el que se
cobró**. Un snapshot que se re-deriva no es un snapshot: es una reconstrucción.

**Arreglo propuesto.** Capturar el escalón **donde se fija el precio** — en el carrito, cuando
`resolveWholesalePrice` / `wholesaleTierUnitPrice` deciden el `unitPrice` de la línea — y pasarlo en
el snapshot de línea que `createOrder` ya recibe. Así `wholesaleTierUnitPrice` y
`wholesaleTierMinPacks` son los que realmente se aplicaron, y `wholesalePacks` sale de la cantidad
de paquetes que el carrito conoce, no de una división posterior.

**Verificación que falta.** Un caso con cantidad no divisible y otro con la config del producto
cambiada entre agregar y registrar.

---

## F3 · `R3-BACKFILL-IDEMPOTENCE` — falta fijar que la cura no se repita (SUGGESTION)

El backfill marca `changed = true` solo cuando realmente sanea algo. En una segunda lectura de un
store ya sano, `changed` debería quedar en `false` y **no** volver a escribir.

Hoy la suite afirma los valores sanados, pero **nunca** afirma que la segunda lectura no escribe.
Sin ese test no se puede distinguir «se curó una vez» de «escribe en cada lectura» — que sería
exactamente el problema de F1 agravado.

**Verificación que falta.** Leer dos veces un store legacy; afirmar que la primera persistió y la
segunda **no** invocó `setOrdersLocalStorage`.

---

## F4 · `R3-E2E-NOT-RUN` — el contrato persistido cambió sin corrida E2E (SUGGESTION)

El contrato guardado cambió de forma material: toda orden lleva ahora `payments[]` **siempre**, más
`storeId` / `createdById` / `client` / `tenderedAmount` / `change` / `saleCurrencyRate*` y el
snapshot por línea.

**No se ejecutó ningún E2E** — fue una orden explícita del owner para este cambio. La conclusión
«ningún E2E afectado» se apoya en un **grep manual** sobre `frontend-react/e2e/`
(`originalPrice`, `conversionRate`, `saleCurrencyRate`, `tenderedAmount` → 0 coincidencias;
`payments` solo en nombres y comentarios, nunca `order.payments`; los únicos specs que leen órdenes
guardadas leen solo `id`/`isActive`/`orderItems[].productCosts[].costPrice`).

El grep es evidencia razonable, pero **no es una corrida**. Un round-trip real de almacenamiento a
través de la app corriendo sigue sin probarse en el nivel más alto.

**Acción propuesta.** Correr la suite E2E completa en la próxima ventana, sin modificar nada más.
Si aparece un rojo, es información: nombrarlo y decidir, nunca «arreglarlo» tocando el E2E.

---

## F5 · `R3-HEALED-MIRROR` — el test espeja la regla de producción (SUGGESTION)

Los tests existentes que actualicé comparan contra una forma «sanada» **reimplementada en el propio
test**:

```ts
// order-offline-service.test.ts:197 (aprox.)
function healedItems(items: OrderItem[]): OrderItem[] {
  return items.map((item) => ({
    ...item,
    originalPrice: item.price,
    originalCurrency: item.currency ?? Currency.CUP,
    conversionRate: 1,
  }));
}
```

El test coincide con producción **por construcción**, porque copia la misma regla. Eso lo hace
débil como evidencia: si la regla de producción y la del test se equivocan juntas, el test sigue
verde.

**No es incorrecto** — mantiene igualdad profunda completa y no debilita ninguna aserción. Solo es
evidencia más débil que un fixture escrito a mano con los valores esperados explícitos.

**Acción propuesta.** Añadir (no reemplazar) un caso con el objeto esperado **literal** para una
orden legacy, sin derivarlo con `healedItems`.

---

## Orden sugerido de trabajo

1. **F1** (`R3-READ-WRITE-BACK`) — es el único con impacto de disponibilidad real: puede tumbar una
   pantalla en un dispositivo con cuota llena o sin desbloquear. Arreglo pequeño y acotado.
2. **F3** (`idempotencia`) — va pegado a F1; el test que falta es el que prueba que F1 no escribe
   en cada lectura.
3. **F2(b)** (escalón derivado) — el fondo es que un dato derivado no es un snapshot. Capturarlo en
   el carrito es un cambio más grande que los otros.
4. **F2(a)** (`packs` fraccionario) — se resuelve casi solo con F2(b).
5. **F5** y **F4** — barato el primero, de coordinación el segundo.

## Referencias

- Documento de la feature: `odd/tasks/sale-snapshot-completeness.md` (incluye el resultado de la
  revisión en su §10).
- Código: `frontend-react/apps/web-store-pos/app/sales/lib/services/order-offline-service.ts`
  (`createOrder`, `getOrdersFromLocalStorage`, `reviveAndBackfillOrder`),
  `frontend-react/apps/web-store-pos/app/sales/lib/wholesale.ts`.
- Revisión: lineage `review-0ad703bb5a59aea3`, resultado `approved`, authority `burned`.
