# Plan — Precio canónico de plan en las tarjetas de tienda (Owner y SuperAdmin)

Fecha: 2026-09-15 · Estado: **IMPLEMENTADO** — backend (DTOs, handlers, PlanPricingUtils, 6 unit tests) + frontend (domain, 2 cards, factories) + E2E nuevo `StorePlanCanonicalPriceTests.cs` (P1–P6, escrito, compila; NO ejecutado — requiere BD `smca_test`). Ningún E2E existente tocado. §6.1 (montos de pago) pendiente de permiso, caso por caso.
Base: análisis del síntoma "Pago muestra 15 (tachado) 7.5 USD en la tarjeta pero 12 (tachado) 5 USD al editar el plan".

## 1. Síntoma
Una tienda en plan **Pago** muestra en la tarjeta (Owner `my-stores` y SuperAdmin `by-current-user`) `15 (tachado) 7.5 USD`, pero la vista de editar plan (`/plan` → `GET /v1/plans`) muestra `12 (tachado) 5 USD`. Con los mismos datos de la BD, ambos precios deben ser iguales **siempre**.

## 2. Causa raíz (verificada en código)
Existen **dos fuentes de verdad** para "lo que paga la tienda":

| Vista | Fuente del precio |
|---|---|
| **Tarjetas de tienda** | **Snapshot congelado**: filas `StoreModule` de la tienda (Σ `price` tachado, Σ `currentPrice`) — `owner-store-card.tsx:96-99`, `store-card-list.tsx:66-75` |
| **Vista editar plan** | **Catálogo vivo**: `PlanProfile.cs:18-20` suma `GetCurrentPrice(Module.Price, ...)` sobre los módulos miembros del plan |

El snapshot de la tienda solo se escribe al **insertar o reactivar** una fila (`ChangeStorePlanCommand.cs:203-213`, `UpdateStoreCommand.cs:230-243`, `ToggleStorePlanCommand.cs:152-165` — siempre en la rama `!storeModule.IsActive`); una vez activa, **jamás se refresca**. Tres vías de divergencia:

1. **El toggle activa de más** (causa principal del síntoma): `ToggleStorePlanCommand.ApplyFreeToPaid` (líneas 140-142) activa **todos** los módulos pagos del catálogo (incluye Warehouses, MultiStores, WholesaleSales) pero deja `StorePlanId = Pago`. La tienda queda con módulos fuera del universo del plan Pago → la tarjeta suma más (15→7.5) que el precio real del plan (12→5). `ChangeStorePlanCommand` sí usa el universo correcto (free ∪ miembros del plan).
2. **Precios congelados**: si el precio/descuento de un módulo cambia en el catálogo (edición de superadmin), las filas ya activas de las tiendas existentes nunca se actualizan → la tarjeta muestra el precio viejo para siempre.
3. **Cambios de plan vía `UpdateStoreCommand` con `PlanId`**: cambian `StorePlanId` sin reconstruir el snapshot.

**Por plan:**
- **Pago**: sufre 1 + 2 + 3 (universo del toggle ≠ universo del plan, precios congelados).
- **Superior / VIP**: solo 2 (su universo ES todo el catálogo pago — `StorePlanModuleEntityTypeConfiguration.cs:53-79`; VIP no está en `/v1/plans`).
- **Gratis**: inmune (no muestra precio).

## 3. Solución — sin migraciones (invariante: misma BD ⇒ mismos precios)
En lugar de reparar el snapshot, **las tarjetas dejan de leerlo para el precio**. El backend calcula el precio mostrado desde `StorePlanId` + catálogo con **la misma fórmula** que usa `PlanProfile` (`CurrentPriceServiceUtils.GetCurrentPrice` sobre los módulos miembros del plan):

```
precio tarjeta = precio vista plan = f(StorePlanId, catálogo)
```

Misma función sobre los mismos datos ⇒ iguales **por construcción**, sin importar el historial de la tienda. El snapshot `StoreModule` conserva su rol de **autorización** (features/roles), y deja de ser fuente de precios.

## 4. Cambios
- **Backend DTOs**: `StoreDto` y `OwnerStoreDto` con `PlanPrice` (Σ price original del plan) y `PlanCurrentPrice` (Σ currentPrice del plan); `null` si la tienda `!Approved` o no tiene plan.
- **Backend handlers**: `GetStoresByCurrentUserQueryHandler` y `GetMyStoresQueryHandler` computan los campos con memo por plan (1 cálculo por plan distinto, no por tienda), vía `IPlanRepository.GetActivePlanWithModulesByIdAsync` + `CurrentPriceServiceUtils`. Mismo patrón que `NextPaymentDate` ya presente.
- **Frontend**: domain `Store`/`OwnerStore` + rebuild dist; `store-card-list.tsx` y `owner-store-card.tsx` consumen los campos canónicos; unit tests de ambas cards actualizados.
- **Unit tests backend** (libremente modificables): dos tiendas con el mismo plan y snapshots distintos ⇒ mismo precio canónico; `!Approved` ⇒ nulos.

