# Web catalog → POS import

Branch `feat/web-catalog-to-pos-import`. Delivery: single PR, work-unit commits. Runner: `pnpm test` / `pnpm typecheck` (frontend-react), `dotnet test` (backend).

## Specs

S1 — One direction only: the server web catalog into the POS local catalog. The existing POS → web catalog sync is explicitly out of scope and must not change: "Eso es un sentido que ya esta hecho y no hay que tocar ni cambiar nada y se mantiene absolutamente como esta. Estamos hablando del otro sentido cuando es Catalogo Web para el POS."

S2 — Product identity is the `id` only: "solo por id". "verificar por el ID y si no esta entonces se inserta." If the `id` already exists in the POS, nothing is touched: no price, no name, no category, no anything.

S3 — Category identity is the `id` too: "Para la categoria revisa si tambien es por id y entonces si no esta se inserta."

S4 — Copied fields, exactly: "solo se debe actualizar estoso datos categoria, producto, precio de venta y moneda de venta." Description, images, catalog discounts, `IsNew` and availability are NOT copied.

S5 — Order must reach the POS: "El orden hay que traerlo para el POS asi que haces esos cambios." Both the product `order` and the category `order` are copied. The product order already travels in the read response; the category order does not and must be exposed.

S6 — The action lives in the POS catalog view: "En la vista del catalogo del POS adicionar algun boton para eso?"

S7 — The POS → web catalog sync already sends and persists both orders (`CatalogMirrorWriter.cs:87,96,125,140`). Nothing is missing on the write side; the gap is read-side only.

Assumption (flagged, not confirmed by the user): fields not listed in S4 (availability, `IsActive`, `DiscountFromInventory`, `BusinessId`, barcode) take the local service defaults on insert. Nothing is invented from the server.

S8 — Failure policy (user, 2026-10-23): "avisa que no se pudo insertar la categoria y sus productos asociados". The local repository guards (uniqueness by category + name) are never bypassed. If a category cannot be inserted, none of its products are imported and the failure is reported. If a product cannot be inserted, it is skipped and reported. The user is told exactly what was not imported.

## Tasks

| ID | Scope | S# | Route | Status |
|----|-------|----|-------|--------|
| T1 | Backend: expose `CategoryOrder` in `CatalogProductViewDto` + populate it in `GetCatalogProductsQuery`; new unit test. | S5 | delegated writer (backend) | done — `5ec02112` |
| T2 | Frontend: `categoryOrder` on the client `CatalogProductView` type; pure importer (match by `id`, insert missing products and categories only); POS catalog view button + confirm + toast + i18n; unit tests. | S2–S6 | delegated writer (frontend) | done — `d5349b8b` |
| T3 | Verification: backend tests, frontend typecheck/lint/tests, risk assessment, RDD review. | all | inline | done — verifier + correction `760a9299` |

## Log

L1 (user, verbatim): "Como poder sincronizar los productos del catalogo del POS si lo tengo en el catalogo web. Lo que pasa es que en un dispositivo adicione los productos al catalogo del POS y los sincronice para el catalogo web pero ahora en otra dispositivo quiero poder sincronizarlos para el catalogo del POS. En la vista del catalogo del POS adicionar algun boton para eso?"

L2 (user, verbatim): "solo por id, que fue lo ultimo que te dije."

L3 (user, verbatim): "En el catalogo web no esta order del categoria y producto?"

L4 (user, verbatim): "SI eso no se sincroniza lo anotas en un plan para hacerlo despues. El orden hay que traerlo para el POS asi que haces esos cambios."

L5: Verified `CatalogMirrorWriter` already writes both orders, so no plan item is needed for the sync direction. The only gap is that `CatalogProductViewDto` omits the category order (`CatalogProductViewDto.cs:10-11`) although `ProductCategory.Order` exists (`ProductCategory.cs:11`) and the query already includes `Category`.

L6: Authorized by the user to implement with ODD + RDD.

L7: Rejected by the user and removed from scope: the category + product name fallback for identity. Identity is `id` alone.

L8 (T1, done, commit `5ec02112`): `CategoryOrder` added to `CatalogProductViewDto` and populated; 4 new unit cases pass; `dotnet build` succeeds. RDD assess over `dev..HEAD`: `risk: medium`, `review_due: false`, `review_due_reason: under_budget`.

L9 (explorer findings, blocking for T2): the local repositories enforce uniqueness the user did NOT ask for, which collides with the "id only" rule:- `product-repository.ts:225-228` rejects a product whose (category, name) already exists even when the `id` is new.
- `product-category-repository.ts:119-120` rejects a category whose name already exists even when the `id` is new.
- Inserting with the server `order` shifts every sibling with `order >= order` by +1 (`product-repository.ts:323-332`, `product-category-repository.ts:174-177`), so an insert renumbers existing rows.
Also: the client `CatalogProductView` type lacks `categoryOrder`; currency arrives as an enum NAME string and must be parsed with `parseCurrencyByName` (`csv-product-parser.ts:189`).

L10 (user, verbatim): "avisa que no se pudo insertar la categoria y sus productos asociados" → recorded as S8. Category rejection blocks its products and is reported; the repository guard is never bypassed.

L11 (T2, done, commit `d5349b8b`): importer, button, i18n and 13 new tests. Focused run 13/13, full app suite 411 files / 5792 tests green, typecheck clean. RDD assess over `dev..HEAD`: `medium`, `review_due: false` (`under_budget`).

L12 (independent verification): S1, S3, S4, S5, S6, S7, S8 PASS. S2 FAILED as written — inserting with the server order renumbers existing rows in the same category, contradicting the confirm dialog's claim that existing products are not modified.

L13 (user, verbatim): "se inserta con los datos que trae el servidor y punto, para que complicas las cosas? que sentido tiene eso? los datos del servidor se insertar local y punta". Decision: the server `order` is inserted as-is and the sibling renumbering is accepted. The importer's behavior stands; only the false promise in the dialog copy is corrected.

L14 (correction batch, commit `760a9299`): confirm copy reworded to state the renumbering; button gated on the same session signal the Catálogo Web view uses (`isOwnerAdmin(user) && isModuleAvailable(user, EModules.WebCatalog)`); new `catalog-import.regressions.test.ts` pins id-only identity (existing id with a different name is skipped), the reported name collision, the category rejection, and the non-copied fields; DOM test pins the fetch failure. Recheck limited to the blockers: 21/21 focused tests, typecheck clean. Residual risk recorded: the client gate mirrors OwnerAdmin + module 18, while the API also requires feature `WebCatalogAdmin`; no client-side source exposes that feature alone, so no client check was invented.



