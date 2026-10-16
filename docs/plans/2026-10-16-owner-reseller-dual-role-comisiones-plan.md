# Plan — Owner que también es ReSeller, y comisiones aplicadas a su propio pago

**Fecha:** 2026-10-16 · **Rama:** (sin definir) · **Estado:** PROPUESTA — NO INICIADO

> Documento de factibilidad + diseño propuesto. **No autoriza implementación.** Nace de la pregunta del
> owner (2026-10-16): *"¿Es posible hacer que un usuario Owner pueda ser reseller al mismo tiempo y que se
> le descuente según los pagos hechos por sus clientes captados por sus comisiones?"*

## 1. Resumen

Se quiere que **un mismo usuario sea Owner (tiene tienda(s)) y ReSeller (capta clientes)** a la vez, y que
las **comisiones** que gana por los pagos de esos clientes se le **apliquen como descuento** en los pagos de
su propia tienda.

**Veredicto:** hoy **no está soportado**, aunque el modelo de datos lo permite a medias. No es un cambio
pequeño: toca **dinero** (precio a cobrar, comisiones, trial) → riesgo alto, requiere diseño de producto y
verificación independiente.

## 2. Estado actual — lo que YA existe

| Pieza | Dónde | Qué aporta |
|---|---|---|
| Multi-rol por usuario | `Domain/Entities/UserRoles/UserRole` · `AddUserRolesCommand` | `UserRole` es colección; `AddUserRoles` puede añadir `ReSeller (4)` a cualquier usuario |
| Claims por rol independientes | `SMCA.WebApi/Services/ClaimsTransformerService.cs:34-45` | Calcula `admin` y `reseller` por separado → un usuario con ambos roles llevaría **ambas banderas** |
| Comisión por pago | `StorePayment` (`ReSellerId`, `ReSellerPercentDiscountPrice`, `ReSellerDiscountPrice`, `ReSellerAmount`) | Se calcula al registrar el pago y **queda guardada** por pago |
| Fórmula de comisión | `Domain/Common/Utils/StoreBillingUtils.GetReSellerCommission` | `amount − GetCurrentPrice(amount, percent, flat)` |
| Reporte de comisiones | `GetReSellerCommissionsQuery` + `ReSellerCommissionDto` | Agrupa por año/mes, **separando USD y CUP** (regla 2026-10-13) |
| Vínculo reseller↔owner | `ReSellerOwner` (con descuento negociado) | Lo que hoy liga a un reseller con los owners que captó |
| Registro de pago | `RegisterStorePaymentCommand` | Guard: **solo SuperAdmin o ReSeller**. Snapshot de `ReSellerOwner` para la comisión |

## 3. Estado actual — lo que FALTA (por eso hoy no se puede)

1. **No hay flujo de producto que haga a un owner reseller a la vez.**
   - `CreateOwnerService` crea el usuario con `OwnerAdmin` y **su propio `Tenant`**.
   - `CreateReSellerCommand` crea el usuario con `ReSeller`.
   - No hay UI ni caso de uso que una ambos; login / home / features no están resueltos para el doble rol.
2. **No existe un saldo de comisiones.** La comisión se **registra y se reporta**, pero nunca se **acumula
   como crédito disponible** en ningún lado.
3. **No hay nada que aplique ese crédito a un pago propio.** `RegisterStorePaymentCommand` solo admite
   SuperAdmin o ReSeller (un `OwnerAdmin` **ni siquiera puede registrar pagos** hoy), y el monto a cobrar
   sale **exclusivamente** de `ModulePriceCalculator.CalculateTotal` — sin resta de comisiones.
4. **Riesgo de auto-comisión.** Si el reseller es dueño de su propia tienda, hay que impedir que gane
   comisión sobre sus **propios** pagos. `ReSellerOwner` hoy no lo prohíbe (se auto-referenciaría).

## 4. Diseño propuesto (borrador, sujeto a decisión del owner)

### Fase A — Doble rol (Owner + ReSeller)
- Permitir que un usuario tenga `UserRole` de `OwnerAdmin` y `ReSeller` simultáneamente (el modelo ya lo
  soporta; falta el flujo y la UI).
