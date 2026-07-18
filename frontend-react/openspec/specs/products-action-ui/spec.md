# products-action-ui Specification

**Change:** action-icons-labels-parity
**Phase:** Spec
**Status:** Done
**Date:** 2026-07-18
**Mode:** Hybrid (engram + openspec file)

---

## Purpose

Pure UI-parity spec (icons + labels) for the Products area action UI (category gear menu,
per-product gear menu, product modals). No new capability; existing behavior of save/close/delete
actions is unchanged — only rendered icon and label text match Angular (source of truth). Design
phase was skipped for this change (mechanical parity, no architectural decisions).

---

## Requirements

### Requirement: Category gear menu icons and order

The category actions menu (`category-actions-menu.tsx`) MUST render one icon per menu item,
matching Angular, and MUST order items Categoría, Productos (bulk), Producto (single).

#### Scenario: Menu items render Angular icons in Angular order

- GIVEN the category gear menu is open
- WHEN the menu items are inspected in DOM order
- THEN the first item is "Editar Categoría" with an edit icon rendered inside it
- AND the second item is "Nuevo Productos" (bulk) with a plus icon rendered inside it
- AND the third item is "Nuevo Producto" (single) with a plus icon rendered inside it

### Requirement: Per-product gear menu icons

The per-product row menu (`ProductRow` in `category-product-list.tsx`) MUST render an edit icon on
"Editar Producto" and a delete icon on "Eliminar Producto", each with distinct visual treatment
matching Angular.

#### Scenario: Edit item shows primary-colored edit icon

- GIVEN a product row's gear menu is open
- WHEN the "Editar Producto" item is inspected
- THEN it renders an edit icon
- AND the icon/item uses the primary color styling

#### Scenario: Delete item shows danger-colored delete icon

- GIVEN a product row's gear menu is open
- WHEN the "Eliminar Producto" item is inspected
- THEN it renders a trash/delete icon
- AND the icon/item uses the existing danger (red) color styling

### Requirement: Product-area modal footer labels and icons

Each in-scope product-area modal (`edit-product-category-modal.tsx`, `create-product-modal.tsx`,
`edit-product-modal.tsx`, `edit-products-modal.tsx` footer only) MUST show a close button labeled
"Cerrar" (`GENERAL.CLOSE`) with a close icon, and a confirm button with a save icon. The confirm
label MUST be "Actualizar" (`GENERAL.UPDATE`) in edit-mode and "Salvar" (`GENERAL.SAVE`) in
create-mode; modals that only support one mode MUST show the single label matching that mode.

#### Scenario: Close button uses GENERAL.CLOSE and a close icon

- GIVEN any of the four in-scope modals is open
- WHEN the footer dismiss button is queried by accessible name "Cerrar"
- THEN it is found (not "Cancelar")
- AND it renders a close (X) icon

#### Scenario: edit-product-category-modal confirm label switches by mode

- GIVEN `edit-product-category-modal.tsx` is open in edit mode
- WHEN the confirm button is queried
- THEN its accessible name is "Actualizar" and it renders a save icon
- GIVEN the same modal is open in create mode
- WHEN the confirm button is queried
- THEN its accessible name is "Salvar" and it renders a save icon

#### Scenario: Single-mode modals show the mode-appropriate confirm label

- GIVEN `create-product-modal.tsx` is open
- WHEN the confirm button is queried
- THEN its accessible name is "Salvar" and it renders a save icon
- GIVEN `edit-product-modal.tsx` is open
- WHEN the confirm button is queried
- THEN its accessible name is "Actualizar" and it renders a save icon
- GIVEN `edit-products-modal.tsx` footer is open
- WHEN the footer confirm button is queried
- THEN it renders a save icon alongside its existing label

### Requirement: GENERAL.SAVE i18n value parity

The `GENERAL.SAVE` i18n key in `shared/lib/i18n/es.ts` MUST resolve to "Salvar" (Angular value),
replacing the previous "Guardar". This applies globally to every consumer of the key, including
expenses and orders modals, not only the products area.

#### Scenario: GENERAL.SAVE resolves to Salvar everywhere

- GIVEN any component that renders the `GENERAL.SAVE` i18n key
- WHEN the rendered text is queried
- THEN it reads "Salvar"
- AND this holds for products-area, expenses, and orders modals alike

---

## Out of Scope (explicitly deferred — not specified)

- The orphan delete-confirm footer block in `edit-product-modal.tsx` (no Angular equivalent) —
  separate follow-up, untouched by this change.
- The body of `edit-products-modal.tsx` (React bulk price-edit vs Angular bulk-add) — different
  feature, footer-only change specified above.

---

## Traceability

- Proposal: `sdd/action-icons-labels-parity/proposal` (Engram #1244)
- Spec (delta, source of this document): `sdd/action-icons-labels-parity/spec` (Engram #1246)
- Tasks: `sdd/action-icons-labels-parity/tasks` (Engram #1247)
- Apply Progress: `sdd/action-icons-labels-parity/apply-progress` (Engram #1248)
- Verify Report: `sdd/action-icons-labels-parity/verify-report` (Engram #1249) — Verdict: PASS
- Implementation commit: `3e22f16` (main)
