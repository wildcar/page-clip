# State

Current snapshot. Overwrite this file each iteration. Aim for ≤50 lines: keep pointers and
the live picture here; push detail into `AGENTS/SPEC.md` (the contract) and `AGENTS/HISTORY.md`
(the log).

## Goal

MV3 extension that prints selected page blocks to PDF, with per-site presets
(first: SM-Clinic "Информация о приёме"). Design: `docs/adr/Page Blocks to PDF — design.md`.

## Now

- Repository initialized: docs filled from the design, no extension code yet.

## Next

- Scaffold `extension/`: manifest, popup, content.js (preset engine + print), print.css.
- Built-in SM-Clinic preset; then manual picker; then options page.

## Open questions

- SM-Clinic DOM is unknown without login: the preset locators need tuning against a real page (outerHTML from DevTools).

## Deferred

- Build / lint / tests: no toolchain yet. Node.js is not installed on the dev host, so `node --check` is unavailable; decide on syntax check / ESLint when code appears.
- Later (from design): more presets, per-preset print options, keyboard shortcut, jsPDF direct-file mode.