- Resolver **login/home/features** para el doble rol (hoy `AllowedFeaturesService` ramifica por rol).
- Reglas de convivencia: ¿qué home ve?, ¿puede captar owners propios y tener tienda propia?

### Fase B — Ledger de comisiones (saldo)
- **Nuevo:** saldo de comisiones por reseller, en su moneda (**USD y CUP separadas**, como el reporte).
- Fuente: los `StorePayment.ReSellerAmount` ya persistidos; acreditación al confirmarse el pago.
- Definir: ¿solo lectura/consulta o saldo consumible? ¿movimientos (alta/baja) o un acumulado?

### Fase C — Aplicar el saldo como descuento al pago de su propia tienda
- Integrar con la **regla única de cobro** (`ModulePriceCalculator.CalculateTotal`) y con
  `BillingService.GetStoreBillingSummaryAsync` para que cartel y cobro no discrepen.
- Cuidar el **gate de monto efectivo 0** (`hasBillableAmount`): si el descuento deja el pago en 0, no debe
  entrar en trial ni generar cartel de primer cobro (patrón ya existente 2026-09-06).
- **Guard de auto-comisión (Fase D, obligatorio antes):** un reseller no gana comisión sobre sus propios
  pagos; si se permitiera, el descuento y la comisión se realimentarían.

## 5. Decisiones de producto ABIERTAS (bloquean el diseño)

1. ¿El descuento se aplica **automáticamente** o el usuario **elige** cuánto saldo usar?
2. ¿El saldo **caduca**? ¿Se puede quedar **en negativo**? ¿Se puede retirar/transferir?
3. ¿En qué **moneda** se descuenta si el pago y el saldo están en monedas distintas (USD vs CUP)?
4. ¿Cómo interactúa con el **trial** y con `AmountPaid`/tipo de cambio?
5. ¿Las comisiones ya ganadas **antes** de esta feature se acreditan al nuevo ledger?

## 6. Riesgos

- **Alto (dinero):** cualquier error cambia lo que se cobra o lo que se paga al reseller.
- **Doble rol:** afecta autenticación, home, features y aislamiento por tenant.
- **Auto-referencia:** `ReSellerOwner` ligando a un reseller con su propio owner.
- **Desincronización cartel/cobro** si el descuento no entra por la regla única de precio.

## 7. Fuera de alcance

- No se toca el cálculo de comisión existente ni el reporte `GetReSellerCommissionsQuery` (solo se le suma
  la parte de saldo/aplicación).
- No se toca el módulo MultiStores ni su regla de tienda adicional (2026-10-16, ya entregada).

## 8. Evidencia (archivos)

- `backend/src/Domain/Entities/StorePayments/StorePayment.cs`
- `backend/src/Domain/Entities/ReSellerOwners/ReSellerOwner.cs`
- `backend/src/Domain/Entities/ReSellers/ReSeller.cs`
- `backend/src/Domain/Common/Utils/StoreBillingUtils.cs`
- `backend/src/Domain/Common/Utils/ModulePriceCalculator.cs`
- `backend/src/Application/Features/StoreManagement/StorePayments/Commands/RegisterStorePayment/RegisterStorePaymentCommand.cs`
- `backend/src/Application/Features/StoreManagement/StorePayments/Queries/GetReSellerCommissions/GetReSellerCommissionsQuery.cs`
- `backend/src/Application/Services/Billing/BillingService.cs`
- `backend/src/Application/Services/Owners/CreateOwnerService.cs`
- `backend/src/Application/Features/Administration/ReSellers/Commands/CreateReSeller/CreateReSellerCommand.cs`
- `backend/src/Application/Features/UserManagement/Users/Commands/AddUserRoles/AddUserRolesCommand.cs`
- `backend/src/SMCA.WebApi/Services/ClaimsTransformerService.cs`

## 9. Siguiente paso

Confirmar las decisiones de §5 (o al menos la 1, 2 y 4). Con eso, pasar a una propuesta formal
(ODD/SDD) con specs y tareas antes de tocar código.
