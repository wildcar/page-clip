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

## Next

- User check in Yandex Browser as an installed extension: live SM-Clinic page (PDF file name,
  real print preview), picker on an arbitrary site (Wikipedia), save preset → reload → run,
  options export/import.

## Open questions

- Real print preview not seen yet (only screen emulation of print.css). Page breaks inside
  long recommendation blocks may need tuning.

## Deferred

- Lint: Node.js is not installed on the dev host, so no `node --check` / ESLint; syntax is
  checked by loading the files in a browser (harness + `new Function` over each file).
- Later (from design): more presets, per-preset print options, keyboard shortcut, jsPDF direct-file mode.
