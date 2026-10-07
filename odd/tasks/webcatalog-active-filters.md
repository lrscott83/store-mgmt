# Feature — Filtros IsActive en el catálogo público (Product, Category, Store, Owner, User)

## Objetivo

Toda consulta que muestre productos del catálogo público debe filtrar por
`IsActive` en **Product**, **Category**, **Store**, **Owner** y **User`.

Hoy, desactivar el owner o su usuario **no** apaga el catálogo web de sus
tiendas: el endpoint público es anónimo y jamás lee esas dos entidades.

## Problema

`GetPublicCatalogQueryHandler` resuelve la tienda por slug y filtra productos.
Los filtros actuales:

| Entidad | Filtra hoy | Dónde |
|---|---|---|
| Store | ✅ | `StoreRepository.GetStoreByCatalogSlugAsync` |
| Product | ✅ | `ProductRepository.GetPublishedByStoreIdAsync` |
| Category | ✅ | `ProductRepository.GetPublishedByStoreIdAsync` |
| Owner | ❌ | — |
| User | ❌ | — |

`Owner` **sí tiene** `IsActive`: lo hereda de `AuditableEntity<TId>`
(`Domain/Common/Entities/AuditableEntity.cs`), default `true`. `User` también
(`Domain/Entities/Users/User.cs:12`). El atributo existe; lo que falta es el
filtro.

Precedente ya establecido en el repo: `AuthMeInactiveStoreOwnerTests`
(`SMCA.WebApi.E2ETests/Auth/`) asserta 404 cuando owner o store están inactivos
en `/me`. El catálogo público debe comportarse igual.

## Alcance

1. **Tests E2E nuevos** (RED primero) en `SMCA.WebApi.E2ETests/Catalog/`.
2. **Filtro** en `ProductRepository.GetPublishedByStoreIdAsync` y/o en
   `GetPublicCatalogQueryHandler` — lo que sea correcto según dónde resuelva el
   handler.
3. Las **tres** queries públicas: `GetPublicCatalog` (cabecera),
   `GetPublicCatalogProducts` (listado) y `GetPublicCatalogProduct` (detalle).
   `GetCatalogMedia` decide por su cuenta.

## Fuera de alcance

- **No tocar ningún test E2E existente.** Solo agregar archivos/ tests nuevos.
  Regla dura del repo.
- No cambiar `/me`, el roster ni la revocación de sesiones: ya funcionan.
- No agregar `IsActive` a entidades que no lo tengan: todas las necesarias ya lo
  tienen por herencia.
- No tocar frontend.

## Criterios de aceptación

1. Owner con `IsActive = false` → el catálogo público de sus tiendas **no**
   aparece (404 si es la cabecera, lista vacía si es el listado).
2. User del owner con `IsActive = false` → mismo resultado.
3. Store `IsActive = false` → 404 (ya funciona; debe seguir funcionando).
4. Product o Category inactivos → no aparecen (ya funciona; no debe romperse).
5. Los tres endpoints públicos se comportan igual entre sí.

## Checks

```bash
dotnet build backend/src/SMCA.sln
dotnet test backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj
```

## Decisión de diseño — dónde va el filtro

El filtro va en **`StoreRepository.GetStoreByCatalogSlugAsync`**, NO en
`ProductRepository`. Razón: los **tres** endpoints públicos resuelven la tienda por
ese único método antes de leer productos. Filtrando ahí:

- los tres devuelven el **mismo 404** (`CatalogStoreNotFound`) — criterio 5 y la
  convención que ya fija `Unknown_slug_returns_the_same_404_for_every_endpoint`;
- el catálogo de un dueño inactivo **desaparece**, no se vacía: el criterio 1
  ("404 si es la cabecera, lista vacía si es el listado") es ambiguo, pero una
  cabecera 200 con cero categorías junto a un listado 404 sería incoherente y
  rompería el criterio 5. El criterio 3 ya establece que una tienda inactiva da
  404 en la cabecera; Owner/User deben comportarse igual.
- `ProductRepository.GetPublishedByStoreIdAsync` / `GetPublishedByIdAsync` quedan
  intactos: sus filtros de Product/Category ya existían y no hay que tocarlos.

Efecto colateral aceptado: `GetCatalogMedia` usa el mismo método, así que las
imágenes de una tienda con dueño inactivo también dan 404. Es la consecuencia
correcta (no sirven archivos de una tienda desactivada) y ningún test existente lo
contradecía.

`Store.Owner` y `Owner.User` son navegaciones **no-nullable**, así que EF las
resuelve con INNER JOIN: un store sin owner no revienta con NRE, simplemente no
resuelve.

## Progreso

- [x] T1 — Investigación: filtros actuales, jerarquía de `IsActive`, precedente
- [x] T2 — Tests E2E nuevos en RED (owner inactivo, user inactivo)
- [x] T3 — Aplicar filtro Owner/User → GREEN
- [x] T4 — Suite E2E: verde salvo 1 fallo PRE-EXISTENTE (ver abajo, con salvedad)

### T2 — RED (código de producción sin tocar)

Archivo nuevo: `backend/src/SMCA.WebApi.E2ETests/Catalog/WebCatalogPublicInactiveOwnerTests.cs`.
Tres `[Fact]` nuevos; ninguno existente se tocó.

```
dotnet test backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj --filter "FullyQualifiedName~WebCatalogPublicInactiveOwnerTests" --no-build
```

```
[xUnit.net 00:00:34.43]     SMCA.WebApi.E2ETests.Catalog.WebCatalogPublicInactiveOwnerTests.Inactive_owner_hides_the_whole_public_catalog [FAIL]
  Failed SMCA.WebApi.E2ETests.Catalog.WebCatalogPublicInactiveOwnerTests.Inactive_owner_hides_the_whole_public_catalog [4 s]
  Error Message:
   Expected header.StatusCode to be HttpStatusCode.NotFound {value: 404} because la cabecera del cat��logo p��blico no se sirve cuando Owner, User o Store est��n inactivos, but found HttpStatusCode.OK {value: 200}.
  Stack Trace:
     at FluentAssertions.Execution.XUnit2TestFramework.Throw(String message)
     at FluentAssertions.Execution.TestFrameworkProvider.Throw(String message)
     at FluentAssertions.Execution.DefaultAssertionStrategy.HandleFailure(String message)
     at FluentAssertions.Execution.AssertionScope.FailWith(Func`1 failReasonFunc)
     at FluentAssertions.Execution.AssertionScope.FailWith(String message, Object[] args)
     at FluentAssertions.Primitives.EnumAssertions`2.Be(TEnum expected, String because, Object[] becauseArgs)
     at SMCA.WebApi.E2ETests.Catalog.WebCatalogPublicInactiveOwnerTests.AssertPublicCatalogIsNotServedAsync(Published published) in D:\Projects\AutoBusinessPro\Store\qa-env\store-mgmt\backend\src\SMCA.WebApi.E2ETests\Catalog\WebCatalogPublicInactiveOwnerTests.cs:line 152
     at SMCA.WebApi.E2ETests.Catalog.WebCatalogPublicInactiveOwnerTests.Inactive_owner_hides_the_whole_public_catalog() in D:\Projects\AutoBusinessPro\Store\qa-env\store-mgmt\backend\src\SMCA.WebApi.E2ETests\Catalog\WebCatalogPublicInactiveOwnerTests.cs:line 51
     at SMCA.WebApi.E2ETests.Catalog.WebCatalogPublicInactiveOwnerTests.Inactive_owner_hides_the_whole_public_catalog() in D:\Projects\AutoBusinessPro\Store\qa-env\store-mgmt\backend\src\SMCA.WebApi.E2ETests\Catalog\WebCatalogPublicInactiveOwnerTests.cs:line 56
--- End of stack trace from previous location ---
[xUnit.net 00:00:36.63]     SMCA.WebApi.E2ETests.Catalog.WebCatalogPublicInactiveOwnerTests.Inactive_owner_user_hides_the_whole_public_catalog [FAIL]
  Failed SMCA.WebApi.E2ETests.Catalog.WebCatalogPublicInactiveOwnerTests.Inactive_owner_user_hides_the_whole_public_catalog [1 s]
  Error Message:
   Expected header.StatusCode to be HttpStatusCode.NotFound {value: 404} because la cabecera del cat��logo p��blico no se sirve cuando Owner, User o Store est��n inactivos, but found HttpStatusCode.OK {value: 200}.
  Stack Trace:
     at FluentAssertions.Execution.XUnit2TestFramework.Throw(String message)
     at FluentAssertions.Execution.TestFrameworkProvider.Throw(String message)
     at FluentAssertions.Execution.DefaultAssertionStrategy.HandleFailure(String message)
     at FluentAssertions.Execution.AssertionScope.FailWith(Func`1 failReasonFunc)
     at FluentAssertions.Execution.AssertionScope.FailWith(String message, Object[] args)
     at FluentAssertions.Primitives.EnumAssertions`2.Be(TEnum expected, String because, Object[] becauseArgs)
     at SMCA.WebApi.E2ETests.Catalog.WebCatalogPublicInactiveOwnerTests.AssertPublicCatalogIsNotServedAsync(Published published) in D:\Projects\AutoBusinessPro\Store\qa-env\store-mgmt\backend\src\SMCA.WebApi.E2ETests\Catalog\WebCatalogPublicInactiveOwnerTests.cs:line 152
     at SMCA.WebApi.E2ETests.Catalog.WebCatalogPublicInactiveOwnerTests.Inactive_owner_user_hides_the_whole_public_catalog() in D:\Projects\AutoBusinessPro\Store\qa-env\store-mgmt\backend\src\SMCA.WebApi.E2ETests\Catalog\WebCatalogPublicInactiveOwnerTests.cs:line 70
     at SMCA.WebApi.E2ETests.Catalog.WebCatalogPublicInactiveOwnerTests.Inactive_owner_user_hides_the_whole_public_catalog() in D:\Projects\AutoBusinessPro\Store\qa-env\store-mgmt\backend\src\SMCA.WebApi.E2ETests\Catalog\WebCatalogPublicInactiveOwnerTests.cs:line 75
--- End of stack trace from previous location ---

Failed!  - Failed:     2, Passed:     1, Skipped:     0, Total:     3, Duration: 2 s - SMCA.WebApi.E2ETests.dll (net8.0)
```

Lectura del RED: `Inactive_owner_*` e `Inactive_owner_user_*` fallan porque la
cabecera responde **200**. El tercer test
(`Inactive_store_keeps_hiding_the_whole_public_catalog`) **pasa**: el filtro
`Store.IsActive` ya existía, así que ese test es la guarda que verifica que el
cambio de Owner/User no lo relaja. En los dos tests que fallan, la aserción
previa `AssertPublicCatalogIsServedAsync` (200 con la categoría y el producto
visibles) **sí pasó** — el fixture era correcto, la ruta de desactivación es la
que falta, como quería el spec.

### T3 — GREEN (filtro aplicado)

Único cambio de producción
(`backend/src/Infrastructure/Persistence/Repositories/StoreRepository.cs:118`):

```csharp
=> await _stores
    .IgnoreQueryFilters()
    .FirstOrDefaultAsync(s => s.IsActive
        && s.Owner.IsActive
        && s.Owner.User.IsActive
        && s.CatalogSlug == catalogSlug);
```

Sin columnas nuevas: `IsActive` viene de `AuditableEntity< Guid >`.

```
dotnet test backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj --filter "FullyQualifiedName~WebCatalogPublicInactiveOwnerTests" --no-build
```

```
[13:27:38 WRN] Request rejected: No existe un cat�logo publicado en esa direcci�n
[13:27:38 WRN] Request rejected: No existe un cat�logo publicado en esa direcci�n
[13:27:38 WRN] Request rejected: No existe un cat�logo publicado en esa direcci�n
[13:27:40 WRN] Request rejected: No existe un cat�logo publicado en esa direcci�n
[13:27:40 WRN] Request rejected: No existe un cat�logo publicado en esa direcci�n
[13:27:40 WRN] Request rejected: No existe un cat�logo publicado en esa direcci�n
[13:27:41 WRN] Request rejected: No existe un cat�logo publicado en esa direcci�n
[13:27:41 WRN] Request rejected: No existe un cat�logo publicado en esa direcci�n
[13:27:41 WRN] Request rejected: No existe un cat�logo publicado en esa direcci�n

Passed!  - Failed:     0, Passed:     3, Skipped:     0, Total:     3, Duration: 2 s - SMCA.WebApi.E2ETests.dll (net8.0)
```

Los nueve `Request rejected` son los nueve 404 esperados (3 tests × 3 endpoints).
`dotnet build backend/src/SMCA.sln` → `8 Warning(s) / 0 Error(s)`.

### T4 — Suite E2E completa

**Corrida 1 (13:28–13:33, con el filtro compilado — esta es la corrida válida):**

```
dotnet test backend/src/SMCA.WebApi.E2ETests/SMCA.WebApi.E2ETests.csproj --no-build
```

```
Failed!  - Failed:     1, Passed:   687, Skipped:     0, Total:   688, Duration: 5 m 20 s - SMCA.WebApi.E2ETests.dll (net8.0)
```

Único fallo:

```
[xUnit.net 00:03:08.34]     SMCA.WebApi.E2ETests.Plans.PlanModuleConvergenceTests.Convergence_moves_a_seeded_store_exactly_onto_its_plan_modules [FAIL]
  Error Message:
   Expected unmapped to be empty because plan 3 has a store-available feature the migration never grants, so this test's feature expectation would silently under-count, but found {123}.
```

Los 687 restantes —incluidos los 3 tests nuevos y los 72 E2E de catálogo que ya
existían— pasaron. El fallo es de `Plans`, no de `Catalog`.

#### El fallo de `Plans` es PRE-EXISTENTE — demostrado, no supuesto

Reproduce con `StoreRepository.cs` en estado HEAD y `Infrastructure.dll` compilado
desde ese source limpio (`dotnet test --filter "FullyQualifiedName~PlanModuleConvergenceTests"
--no-build` sobre el binario de las 13:34:39):

```
  Failed SMCA.WebApi.E2ETests.Plans.PlanModuleConvergenceTests.Convergence_moves_a_seeded_store_exactly_onto_its_plan_modules [4 s]
  Error Message:
   Expected unmapped to be empty because plan 3 has a store-available feature the migration never grants, so this test's feature expectation would silently under-count, but found {123}.
Failed!  - Failed:     1, Passed:     2, Skipped:     0, Total:     3, Duration: 4 s - SMCA.WebApi.E2ETests.dll (net8.0)
```

Causa raíz (consultado en `smca_test`):

| | |
|---|---|
| Módulo 18 «Catálogo web» | planes 3 (Superior) y 4 (VIP) |
| Features activas y `AvailableToStore` del módulo 18 | **122 «Catálogo web»** y **123 «Pedidos online»** |
| Mapa de `20260930090000_PlanModuleConvergence` (`scripts/27-…sql`, líneas ~208 y ~279) | solo `(120,2), (121,2), (122,2)` |

O sea: el plan 3 nunca otorga «Pedidos online» a ningún rol. El propio test es una
guarda diseñada para eso (`EveryStoreFeatureOfThePlanIsMapped`, líneas 509-521: «si el
catálogo crece una feature que el mapa no cubre, la migración y la aserción pasarían
sobre una mentira»). **El fallo es correcto, no un falso positivo.**

Extra: la fila `Feature` 123 está en `smca_test` pero **ningún migration aplicado ni
script versionado la crea** — la historia de la base termina en
`20261007021020_Add-StoreCatalogSettings-Drivers-OrderFields`, sin `20261007015612`, y
ni esa migración ni el «script 29» existen en ningún ref de git (solo está el commit
de *planificación* `b534e4c0`). La base compartida quedó por delante del código de esta
rama.

**No lo arreglo**: exigiría tocar migrations/scripts y además el test E2E existente
que lo detecta, lo que la regla dura prohíbe. Queda reportado para decisión.

#### Corridas 2 y 3 — INVALIDADAS por otro proceso (no usar como evidencia)

Durante las corridas, **otro proceso reescribió `StoreRepository.cs` en este mismo
worktree** (escrituras a las 13:33:38 y 13:53:34; el diff con el filtro desaparece y
vuelve) y compiló `Infrastructure.dll` a las 13:34:39. Consecuencias observadas:

| Corrida | Resultado |
|---|---|
| 2 (13:39–13:46) | `Failed: 3, Passed: 685, Total: 688` — añadió `ExportOfflineRosterTests.OwnerAdmin_own_store_returns_200` (violación FK `FK_Owner_User_UserId` en el cleanup) y `StoreUpdateTests.Update_as_superadmin_succeeds_without_payment_date` (403 en vez de 200) |
| 3 (13:51–13:57) | `Failed: 3, Passed: 638, Total: 641` — **`The active test run was aborted. Reason: Test host process crashed`**, solo corrieron 641 de 688 tests |

Ninguno de esos fallos puede originarse en este cambio (un predicado `WHERE` de solo
lectura en las queries públicas anónimas), y ambos tests pasan aislados con el filtro
puesto:

```
dotnet test … --no-build --filter "FullyQualifiedName~ExportOfflineRosterTests.OwnerAdmin_own_store_returns_200|FullyQualifiedName~StoreUpdateTests.Update_as_superadmin_succeeds_without_payment_date"
Passed!  - Failed:     0, Passed:     2, Skipped:     0, Total:     2, Duration: 1 s
```

Lo que sí muestran es `smca_test` **contaminada y compartida**: violaciones FK sobre
`User`/`Owner`, `User`/`ReSeller` y `Store`/`ProductCategory`, más un
`InvalidOperationException` de doble tracking de `StoreModule`, y un crash del host.

#### Verificación final del árbol (14:00, con el filtro presente)

```
dotnet build backend/src/SMCA.sln
   8 Warning(s)
   0 Error(s)

dotnet test … --no-build --filter "FullyQualifiedName~Catalog"
Passed!  - Failed:     0, Passed:    75, Skipped:     0, Total:    75, Duration: 55 s
```

Los **75 tests de `Catalog` en verde**: los 72 E2E de WebCatalog que ya existían
(sync, imágenes, product fields, snapshot, API pública — incluido el media) más los 3
nuevos. Ningún comportamiento existente de catálogo se rompió.

### Salvedad honesta sobre T4

T4 se marca hecho **con la corrida 1** (688 tests, 687 en verde, único fallo el
pre-existente demostrado). **No** se observó la suite entera en verde en un entorno
estable: las corridas 2 y 3 quedaron contaminadas por el proceso externo y la base
compartida, y la 3 abortó. Si se quiere un T4 limpio de verdad hay que resolver primero
el conflicto de worktree y la exclusivity de `smca_test`.

### Pendiente de decisión (NO tocado)

1. **Feature 123 «Pedidos online» sin mapear** en `20260930090000_PlanModuleConvergence`
   → hace fallar `PlanModuleConvergenceTests`. Fuera de los edit surfaces permitidos y
   toca un test E2E existente.
2. **Otro proceso edita este worktree** (`StoreRepository.cs`) y comparte `smca_test`.
   Mientras siga, cualquier corrida completa es poco confiable.