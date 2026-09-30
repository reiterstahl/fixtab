import { plural, t } from "./lib/i18n.js";
import { canAdd, entriesFromTabs, inGroup } from "./lib/plan.js";
import { getSettings, setAutoLoad, setGroup } from "./lib/store.js";

/** @typedef {import("./lib/plan.js").Entry} Entry */

const $ = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));

const els = {
  restore: /** @type {HTMLButtonElement} */ ($("restore")),
  restoreHint: $("restore-hint"),
  status: $("status"),
  pinCurrent: /** @type {HTMLButtonElement} */ ($("pin-current")),
  pinCurrentHint: $("pin-current-hint"),
  missing: $("missing"),
  missingText: $("missing-text"),
  missingAdd: /** @type {HTMLButtonElement} */ ($("missing-add")),
  others: $("others"),
  othersTitle: $("others-title"),
  othersList: $("others-list"),
  autoload: /** @type {HTMLInputElement} */ ($("autoload")),
  autoloadHint: $("autoload-hint"),
  groupTitle: $("group-title"),
  group: $("group"),
  empty: $("empty"),
  save: /** @type {HTMLButtonElement} */ ($("save")),
  saveHint: $("save-hint"),
  shortcut: $("shortcut"),
};

const state = {
  /** @type {Entry[]} */
  group: [],
  autoLoad: true,
  /** Todas las pestañas de la ventana, en orden. @type {chrome.tabs.Tab[]} */
  tabs: [],
  windowId: /** @type {number | undefined} */ (undefined),
  busy: false,
  confirmingSave: false,
};

/** Textos fijos del HTML: los elementos con atributo data-i18n llevan la clave. */
function localizeStatic() {
  document.documentElement.lang = chrome.i18n.getUILanguage();
  for (const el of document.querySelectorAll("[data-i18n]")) {
    el.textContent = t(/** @type {HTMLElement} */ (el).dataset.i18n ?? "");
  }
}

const OWN_PREFIX = chrome.runtime.getURL("");

// Para el e2e y las capturas, donde el popup se abre como una pestaña más:
// popup.html?tab=<id> indica cuál tratar como «esta pestaña».
const forcedTabId = Number(new URLSearchParams(location.search).get("tab")) || undefined;

async function init() {
  localizeStatic();
  const win = await chrome.windows.getCurrent();
  state.windowId = win.id;
  await Promise.all([loadSettings(), loadTabs(), showShortcut()]);
  render();
}

async function loadSettings() {
  const s = await getSettings();
  state.group = s.group;
  state.autoLoad = s.autoLoad;
}

async function loadTabs() {
  const tabs = await chrome.tabs.query({ windowId: state.windowId });
  state.tabs = tabs.sort((a, b) => a.index - b.index);
}

async function showShortcut() {
  const commands = await chrome.commands.getAll();
  const keys = (/** @type {string} */ name) => commands.find((c) => c.name === name)?.shortcut;
  const restore = keys("restore-pinned");
  const pin = keys("pin-current");
  const parts = [];
  if (restore) parts.push(t("shortcutRestore", [restore]));
  if (pin) parts.push(t("shortcutPin", [pin]));
  els.shortcut.textContent = parts.length ? parts.join(" · ") : t("noShortcut");
}

/** La pestaña sobre la que actúa el botón «esta pestaña». */
function currentTab() {
  return forcedTabId !== undefined
    ? state.tabs.find((tab) => tab.id === forcedTabId)
    : state.tabs.find((tab) => tab.active);
}

