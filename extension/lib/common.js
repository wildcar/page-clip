// Shared helpers for popup, options and content script: i18n, URL match patterns,
// preset validation and user-preset storage. Safe to load several times.
var PageClip = globalThis.PageClip || {};
globalThis.PageClip = PageClip;

PageClip.t = function t(key, substitutions) {
  const msg = globalThis.chrome?.i18n?.getMessage(key, substitutions);
  return msg || key;
};

// Fills elements marked with data-i18n (text) and data-i18n-title / data-i18n-placeholder.
PageClip.localize = function localize(root = document) {
  for (const el of root.querySelectorAll("[data-i18n]")) el.textContent = PageClip.t(el.dataset.i18n);
  for (const el of root.querySelectorAll("[data-i18n-title]")) el.title = PageClip.t(el.dataset.i18nTitle);
  for (const el of root.querySelectorAll("[data-i18n-placeholder]")) {
    el.placeholder = PageClip.t(el.dataset.i18nPlaceholder);
  }
};

// Chrome-style match pattern: <scheme>://<host>/<path>, with "*" wildcards and "<all_urls>".
PageClip.matchUrl = function matchUrl(pattern, url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  const proto = u.protocol.slice(0, -1);
  if (pattern === "<all_urls>") return ["http", "https", "file"].includes(proto);
  const m = /^(\*|https?|file|ftp):\/\/([^/]*)(\/.*)$/.exec(pattern);
  if (!m) return false;
  const [, scheme, host, path] = m;
  if (scheme === "*" ? !["http", "https"].includes(proto) : scheme !== proto) return false;
  if (scheme !== "file" && host !== "*") {
    const actual = host.includes(":") ? u.host : u.hostname;
    if (host.startsWith("*.")) {
      const base = host.slice(2);
      if (actual !== base && !actual.endsWith("." + base)) return false;
    } else if (actual !== host) {
      return false;
    }
  }
  const escape = (s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp("^" + path.split("*").map(escape).join(".*") + "$");
  return re.test(u.pathname + u.search);
};

PageClip.presetMatches = function presetMatches(preset, url) {
  return (preset.match || []).some((p) => PageClip.matchUrl(p, url));
};

// Throws an Error with a human-readable message when the preset is malformed.
PageClip.validatePreset = function validatePreset(p) {
  const fail = (what) => {
    throw new Error(PageClip.t("errInvalidPreset", [String(p?.name || p?.id || "?"), what]));
  };
  if (!p || typeof p !== "object" || Array.isArray(p)) fail("object");
  if (typeof p.id !== "string" || !p.id) fail("id");
  if (typeof p.name !== "string" || !p.name.trim()) fail("name");
  if (!Array.isArray(p.match) || !p.match.length || !p.match.every((m) => typeof m === "string")) fail("match");
  if (!Array.isArray(p.blocks) || !p.blocks.length) fail("blocks");
  for (const b of p.blocks) {
    if (!b || (typeof b.selector !== "string" && typeof b.anchorText !== "string")) fail("blocks[].selector|anchorText");
  }
  if (p.hide !== undefined && !Array.isArray(p.hide)) fail("hide");
  if (p.title !== undefined && typeof p.title !== "string") fail("title");
  if (p.fields !== undefined && (typeof p.fields !== "object" || Array.isArray(p.fields))) fail("fields");
  if (p.attachments !== undefined) {
    if (!Array.isArray(p.attachments)) fail("attachments");
    for (const a of p.attachments) {
      if (!a || (typeof a.clickText !== "string" && typeof a.clickSelector !== "string")) fail("attachments[].clickText|clickSelector");
    }
  }
  return p;
};

PageClip.newPresetId = function newPresetId() {
  return "user-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
};

// User presets: one item per preset ("preset:<id>") in storage.sync, so each stays under the
// 8 KB per-item limit; if sync refuses the write (quota), the preset goes to storage.local.
PageClip.storage = {
  PREFIX: "preset:",

  async listUser() {
    const [sync, local] = await Promise.all([
      chrome.storage.sync.get(null).catch(() => ({})),
      chrome.storage.local.get(null).catch(() => ({})),
    ]);
    const byId = new Map();
    for (const area of [sync, local]) {
      for (const [key, value] of Object.entries(area)) {
        if (key.startsWith(this.PREFIX) && value?.id) byId.set(value.id, value);
      }
    }
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, "ru"));
  },

  async save(preset) {
    PageClip.validatePreset(preset);
    const key = this.PREFIX + preset.id;
    try {
      await chrome.storage.sync.set({ [key]: preset });
      await chrome.storage.local.remove(key);
    } catch {
      await chrome.storage.local.set({ [key]: preset });
      await chrome.storage.sync.remove(key).catch(() => {});
    }
  },

  async remove(id) {
    const key = this.PREFIX + id;
    await Promise.all([chrome.storage.sync.remove(key), chrome.storage.local.remove(key)]);
  },
};

PageClip.allPresets = async function allPresets() {
  const user = await PageClip.storage.listUser();
  return [...(PageClip.BUILTIN || []).map((p) => ({ ...p, builtin: true })), ...user];
};
