# State

Current snapshot. Overwrite this file each iteration. Aim for ≤50 lines: keep pointers and
the live picture here; push detail into `AGENTS/SPEC.md` (the contract) and `AGENTS/HISTORY.md`
(the log).

## Goal

MV3 extension that saves selected page blocks to PDF (print dialog) or Markdown, with per-site
presets (first: SM-Clinic "Информация о приёме"). Design: `docs/adr/Page Blocks to PDF — design.md`.

## Now

- v0.1 checked by the user on the live SM-Clinic page: works.
- File name `Приём <date> <specialty>`; visit year asked in an on-page dialog when the weekday
  fits several years, answer remembered per visit. `test/harness.html` 80/80.

## Next

- User check of the year dialog in Yandex Browser.
- Optional: take the year automatically from the visit list (`/history`), see Open questions.

## Open questions

- Automatic year: the list page shows the year on each card (`.medical-info-card .date__year`),
  but the visit page does not, and the list is gone after the SPA navigates. Capturing it needs a
  content script on app.smclinic.ru (optional host permission + background worker), which
  deviates from "inject on click only". Waiting for the user's decision.

## Deferred

- Lint: Node.js is not installed on the dev host, so no `node --check` / ESLint; syntax is
  checked by loading the files in a browser (harness + `new Function` over each file).
- Later (from design): more presets, per-preset print options, keyboard shortcut, jsPDF direct-file mode.
