const { t } = PageClip;
const statusEl = document.getElementById("status");

function setStatus(text, kind = "") {
  statusEl.textContent = text;
  statusEl.className = kind;
}

function button(label, onClick, className = "") {
  const b = document.createElement("button");
  b.textContent = label;
  b.className = className;
  b.addEventListener("click", onClick);
  return b;
}

// Strips UI-only flags before storing or exporting.
function plain(preset) {
  const { builtin, ...rest } = preset;
  return rest;
}

function presetItem(preset, actions) {
  const li = document.createElement("li");
  const row = document.createElement("div");
  row.className = "row";
  const name = document.createElement("span");
  name.className = "name";
  name.textContent = preset.name;
  row.append(name, ...actions);
  const match = document.createElement("div");
  match.className = "match";
  match.textContent = preset.match.join("  ");
  li.append(row, match);
  return li;
}

function toggleEditor(li, preset, readOnly) {
  const existing = li.querySelector(".editor");
  if (existing) {
    existing.remove();
    return;
  }
  const editor = document.createElement("div");
  editor.className = "editor";
  const area = document.createElement("textarea");
  area.spellcheck = false;
  area.value = JSON.stringify(plain(preset), null, 2);
  area.readOnly = readOnly;
  editor.append(area);
  if (!readOnly) {
    const row = document.createElement("div");
    row.className = "row";
    row.append(
      button(t("optionsSave"), async () => {
        try {
          const updated = PageClip.validatePreset(JSON.parse(area.value));
          if (updated.id !== preset.id) await PageClip.storage.remove(preset.id);
          await PageClip.storage.save(updated);
          setStatus(t("optionsSaved"), "ok");
          await render();
        } catch (e) {
          setStatus(e instanceof SyntaxError ? t("optionsBadJson", [e.message]) : e.message, "error");
        }
      }),
      button(t("optionsCancel"), () => editor.remove()),
    );
    editor.append(row);
  }
  li.append(editor);
}

async function duplicate(preset) {
  const copy = {
    ...structuredClone(plain(preset)),
    id: PageClip.newPresetId(),
    name: `${preset.name} (${t("optionsCopySuffix")})`,
  };
  await PageClip.storage.save(copy);
  setStatus(t("optionsSaved"), "ok");
  await render();
}

async function rename(preset) {
  const name = prompt(t("optionsPromptName"), preset.name);
  if (!name?.trim()) return;
  await PageClip.storage.save({ ...plain(preset), name: name.trim() });
  await render();
}

async function remove(preset) {
  if (!confirm(t("optionsConfirmDelete", [preset.name]))) return;
  await PageClip.storage.remove(preset.id);
  await render();
}

async function render() {
  const builtinList = document.getElementById("builtin-list");
  const userList = document.getElementById("user-list");
  builtinList.replaceChildren();
  userList.replaceChildren();

  for (const preset of PageClip.BUILTIN) {
    const li = presetItem(preset, [
      button(t("optionsEdit"), () => toggleEditor(li, preset, true)),
      button(t("optionsDuplicate"), () => duplicate(preset)),
    ]);
    builtinList.append(li);
  }

  const user = await PageClip.storage.listUser();
  for (const preset of user) {
    const li = presetItem(preset, [
      button(t("optionsRename"), () => rename(preset)),
      button(t("optionsEdit"), () => toggleEditor(li, preset, false)),
      button(t("optionsDelete"), () => remove(preset), "danger"),
    ]);
    userList.append(li);
  }
  document.getElementById("no-user").hidden = user.length > 0;
}

async function exportPresets() {
  const user = (await PageClip.storage.listUser()).map(plain);
  const blob = new Blob([JSON.stringify(user, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `page-clip-presets-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

// Accepts an array of presets or a single preset; merges by id (same id overwrites).
async function importPresets(file) {
  try {
    const data = JSON.parse(await file.text());
    const presets = (Array.isArray(data) ? data : [data]).map(PageClip.validatePreset);
    const builtinIds = new Set(PageClip.BUILTIN.map((p) => p.id));
    for (const p of presets) {
      await PageClip.storage.save(builtinIds.has(p.id) ? { ...p, id: PageClip.newPresetId() } : p);
    }
    setStatus(t("optionsImported", [String(presets.length)]), "ok");
  } catch (e) {
    setStatus(e instanceof SyntaxError ? t("optionsBadJson", [e.message]) : e.message, "error");
  }
  await render();
}

PageClip.localize();
document.title = t("optionsTitle");
document.getElementById("export").addEventListener("click", exportPresets);
document.getElementById("import").addEventListener("change", (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (file) importPresets(file);
});
render().catch((e) => setStatus(e.message, "error"));
