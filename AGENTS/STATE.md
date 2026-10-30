# State

Current snapshot. Overwrite this file each iteration. Aim for ≤50 lines: keep pointers and
the live picture here; push detail into `AGENTS/SPEC.md` (the contract) and `AGENTS/HISTORY.md`
(the log).

## Goal

MV3 extension that saves selected page blocks to PDF (print dialog) or Markdown, with per-site
presets (first: SM-Clinic "Информация о приёме"). Design: `docs/adr/Page Blocks to PDF — design.md`.

## Now

- v0.1.0 implemented: popup, preset engine, picker, PDF, Markdown, options, SM-Clinic preset.
- `test/harness.html` 70/70. Print layout, Markdown and picker checked on a local copy of the real
  SM-Clinic page (`test/smclinic.local.html`, gitignored), with print.css applied on screen.

- User checked it on the live SM-Clinic page: works. File name now `Приём <date> <specialty>`.

## Next

- Reliable visit year for SM-Clinic (weekday guess picked 2024 for a 2019 visit).

## Open questions

- Where to get the visit year: the page has none; candidates are the visit API response
  (DevTools → Network) or asking the user when the year is ambiguous. Waiting for the user.

## Deferred

- Lint: Node.js is not installed on the dev host, so no `node --check` / ESLint; syntax is
  checked by loading the files in a browser (harness + `new Function` over each file).
- Later (from design): more presets, per-preset print options, keyboard shortcut, jsPDF direct-file mode.