function render() {
  const n = state.group.length;
  const pinnedTabs = state.tabs.filter((tab) => tab.pinned);
  const m = pinnedTabs.length;
  const addable = state.tabs.filter((tab) => canAdd(tab, OWN_PREFIX));
  const current = currentTab();

  els.restore.disabled = state.busy || n === 0;
  els.restore.textContent = n ? t("restoreButtonCount", [n]) : t("restoreButton");
  els.restoreHint.hidden = n > 0;
  els.restoreHint.textContent = t("restoreHintEmpty");

  els.autoload.checked = state.autoLoad;
  els.autoload.disabled = state.busy;
  els.autoloadHint.textContent = t(state.autoLoad ? "autoloadOn" : "autoloadOff");

  renderCurrent(current);

  // Fijadas a mano que el grupo todavía no conoce.
  const missing = addable.filter((tab) => tab.pinned && !inGroup(state.group, tab)).length;
  els.missing.hidden = missing === 0;
  els.missingText.textContent = plural(t, "notInGroup", missing);
  els.missingAdd.disabled = state.busy;

  const others = addable.filter((tab) => !tab.pinned && tab.id !== current?.id);
  els.others.hidden = others.length === 0;
  els.othersTitle.textContent = t("othersTitle", [others.length]);
  els.othersList.replaceChildren(...others.map(renderOpenTab));

  els.groupTitle.textContent = n ? t("groupTitleCount", [n]) : t("groupTitle");
  els.empty.hidden = n > 0;
  els.group.replaceChildren(...state.group.map(renderEntry));

  els.save.disabled = state.busy || m === 0;
  els.save.classList.toggle("danger", state.confirmingSave);
  if (m === 0) {
    els.save.textContent = t("saveButton");
    els.saveHint.textContent = t("saveHintNoPinned");
  } else if (state.confirmingSave) {
    els.save.textContent = t("saveConfirm");
    els.saveHint.textContent = t("saveConfirmHint", [n, m]);
  } else {
    els.save.textContent = plural(t, "saveButton", m);
    els.saveHint.textContent = "";
  }
}

/**
 * El botón de «esta pestaña» hace lo que le falte: fijarla, agregarla o ambas.
 * @param {chrome.tabs.Tab | undefined} tab
 */
function renderCurrent(tab) {
  const usable = tab !== undefined && canAdd(tab, OWN_PREFIX);
  const known = usable && inGroup(state.group, tab);
  const done = usable && tab.pinned && known;

  els.pinCurrent.disabled = state.busy || !usable || done;
  if (usable && tab.pinned && !known) els.pinCurrent.textContent = t("addCurrent");
  else if (usable && known && !tab.pinned) els.pinCurrent.textContent = t("pinCurrentOnly");
  else els.pinCurrent.textContent = t("pinCurrent");

  if (!usable) els.pinCurrentHint.textContent = t("currentUnavailable");
  else if (done) els.pinCurrentHint.textContent = t("currentDone");
  else els.pinCurrentHint.textContent = tab.title || hostOf(tab.url ?? "");
}

/**
 * Fila común del grupo guardado y de las pestañas abiertas.
 * @param {{ url: string, title?: string, tooltip: string }} item
 * @param {HTMLButtonElement} action
 */
function renderRow(item, action) {
  const li = document.createElement("li");

  const icon = document.createElement("img");
  icon.src = faviconUrl(item.url);
  icon.alt = "";
  icon.width = 16;
  icon.height = 16;

  const text = document.createElement("span");
  text.className = "entry-text";
  const title = document.createElement("span");
  title.className = "entry-title";
  title.textContent = item.title || hostOf(item.url);
  const host = document.createElement("span");
  host.className = "entry-host";
  host.textContent = hostOf(item.url);
  text.append(title, host);
  text.title = item.tooltip;

  action.type = "button";
  action.disabled = state.busy;
  li.append(icon, text, action);
  return li;
}

/**
 * @param {Entry} entry
 * @param {number} index
 */
function renderEntry(entry, index) {
  const remove = document.createElement("button");
  remove.className = "remove";
  remove.textContent = "×";
  remove.title = t("removeTitle");
  remove.setAttribute("aria-label", t("removeLabel", [entry.title || hostOf(entry.url)]));
  remove.addEventListener("click", () =>
    run(async () => {
      await setGroup(state.group.filter((_, i) => i !== index));
    }),
  );
  const tooltip = entry.finalUrl ? `${entry.url}\n→ ${entry.finalUrl}` : entry.url;
  return renderRow({ url: entry.url, title: entry.title, tooltip }, remove);
}

