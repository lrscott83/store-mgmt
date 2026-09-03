# Sale View Barcode Scanner — Research & Implementation Plan

Date: 2026-09-03
Status: Proposed — not implemented. No code touched.

## Goal

Add a camera barcode scanner to the sale view (`/sales/sale`) so a
merchant can scan a product's barcode and add it directly to the
cart, preserving the exact same flow as a manual add (inventory
gate, `OrderType.Normal`, cart accumulation).

## Package research (requirement: simple, light, fast)

**Decision: `@zxing/browser` — it is ALREADY installed and sanctioned.**

| Option | Status | Weight | Verdict |
|---|---|---|---|
| `@zxing/browser` ^0.2.0 | Already in `apps/web-store-pos/package.json`; ZERO imports in app code today (grep-verified) | ~90 KB gzip (engine: `@zxing/library`), loaded as a lazy chunk only when the scanner opens | CHOSEN — zero new dependency weight, fastest to ship |
| `html5-qrcode` | Not installed; also allowed by AGENTS.md | ~180 KB (wraps the same ZXing engine) | Rejected — heavier, no capability gain |
| Native `BarcodeDetector` API | Browser built-in | 0 KB | Rejected for v1 — Chrome/Edge only; a POS cannot assume the browser matrix. Future optimization: use it when available, fall back to zxing |
| Commercial SDKs (Dynamlocal et al.) | — | — | Rejected — cost, weight, license |

Key point: the feature costs NO new dependency — only a lazy chunk
that mounts when the modal opens. AGENTS.md mandates scanner libs
load only on sale/scanner routes and heavy deps MUST be lazy-loaded;
the plan honors that with dynamic `import('@zxing/browser')`.

## Verified current state (facts, not assumptions)

- `@zxing/browser: ^0.2.0` in `package.json`; zero imports in app
  code — installed for this day, never wired.
- i18n keys already exist (`es.ts:558-560`):
  `SCANNER.CAMERA_PERMISSION_DENIED`, `SCANNER.PRODUCT_NOT_FOUND`,
  `SCANNER.SCANNING`.
- `getProductByBarcode(barcode)` exists on BOTH branches of the
  factory (`product-service.factory.ts`):
  - offline: `ProductOfflineService.getProductByBarcode` →
    `ProductRepository.getProductByBarcode` (find by
    `p.barcode === barcode`)
  - online: `ProductOnlineService.getProductByBarcode` →
    `GET byBarcode/{barcode}`
- Cart: `useCartStore.addItem(product, quantity, orderType, price)`
  sums quantity for an existing product (`cart-store.ts:55-72`) —
  repeated scans accumulate, POS semantics.
- The manual add flow to preserve: `sale.tsx` `handleAdded` +
  `checkAvailability` → `hasAvailableProductToSale` (cart quantity +
  inventory + module gate) → `addItem`. NOTE: both look the product
  up in `displayedProducts` — the scanner path receives its product
  from the barcode lookup instead, so the flow must be refactored to
  share a product-object entry point.
- Unit test `sale.test.tsx:132` PINS the absence of a scanner
  ("does NOT render a barcode-scanner entry point"; rationale:
  Angular had it commented out). It is a VITEST unit test — NOT an
  E2E test — so it can be updated when the rationale changes
  (React-only feature, same as the search box and the "Todos"
  pseudo-category Angular never had).
- CSP/deployment: `deploy/nginx.conf:63` serves
  `Content-Security-Policy-Report-Only` and there is NO
  Permissions-Policy header — getUserMedia is not blocked by
  deployment config. Camera requires a secure context (HTTPS or
  localhost); production serves HTTPS.
- ZXing API (docs verified via Context7):
  `new BrowserMultiFormatReader(hints, { delayBetweenScanSuccess: 500 })`,
  `reader.decodeFromVideoDevice(undefined, videoElem, cb)` returns
  controls with `.stop()`; `undefined` deviceId = default
  environment-facing camera.

## Design

### UX

- Scanner icon button next to the search box in `sale.tsx`
  (`data-testid="quick-sale-scanner"` — reclaim the testid the old
  test asserted against).
- Modal: live camera preview (`<video muted playsInline>`),
  "Escaneando..." status line, and a manual barcode input fallback
  (works without a camera; makes the flow testable without fake
  video devices; serves keyboard-wedge gun scanners for free).
- Continuous scan: the modal STAYS OPEN after each scan (POS cadence:
  scan-scan-scan, then close). Each decode adds +1 of the product.
- Close: X button, Escape, or a "done" button. Every close path
  stops the stream (`controls.stop()`) and unmounts the video.

