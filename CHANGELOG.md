# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[1.2.0]: https://github.com/ChesnoTech/osTicket-visibility-control/releases/tag/v1.2.0
[1.1.0]: https://github.com/ChesnoTech/osTicket-visibility-control/releases/tag/v1.1.0
[1.0.0]: https://github.com/ChesnoTech/osTicket-visibility-control/releases/tag/v1.0.0
