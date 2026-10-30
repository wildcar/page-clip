# State

Current snapshot. Overwrite this file each iteration. Aim for ≤50 lines: keep pointers and
the live picture here; push detail into `AGENTS/SPEC.md` (the contract) and `AGENTS/HISTORY.md`
(the log).

## Goal

MV3 extension that saves selected page blocks to PDF (print dialog) or Markdown, with per-site
presets (first: SM-Clinic "Информация о приёме"). Design: `docs/adr/Page Blocks to PDF — design.md`.

## Now

- v0.1 checked by the user on the live SM-Clinic page: works, year 2019 taken from the API. File name `Приём <date> <specialty>`; the found year is also inserted into the date text of the saved document.
- Visit year: from `visit.dateTime` of the visit JSON the page loaded (`/api/visits/<uuid>`);
  fallback: on-page year dialog, answer remembered per visit. `test/harness.html` 91/91; the real
  Performance API + fetch path checked against a local mock endpoint.

## Next

- User check: PDF and Markdown show "01 апреля 2019, 18:14"; page text unchanged after printing.

## Open questions

- SM-Clinic API auth works with what the extension sends (user check 2026-10-30). The extension tries cookies,
  then JWT-looking tokens from the page storage; if both fail, the dialog appears.

## Deferred

- Lint: Node.js is not installed on the dev host, so no `node --check` / ESLint; syntax is
  checked by loading the files in a browser (harness + `new Function` over each file).
- Later (from design): more presets, per-preset print options, keyboard shortcut, jsPDF direct-file mode.
