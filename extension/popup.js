const { t } = PageClip;
const statusEl = document.getElementById("status");

function setStatus(text, isError = false) {
  statusEl.textContent = text;
  statusEl.classList.toggle("error", isError);
}

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

// Injects print.css and the content script, then calls window.__pageClip[method](...args)
// in the extension's isolated world of the page.
async function callInPage(tabId, method, args = []) {
  const target = { tabId };
  await chrome.scripting.insertCSS({ target, files: ["print.css"] });
  await chrome.scripting.executeScript({ target, files: ["lib/common.js", "content.js"] });
  const [{ result }] = await chrome.scripting.executeScript({
    target,
    func: (m, a) => window.__pageClip[m](...a),
    args: [method, args],
  });
  return result;
}

async function run(tab, method, args) {
  for (const b of document.querySelectorAll("button")) b.disabled = true;
  try {
    const result = await callInPage(tab.id, method, args);
    if (result?.ok) {
      window.close();
      return;
    }
    setStatus(result?.error || t("errUnknown"), true);
  } catch (e) {
    console.error(e);
    setStatus(t("errCannotInject"), true);
  }
  for (const b of document.querySelectorAll("button")) b.disabled = false;
}

function renderPresets(tab, presets) {
  const list = document.getElementById("preset-list");
  for (const preset of presets) {
    const li = document.createElement("li");
    const name = document.createElement("span");
    name.className = "name";
    name.textContent = preset.name;
    name.title = preset.name;
    const pdf = document.createElement("button");
    pdf.className = "primary";
    pdf.textContent = "PDF";
    pdf.title = t("popupSavePdf");
    pdf.addEventListener("click", () => run(tab, "runPreset", [preset, "pdf"]));
    const md = document.createElement("button");
    md.textContent = "MD";
    md.title = t("popupSaveMd");
    md.addEventListener("click", () => run(tab, "runPreset", [preset, "md"]));
    li.append(name, pdf, md);
    list.append(li);
  }
  document.getElementById("no-presets").hidden = presets.length > 0;
}

async function init() {
  PageClip.localize();
  document.getElementById("open-options").addEventListener("click", (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });

  const tab = await activeTab();
  const url = tab?.url || "";
  const presets = (await PageClip.allPresets()).filter((p) => PageClip.presetMatches(p, url));
  renderPresets(tab, presets);
  document.getElementById("pick").addEventListener("click", () => run(tab, "startPicker", []));
}

init().catch((e) => {
  console.error(e);
  setStatus(String(e.message || e), true);
});
