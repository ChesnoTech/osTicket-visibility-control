# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.4.0] - 2026-05-06

### Added
- **Per-row selection shortcuts** in the matrix actions column. Each row now
  has three new icon buttons placed before the existing remove (`X`) and
  `Save` controls:
  - `&#10003;` **Allow all** — restrict + allow every column for this row
    (excludes the row's own department in transfer-by-department mode)
  - `&#8856;` **Block all** — restrict + deny every column (deny-all sentinel)
  - `&#8646;` **Invert selection** — flip the current allow list
- **Bulk apply bar** above the matrix when scope is *By Agent*. Two buttons
  apply *Allow all* / *Block all* to every row matching the current search
  + department filter. A confirmation dialog appears for >5 rows. Rows are
  marked dirty; the existing *Save All* button persists everything.
- New i18n strings: `checkAll`, `clearAll`, `invertSelection`,
  `applyToVisible`, `bulkCheckAll`, `bulkClearAll`, `confirmBulk`.

## [1.3.0] - 2026-05-05

### Added
- **"Open Admin Panel" launcher button** on the plugin config page
  (`Admin Panel → Manage → Plugins → Visibility Control`). Replaces the
  previously-hidden need to type the admin URL by hand. A secondary
  "Check for Updates" button deep-links to the matrix Updates tab.
- **Granular update-check error messages** — distinguishes:
  - `HTTP 404` → "GitHub repo not found"
  - `HTTP 403` → "Rate limit reached"
  - Other HTTP codes → exact code echoed
  - Network errors → cURL message surfaced
  - Empty release list → treated as up-to-date instead of error
- `file_get_contents` fallback in `curlGetEx` when the cURL extension is
  not loaded.

## [1.2.1] - 2026-05-05

### Fixed
- **Matrix scroll position no longer resets** when toggling a checkbox,
  removing a restriction, or saving a row. Previously, every in-matrix
  mutation triggered a full re-render that scrolled the wrap back to
  `(0, 0)`, forcing the admin to scroll all the way right again to
  uncheck the next column. A new `renderKeepScroll()` helper captures
  `scrollLeft` / `scrollTop` before the rebuild and restores them on the
  new wrapper.

## [1.2.0] - 2026-05-05

### Added
- **Department filter** for the agent list in the admin matrix. When the
  scope is *By Agent*, a dropdown next to the search box filters rows to a
  single department; combine with the search box for fast lookup. Useful
  when the staff list is long.
- **Result counter** badge (`visible / total`) next to the filter shows how
  many agents match the current search + department combo.
- New i18n strings: `allDepartments`, `filterByDepartment`.

### Changed
- Search input handler now also updates the result counter and avoids
  losing focus during incremental typing (replaces only the matrix wrapper,
  keeps the search bar and dropdown intact).
- Switching the scope toggle (*By Agent* / *By Department*) now resets the
  department filter as well as the search term.

## [1.1.0] - 2026-05-05

### Fixed
- **Deny-all rules now apply correctly.** Previously, unchecking every status
  (or every department) for an agent/department deleted all rule rows, which
  was treated as "unrestricted." Now uses a `target_id = 0` sentinel row to
  represent "restricted with zero allowed targets," so the agent really is
  blocked from all statuses/transfers.
- Save payload now includes an explicit `restricted` flag so the backend can
  distinguish *Remove Restriction* (no rule) from *deny-all* (empty allow list).
- `getRules` and `getAgentRules` skip the sentinel when building the allow list
  but still flag `hasStatusRestriction` / `hasTransferRestriction` as `true`.

### Changed
- **Matrix navigation for long status/department lists.**
  - Matrix now scrolls inside its own container (`max-height: calc(100vh - 280px)`)
    instead of pushing the page wider, so the sticky thead actually engages.
  - Sticky right-side `Save` column added so the action button stays visible
    when scrolled horizontally.
  - Box-shadow indicators on sticky columns hint at off-screen content.
  - Column header labels clamp to 2 lines + word-break for long status names.

## [1.0.0] - 2026-04-08

### Added
- Per-agent status visibility rules (whitelist approach)
- Per-agent transfer department rules
- Per-department status visibility rules
- Per-department transfer department rules
- Agent-level rules override department-level rules (precedence logic)
- Admin matrix UI with tabs (Status Rules / Transfer Rules) and scope toggle (By Agent / By Department)
- Client-side DOM filtering via MutationObserver for AJAX-loaded dialogs
- Server-side pre-validation endpoints (`/validate/status`, `/validate/transfer`)
- Standalone admin page with full matrix grid editor
- Search/filter bar for agent names in admin UI
- Per-row and global Save All with dirty tracking
- Remove Restriction button to return to unrestricted state
- Toast notifications for save feedback
- Dark mode support via `prefers-color-scheme`
- Responsive design for mobile screens
- ETag-based static asset caching
- PJAX navigation support
- GitHub Releases auto-updater with minor/major detection
- File and database backup before updates
- Auto-rollback on failed updates

[1.4.0]: https://github.com/ChesnoTech/osTicket-visibility-control/releases/tag/v1.4.0
[1.3.0]: https://github.com/ChesnoTech/osTicket-visibility-control/releases/tag/v1.3.0
[1.2.1]: https://github.com/ChesnoTech/osTicket-visibility-control/releases/tag/v1.2.1
[1.2.0]: https://github.com/ChesnoTech/osTicket-visibility-control/releases/tag/v1.2.0
[1.1.0]: https://github.com/ChesnoTech/osTicket-visibility-control/releases/tag/v1.1.0
[1.0.0]: https://github.com/ChesnoTech/osTicket-visibility-control/releases/tag/v1.0.0
