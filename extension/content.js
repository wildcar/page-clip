// Injected on demand by the popup (after lib/common.js). Exposes window.__pageClip with:
//   runPreset(preset, format)  — locate blocks and export them ("pdf" | "md")
//   startPicker()              — manual block selection with a floating toolbar
// Everything it adds to the page uses the data-pb-* attributes and is removed afterwards.
(() => {
  if (window.__pageClip) return;

  const t = (key, subs) => globalThis.PageClip?.t(key, subs) ?? key;

  const ATTR = {
    keep: "data-pb-keep",
    path: "data-pb-path",
    hide: "data-pb-hide",
    active: "data-pb-active",
    preline: "data-pb-preline",
    hover: "data-pb-hover",
    picked: "data-pb-picked",
  };
  const UI_ID = "pb-ui";
  const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "HEAD", "META", "LINK"]);

  // ---------- text helpers ----------

  const clean = (s) => (s || "").replace(/\s+/g, " ").trim();
  const norm = (s) => clean(s).toLowerCase().replace(/ё/g, "е");
  const isOurs = (el) => !!el.closest?.("#" + UI_ID);

  // Smallest elements whose whole text equals `text` (normalized), in document order.
  function elementsWithText(text, root = document.body) {
    const want = norm(text);
    const out = [];
    if (!want || !root) return out;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
      acceptNode: (el) => (SKIP_TAGS.has(el.tagName) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    for (let el = walker.currentNode; el; el = walker.nextNode()) {
      const raw = el.textContent;
      if (raw.length > want.length * 4 + 200) continue;
      if (norm(raw) !== want || isOurs(el)) continue;
      if ([...el.children].some((c) => norm(c.textContent) === want)) continue;
      out.push(el);
    }
    return out;
  }

  function querySafe(selector, all = false) {
    try {
      return all ? [...document.querySelectorAll(selector)] : document.querySelector(selector);
    } catch {
      return all ? [] : null;
    }
  }

  // ---------- preset engine ----------

  function climb(el, cond) {
    if (!cond) return el;
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
      const text = norm(n.textContent);
      if (cond.notContainsText?.some((x) => text.includes(norm(x)))) return null;
      const hasText = !cond.containsText || cond.containsText.every((x) => text.includes(norm(x)));
      const hasSel = !cond.hasSelector || !!querySafeIn(n, cond.hasSelector);
      if (hasText && hasSel) return n;
    }
    return null;
  }

  function querySafeIn(root, selector) {
    try {
      return root.querySelector(selector);
    } catch {
      return null;
    }
  }

  function locate(loc) {
    if (loc.selector) {
      const el = querySafe(loc.selector);
      if (el) return el;
    }
    if (loc.anchorText) {
      for (const anchor of elementsWithText(loc.anchorText)) {
        const el = climb(anchor, loc.climbUntil);
        if (el) return el;
      }
    }
    return null;
  }

  // Unique, outermost, in document order.
  function normalizeBlocks(elements) {
    const unique = [...new Set(elements.filter(Boolean))];
    const outer = unique.filter((el) => !unique.some((o) => o !== el && o.contains(el)));
    return outer.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
  }

  function locateBlocks(locators) {
    return normalizeBlocks((locators || []).map(locate));
  }

  function applyHide(rules) {
    for (const rule of rules || []) {
      if (rule.selector) for (const el of querySafe(rule.selector, true)) el.setAttribute(ATTR.hide, "");
      for (const text of rule.text || []) {
        for (const el of elementsWithText(text)) {
          (el.closest("button, a, [role=button]") || el).setAttribute(ATTR.hide, "");
        }
      }
    }
  }

  function nextValueAfter(label) {
    for (let n = label, depth = 0; n && depth < 3; n = n.parentElement, depth++) {
      for (let s = n.nextElementSibling; s; s = s.nextElementSibling) {
        if (clean(s.textContent)) return s;
      }
    }
    return null;
  }

  const MONTHS = [
    "январ", "феврал", "март", "апрел", "ма", "июн", "июл", "август", "сентябр", "октябр", "ноябр", "декабр",
  ];
  const WEEKDAYS = ["воскресенье", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота"];
  const pad = (n) => String(n).padStart(2, "0");
  const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  const EARLIEST_YEAR = 2000;

  // "Понедельник, 12 октября, 15:06" → { year: null, month: 9, day: 12, weekday: 1 };
  // also "1 марта 2024", "12.03.2024", "2024-03-12". null when unparseable.
  function parseDate(value) {
    const s = value.toLowerCase().replace(/ё/g, "е");
    let m = /(\d{4})-(\d{2})-(\d{2})/.exec(s);
    if (m) return { year: +m[1], month: m[2] - 1, day: +m[3], weekday: -1 };
    m = /(\d{1,2})\.(\d{1,2})\.(\d{4})/.exec(s);
    if (m) return { year: +m[3], month: m[2] - 1, day: +m[1], weekday: -1 };
    m = /(\d{1,2})\s+([а-я]+)(?:\s+(\d{4}))?/.exec(s);
    if (!m) return null;
    // "март" precedes "ма" in MONTHS, so "марта" never reaches the May prefix.
    const month = MONTHS.findIndex((p) => m[2].startsWith(p));
    if (month < 0) return null;
    return { year: m[3] ? +m[3] : null, month, day: +m[1], weekday: WEEKDAYS.findIndex((w) => s.includes(w)) };
  }

  // Years (newest first) when the date is not in the future and, if a weekday is given, falls on it.
  // A weekday repeats on the same date every 5–11 years, so there are usually several.
  function candidateYears(date) {
    const now = new Date();
    const years = [];
    for (let y = now.getFullYear(); y >= EARLIEST_YEAR; y--) {
      const d = new Date(y, date.month, date.day);
      if (d.getMonth() !== date.month || d > now) continue;
      if (date.weekday >= 0 && d.getDay() !== date.weekday) continue;
      years.push(y);
    }
    return years;
  }

  const isoParts = (year, date) => `${year}-${pad(date.month + 1)}-${pad(date.day)}`;

  // Synchronous best guess: an explicit year, else the newest candidate year.
  function formatDate(value) {
    const date = parseDate(value);
    if (!date) return value;
    const year = date.year ?? candidateYears(date)[0];
    return year ? isoParts(year, date) : value;
  }

  // "Иванова Татьяна Геннадьевна" → "Иванова Т.Г."
  function formatInitials(value) {
    const parts = clean(value).split(" ").filter(Boolean);
    if (parts.length < 2) return clean(value);
    return parts[0] + " " + parts.slice(1).map((p) => p[0].toUpperCase() + ".").join("");
  }

  const FORMATS = { date: formatDate, initials: formatInitials };

  function fieldElement(field) {
    if (field.selector) return querySafe(field.selector);
    if (field.afterLabel) {
      for (const label of elementsWithText(field.afterLabel)) {
        const el = nextValueAfter(label);
        if (el) return el;
      }
    }
    return null;
  }

  // Adds `year` after the first "<day> <month>" in el's text: "01 апреля, 18:14" → "01 апреля 2019, 18:14".
  // Changed text nodes go to changedText, so cleanup() restores them.
  function insertYearInto(el, year) {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const m = /(\d{1,2}\s+([А-Яа-яЁё]+))(?!\s*\d{4})/.exec(node.nodeValue);
      if (!m || !MONTHS.some((p) => m[2].toLowerCase().replace(/ё/g, "е").startsWith(p))) continue;
      const at = m.index + m[1].length;
      changedText.set(node, node.nodeValue);
      node.nodeValue = node.nodeValue.slice(0, at) + " " + year + node.nodeValue.slice(at);
      return true;
    }
    return false;
  }

  // Year chosen by the user for a date shown without one, remembered per site and date text.
  const yearKey = (text) => `year:${location.host}:${norm(text)}`;

  async function rememberedYear(text) {
    try {
      return (await chrome.storage.local.get(yearKey(text)))[yearKey(text)] ?? null;
    } catch {
      return null; // test page without extension APIs
    }
  }

  async function rememberYear(text, year) {
    try {
      await chrome.storage.local.set({ [yearKey(text)]: year });
    } catch {
      /* test page without extension APIs */
    }
  }

  // ---------- values from the site's own API ----------

  // JSON the page itself already loaded: the field's `api.url` (regex) is matched against
  // same-origin resource URLs from the Performance API, newest first, and re-requested.
  // Overridable in test/harness.html.
  const apiEnv = {
    resources: () => performance.getEntriesByType("resource").map((e) => e.name),
    fetchJson,
  };
  const API_ATTEMPTS = 3;

  // JWT-looking strings from the page's storage, for APIs that authorize by a bearer header.
  function storedTokens() {
    const tokens = new Set();
    for (const storage of [localStorage, sessionStorage]) {
      try {
        for (let i = 0; i < storage.length; i++) {
          for (const m of String(storage.getItem(storage.key(i))).matchAll(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g)) tokens.add(m[0]);
        }
      } catch {
        /* storage blocked */
      }
    }
    return [...tokens].slice(0, 5);
  }

  // Same origin only. Cookies first; on 401/403 retry with tokens found in the page's storage.
  async function fetchJson(url) {
    if (new URL(url, location.href).origin !== location.origin) throw new Error("cross-origin");
    const get = (auth) =>
      fetch(url, { credentials: "include", headers: { Accept: "application/json", ...(auth && { Authorization: auth }) } });
    let res = await get();
    if (res.status === 401 || res.status === 403) {
      for (const token of storedTokens()) {
        res = await get(`Bearer ${token}`);
        if (res.ok) break;
      }
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  const getPath = (obj, path) => path.split(".").reduce((o, k) => (o == null ? o : o[k]), obj);

  // First value at `api.path` that `accept` agrees with, or null.
  async function apiValue(api, accept = () => true) {
    let re;
    try {
      re = new RegExp(api.url);
    } catch {
      return null;
    }
    const urls = [...new Set(apiEnv.resources().filter((u) => re.test(u)))].reverse().slice(0, API_ATTEMPTS);
    for (const url of urls) {
      try {
        const value = getPath(await apiEnv.fetchJson(url), api.path);
        if (value != null && value !== "" && accept(String(value))) return String(value);
      } catch {
        /* try the next one */
      }
    }
    return null;
  }

  // API date must be the same day (and time, if the page shows one) as the date on the page:
  // the tab may hold responses for several visits.
  function sameDate(pageText, page, apiText) {
    const api = parseDate(apiText);
    if (!api?.year || api.month !== page.month || api.day !== page.day) return false;
    const time = /(\d{1,2}):(\d{2})/.exec(pageText);
    const apiTime = /T(\d{2}):(\d{2})/.exec(apiText);
    return !time || !apiTime || (Number(time[1]) === Number(apiTime[1]) && time[2] === apiTime[2]);
  }

  class Cancelled extends Error {}

  // Field value for the title. A "date" field takes a missing year from `api` when given, then
  // from a remembered answer, then asks the user (with "askYear", when several years fit);
  // `ask` resolves to a year, 0 (no year) or null (cancel). With "insertYear", a year known from
  // the API or the user is queued in `inserts` to be shown in the page text while exporting.
  async function resolveField(field, ask, inserts) {
    const el = fieldElement(field);
    const text = clean(el?.textContent);
    if (field.format !== "date") {
      const value = text || (field.api ? (await apiValue(field.api)) ?? "" : "");
      return value && FORMATS[field.format] ? FORMATS[field.format](value) : value;
    }
    if (!text) return "";
    const date = parseDate(text);
    if (!date) return text;
    if (date.year) return isoParts(date.year, date);
    const known = (year) => {
      if (field.insertYear && year) inserts.push({ el, year });
      return isoParts(year, date);
    };
    if (field.api) {
      const fromApi = await apiValue(field.api, (v) => sameDate(text, date, v));
      if (fromApi) return known(parseDate(fromApi).year);
    }
    const years = candidateYears(date);
    if (!field.askYear || years.length < 2) return years.length ? isoParts(years[0], date) : text;
    let year = await rememberedYear(text);
    if (year === null) {
      year = await ask(text, years);
      if (year === null) throw new Cancelled();
      await rememberYear(text, year);
    }
    return year ? known(year) : `${pad(date.month + 1)}-${pad(date.day)}`;
  }

  // Rejects with Cancelled when the user cancels a question. Year insertions for the page text
  // (see resolveField) are collected into `inserts`.
  async function buildTitle(preset, ask = askYear, inserts = []) {
    const fallback = clean(document.title) || location.hostname;
    if (!preset?.title) return fallback;
    const values = {};
    for (const key of new Set([...preset.title.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))) {
      const field = preset.fields?.[key];
      values[key] = field ? await resolveField(field, ask, inserts) : "";
    }
    const keys = Object.keys(values);
    const result = clean(preset.title.replace(/\{(\w+)\}/g, (_, key) => values[key]));
    return !result || (keys.length && !keys.some((k) => values[k])) ? fallback : result;
  }

  // ---------- year question ----------

  function askYear(dateText, years) {
    return new Promise((resolve) => {
      const host = document.createElement("div");
      host.id = UI_ID;
      const root = host.attachShadow({ mode: "open" });
      root.innerHTML = `
        <style>
          :host { all: initial; }
          .backdrop { position: fixed; inset: 0; z-index: 2147483647; background: rgba(0, 0, 0, 0.35);
            display: flex; align-items: center; justify-content: center; padding: 16px;
            font: 14px/1.4 system-ui, "Segoe UI", sans-serif; }
          .box { background: #fff; color: #1f2328; border-radius: 10px; padding: 16px 18px; max-width: 420px;
            width: 100%; box-sizing: border-box; box-shadow: 0 10px 40px rgba(0, 0, 0, 0.35); }
          h2 { font-size: 16px; margin: 0 0 6px; }
          p { margin: 0 0 12px; color: #424a53; }
          .years, .row { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
          button, input { font: inherit; padding: 6px 12px; border-radius: 6px; border: 1px solid #d0d7de;
            background: #fff; color: inherit; }
          button { cursor: pointer; }
          button:hover { border-color: #1a73e8; }
          .years button:first-child { background: #1a73e8; border-color: #1a73e8; color: #fff; }
          input { width: 90px; }
          .row:last-child { justify-content: flex-end; margin-bottom: 0; }
        </style>
        <div class="backdrop">
          <div class="box" role="dialog" aria-modal="true">
            <h2></h2>
            <p></p>
            <div class="years"></div>
            <form class="row"><input type="number" min="${EARLIEST_YEAR}" max="${new Date().getFullYear()}" required /><button type="submit">OK</button></form>
            <div class="row"><button data-act="none"></button><button data-act="cancel"></button></div>
          </div>
        </div>`;
      root.querySelector("h2").textContent = t("yearTitle");
      root.querySelector("p").textContent = t("yearPrompt", [dateText]);
      root.querySelector("input").placeholder = t("yearOther");
      root.querySelector("[data-act=none]").textContent = t("yearNone");
      root.querySelector("[data-act=cancel]").textContent = t("yearCancel");
      for (const y of years.slice(0, 4)) {
        const b = document.createElement("button");
        b.textContent = String(y);
        b.addEventListener("click", () => done(y));
        root.querySelector(".years").append(b);
      }
      root.querySelector("form").addEventListener("submit", (e) => {
        e.preventDefault();
        done(Number(root.querySelector("input").value));
      });
      root.querySelector("[data-act=none]").addEventListener("click", () => done(0));
      root.querySelector("[data-act=cancel]").addEventListener("click", () => done(null));
      const onKey = (e) => {
        if (e.key === "Escape") done(null);
      };
      window.addEventListener("keydown", onKey, true);
      function done(value) {
        window.removeEventListener("keydown", onKey, true);
        host.remove();
        resolve(value);
      }
      document.documentElement.append(host);
      root.querySelector(".years button")?.focus();
    });
  }

  const fileSafe = (s) => clean(s.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ")).slice(0, 150) || "page";

  // ---------- marking & export ----------

  // Original values of text nodes changed for export (tidyPreformatted, insertYearInto),
  // restored by cleanup().
  const changedText = new Map();

  // Preformatted text that is not code (user-entered notes) often has runs of tabs and
  // whitespace-only lines that become large gaps on paper. For printing: pre/pre-wrap switch
  // to pre-line (print.css), and several blank lines collapse into one.
  function tidyPreformatted(block) {
    for (const el of [block, ...block.querySelectorAll("*")]) {
      if (el.closest("pre, code, textarea")) continue;
      const ws = getComputedStyle(el).whiteSpace;
      if (!ws.startsWith("pre") && ws !== "break-spaces") continue;
      if (ws !== "pre-line") el.setAttribute(ATTR.preline, "");
      for (const node of el.childNodes) {
        if (node.nodeType !== Node.TEXT_NODE || !node.nodeValue.includes("\n")) continue;
        const tidy = node.nodeValue.replace(/[ \t ]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").replace(/^\n+|\s+$/g, "");
        if (tidy === node.nodeValue) continue;
        changedText.set(node, node.nodeValue);
        node.nodeValue = tidy;
      }
    }
  }

  function cleanup() {
    for (const [node, value] of changedText) node.nodeValue = value;
    changedText.clear();
    for (const name of [ATTR.keep, ATTR.path, ATTR.hide, ATTR.active, ATTR.preline]) {
      for (const el of document.querySelectorAll(`[${name}]`)) el.removeAttribute(name);
    }
  }

  function mark(blocks, hideRules, inserts = []) {
    cleanup();
    for (const block of blocks) {
      block.setAttribute(ATTR.keep, "");
      for (let p = block.parentElement; p; p = p.parentElement) p.setAttribute(ATTR.path, "");
    }
    applyHide(hideRules);
    for (const { el, year } of inserts) if (el?.isConnected) insertYearInto(el, year);
    document.documentElement.setAttribute(ATTR.active, "");
  }

  function printBlocks(blocks, hideRules, title, inserts) {
    mark(blocks, hideRules, inserts);
    blocks.forEach(tidyPreformatted);
    const originalTitle = document.title;
    let restored = false;
    const restore = () => {
      if (restored) return;
      restored = true;
      window.removeEventListener("afterprint", restore);
      document.title = originalTitle;
      cleanup();
    };
    window.addEventListener("afterprint", restore);
    document.title = fileSafe(title);
    window.print();
  }

  function downloadText(text, fileName, type) {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.style.display = "none";
    document.documentElement.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  function saveMarkdown(blocks, hideRules, title, inserts) {
    mark(blocks, hideRules, inserts);
    let md;
    try {
      md = buildMarkdown(blocks, title);
    } finally {
      cleanup();
    }
    downloadText(md, fileSafe(title) + ".md", "text/markdown;charset=utf-8");
    return md;
  }

  function exportBlocks(blocks, hideRules, title, format, inserts = []) {
    if (format === "md") saveMarkdown(blocks, hideRules, title, inserts);
    else printBlocks(blocks, hideRules, title, inserts);
  }

  // ---------- DOM → Markdown ----------

  const BLOCK_SEP = "\uE000";
  const HARD_BR = "\uE001";
  const MD_SKIP_TAGS = new Set([
    ...SKIP_TAGS, "BUTTON", "INPUT", "SELECT", "TEXTAREA", "OPTION", "IFRAME", "OBJECT", "EMBED",
    "CANVAS", "VIDEO", "AUDIO", "SVG", "MATH", "DIALOG",
  ]);

  const escapeMd = (s) => s.replace(/([\\`*_[\]<>])/g, "\\$1");

  function pseudoText(el, which) {
    const content = getComputedStyle(el, which).content;
    const m = /^"(.*)"$/.exec(content || "");
    return m ? m[1].replace(/\\(.)/g, "$1") : "";
  }

  // Collapses separators: BLOCK_SEP → blank line, HARD_BR → Markdown hard break.
  function finalize(s) {
    return s
      .replace(/[ \t]*\uE000[\s\uE000]*/g, "\n\n")
      .replace(/[ \t]*\uE001[ \t]*/g, "  \n")
      .replace(/(  \n){2,}/g, "\n\n")
      .replace(/^(  \n)+|(  \n)+$/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function textToMd(node, ctx) {
    const raw = node.nodeValue;
    if (ctx.code) return raw;
    const ws = ctx.whiteSpace;
    if (ws.startsWith("pre") || ws === "break-spaces") {
      return raw
        .split("\n")
        .map((line) => escapeMd(line.replace(/[ \t\u00a0]+/g, " ").trim()))
        .join(HARD_BR);
    }
    return escapeMd(raw.replace(/\s+/g, " "));
  }

  // Joins inline pieces without doubling the whitespace between them.
  const concat = (a, b) => (a.endsWith(" ") && b.startsWith(" ") ? a + b.slice(1) : a + b);

  function childrenToMd(el, ctx) {
    let out = "";
    for (const child of el.childNodes) out = concat(out, nodeToMd(child, ctx));
    return out;
  }

  function listToMd(list, ctx) {
    const ordered = list.tagName === "OL";
    let index = Number(list.getAttribute("start")) || 1;
    const indent = "  ".repeat(ctx.listDepth);
    const items = [];
    for (const li of list.children) {
      if (li.tagName !== "LI" || isHidden(li)) continue;
      const marker = ordered ? `${index++}. ` : "- ";
      // Tight list: blocks inside an item (paragraphs, nested lists) go on separate lines.
      const body = finalize(childrenToMd(li, { ...ctx, listDepth: ctx.listDepth + 1 })).replace(/\n{2,}/g, "\n");
      const lines = body.split("\n");
      const pad = " ".repeat(marker.length);
      items.push(
        indent + marker + lines[0] + lines.slice(1).map((l) => "\n" + (l && !l.startsWith(indent + "  ") ? indent + pad + l : l)).join(""),
      );
    }
    return BLOCK_SEP + items.join("\n") + BLOCK_SEP;
  }

  function tableToMd(table) {
    const rows = [...table.rows].filter((r) => !isHidden(r));
    if (!rows.length) return "";
    const cell = (c) => clean(c.innerText || c.textContent).replace(/\|/g, "\\|") || " ";
    const lines = rows.map((r) => "| " + [...r.cells].map(cell).join(" | ") + " |");
    const width = rows[0].cells.length;
    lines.splice(1, 0, "|" + " --- |".repeat(width));
    return BLOCK_SEP + lines.join("\n") + BLOCK_SEP;
  }

  function isHidden(el) {
    if (el.hasAttribute(ATTR.hide) || el.getAttribute("aria-hidden") === "true") return true;
    const cs = getComputedStyle(el);
    return cs.display === "none" || cs.visibility === "hidden";
  }

  function nodeToMd(node, ctx) {
    if (node.nodeType === Node.TEXT_NODE) return textToMd(node, ctx);
    if (node.nodeType !== Node.ELEMENT_NODE) return "";
    const el = node;
    const tag = el.tagName.toUpperCase();
    if (MD_SKIP_TAGS.has(tag) || isOurs(el) || isHidden(el)) return "";

    const cs = getComputedStyle(el);
    const inner = (extra = {}) => childrenToMd(el, { ...ctx, whiteSpace: cs.whiteSpace, ...extra });
    const withPseudo = (s) => concat(concat(escapeMd(pseudoText(el, "::before")), s), escapeMd(pseudoText(el, "::after")));

    const heading = /^H([1-6])$/.exec(tag);
    if (heading) {
      const level = Math.min(6, Math.max(2, Number(heading[1]) + ctx.headingShift));
      const text = clean(finalize(inner()).replace(/\n+/g, " "));
      return text ? BLOCK_SEP + "#".repeat(level) + " " + text + BLOCK_SEP : "";
    }

    switch (tag) {
      case "BR":
        return HARD_BR;
      case "HR":
        return BLOCK_SEP + "---" + BLOCK_SEP;
      case "UL":
      case "OL":
        return listToMd(el, ctx);
      case "TABLE":
        return tableToMd(el);
      case "PRE": {
        const code = el.innerText.replace(/\n+$/, "");
        const fence = code.includes("```") ? "~~~" : "```";
        return BLOCK_SEP + fence + "\n" + code + "\n" + fence + BLOCK_SEP;
      }
      case "CODE":
      case "KBD":
      case "SAMP": {
        const code = clean(el.textContent);
        return code ? "`" + code.replace(/`/g, "\\`") + "`" : "";
      }
      case "IMG": {
        const src = el.currentSrc || el.src;
        if (!src || (src.startsWith("data:") && src.length > 2000)) return "";
        return `![${escapeMd(clean(el.alt))}](${src.replace(/ /g, "%20")})`;
      }
      case "A": {
        const text = clean(finalize(inner()).replace(/\n+/g, " "));
        const href = el.href;
        if (!text) return "";
        if (!href || href.startsWith("javascript:") || el.getAttribute("href")?.startsWith("#")) return text;
        return `[${text}](${href.replace(/ /g, "%20")})`;
      }
      case "STRONG":
      case "B": {
        const text = inner().trim();
        return text ? `**${text}**` : "";
      }
      case "EM":
      case "I": {
        const text = inner().trim();
        return text ? `_${text}_` : "";
      }
      case "BLOCKQUOTE": {
        const body = finalize(inner());
        return BLOCK_SEP + body.split("\n").map((l) => "> " + l).join("\n") + BLOCK_SEP;
      }
    }

    const body = withPseudo(inner());
    const inline = cs.display.startsWith("inline") || cs.display === "contents";
    return inline ? body : BLOCK_SEP + body + BLOCK_SEP;
  }

  function buildMarkdown(blocks, title) {
    const levels = blocks.flatMap((b) =>
      [...b.querySelectorAll("h1, h2, h3, h4, h5, h6")].filter((h) => !isHidden(h)).map((h) => Number(h.tagName[1])),
    );
    blocks.forEach((b) => /^H[1-6]$/.test(b.tagName) && levels.push(Number(b.tagName[1])));
    const ctx = { headingShift: levels.length ? 2 - Math.min(...levels) : 0, listDepth: 0, whiteSpace: "normal" };
    const body = blocks.map((b) => finalize(nodeToMd(b, ctx))).filter(Boolean).join("\n\n");
    const saved = isoDate(new Date());
    const source = `_${t("mdSource")}: [${escapeMd(location.hostname || location.href)}](${location.href}), ${saved}_`;
    return `# ${escapeMd(clean(title))}\n\n${body}\n\n---\n\n${source}\n`;
  }

  // ---------- CSS selector generator (for picker presets) ----------

  const STATE_CLASS = /(^|[-_])(active|hover|focus|selected|open|opened|show|shown|hidden|visible|current|disabled|checked|expanded|collapsed)($|[-_])/i;

  function looksGenerated(s) {
    if (!s || s.length > 40) return true;
    if (/[^\w-]/.test(s)) return true; // tailwind-like "w-[10px]", "md:flex", React ":r1:"
    if (/^(css|sc|jsx|emotion|svelte|styled|ng)-/i.test(s)) return true;
    if (/\d{3,}/.test(s)) return true;
    const hasDigit = /\d/.test(s);
    if (hasDigit && /[0-9a-f]{5,}/i.test(s) && /[a-z]/i.test(s)) return true;
    if (hasDigit && /(^|[_-])[a-z0-9]{5,8}$/i.test(s) && /[a-z]/i.test(s)) return true;
    return false;
  }

  const unique = (sel, el) => {
    const found = querySafe(sel, true);
    return found.length === 1 && found[0] === el;
  };
  const attrValue = (v) => '"' + v.replace(/["\\]/g, "\\$&") + '"';

  function stableAttribute(el) {
    const preferred = ["data-testid", "data-test", "data-qa", "data-cy", "data-id", "data-name", "aria-label", "role", "name"];
    const others = [...el.attributes]
      .map((a) => a.name)
      .filter((n) => n.startsWith("data-") && !n.startsWith("data-v-") && !n.startsWith("data-pb-") && !preferred.includes(n));
    for (const name of [...preferred, ...others]) {
      const value = el.getAttribute(name);
      if (value && !looksGenerated(value.replace(/\s+/g, "-")) && value.length <= 40) {
        return `[${name}=${attrValue(value)}]`;
      }
    }
    return "";
  }

  function cssSelectorFor(el) {
    const parts = [];
    for (let n = el; n && n.nodeType === Node.ELEMENT_NODE && n !== document.documentElement; n = n.parentElement) {
      if (n.id && !looksGenerated(n.id)) {
        const idSel = "#" + CSS.escape(n.id);
        if (unique(idSel, n)) {
          parts.unshift(idSel);
          const sel = parts.join(" > ");
          if (unique(sel, el)) return sel;
          continue;
        }
      }
      const tag = n.tagName.toLowerCase();
      let part = tag;
      const attr = stableAttribute(n);
      if (attr) {
        part += attr;
      } else {
        const classes = [...n.classList].filter((c) => !looksGenerated(c) && !STATE_CLASS.test(c));
        part += classes.slice(0, 2).map((c) => "." + CSS.escape(c)).join("");
      }
      const parent = n.parentElement;
      if (parent && n !== document.body) {
        const sameTag = [...parent.children].filter((c) => c.tagName === n.tagName);
        const samePart = sameTag.filter((c) => c.matches(part));
        if (samePart.length > 1) part += `:nth-of-type(${sameTag.indexOf(n) + 1})`;
      }
      parts.unshift(part);
      const sel = parts.join(" > ");
      if (unique(sel, el)) return sel;
    }
    return parts.join(" > ");
  }

  // ---------- picker ----------

  let picker = null;

  const PICKER_CSS = `
    [${ATTR.hover}] { outline: 2px dashed #f57c00 !important; outline-offset: -2px !important; cursor: crosshair !important; }
    [${ATTR.picked}] { outline: 3px solid #1a73e8 !important; outline-offset: -3px !important;
      box-shadow: inset 0 0 0 9999px rgba(26, 115, 232, 0.08) !important; }
  `;

  const TOOLBAR_HTML = `
    <style>
      :host { all: initial; }
      .bar { position: fixed; left: 50%; bottom: 16px; transform: translateX(-50%); z-index: 2147483647;
        display: flex; align-items: center; gap: 6px; flex-wrap: wrap; justify-content: center;
        max-width: calc(100vw - 32px); box-sizing: border-box; padding: 8px 10px; border-radius: 10px;
        background: #1f2125; color: #e6edf3; font: 13px/1.3 system-ui, "Segoe UI", sans-serif;
        box-shadow: 0 6px 24px rgba(0, 0, 0, 0.35); }
      .hint { color: #a5adb7; margin-right: 4px; }
      button { font: inherit; padding: 5px 10px; border-radius: 6px; border: 1px solid #3d444d;
        background: #2b2f36; color: #e6edf3; cursor: pointer; }
      button:hover { border-color: #4c8df6; }
      button.primary { background: #1a73e8; border-color: #1a73e8; color: #fff; }
      button:disabled { opacity: 0.5; cursor: default; }
      .toast { color: #7ee2a8; }
    </style>
    <div class="bar" part="bar">
      <span class="hint"></span>
      <button class="primary" data-act="pdf"></button>
      <button data-act="md"></button>
      <button data-act="save"></button>
      <button data-act="cancel"></button>
      <span class="toast"></span>
    </div>
  `;

  function startPicker() {
    if (picker) return { ok: true };
    cleanup();

    const host = document.createElement("div");
    host.id = UI_ID;
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = TOOLBAR_HTML;
    root.querySelector(".hint").textContent = t("pickerHint");
    root.querySelector("[data-act=save]").textContent = t("pickerSave");
    root.querySelector("[data-act=cancel]").textContent = t("pickerCancel");
    const style = document.createElement("style");
    style.id = "pb-picker-style";
    style.textContent = PICKER_CSS;
    document.documentElement.append(style, host);

    const state = { host, style, root, hover: null, down: [], selected: [], listeners: [] };
    picker = state;

    const inUi = (e) => e.composedPath().includes(host);
    const on = (type, fn, opts = { capture: true }) => {
      window.addEventListener(type, fn, opts);
      state.listeners.push([type, fn, opts]);
    };
    const swallow = (e) => {
      if (inUi(e)) return;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
    };

    on("mouseover", (e) => {
      if (inUi(e) || !(e.target instanceof Element)) return;
      state.down = [];
      setHover(e.target);
    });
    on("click", (e) => {
      if (inUi(e)) return;
      swallow(e);
      toggle(state.hover || e.target);
    });
    for (const type of ["mousedown", "mouseup", "pointerdown", "pointerup", "dblclick", "auxclick", "contextmenu"]) {
      on(type, swallow);
    }
    on("keydown", (e) => {
      if (inUi(e)) return;
      if (e.key === "Escape") {
        swallow(e);
        stopPicker();
      } else if (e.altKey && e.key === "ArrowUp") {
        swallow(e);
        widen();
      } else if (e.altKey && e.key === "ArrowDown") {
        swallow(e);
        narrow();
      } else if (e.key === "Enter" && state.hover) {
        swallow(e);
        toggle(state.hover);
      }
    });
    on(
      "wheel",
      (e) => {
        if (!e.altKey || inUi(e)) return;
        swallow(e);
        if (e.deltaY < 0) widen();
        else if (e.deltaY > 0) narrow();
      },
      { capture: true, passive: false },
    );

    root.querySelector(".bar").addEventListener("click", (e) => {
      const act = e.target.closest?.("button")?.dataset.act;
      if (act === "cancel") stopPicker();
      else if (act === "pdf" || act === "md") finishWith(act);
      else if (act === "save") saveAsPreset();
    });

    updateToolbar();
    return { ok: true };
  }

  function setHover(el) {
    const s = picker;
    if (!s || el === s.hover) return;
    s.hover?.removeAttribute(ATTR.hover);
    s.hover = el && el !== document.documentElement && !isOurs(el) ? el : null;
    s.hover?.setAttribute(ATTR.hover, "");
  }

  function widen() {
    const s = picker;
    const parent = s?.hover?.parentElement;
    if (!parent || parent === document.documentElement) return;
    s.down.push(s.hover);
    setHover(parent);
  }

  function narrow() {
    const s = picker;
    if (!s?.hover) return;
    const next = s.down.pop() || s.hover.firstElementChild;
    if (next) setHover(next);
  }

  function toggle(el) {
    const s = picker;
    if (!s || !el || el === document.documentElement || el === document.body || isOurs(el)) return;
    if (s.selected.includes(el)) {
      s.selected = s.selected.filter((x) => x !== el);
      el.removeAttribute(ATTR.picked);
    } else {
      for (const other of s.selected.filter((x) => x.contains(el) || el.contains(x))) {
        other.removeAttribute(ATTR.picked);
      }
      s.selected = s.selected.filter((x) => !x.contains(el) && !el.contains(x));
      s.selected.push(el);
      el.setAttribute(ATTR.picked, "");
    }
    updateToolbar();
  }

  function updateToolbar(toast = "") {
    const s = picker;
    if (!s) return;
    const n = s.selected.length;
    const q = (sel) => s.root.querySelector(sel);
    q("[data-act=pdf]").textContent = `PDF (${n})`;
    q("[data-act=md]").textContent = `Markdown (${n})`;
    for (const act of ["pdf", "md", "save"]) q(`[data-act=${act}]`).disabled = n === 0;
    q(".toast").textContent = toast;
  }

  function stopPicker() {
    const s = picker;
    if (!s) return;
    picker = null;
    for (const [type, fn, opts] of s.listeners) window.removeEventListener(type, fn, opts);
    for (const name of [ATTR.hover, ATTR.picked]) {
      for (const el of document.querySelectorAll(`[${name}]`)) el.removeAttribute(name);
    }
    s.host.remove();
    s.style.remove();
  }

  function finishWith(format) {
    const blocks = normalizeBlocks(picker?.selected || []);
    if (!blocks.length) return;
    stopPicker();
    // Let the toolbar and outlines disappear before the print snapshot.
    setTimeout(() => exportBlocks(blocks, [], document.title, format), 50);
  }

  function defaultPattern() {
    if (location.protocol === "file:") return "file:///*";
    return `${location.protocol}//${location.host}/*`;
  }

  async function saveAsPreset() {
    const s = picker;
    if (!s?.selected.length) return;
    const name = prompt(t("pickerPromptName"), clean(document.title));
    if (!name?.trim()) return;
    const pattern = prompt(t("pickerPromptPattern"), defaultPattern());
    if (!pattern?.trim()) return;
    const preset = {
      id: PageClip.newPresetId(),
      name: name.trim(),
      match: [pattern.trim()],
      blocks: normalizeBlocks(s.selected).map((el) => ({ selector: cssSelectorFor(el) })),
      hide: [],
      title: "",
    };
    try {
      await PageClip.storage.save(preset);
      updateToolbar(t("pickerSaved"));
    } catch (e) {
      updateToolbar(String(e.message || e));
    }
  }

  // ---------- entry points ----------

  function runPreset(preset, format = "pdf") {
    stopPicker();
    cleanup();
    const blocks = locateBlocks(preset?.blocks);
    if (!blocks.length) return { ok: false, error: t("errNoBlocks") };
    // Return to the popup first (it closes); the title may wait for the year question, and
    // window.print() blocks until the dialog closes.
    setTimeout(async () => {
      let title;
      const inserts = [];
      try {
        title = await buildTitle(preset, askYear, inserts);
      } catch (e) {
        if (e instanceof Cancelled) return;
        throw e;
      }
      exportBlocks(blocks, preset.hide, title, format, inserts);
    }, 50);
    return { ok: true, found: blocks.length };
  }

  window.__pageClip = {
    runPreset,
    startPicker,
    stopPicker,
    // Exposed for test/harness.html.
    _test: { locateBlocks, buildTitle, buildMarkdown, saveMarkdown, mark, tidyPreformatted, cleanup, cssSelectorFor, formatDate, parseDate, candidateYears, askYear, apiEnv, insertYearInto, formatInitials, looksGenerated },
  };
})();
