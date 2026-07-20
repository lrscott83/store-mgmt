# Product Modal Form Specification

## Purpose

Define the field contract, prop signatures, and default-value wiring for the
product create/edit modals so they mirror the single Angular source
(`EditProductModalComponent`). Replaces invented fields (barcode, category
dropdown, in-modal delete) with the real Angular fields (Orden, Activo, `$`
price prefix) and pins create/edit to the click-context category.

## Requirements

### Requirement: Create-product modal field set and order

CreateProductModal MUST render, top to bottom: Nombre (required text),
Precio (required numeric, `$` prefix), Orden (required numeric, prefilled
from `defaultOrder` prop), Activo (checkbox, default checked), Disponible
para Vender (checkbox, default checked), Descuenta del Inventario (checkbox,
default checked). The modal title MUST use i18n key `PRODUCT.NEW_PRODUCT`.
Footer MUST render a Cerrar action with a close icon and a Salvar action
with a save icon.

#### Scenario: Modal renders default field state on open

- GIVEN CreateProductModal is opened with `defaultOrder={5}`
- WHEN the modal renders
- THEN the Orden field value is `5`
- AND Activo, Disponible para Vender, and Descuenta del Inventario are all checked
- AND the title reads the text mapped to `PRODUCT.NEW_PRODUCT`

#### Scenario: Save emits full create payload

- GIVEN CreateProductModal is opened with `category={{ id: 'cat-1', ... }}` and `defaultOrder={3}`
- WHEN the user fills Nombre and Precio and submits Salvar
- THEN `onSave` is called with a payload whose `categoryId` is `'cat-1'`, `order` is `3`, `isActive` is `true`, `availableToSale` is `true`, `discountFromInvantory` is `true`, and `barcode` is `undefined`

### Requirement: Edit-product modal field set and order

EditProductModal MUST render the same field set and order as
CreateProductModal, with values sourced from the `product` prop: Orden
initialized to `product.order`, Activo to `product.isActive`, Disponible
para Vender to `product.availableToSale`, Descuenta del Inventario to
`product.discountFromInvantory`. `categoryId` stays pinned to
`product.categoryId` and is not user-editable. The modal title MUST use
i18n key `PRODUCT.EDIT_PRODUCT`. Footer MUST render Cerrar (close icon) and
Actualizar (save icon). The modal MUST NOT render a delete-confirmation
block.

#### Scenario: Modal renders values from the product prop

- GIVEN EditProductModal is opened with a `product` whose `order` is `7` and `isActive` is `false`
- WHEN the modal renders
- THEN the Orden field value is `7`
- AND the Activo checkbox is unchecked
- AND the title reads the text mapped to `PRODUCT.EDIT_PRODUCT`

#### Scenario: Save emits update payload with pinned categoryId

- GIVEN EditProductModal is opened with `product.categoryId === 'cat-9'`
- WHEN the user edits Nombre and submits Actualizar
- THEN `onSave` is called with a payload whose `categoryId` is `'cat-9'`

### Requirement: Barcode input and category dropdown are absent

Neither CreateProductModal nor EditProductModal MUST render a barcode input
field or a category selection dropdown. Both modals MUST NOT accept a
`categories` array prop.

#### Scenario: No barcode field in create modal

- GIVEN CreateProductModal is rendered
- WHEN querying the form for a barcode input
- THEN no element for barcode is found

#### Scenario: No category dropdown in edit modal

- GIVEN EditProductModal is rendered
- WHEN querying the form for a category select/dropdown
- THEN no element for category selection is found

### Requirement: In-modal delete is removed from EditProductModal

EditProductModal MUST NOT accept an `onDelete` prop and MUST NOT render a
`delete-product-button` or `confirm-delete-button` element or any
delete-confirmation footer state. Product deletion remains available only
at the product list row level.

#### Scenario: No delete controls in edit modal

- GIVEN EditProductModal is rendered without an `onDelete` prop
- WHEN querying the modal for `delete-product-button` or `confirm-delete-button`
- THEN neither element is found

### Requirement: CreateProductModal prop signature

CreateProductModal MUST accept a single `category: ProductCategory` prop
(not `categories: ProductCategory[]`) plus a `defaultOrder: number` prop.
The component MUST use `category.id` as the payload `categoryId` and MUST
NOT expose UI to change it.

#### Scenario: Category prop drives payload without a picker

- GIVEN CreateProductModal receives `category={{ id: 'cat-2' }}`
- WHEN the user submits the form without any category-selection interaction
- THEN the emitted payload `categoryId` is `'cat-2'`

