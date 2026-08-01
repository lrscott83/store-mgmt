# Resources Localization Specification

**Domain**: `resources` — `I18n.resx` + `I18n.en.resx`
**Type**: Full spec
**Status**: Active (source of truth)
**Origin**: SDD change `delete-user-endpoint-fixes`
**Last Updated**: 2026-07-31

---

## Purpose

Localization resources consumed via `IStringLocalizer` across backend handlers and validators. First spec for this domain — created by the `delete-user-endpoint-fixes` change.

## Requirements

### Requirement: RS-1 — `CannotDeleteSelf` Key Added (D3)

BOTH resx MUST add `<data name="CannotDeleteSelf">` in the existing `<data name="..." xml:space="preserve">` format: `I18n.resx` value "No puedes eliminarte a ti mismo" as the FIRST data entry (before `ClientNotFound`, `I18n.resx:120`); `I18n.en.resx` value "You cannot delete yourself" between `BaseFee` (`:123`) and `CarrierAddressIsMain` (`:126`) — sorted (`Can` < `Car`).

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 1a | Spanish value | Localizer resolves `CannotDeleteSelf` (es) | Self-delete guard fires | "No puedes eliminarte a ti mismo" |
| 1b | English value | Localizer resolves `CannotDeleteSelf` (en) | Self-delete guard fires | "You cannot delete yourself" |
| 1c | Sort position | resx inspected | Keys enumerated | First entry before `ClientNotFound` / between `BaseFee` and `CarrierAddressIsMain` |

### Requirement: RS-2 — `UserNotFoud` Renamed to `UserNotFound` (D4)

BOTH resx MUST rename the key `UserNotFoud` (`I18n.resx:246`, `I18n.en.resx:504`) to `UserNotFound`. Values ("Usuario no encontrado" / "User not found") and position (between `UserNotCreated` and `UserNotRole` — sorts correctly) MUST NOT change. The rename localizes all 42 existing `_localizer["UserNotFound"]` references (~20 files) that currently fall back to the literal key.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 2a | Spanish renamed | `I18n.resx` inspected | Keys enumerated | `UserNotFound` present; `UserNotFoud` absent; value unchanged |
| 2b | English renamed | `I18n.en.resx` inspected | Keys enumerated | `UserNotFound` present; value unchanged |
| 2c | 42 refs localize | Any `_localizer["UserNotFound"]` usage | Localizer resolves | Localized string returned — no literal-key fallback |

### Requirement: RS-3 — No Source Reference to `UserNotFoud` Remains

The source tree MUST contain zero references to the typo key (grep `UserNotFoud` → no matches in `.cs`/`.resx`). `I18n.Designer.cs` MAY remain stale (compile-safe — nothing references the property); regeneration is out of scope.

| # | Scenario | GIVEN | WHEN | THEN |
|---|----------|-------|------|------|
| 3a | Typo gone | Source grep for `UserNotFoud` | Search runs | Zero matches |

## Verification Criteria

- [x] Both resx contain `CannotDeleteSelf` with exact values; insertion points per RS-1
- [x] `UserNotFound` renamed in both resx; values + position unchanged
- [x] Grep `UserNotFoud` → 0 matches in source (Designer.cs stale property expected/optional)
