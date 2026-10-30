# page-clip — functional & technical specification

Source of truth for *what the product does* and *how it is built*. Keep it in sync with
reality (update before code when the contract changes). Design rationale:
`docs/adr/Page Blocks to PDF — design.md`.

## Purpose

A Yandex Browser extension that exports selected blocks of any web page to PDF or Markdown,
with per-site presets. First preset: SM-Clinic "Информация о приёме" (app.smclinic.ru), whose
own export loses date, clinic, patient and doctor.

## Stack

- Unpacked Chrome Manifest V3 extension, plain JavaScript, no build step, no dependencies.
- PDF via the browser print dialog (`window.print()` + `@media print` CSS).
- Markdown via an in-page DOM → Markdown converter, saved as a file through a `blob:` link.
- Storage: one `chrome.storage.sync` item per user preset (`preset:<id>`), fallback to
  `chrome.storage.local` when sync refuses the write (quota).
- UI strings: `chrome.i18n`, `_locales/ru` is the default locale.
- Target: Yandex Browser (Chromium); works in Chrome as well.

## Architecture

```
toolbar button → popup.html/js ── matches presets to tab URL
                     │  chrome.scripting.insertCSS(print.css) + executeScript(lib/common.js, content.js)
                     │  (activeTab, on click only), then calls window.__pageClip.*
                     ▼
               content.js + print.css (in the page, extension isolated world)
                 ├─ preset engine: locate blocks, hide rules, title fields
                 ├─ picker: hover/click selection, floating toolbar in a shadow root
                 ├─ pdf: data-pb-* marks → window.print() → cleanup on afterprint
                 └─ md: data-pb-* marks → DOM → Markdown → download → cleanup
options.html/js ── list / rename / edit JSON / delete / export / import presets
lib/common.js ── storage, URL match patterns, preset validation, i18n helper (shared)
presets/builtin.js ── read-only built-in presets
```

## Functional requirements

1. ✅ Popup lists presets whose `match` patterns fit the current tab with "PDF" and "Markdown" buttons, plus "Выбрать блоки вручную" and a link to settings.
2. ✅ Running a preset finds its blocks, applies `hide` rules, builds the title, then opens the print dialog (PDF) or downloads `<title>.md` (Markdown). Zero blocks found → error in the popup.
3. ✅ Manual picker: hover highlight, click toggles selection (several blocks; selecting an ancestor or descendant of a selected block replaces it), `Alt+↑/↓` or `Alt`+wheel moves to parent/child, Enter toggles. Floating toolbar: "PDF (N)", "Markdown (N)", "Сохранить как преднастройку…", "Отмена" (Esc).
4. ✅ Save picked blocks as a preset: name + URL pattern (prefilled with `<origin>/*`), CSS selectors.
5. ✅ PDF output contains only kept blocks, in document order, with site styles; the page view is unchanged after the dialog closes.
6. ✅ Output file name comes from the preset `title` template; unresolved placeholders are dropped; if every placeholder is unresolved or there is no template, the page title is used.
7. ✅ Options page: built-in presets (read-only, can be duplicated) and user presets; rename, edit as JSON, delete, export/import JSON (import merges by `id`).
8. ✅ Built-in preset `smclinic-visit`: page heading, visit card (date, clinic, address, patient, status), doctor card (doctor, specialty, services, recommendations); hides "Повторить запись", "Поделиться", "К списку приёмов", breadcrumbs; title `Приём {date} {specialty}` → `Приём 2026-10-12 Дерматовенеролог` (no doctor name).
9. ✅ Visit year: the SM-Clinic visit page shows no year. When several years fit the weekday, a dialog on the page offers them (newest first, up to 4), a custom year, "Без года" (`MM-DD`) or "Отмена" (Esc; nothing is saved). The answer is remembered in `chrome.storage.local` (`year:<host>:<date text>`) and not asked again.

## Preset format

```json
{
  "id": "smclinic-visit",
  "name": "Информация о приёме",
  "match": ["https://app.smclinic.ru/*"],
  "blocks": [
    { "selector": ".admission-info-wrapper",
      "anchorText": "Дата приёма", "climbUntil": { "containsText": ["Пациент"] } }
  ],
  "hide": [ { "text": ["Поделиться"] }, { "selector": ".sm-crumbs" } ],
  "title": "Приём {date} {specialty} {doctor}",
  "fields": {
    "date": { "afterLabel": "Дата приёма", "format": "date", "askYear": true },
    "doctor": { "selector": ".doctor-info h2", "format": "initials" }
  }
}
```

