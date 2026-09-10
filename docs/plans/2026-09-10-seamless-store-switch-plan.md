# Cambio de tienda sin logout ni password (MultiStores) — Plan

- Estado: aprobado e **en implementación** (2026-09-10)
- Alcance: backend (login wrap multi-tienda) + frontend (tabla de wraps por tienda en el device, flujo de switch compartido). Sin cambios en E2E.
- Regla innegociable del usuario: **los tests E2E de frontend (`frontend-react/e2e/**`) y backend (`SMCA.WebApi.E2ETests/**`) no se modifican sin autorización explícita.** Este plan fue verificado contra ellos: no requieren cambios.

## Objetivo

Con el módulo MultiStores (14), cambiar de tienda —desde el icono del header (`StoreSwitcher`) o desde el select de Configuraciones— **no debe desloguear ni pedir password** para el mismo usuario. Debe comportarse como un hard refresh: persistir la selección, obtener módulos/features de la tienda nueva y recargar.

## Causa raíz (por qué hoy desloguea)

`StoreSwitcher.switchStore()` (`store-switcher.tsx:66-79`) y `ConfigurationsPage.handleStoreChange` llaman `setMyStore(storeId)` y, al tener éxito, llaman `logout()` **explícitamente**. El logout existe porque:

- El DEK (clave de cifrado at-rest) es **por tienda**: `DEK = HKDF(masterSecret, storeId)` — determinista.
- El DEK vive solo en memoria y se limpia en logout; el único re-provisionamiento en sesión (`resolveDekForLogin`) corre solo desde `login()`/`loginOffline()`.
- Tras el switch, nadie en el cliente puede desenvolver el wrap de la tienda nueva (el password nunca se persiste: `password: ''`), así que seguir en sesión cifraría los datos de la tienda nueva con la clave de la vieja ("wrong key under the right label").

## Mecánica que lo resuelve

El servidor **sí puede** envolver el DEK de cada tienda en cualquier momento (`WrapDek(storedPreHash, dek)`, ya lo hace en login y en el roster offline). El password solo está disponible un instante —en el login—, así que el provisionamiento por-tienda DEBE ocurrir ahí:

1. **Login**: la respuesta trae `StoreDekWraps: [{ storeId, wrappedDek, wrapSalt, wrapIv }]` — un wrap por cada tienda a la que el usuario puede cambiar. El frontend desenvuelve cada uno con el password (disponible solo entonces) y persiste cada DEK envuelto bajo la **device key** en la tabla `lizoft.device-dek` (v2, entradas por tienda). Es el mismo mecanismo de confianza que ya permite a un reload recuperar el DEK sin password, extendido de una tienda a varias.
2. **Switch**: `setMyStore(storeId)` → `getMe()` (módulos/features/roles de la tienda nueva, server-side) → `retargetDeviceWrapStore(storeId)` (copia el device-wrap de esa tienda al slot activo) → `updateUser(fresh)` → `window.location.reload()`. En el boot, el usuario cacheado hidrata con la tienda nueva y `bootstrapDeviceDek` recupera **su** DEK. Sin login, sin password.
3. **Fallback**: si la tienda nueva no tiene wrap en este device (p. ej. concedida después del último login del device), se usa el flujo actual de logout con aviso; el próximo login la provisiona.

## Backend

| Archivo | Cambio |
|---|---|
| `Application/Dtos/Authentication/AuthDto.cs` | Nuevo `StoreDekWrapDto(string StoreId, string WrappedDek, string WrapSalt, string WrapIv)`; `AuthDto` gana `List<StoreDekWrapDto>? StoreDekWraps = null` (último parámetro opcional — `RegisterCommand.cs:132` y `RefreshCommand.cs:85-90` no se tocan). Aditivo: JSON de clientes viejos y tests E2E (`AuthLoginDekWrapTests` afirma solo los campos top-level) intactos. |
| `Application/Features/Authentication/Commands/Login/LoginCommand.cs` | `TryBuildLoginDekWrapAsync` → `TryBuildLoginDekWrapsAsync`: tras el guard actual, envuelve el DEK de la tienda **seleccionada primero** (los campos top-level legacy se ligan al primer wrap) + las tiendas activas del owner vía `IStoreRepository.GetActiveStoresByUserIdAndIgnoreQueryFiltersAsync(user.Id)`. `IgnoreQueryFilters` obligatorio: login es anónimo y el filtro tenant (`IsSuperAdmin || TenantId == context.TenantId`) ocultaría todas las tiendas (mismo motivo del re-query del usuario sin filtros). Try/catch por tienda: una tienda que falla se omite, el login nunca falla (disciplina R4). |
| `Application.Tests/.../LoginCommandHandlerTests.cs` | Unit: owner con 2 tiendas → 2 wraps (seleccionada primero, top-level intacto); seleccionada no-owned → envuelta igual; una tienda lanza → se omite, el resto y el login siguen; todas fallan → campos vacíos, éxito. |

