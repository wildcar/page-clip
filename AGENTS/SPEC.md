# page-clip — functional & technical specification

Source of truth for *what the product does* and *how it is built*. Keep it in sync with
reality (update before code when the contract changes). Design rationale:
`docs/adr/Page Blocks to PDF — design.md`.

## Purpose

A Yandex Browser extension that exports selected blocks of any web page to PDF, with
per-site presets. First preset: SM-Clinic "Информация о приёме" (app.smclinic.ru), whose own
export loses date, clinic, patient and doctor.

## Stack

- Unpacked Chrome Manifest V3 extension, plain JavaScript, no build step, no dependencies.
- PDF via the browser print dialog (`window.print()` + `@media print` CSS).
- Storage: `chrome.storage.sync` for user presets, fallback to `chrome.storage.local` on quota errors.
- Target: Yandex Browser (Chromium); works in Chrome as well.

## Architecture

```
toolbar button → popup.html/js ── matches presets to tab URL
                     │  chrome.scripting.executeScript / insertCSS (activeTab, on click only)
                     ▼
               content.js + print.css (in the page)
                 ├─ preset engine: locate blocks, hide rules, title fields
                 ├─ picker: hover/click selection, floating toolbar
                 └─ print: data-pb-* marks → window.print() → cleanup on afterprint
options.html/js ── list / rename / delete / export / import presets (storage)
presets/builtin.js ── read-only built-in presets
```

## Functional requirements

1. ⏳ Popup lists presets whose `match` patterns fit the current tab, plus "Выбрать блоки вручную".
2. ⏳ Running a preset finds its blocks, applies `hide` rules, sets the title, opens the print dialog.
3. ⏳ Manual picker: hover highlight, click toggles selection (multiple blocks), `Alt+↑/↓` or wheel moves parent/child, floating toolbar "Печать (N)" / "Сохранить как преднастройку…" / "Отмена" (Esc).
4. ⏳ Save picked blocks as a preset: name + URL pattern (prefilled with the host), CSS selectors.
5. ⏳ Print output contains only kept blocks, in document order, with site styles; page view is unchanged after the dialog closes.
6. ⏳ Default PDF file name comes from the preset `title` template; unresolved placeholders are dropped; fallback is the page title.
7. ⏳ Options page: built-in presets (read-only, can be duplicated) and user presets; rename, delete, export/import JSON.
8. ⏳ Built-in preset `smclinic-visit`: two cards (visit info; doctor + services + recommendations), hide action buttons, breadcrumbs, right sidebar; title `Приём {date} {specialty} {doctor}`.

## Preset format

```json
{
  "id": "smclinic-visit",
  "name": "Информация о приёме",
  "match": ["https://app.smclinic.ru/*"],
  "blocks": [
    { "anchorText": "Информация о приёме",
      "climbUntil": { "containsText": ["Дата приёма"], "notContainsText": ["Записать себя"] } },
    { "selector": "main .card" }
  ],
  "hide": [ { "text": ["Поделиться"] }, { "selector": "nav" } ],
  "title": "Приём {date} {specialty} {doctor}",
  "fields": {
    "date": { "afterLabel": "Дата приёма" },
    "doctor": { "selector": "…" }
  }
}
```

- Block locator: `selector` (CSS) or `anchorText` + `climbUntil` (smallest element with that exact text, then ancestors until conditions hold).
- Picker-generated selectors prefer `id`, `data-*`, ARIA attributes, then `tag:nth-of-type`; hash-like class names are skipped.

## Print technique

1. Selected blocks get `data-pb-keep`, their ancestors `data-pb-path`; `hide` matches get `data-pb-hide`.
2. `print.css` (`@media print` only): everything in `body` that is not keep / path / inside keep is `display:none`; path ancestors lose padding, margins, backgrounds, shadows, positioning and transforms.
3. Inside kept blocks: `max-height:none; overflow:visible`, `break-inside: avoid`, `print-color-adjust: exact`; `@page { margin: 12mm }`.
4. Set `document.title`, `window.print()`, on `afterprint` restore title and strip all `data-pb-*`.

## Project structure

```
extension/            unpacked extension root (load this folder)
  manifest.json       MV3 manifest: activeTab, scripting, storage; popup; options page
  popup.html/js       preset list for the current tab, injection
  content.js          preset engine, picker, print orchestration
  print.css           @media print rules only
  options.html/js     preset management, JSON export/import
  presets/builtin.js  built-in presets
docs/adr/             design decisions
AGENTS/               agent docs (spec, state, history, memory, env)
```

## Deployment

- No store publication. Install as unpacked extension: `browser://extensions` → "Режим разработчика" → "Загрузить распакованное расширение" → `extension/`.

## Current state

- ✅ Repository initialized, design recorded.
- ⏳ Extension implementation (all requirements above).

See `AGENTS/STATE.md` for the live Now / Next snapshot.

## Data sources & dependencies

- None at runtime. SM-Clinic preset depends on the DOM of app.smclinic.ru (requires login; may change without notice).
