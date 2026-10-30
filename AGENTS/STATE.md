# State

Current snapshot. Overwrite this file each iteration. Aim for ≤50 lines: keep pointers and
the live picture here; push detail into `AGENTS/SPEC.md` (the contract) and `AGENTS/HISTORY.md`
(the log).

## Goal

MV3 extension that saves selected page blocks to PDF (print dialog) or Markdown, with per-site
presets (first: SM-Clinic "Информация о приёме"). Design: `docs/adr/Page Blocks to PDF — design.md`.

## Now

- v0.1 checked by the user on the live SM-Clinic page: works. File name `Приём <date> <specialty>`.
- Visit year: from `visit.dateTime` of the visit JSON the page loaded (`/api/visits/<uuid>`);
  fallback: on-page year dialog, answer remembered per visit. `test/harness.html` 85/85; the real
  Performance API + fetch path checked against a local mock endpoint.

## Next

- User check on the live SM-Clinic page: the 2019-04-01 visit must get 2019 without a question.

## Open questions

- Auth of the SM-Clinic API is unknown (cookies or bearer token). The extension tries cookies,
  then JWT-looking tokens from the page storage; if both fail, the dialog appears.

## Deferred

- Lint: Node.js is not installed on the dev host, so no `node --check` / ESLint; syntax is
  checked by loading the files in a browser (harness + `new Function` over each file).
- Later (from design): more presets, per-preset print options, keyboard shortcut, jsPDF direct-file mode.