### Add flow (same as the manual add)

```
decode(barcode) → debounce (delayBetweenScanSuccess: 500ms)
  → productService.getProductByBarcode(barcode)
  → not found → error UI (SCANNER.PRODUCT_NOT_FOUND)
  → found but not sellable (isActive/availableToSale) → distinct message
  → found + sellable → availability gate
    (SAME hasAvailableProductToSale: cart qty + inventory + module)
    → gate fails → blocking alert (same as manual add)
    → gate passes → addItem(product, 1, OrderType.Normal) → success feedback
```

Sellability gate detail: the repository barcode lookup does NOT
filter by `isActive`/`availableToSale` (unlike
`getProductsToSaleByCategoryId`, which guarantees both for the manual
flow) — the scanner must check them before adding. Non-sellable gets
a distinct message (new key), NOT PRODUCT_NOT_FOUND, so the merchant
knows the barcode works but the product can't be sold.

### Refactor to share the flow

Extract from `sale.tsx` a single
`addProductToSale(product: Product, quantity: number)`:
- availability gate via `hasAvailableProductToSale` (receives the
  product object instead of doing `displayedProducts.find`)
- `addItem` call
- `handleAdded` (row path) and the scanner path both call it.
No behavior change for the manual path — same functions, same order
of checks.

## Steps

1. `icons.tsx`: add `ScanBarcodeIcon` (additive; same pattern as the
   recently added HelpIcon).
2. `scanner-modal.tsx` (new, `sales/components/`): modal + video +
   manual input + status/error area. ALL zxing imports DYNAMIC inside
   the open effect (`import('@zxing/browser')`). Stream cleanup on
   unmount/close (`controls.stop()`).
3. `sale.tsx`: scanner icon button next to the search Switch; wire
   the modal; extract the shared `addProductToSale`.
4. `es.ts`: add keys — `SCANNER.TITLE`, `SCANNER.DONE`,
   `SCANNER.MANUAL_ENTRY`, `SCANNER.PRODUCT_ADDED`,
   `SCANNER.PRODUCT_NOT_SELLABLE` (the 3 existing keys are reused).
5. Unit tests:
   - UPDATE `sale.test.tsx:132` — the pinned absence becomes a pinned
     PRESENCE (icon renders, opens the modal). Unit test, not E2E.
   - NEW `scanner-modal.test.tsx`: renders; manual entry calls the
     callback; Escape/X stops and closes; permission denied shows
     `SCANNER.CAMERA_PERMISSION_DENIED`.
   - NEW cases in `sale.test.tsx`: scanned barcode not found → error
     message; sellable product → `addItem` called with qty 1 +
     `OrderType.Normal`; non-sellable → NOT_SELLABLE message;
     repeated same-barcode scans accumulate quantity.
6. E2E (add-only, new spec): scanner modal opens; MANUAL ENTRY of a
   seeded product's barcode adds it to the cart. Camera decoding
   itself is not E2E-testable without fake-device flags — out of
   scope for v1.

## Risks & edge cases

- Repeated decodes of the same barcode within a second: debounced by
  `delayBetweenScanSuccess` (500ms) plus a guard ignoring an
  identical consecutive barcode within a short window.
- Camera permission denied → `SCANNER.CAMERA_PERMISSION_DENIED` shown
  in the modal; manual entry still works.
- getUserMedia requires HTTPS/localhost — production is HTTPS; note
  for plain-HTTP LAN dev testing.
- iOS Safari: video needs `muted` + `playsInline` (the modal sets the
  attributes explicitly).
- Default camera may be front-facing on some phones: v1 uses the
  default device (`undefined` deviceId); v2 can add a device picker
  or `facingMode: 'environment'` via `decodeFromConstraints`.
- Hardware failure of the camera mid-session: zxing errors are
  non-fatal per decode attempt; stream errors close the modal
  gracefully with the permission message as a fallback.

## Impact

| Area | Impact |
|---|---|
| New dependency | NONE (`@zxing/browser` already in package.json) |
| Bundle | Lazy chunk only when the modal first opens; sale route initial load unchanged |
| Files | `icons.tsx` (+1 icon), `scanner-modal.tsx` (new), `sale.tsx` (button + shared-flow refactor), `es.ts` (+5 keys), tests |
| Manual sale flow | Refactored to share `addProductToSale` — behavior identical |
| Backend | ZERO changes (`byBarcode` endpoint + offline repository already exist) |
| Existing E2E | Untouched (new spec only) |
| CLAUDE.md | Compliant — no backend code, no existing E2E; one UNIT test updated with a changed rationale |