## 5. Tests E2E NUEVOS (archivo nuevo `Stores/StorePlanCanonicalPriceTests.cs`)

| # | Qué prueba | Problema simple | Solución que fija |
|---|---|---|---|
| P1 | Para Gratis/Pago/Superior/VIP: precio de `my-stores` == precio de `by-current-user` == `PlanDto.Price` de `/v1/plans` (VIP contra Σ del catálogo) | "Lo que ves en la tarjeta es exactamente lo que cuesta el plan" | La fórmula canónica compartida |
| P2 | Tras `POST /toggle-plan` Free→Pago, la tarjeta muestra el precio del **plan Pago** (12→5), no la Σ de todo el catálogo (15→7.5) | "Encender el plan no cobra módulos de otros planes" | El precio ignora las filas extra del snapshot. **ROJO hoy** (reproduce el síntoma) |
| P3 | Cambiado el precio de un módulo en el catálogo, las tarjetas existentes lo muestran sin escribir nada en la tienda | "Si cambio un precio, todas las tiendas lo muestran al momento" | Precio del catálogo vivo, no congelado. **ROJO hoy** |
| P4 | `POST /change-plan` Pago→Superior actualiza el precio de la tarjeta al del plan Superior | "Al cambiar de plan cambia el precio" | Precio = f(StorePlanId) |
| P5 | Tienda VIP muestra la Σ de todo el catálogo pago (VIP no está en `/v1/plans`) | "VIP cuesta la suma de todo" | El cálculo sirve para planes fuera del catálogo |
| P6 | `!Approved` o plan inválido ⇒ `PlanPrice`/`PlanCurrentPrice` nulos | "Tienda no aprobada no muestra precio" | El guard vive en el backend (hoy solo está en el frontend) |

## 6. Tests E2E EXISTENTES a modificar: **NINGUNO**
- `StoreListPriceParityTests` — verde: los campos son aditivos, la lista de módulos no cambia.
- `ToggleStorePlanTests` — verde: el toggle conserva su contrato de **autorización** (activa todo el catálogo pago); solo el **precio** deja de leerse del snapshot.
- `MyStoresTests`, `PaymentMoneyTests`, `RegisterStorePaymentTests`, … — intocados.

### 6.1 Follow-up OPCIONAL — canonicalizar el monto del pago (requiere permiso, uno a uno)
Hoy `RegisterStorePaymentCommand.cs:73-75` cobra el **snapshot** ⇒ en tiendas toggladas cobra de más. Alinear el cobro al precio canónico requiere modificar E2E existentes; cada caso con: qué prueba / causa / propuesta.

- **E2E-1 `PaymentMoneyTests.Payment_amount_equals_module_sum`** — *Qué prueba:* que el pago registrado equivale a la suma de módulos pagos del snapshot (1500 sembrados). *Causa:* con el precio canónico el monto debe ser el precio del plan del catálogo. *Propuesta:* re-sembrar vía toggle/change-plan o ajustar el esperado al precio canónico del plan.
- **E2E-2 `PaymentMoneyTests.Reseller_commission_is_persisted`** — *Qué prueba:* que la comisión del reseller (25% del monto) se persiste. *Causa:* la comisión deriva del monto; si el monto pasa a canónico, el % se calcula sobre ese. *Propuesta:* actualizar el esperado al monto canónico (proporción intacta).
- **E2E-3 asertos de monto en `RegisterStorePaymentTests`** — *Qué prueba:* montos/comisiones sobre snapshots sembrados a mano. *Causa:* ídem. *Propuesta:* alinear esperados a la fórmula canónica.

**Si no se aprueba §6.1**, este plan queda solo con el precio mostrado; el cobro sigue leyendo el snapshot (queda documentado).

## 7. Verificación
1. E2E nuevos: P2/P3 rojo → fix → 6/6 verdes; suites relacionadas (`StoreListPriceParityTests`, `ToggleStorePlanTests`, `MyStoresTests`) verdes.
2. `dotnet build SMCA.sln` + unit tests backend en verde.
3. Frontend: unit tests de las dos cards + `pnpm typecheck` + `pnpm test`.
4. Frontend E2E (`frontend-react/e2e/**`): sin tocar.

## 8. Fuera de alcance
- Qué módulos activa el toggle (contrato de autorización) — intocable.
- §6.1 salvo aprobación explícita, caso por caso.
- Frontend E2E.
