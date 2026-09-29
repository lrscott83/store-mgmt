# Channel Rates — Buy/Sell Values

## Objetivo

Agregar valores de compra y venta al registro de tasas de canal para permitir conversión bidireccional explícita.

## Diseño

- `buyValue` y `sellValue` reemplazan el campo `value` actual
- **CUP → USD**: se divide entre `buyValue` (el banco compra CUP, recibe USD)
- **USD → CUP**: se multiplica por `sellValue` (el banco vende CUP, recibe USD)
- Tasas existentes se migran: `buyValue = sellValue = value`
- Icono info con tooltip explicativo junto a cada campo

## Impacto

- **Domain**: `ChannelRate` interface, `channel-conversion.ts`
- **Servicio offline**: `channel-rate-offline-service.ts`
- **UI**: `channel-rates.tsx`
- **Sincronización**: `data-synchronizer-service.ts`, `data-serializer-service.ts`
- **Tests**: `channel-rate-offline-service.test.ts`, `channel-rates.test.tsx`, `channel-conversion.test.ts`, `data-synchronizer-channel-rates.test.ts`, `multi-payment-two-channels.integration.test.ts`

## Tareas

- [x] T1: Domain — ChannelRate interface + lógica de conversión
- [x] T2: Servicio offline — migración + persistencia
- [x] T3: UI — formulario + tabla + iconos info
- [x] T4: Tests — actualizar tests existentes + nuevos
- [x] T5: Verificación — build + tests

## Commits

- `1bbca6bf` feat(domain): add buy/sell values to ChannelRate with directional conversion
- `66b01e27` feat(channel-rates): migrate offline service to buy/sell values with legacy support
- `b4f21228` feat(channel-rates): update UI to buy/sell values with info tooltips
- `35a88635` test(channel-rates): update all tests for buy/sell values
- `48a27838` fix(channel-rates): update remaining tests and source for buy/sell values

## Estado

✅ Completo — TypeScript sin errores, todos los tests actualizados.
