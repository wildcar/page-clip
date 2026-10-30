# Page Blocks to PDF — design

Oct 30, 2026 · @Sergey

## Context

A Yandex Browser extension that exports selected blocks of any web page to PDF, with per-site presets. First preset: SM-Clinic "Информация о приёме" (app.smclinic.ru). The site's own export gives only the recommendations text, without date, clinic, patient and doctor. More site presets will be added later.

Decisions already made:

- Unpacked Chrome MV3 extension (Yandex Browser supports them).
- PDF via the browser print dialog ("Сохранить как PDF"): text stays selectable, no third-party libraries.

## Goal

One click on the toolbar: pick a preset for the current site (or select blocks manually), the print preview shows only the chosen blocks, save as PDF with a meaningful default file name.

## User flow

1. Click the extension button, a popup opens.
2. The popup lists presets whose URL pattern matches the current tab (on app.smclinic.ru: "Информация о приёме"), plus "Выбрать блоки вручную".
3. Preset: blocks are found automatically, then the print dialog opens.
4. Manual: picker mode on the page. Hover highlights an element, click toggles selection (several blocks allowed), `Alt+↑/↓` or the wheel moves to parent/child. Floating toolbar: "Печать (N)", "Сохранить как преднастройку…", "Отмена" (Esc).
5. "Сохранить как преднастройку" asks for a name and a URL pattern (prefilled with the host) and stores the selectors.

## Components (MV3)

- `manifest.json`: permissions `activeTab`, `scripting`, `storage`; `action.default_popup`; `options_page`. No permanent host permissions, code is injected on click only.
- `popup.html/js`: matches presets to the tab URL, injects `content.js` + `print.css`, sends `{cmd: "runPreset", preset}` or `{cmd: "pick"}`.
- `content.js`: preset engine, picker, print orchestration.
- `print.css`: `@media print` rules only, never affects the normal view.
- `options.html/js`: list built-in and user presets, rename/delete, export/import JSON.
- `presets/builtin.js`: presets shipped with the extension (read-only, the user can duplicate them).
- Storage: user presets in `chrome.storage.sync`, fallback to `local` if the sync quota is exceeded.

## Preset format

```json
{
  "id": "smclinic-visit",
  "name": "Информация о приёме",
  "match": ["https://app.smclinic.ru/*"],
  "blocks": [
    { "anchorText": "Информация о приёме",
      "climbUntil": { "containsText": ["Дата приёма", "Рекомендации врача"],
                      "notContainsText": ["Записать себя"] } }
  ],
  "hide": [
    { "text": ["Повторить запись", "Поделиться", "К списку приёмов"] },
    { "selector": "nav, [class*=breadcrumb]" }
  ],
  "title": "Приём {date} {specialty} {doctor}",
  "fields": {
    "date": { "afterLabel": "Дата приёма" },
    "specialty": { "aboveText": "…" },
    "doctor": { "selector": "…" }
  }
}
```

- Block locators (any of): `selector` (CSS), or `anchorText` + `climbUntil` (find the smallest element with that exact text, walk up ancestors until the conditions hold). Text-based locators survive hashed/generated class names, which SPA sites like SM-Clinic use.
- Picker-made presets store CSS selectors from a generator that prefers `id`, `data-*`, ARIA attributes, then `tag:nth-of-type` paths, and skips class names that look generated (hash-like).
- `title` placeholders come from `fields`; unresolved placeholders are dropped; fallback is the page title. The default PDF file name is `document.title` at print time.

## Printing technique (keeps site styles)

1. Mark each selected block with `data-pb-keep`, each of its ancestors with `data-pb-path`.
2. `print.css`: inside `body`, any element that is neither keep, path, nor inside keep gets `display:none`. Ancestors on the path lose padding, margins, backgrounds and shadows; `position:static`, `transform:none`.
3. Inside kept blocks: `max-height:none; overflow:visible` (long lists are not clipped), `break-inside: avoid` per block, `print-color-adjust: exact`, `@page { margin: 12mm }`.
4. Elements matched by `hide` rules get `data-pb-hide` and are hidden.
5. Set `document.title` from the template, call `window.print()`, on `afterprint` restore the title and remove all `data-pb-*` attributes.

Block order in the PDF follows document order, so several blocks from different parts of the page work.

## Built-in preset #1: SM-Clinic

- Page: app.smclinic.ru → История посещений → Информация о приёме.
- Blocks: the card with date, clinic, address, metro, patient; the card with doctor, specialty, services, recommendations.
- Hidden: "Повторить запись", "Поделиться", "К списку приёмов", breadcrumbs, right sidebar.
- Title style: `Приём 2024-04-01 Терапевт Демидова Н.А.`
- Risk: the DOM isn't visible without login. If the locator misses on first run, copy the block's outerHTML in DevTools and tune `climbUntil` / `hide`.

## Install / usage (README)

`browser://extensions` → "Режим разработчика" → "Загрузить распакованное расширение" → pick the folder.

## Verification

- `node --check` for JS syntax; optional ESLint.
- SM-Clinic page: preview shows exactly the two cards, all recommendation lines, no sidebar or buttons; default file name is correct; text is selectable in the PDF; the page view is unchanged after closing the dialog.
- Picker on an arbitrary site (e.g. a Wikipedia article): select two non-adjacent blocks, print, save as preset, reload, run the preset: same result.
- Options: export presets to JSON, delete, import back.

## Later

- More built-in presets.
- Per-preset print options (orientation, scale, margins).
- Keyboard shortcut (`commands`).
- Optional direct-file mode via jsPDF if the print dialog becomes a nuisance.
