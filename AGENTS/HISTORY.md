# History

Newest first. Each entry ≤5 lines using the format defined in `AGENTS.md`.

---

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