### Requirement: EditProductModal prop signature

EditProductModal MUST NOT accept `categories` or `onDelete` props.

#### Scenario: Component renders without the removed props

- GIVEN EditProductModal is rendered with only `product`, `onSave`, and `onClose`
- WHEN the component mounts
- THEN it renders without runtime errors and without delete or category-picker UI

### Requirement: products.tsx wiring for order and category

products.tsx MUST resolve `defaultOrder` by awaiting
`productService.getMaxOrder(category.id)` and adding `1` before opening
CreateProductModal, and MUST pass the single click-context `category` object
as the `category` prop. products.tsx MUST NOT pass `onDelete` to
EditProductModal.

#### Scenario: Opening create modal precomputes defaultOrder

- GIVEN a category with existing products whose max order is `4`
- WHEN the user triggers "new product" for that category
- THEN CreateProductModal opens with `defaultOrder={5}` and `category` set to the clicked category

#### Scenario: Edit modal usage omits onDelete

- GIVEN products.tsx renders EditProductModal for a selected product
- WHEN inspecting the props passed to EditProductModal
- THEN no `onDelete` prop is present and no `categories` prop is present

### Requirement: i18n copy for titles and inventory-discount label

The create modal title MUST resolve `PRODUCT.NEW_PRODUCT` and the edit modal
title MUST resolve `PRODUCT.EDIT_PRODUCT`. The "Descuenta del Inventario"
checkbox label MUST render the exact copy "Descuenta del Inventario" (not
"Descontar del inventario").

#### Scenario: Inventory-discount label matches Angular copy

- GIVEN either modal is rendered
- WHEN reading the label text of the inventory-discount checkbox
- THEN the text is exactly "Descuenta del Inventario"

### Requirement: No service or domain signature changes

Product create/edit modal changes MUST NOT alter
`productService.createProduct` (9-arg) or `productService.updateProduct`
(10-arg) signatures, and MUST NOT introduce new service/repository calls
from within the modal components.

#### Scenario: Existing service signatures remain callable unchanged

- GIVEN the modal changes are applied
- WHEN `createProduct` and `updateProduct` are invoked from products.tsx as before
- THEN both calls type-check against their existing 9-arg and 10-arg signatures

### Requirement: Price field enforces a non-negative minimum

Both modals' Precio field MUST reject negative values, mirroring Angular's
`Validators.compose([Validators.required, Validators.min(0)])` and the
`min="0"` HTML attribute. When Precio is present but negative, `validate()`
MUST block submission and display the `GENERAL.VALIDATION.NUMBER_GREADER_THAN_ZERO`
message interpolated with `GENERAL.PRICE`.

#### Scenario: Negative price blocks submit with a message

- GIVEN either modal has a valid Nombre and Precio set to `-5`
- WHEN the user submits the form
- THEN `onSave` is NOT called
- AND the text "Precio mínimo valor es 0" is displayed

### Requirement: Order field enforces a non-negative integer pattern with no visible error

Both modals' Orden field MUST reject values that are not a non-negative
integer, mirroring Angular's `Validators.pattern(/^[0-9]\d*$/)`
(`RegExExtensions.numeric`). Unlike the required-empty case, a pattern
mismatch (decimal, negative, or non-numeric) MUST block submission WITHOUT
rendering any visible error message, mirroring Angular's HTML which has no
mat-error block for the pattern failure (only for `required`).

#### Scenario: Decimal or negative order blocks submit silently

- GIVEN either modal has Orden set to `3.5` or `-1`
- WHEN the user submits the form
- THEN `onSave` is NOT called
- AND no "Orden es requerido" (or other) message is displayed

#### Scenario: Valid non-negative integer order still submits

- GIVEN either modal has Orden set to a valid non-negative integer (e.g. `9`)
- WHEN the user submits the form
- THEN `onSave` is called with `order` set to that value

### Requirement: Update always sends barcode as undefined

`handleEditProduct` in products.tsx MUST pass `undefined` as the `barcode`
positional argument to `productService.updateProduct(...)`, regardless of
whether the edited product has a stored `barcode` value. This mirrors
Angular's `edit-product-modal.component.ts`, where the barcode FormControl
is permanently commented out, so `barcodeValue` is always `undefined` on
both create and update.

#### Scenario: Editing a product with a stored barcode still sends undefined

- GIVEN a product with a non-empty `barcode` value is being edited
- WHEN the edit form is submitted
- THEN `productService.updateProduct` is called with `undefined` in the
  barcode positional argument