/** @param {chrome.tabs.Tab} tab */
function renderOpenTab(tab) {
  const url = tab.url || tab.pendingUrl || "";
  const pin = document.createElement("button");
  pin.className = "small";
  pin.textContent = t("pinButton");
  pin.setAttribute("aria-label", t("pinLabel", [tab.title || hostOf(url)]));
  pin.addEventListener("click", () => run(() => pinAndAdd(tab.id)));
  return renderRow({ url, title: tab.title, tooltip: url }, pin);
}

/**
 * Pide al fondo de la extensión que haga algo y devuelve su resultado.
 * @param {Record<string, unknown>} message
 */
async function ask(message) {
  const res = await chrome.runtime.sendMessage(message);
  if (!res?.ok) throw new Error(res?.error ?? t("noResponse"));
  return res;
}

/** @param {number | undefined} tabId */
async function pinAndAdd(tabId) {
  const { result } = await ask({ type: "pinAndAdd", tabId });
  if (result.pinned && result.added) showStatus(t("pinnedAdded"));
  else if (result.pinned) showStatus(t("pinnedOnly"));
  else if (result.added) showStatus(t("addedOne"));
  else showStatus(t("currentDone"));
}

/** @param {string} url */
function faviconUrl(url) {
  const u = new URL(chrome.runtime.getURL("/_favicon/"));
  u.searchParams.set("pageUrl", url);
  u.searchParams.set("size", "32");
  return u.href;
}

/** @param {string} url */
function hostOf(url) {
  try {
    return new URL(url).host || url;
  } catch {
    return url;
  }
}

/**
 * @param {string} text
 * @param {"ok" | "error"} [kind]
 */
function showStatus(text, kind = "ok") {
  els.status.textContent = text;
  els.status.dataset.kind = kind;
  els.status.hidden = false;
}

/**
 * Ejecuta una acción con el popup ocupado y vuelve a pintar. El indicador se
 * libera en `finally`: si se quedara puesto, todos los botones quedarían muertos.
 * @param {() => Promise<void>} action
 */
async function run(action) {
  state.busy = true;
  state.confirmingSave = false;
  render();
  try {
    await action();
    await Promise.all([loadSettings(), loadTabs()]);
  } catch (err) {
    showStatus(err instanceof Error ? err.message : String(err), "error");
  } finally {
    state.busy = false;
    render();
  }
}

els.restore.addEventListener("click", () =>
  run(async () => {
    const res = await ask({ type: "restore", windowId: state.windowId });
    showStatus(res.text, res.result.failed ? "error" : "ok");
  }),
);

els.pinCurrent.addEventListener("click", () => run(() => pinAndAdd(currentTab()?.id)));

els.missingAdd.addEventListener("click", () =>
  run(async () => {
    const { result } = await ask({ type: "addPinned", windowId: state.windowId });
    showStatus(result.added === 1 ? t("addedOne") : t("addedCount", [result.added]));
  }),
);

els.autoload.addEventListener("change", () => {
  // Leer antes de run(): su primer render() repinta el checkbox con el valor viejo.
  const next = els.autoload.checked;
  state.autoLoad = next;
  run(async () => {
    await setAutoLoad(next);
  });
});

els.save.addEventListener("click", () => {
  if (state.group.length > 0 && !state.confirmingSave) {
    state.confirmingSave = true;
    render();
    return;
  }
  run(async () => {
    await loadTabs();
    const entries = entriesFromTabs(state.tabs);
    await setGroup(entries);
    showStatus(entries.length === 1 ? t("savedOne") : t("savedCount", [entries.length]));
  });
});

// La URL final de una pestaña se registra mientras carga; si el popup está
// abierto, refrescar.
chrome.storage.onChanged.addListener((_changes, area) => {
  if (area !== "sync" || state.busy) return;
  void loadSettings().then(render);
});

// Fijar, cerrar o navegar con el popup abierto cambia lo que hay que mostrar.
function refreshTabs() {
  if (!state.busy) void loadTabs().then(render);
}
chrome.tabs.onUpdated.addListener((_id, change) => {
  if ("pinned" in change || change.url || change.title) refreshTabs();
});
chrome.tabs.onRemoved.addListener(refreshTabs);
chrome.tabs.onCreated.addListener(refreshTabs);

init().catch((err) => showStatus(err instanceof Error ? err.message : String(err), "error"));
