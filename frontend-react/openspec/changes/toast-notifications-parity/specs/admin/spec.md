# Delta Spec: Admin (Features Page notifications)

**Change:** toast-notifications-parity
**Phase:** Spec
**Status:** Draft
**Date:** 2026-07-23
**Mode:** OpenSpec

---

Narrow supersession of `openspec/specs/admin/spec.md`'s `### Features Page (PAGE)` section
(PAGE-5, PAGE-6 only — PAGE-1/2/3/4/7/8 are unchanged and copied verbatim per the
copy-full-block-then-edit rule so the archive step doesn't lose them). This also supersedes the
archived `frontend-parity-audit` note ("inline, not toastr") for these two requirements only —
that archive record is cited as historical context and is NOT edited. No other admin
requirement, and no other spec's "no toast" convention (e.g. `admin/spec.md:218,226`,
`management/spec.md:352`), is in scope.

## MODIFIED Requirements

### Requirement: Features Page (PAGE)

**PAGE-1** — The container MUST live at `app/admin/features/routes/features.tsx`, export
`FeaturesPage` as a named export, and also export it as `default`.

**PAGE-2** — The page MUST render a title using the i18n key `FEATURES.TITLE`.

**PAGE-3** — The page MUST render a single button with label `FEATURES.ACTIVATE_FEATURES`.

**PAGE-4** — Clicking the button MUST call `featureHttpService.activateFeatures()`.

**PAGE-5** — When the response has `succeeded === true`, the page MUST fire a success toast
(`showToastSuccess`) with message `FEATURES.FEATURES_ACTIVATED` and title
`GENERAL.RESPONSE.SUCCESS_TITLE` ("Éxito"). No inline message is rendered.
(Previously: "the page MUST display an inline success message... No toast is used.")

**PAGE-6** — When the response has `succeeded === false` OR the HTTP call throws, the page MUST
fire an error toast (`showToastError`) with message `FEATURES.UNEXPECTED_ERROR` and title
`GENERAL.RESPONSE.ERROR_TITLE` ("Error"). No inline message is rendered.
(Previously: "the page MUST display an inline error message... No toast is used.")

**PAGE-7** — No loading state or button-disabled state is implemented (Angular has none).

**PAGE-8** — The page MUST NOT contain offline checks, form fields, or additional actions beyond
the single activate button.

#### Scenario: S-PAGE-5-TOAST — Success shows as a toast, not inline

- GIVEN a SuperAdmin clicks "Activar funcionalidades" and `activateFeatures()` resolves
  `succeeded: true`
- WHEN the response resolves
- THEN a success toast fires with message `FEATURES.FEATURES_ACTIVATED` and title
  `GENERAL.RESPONSE.SUCCESS_TITLE` ("Éxito")
- AND no inline success message renders in the page DOM

#### Scenario: S-PAGE-6-TOAST — Error shows as a toast, not inline

- GIVEN a SuperAdmin clicks "Activar funcionalidades" and `activateFeatures()` resolves
  `succeeded: false`, OR the call throws
- WHEN the failure occurs
- THEN an error toast fires with message `FEATURES.UNEXPECTED_ERROR` and title
  `GENERAL.RESPONSE.ERROR_TITLE` ("Error")
- AND no inline error message renders in the page DOM

#### Scenario: S-PAGE-1..4,7,8 — Unchanged requirements still hold

- GIVEN the `FeaturesPage` container, its title, its single activate button, and its click
  handler
- THEN they behave exactly as before this change (route/export shape, `FEATURES.TITLE` title,
  `FEATURES.ACTIVATE_FEATURES` button, `activateFeatures()` call, no loading state, no extra
  fields/actions)
