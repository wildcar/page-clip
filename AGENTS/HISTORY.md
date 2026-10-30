# History

Newest first. Each entry ≤5 lines using the format defined in `AGENTS.md`.

---

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
