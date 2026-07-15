# CSV Product Import — Parsing Specification (New Capability)

## Purpose

Bring `sales/lib/csv-product-parser.ts`'s `parseCsvProducts` to behavioral parity with Angular's
`CsvProductService.parseCsv` (`_services/csv/csv-product.service.ts`, Papa.parse-backed), whose
live consumer is `csv-product-importer-modal.component.ts:45`. React currently degrades to
naive `split(',')` (breaks on quoted commas) and treats `category` as optional (Angular's
`validateProducts` requires it, dropping rows that lack it).

## Requirements

### Requirement: Quoted Fields With Embedded Commas Parse Correctly

`parseCsvProducts` MUST correctly split rows where a field value is wrapped in double quotes and
contains a comma, mirroring Papa.parse's default quoted-field handling (`csv-product.service.ts:12-16`,
`header: true`). A naive `split(',')` MUST NOT be used for row tokenization.

**Rules**: 3 (behavioral signature parity — same field boundaries as Papa.parse would produce),
9 (exact contract — no row corruption), 10 (call-site parity — importer modal still receives correct
rows), 12 (mirror behavior only; no re-introduction of a service class — function-shape is the
established React idiom).

#### Scenario: Quoted comma does not split the field
- GIVEN a CSV row `"Widget, Large",9.99,tools`
- WHEN `parseCsvProducts` parses the row
- THEN the `name` field is `Widget, Large` (comma preserved, quotes stripped)
- AND `price` is `9.99` and `category` is `tools`

### Requirement: Category Is Required

A row missing a non-empty `category` value MUST be excluded from `products` and reported as an
error, mirroring Angular's `validateProducts` filter (`item['category'] && item['name'] && typeof item['price'] === 'number'`, `csv-product.service.ts:26-34`).

**Rules**: 9 (exact validation contract — category is required, not optional), 10 (call-site parity
— importer modal's error list reflects the same rejected rows Angular would reject), 12 (mirror
Angular's required-field set exactly; do not invent additional required/optional fields).

#### Scenario: Missing category is rejected
- GIVEN a CSV row with `name` and `price` present but `category` empty or absent
- WHEN `parseCsvProducts` parses the row
- THEN the row is excluded from `products`
- AND an error entry is pushed with a `MISSING_CATEGORY` code for that row number

#### Scenario: Row with all 3 required fields is accepted
- GIVEN a CSV row with non-empty `name`, `category`, and a valid numeric `price`
- WHEN `parseCsvProducts` parses the row
- THEN the row is pushed to `products` with all 3 fields populated

### Requirement: Price Is Coerced To A Number, Non-Numeric Rejected

`price` MUST be validated as numeric after coercion, mirroring Angular's `dynamicTyping: true` +
`typeof item['price'] === 'number'` check — a non-numeric price value MUST be rejected, not
silently coerced to `NaN` and passed through.

**Rules**: 3 (same coercion behavior as Papa.parse's `dynamicTyping`), 9 (reject, don't corrupt).

#### Scenario: Non-numeric price is rejected
- GIVEN a CSV row with `price` value `"abc"`
- WHEN `parseCsvProducts` parses the row
- THEN the row is excluded from `products` with an `INVALID_PRICE` error for that row number

## Non-Requirements

- MUST NOT reintroduce a `CsvProductService` class or an Observable-returning API — the established
  React idiom for this module is a plain parsing function (`ParsedProductRow`/`CsvParseResult`
  types stay as-is); only the tokenization/validation logic changes.
