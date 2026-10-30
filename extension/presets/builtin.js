// Presets shipped with the extension. Read-only: the options page can duplicate them
// into user presets for editing. Format: AGENTS/SPEC.md → "Preset format".
var PageClip = globalThis.PageClip || {};
globalThis.PageClip = PageClip;

PageClip.BUILTIN = [
  {
    id: "smclinic-visit",
    name: "Информация о приёме",
    match: ["https://app.smclinic.ru/*"],
    blocks: [
      { selector: ".admission__headline h2" },
      {
        selector: ".admission-info-wrapper",
        anchorText: "Дата приёма",
        climbUntil: { containsText: ["Пациент"], notContainsText: ["Записать себя"] },
      },
      {
        selector: ".doctor-info-wrapper:has(.personal-info)",
        anchorText: "Рекомендации врача",
        climbUntil: { containsText: ["Стаж"], notContainsText: ["Записать себя"] },
      },
    ],
    hide: [
      { text: ["Повторить запись", "Поделиться", "К списку приёмов"] },
      { selector: ".sm-crumbs, .transfer, .doctor-recommendation__details, .go-back" },
    ],
    title: "Приём {date} {specialty}",
    fields: {
      date: { afterLabel: "Дата приёма", format: "date", askYear: true },
      specialty: { selector: ".doctor-info .doctors-specialization" },
    },
  },
];