- Block locator: `selector` (CSS, first match) is tried first; if absent or unmatched, `anchorText` + optional `climbUntil` (smallest element whose whole text equals `anchorText`, then ancestors until all conditions hold: `containsText[]`, `hasSelector`; `notContainsText[]` aborts the climb).
- Text comparison ignores case, collapses whitespace and treats `ё` as `е`.
- Blocks are deduplicated, nested blocks are dropped in favour of the outer one, order follows the document.
- `hide`: `{ "selector": "…" }` or `{ "text": [...] }` (exact text; the closest button/link is hidden).
- Fields: `selector` (text of first match) or `afterLabel` (text of the first non-empty element after the label). `format`: `date` → `YYYY-MM-DD` (Russian dates; a missing year: candidates are years since 2000, not in the future, whose weekday matches; with `"askYear": true` and several candidates the user is asked, otherwise the newest is used), `initials` → `Фамилия И.О.`.
- Picker-generated selectors prefer a stable `id`, then `data-*` / ARIA / `role` / `name` attributes, then stable class names, then `:nth-of-type`; hash-like ids, classes and values are skipped.

## Print technique

1. Selected blocks get `data-pb-keep`, their ancestors `data-pb-path`, `hide` matches `data-pb-hide`, `<html>` gets `data-pb-active`.
2. `print.css` (`@media print` only, every rule gated by `html[data-pb-active]`, so a normal Ctrl+P is untouched): everything in `body` that is not keep / path / inside keep is `display:none`; path ancestors become plain `display:block` boxes without padding, margins, borders, backgrounds, shadows, positioning or transforms.
3. Kept blocks get `position: relative` (absolutely positioned badges stay inside), `break-inside: avoid`; inside them `max-height:none; overflow:visible`, `print-color-adjust: exact`; `@page { margin: 12mm }`.
4. Non-code text with `white-space: pre*` gets `data-pb-preline` (printed as `pre-line`); its text nodes lose trailing whitespace and runs of blank lines (user-entered notes on SM-Clinic carry dozens of tabs). Original text is restored on cleanup.
5. Set `document.title`, `window.print()`, on `afterprint` restore title and text, strip all `data-pb-*`.

## Markdown conversion

- Block-level vs inline is decided by computed `display`; hidden elements (`display:none`, `visibility:hidden`, `aria-hidden`, `data-pb-hide`) and controls (`button`, inputs, `svg`, media, iframes) are skipped.
- Supported: headings (shifted so the highest becomes `##`; the document title is `#`), paragraphs, `br`, lists (nested), links (absolute URLs), images, bold/italic, inline code, `pre`, tables (GFM), blockquotes, `hr`, text from `::before/::after` `content`.
- Text in `white-space: pre*` elements keeps its line breaks (Markdown hard breaks).
- Footer: source link and save date.

## Project structure

```
extension/              unpacked extension root (load this folder)
  manifest.json         MV3 manifest: activeTab, scripting, storage; popup; options page
  _locales/ru/          UI strings
  lib/common.js         storage, match patterns, validation, i18n helper
  presets/builtin.js    built-in presets
  popup.html/css/js     preset list for the current tab, injection
  content.js            preset engine, picker, PDF and Markdown export
  print.css             @media print rules only
  options.html/css/js   preset management, JSON export/import
  icons/                toolbar icons
test/
  harness.html          browser test page: anonymized SM-Clinic fixture + assertions
tools/serve.ps1         localhost static server (for the Claude preview pane, which can't load file://)
docs/adr/               design decisions
AGENTS/                 agent docs (spec, state, history, memory, env)
```

## Deployment

- No store publication. Install as unpacked extension: `browser://extensions` → "Режим разработчика" → "Загрузить распакованное расширение" → `extension/`.

## Current state

- ✅ Requirements 1–8 implemented. `test/harness.html`: 80/80. Print layout (print.css applied on screen), Markdown and picker checked on a local copy of the real SM-Clinic page.
- ⏳ Check as an installed extension in Yandex Browser: live SM-Clinic page, an arbitrary site, options export/import.

See `AGENTS/STATE.md` for the live Now / Next snapshot.

## Data sources & dependencies

- None at runtime. SM-Clinic preset depends on the DOM of app.smclinic.ru (requires login; may change without notice).
