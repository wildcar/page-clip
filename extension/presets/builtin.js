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
      date: {
        afterLabel: "Дата приёма",
        format: "date",
        // The page shows no year; the visit JSON the page loads has "visit.dateTime".
        api: { url: "/api/visits/[0-9a-f-]{36}(\\?|$)", path: "visit.dateTime" },
        askYear: true,
        // Show the found year in the saved document: "01 апреля 2019, 18:14".
        insertYear: true,
      },
      specialty: { selector: ".doctor-info .doctors-specialization" },
    },
  },
  {
    id: "smclinic-study",
    name: "Информация об исследовании",
    match: ["https://app.smclinic.ru/*"],
    blocks: [
      { selector: ".diagnostic__headline h2" },
      {
        selector: ".analysis-info",
        anchorText: "Дата проведения исследования",
        climbUntil: { containsText: ["Пациент"] },
      },
      {
        selector: ".analysis-examination",
        anchorText: "Назначенные обследования",
        climbUntil: { containsText: ["Результаты обследования"] },
      },
    ],
    // The file link is replaced by the text of the file (attachments).
    hide: [{ selector: ".sm-crumbs, .go-back, .result-wrapper" }],
    title: "Исследование {date} {exam}",
    fields: {
      date: {
        afterLabel: "Дата проведения исследования",
        format: "date",
        // The page shows no year; the study JSON the page loads has "diagnostic.analysisDateTime".
        api: { url: "/api/diagnostics/[0-9a-f-]{36}(\\?|$)", path: "diagnostic.analysisDateTime" },
        askYear: true,
        insertYear: true,
      },
      exam: { selector: ".analysis-examination__text" },
    },
    // "Посмотреть результаты обследования" downloads a text PDF. The same text, with its own line
    // breaks, is "diagnostic.result" in the study JSON; the PDF is the fallback.
    attachments: [
      {
        api: { url: "/api/diagnostics/[0-9a-f-]{36}(\\?|$)", path: "diagnostic.result" },
        clickText: "Посмотреть результаты обследования",
        container: ".result-wrapper",
      },
    ],
  },
];