## Frontend

| Archivo | Cambio |
|---|---|
| `packages/domain/src/models/auth.ts` | `AuthModel.storeDekWraps?: Array<{ storeId, wrappedDek, wrapSalt, wrapIv }>` (opcional). Rebuild del dist (`npm run build` en `packages/domain` — resuelve por dist). |
| `shared/lib/storage/device-dek-table.ts` | `formatVersion: 2`, campo opcional `stores?: Record<string, { device: DeviceWrap }>`; `hasValidShape` acepta 1 y 2 (tablas legacy siguen leyendo; campo opcional ⇒ sin migración). Nuevo `retargetDeviceWrapStore(newStoreId): boolean` — copia `stores[newStoreId].device` a `table.device`, `table.storeId = newStoreId`, escribe; `false` si no existe (dispara el fallback). |
| `shared/lib/offline/dek-provisioning.ts` | 1) `provisionStoreDekWraps({ login, password, wraps })`: por entrada, `unwrapDek(password, entry)` → `wrapDekForDevice(dek, deviceKey)` → `table.stores[storeId] = { device }`; fallo por entrada se omite, nunca fatal; corre tras `resolveDekForLogin` en `auth-store.login` (read-modify-write fresco). 2) **Cierra el "KNOWN GAP" documentado**: cuando el DEK ya estaba establecido (bootstrap de device / entrada propia) y la respuesta de login trae wrap, desenvolverlo y comparar; si difiere, adoptar la clave del servidor para `sessionStoreId` (autoridad de esta sesión; `GetDek` es determinista ⇒ una discrepancia solo puede significar tiendas distintas), reescribiendo `table.storeId`/`table.device`. Antes era gap aceptado; con switch en sesión se vuelve riesgo real de split cross-store. Costo: 1 PBKDF2 + AES-GCM por login. |
| `shared/lib/stores/auth-store.ts` | `login()` reenvía `authData.storeDekWraps` a `provisionStoreDekWraps` (tras `resolveDekForLogin`, antes del latch reset; solo si el array no es vacío). `loginOffline` intacto. |
| `shared/lib/stores/switch-store.ts` (NUEVO) | Flujo compartido por ambas UIs: `setMyStore → getMe → retargetDeviceWrapStore → true: updateUser + window.location.reload() / false: logout()` (fallback). Lanza si `setMyStore`/`getMe` fallan para que cada caller mantenga su UI de error. |
| `shared/components/store-switcher.tsx` + `management/configurations/routes/configurations.tsx` | Delegan en el helper; manejo de error y estados `isSwitching` preservados; comentarios actualizados. |

## Tests (unitarios — ningún E2E tocado)

- `device-dek-table.test.ts`: shape v2, v1 legacy sigue válida, retarget true/false.
- `dek-provisioning.test.ts`: provisionamiento por tienda (unwrap+device-wrap, fallos omitidos), retarget, reconciliación login-response con DEK establecido que difiere.
- `auth-store` (dek tests): login pasa los wraps.
- `store-switcher.test.tsx` / `configurations.test.tsx`: éxito afirma `setMyStore` + `getMe` + retarget + `updateUser` + reload y **sin logout**; fallback afirma logout cuando retarget es false; tests de fallo existentes se preservan (el mock de auth gana `updateUser`).

## Tradeoffs aceptados

- Compromiso del device expone wraps de todas las tiendas usadas en él (misma clase que el device-wrap actual, multiplicada).
- El roster offline sigue siendo por tienda: tras cambiar, el uso offline de la nueva exige re-export de roster (flujo existente). El uso online no cambia.

## Verificación

`dotnet build` + `Application.Tests` completos; frontend `tsc --noEmit` + vitest de las suites tocadas; `git diff` prueba que `SMCA.WebApi.E2ETests/**` y `frontend-react/e2e/**` quedan byte-idénticos al estado committeado.
