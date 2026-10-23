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

## Tasks

| ID | Scope | S# | Route | Status |
|----|-------|----|-------|--------|
| T1 | Backend: expose `CategoryOrder` in `CatalogProductViewDto` + populate it in `GetCatalogProductsQuery`; new unit test. | S5 | delegated writer (backend) | pending |
| T2 | Frontend: `categoryOrder` on the client `CatalogProductView` type; pure importer (match by `id`, insert missing products and categories only); POS catalog view button + confirm + toast + i18n; unit tests. | S2–S6 | delegated writer (frontend) | pending |
| T3 | Verification: backend tests, frontend typecheck/lint/tests, risk assessment, RDD review. | all | inline | pending |

## Log

L1 (user, verbatim): "Como poder sincronizar los productos del catalogo del POS si lo tengo en el catalogo web. Lo que pasa es que en un dispositivo adicione los productos al catalogo del POS y los sincronice para el catalogo web pero ahora en otra dispositivo quiero poder sincronizarlos para el catalogo del POS. En la vista del catalogo del POS adicionar algun boton para eso?"

L2 (user, verbatim): "solo por id, que fue lo ultimo que te dije."

L3 (user, verbatim): "En el catalogo web no esta order del categoria y producto?"

L4 (user, verbatim): "SI eso no se sincroniza lo anotas en un plan para hacerlo despues. El orden hay que traerlo para el POS asi que haces esos cambios."

L5: Verified `CatalogMirrorWriter` already writes both orders, so no plan item is needed for the sync direction. The only gap is that `CatalogProductViewDto` omits the category order (`CatalogProductViewDto.cs:10-11`) although `ProductCategory.Order` exists (`ProductCategory.cs:11`) and the query already includes `Category`.

L6: Authorized by the user to implement with ODD + RDD.

L7: Rejected by the user and removed from scope: the category + product name fallback for identity. Identity is `id` alone.
