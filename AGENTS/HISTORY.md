# History

Newest first. Each entry ≤5 lines using the format defined in `AGENTS.md`.

---

## 2026-10-31 · Study year and result from the API; print page breaks
- What: study preset takes the year (`analysisDateTime`) and result text (`result`) from `/api/diagnostics/<uuid>`, PDF capture is the fallback (`attachments[].api`); print keeps only blocks under 500 px whole, headings `break-after: avoid`
- Why: user found the study JSON; tall blocks jumped to the next page leaving headings behind
- Files: extension/content.js, extension/print.css, extension/presets/builtin.js, test/harness.html, AGENTS/SPEC.md
- Next: user check of the printed study page

## 2026-10-31 · Study page preset with the results PDF text
- What: preset `smclinic-study`; preset key `attachments`: click the site's file control, catch the PDF in the page world (`pagehook.js`), extract text (`lib/pdftext.js`, no deps), insert it into the export
- Why: user request: results are only a PDF download with plain text
- Files: extension/pagehook.js, extension/lib/pdftext.js, extension/content.js, extension/popup.js, extension/presets/builtin.js, extension/lib/common.js, extension/_locales/ru/messages.json, test/harness.html, AGENTS/SPEC.md
- Next: user check on the live page; study year source

## 2026-10-30 · Visit year shown in the saved date
- What: date field option `insertYear`; a year from the API or the user is inserted after the month in the page text during export, restored afterwards
- Why: user request: "Понедельник, 01 апреля 2019, 18:14" in the PDF
- Files: extension/content.js, extension/presets/builtin.js, test/harness.html, AGENTS/SPEC.md
- Next: user check of PDF and Markdown

## 2026-10-30 · Visit year from the site API
- What: preset field `api` (regex over loaded resource URLs + JSON path); SM-Clinic date takes the year from `visit.dateTime`, checked against page day/month/time
- Why: the page has no year; the user found `/api/visits/<uuid>` in DevTools
- Files: extension/content.js, extension/presets/builtin.js, test/harness.html, AGENTS/SPEC.md
- Next: user check on the live page (auth: cookies or bearer unknown)

## 2026-10-30 · Ask the visit year instead of guessing
- What: on-page year dialog for dates without a year (candidates by weekday, custom, none, cancel), answer remembered per visit; buildTitle is async
- Why: weekday guess gave 2024 for a 2019 visit; the visit page has no year anywhere
- Files: extension/content.js, extension/presets/builtin.js, extension/_locales/ru/messages.json, test/harness.html, AGENTS/SPEC.md
- Next: decide on automatic year capture from the visit list page

## 2026-10-30 · SM-Clinic file name without doctor
- What: preset title `Приём {date} {specialty}` (doctor name dropped)
- Why: user feedback after the live check
- Files: extension/presets/builtin.js, test/harness.html, AGENTS/SPEC.md, README.md
- Next: reliable visit year (weekday guess is ambiguous)

## 2026-10-30 · Extension v0.1.0: presets, picker, PDF and Markdown
- What: MV3 extension (popup, content.js engine + picker, print.css, options, i18n), SM-Clinic preset, Markdown export, browser test harness
- Why: task in `docs/adr/Page Blocks to PDF — design.md`; Markdown export added on user request
- Files: extension/*, test/harness.html, tools/serve.ps1, AGENTS/SPEC.md, README.md
- Next: user check in Yandex Browser on the live SM-Clinic page
- Fixes-on-the-fly: badge escaping its card (keep → position:relative); tab-padded doctor notes printed with huge gaps (pre-line + blank-line collapse)

## 2026-10-30 · Repository initialized
- What: git repo, .gitignore, README, SPEC/STATE/ENV filled from the design doc
- Why: start of the project; task in `docs/adr/Page Blocks to PDF — design.md`
- Files: AGENTS.md, AGENTS/*.md, README.md, .gitignore, .gitattributes
- Next: scaffold `extension/` (manifest, popup, content.js, print.css, SM-Clinic preset)
