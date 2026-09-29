import { entriesFromTabs } from "./lib/plan.js";
import { getSettings, setAutoLoad, setGroup } from "./lib/store.js";

/** @typedef {import("./lib/plan.js").Entry} Entry */

const $ = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));

const els = {
  restore: /** @type {HTMLButtonElement} */ ($("restore")),
  restoreHint: $("restore-hint"),
  status: $("status"),
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
  /** @type {chrome.tabs.Tab[]} */
  pinned: [],
  windowId: /** @type {number | undefined} */ (undefined),
  busy: false,
  confirmingSave: false,
};

async function init() {
  const win = await chrome.windows.getCurrent();
  state.windowId = win.id;
  await Promise.all([loadSettings(), loadPinned(), showShortcut()]);
  render();
}

async function loadSettings() {
  const s = await getSettings();
  state.group = s.group;
  state.autoLoad = s.autoLoad;
}

async function loadPinned() {
  state.pinned = await chrome.tabs.query({ windowId: state.windowId, pinned: true });
}

async function showShortcut() {
  const commands = await chrome.commands.getAll();
  const shortcut = commands.find((c) => c.name === "restore-pinned")?.shortcut;
  els.shortcut.textContent = shortcut
    ? `Atajo: ${shortcut}`
    : "Sin atajo de teclado. Se asigna en chrome://extensions/shortcuts.";
}

function render() {
  const n = state.group.length;
  const m = state.pinned.length;

  els.restore.disabled = state.busy || n === 0;
  els.restore.textContent = n ? `Restaurar fijadas (${n})` : "Restaurar fijadas";
  els.restoreHint.hidden = n > 0;
  els.restoreHint.textContent = "No hay grupo guardado todavía.";

  els.autoload.checked = state.autoLoad;
  els.autoload.disabled = state.busy;
  els.autoloadHint.textContent = state.autoLoad
    ? "Se cargan solas al abrir Chrome."
    : "Solo se cargan cuando pulsas «Restaurar».";

  els.groupTitle.textContent = n ? `Grupo guardado (${n})` : "Grupo guardado";
  els.empty.hidden = n > 0;
  els.group.replaceChildren(...state.group.map(renderEntry));

  els.save.disabled = state.busy || m === 0;
  els.save.classList.toggle("danger", state.confirmingSave);
  if (m === 0) {
    els.save.textContent = "Guardar las fijadas de esta ventana";
    els.saveHint.textContent = "Esta ventana no tiene pestañas fijadas.";
  } else if (state.confirmingSave) {
    els.save.textContent = "Confirmar: reemplazar el grupo";
    els.saveHint.textContent = `Pulsa de nuevo para cambiar las ${n} guardadas por las ${m} fijadas de esta ventana.`;
  } else {
    els.save.textContent = `Guardar las ${m} fijadas de esta ventana`;
    els.saveHint.textContent = n ? "Reemplaza el grupo guardado." : "";
  }
}

/**
 * @param {Entry} entry
 * @param {number} index
 */
function renderEntry(entry, index) {
  const li = document.createElement("li");

  const icon = document.createElement("img");
  icon.src = faviconUrl(entry.url);
  icon.alt = "";
  icon.width = 16;
  icon.height = 16;

  const text = document.createElement("span");
  text.className = "entry-text";
  const title = document.createElement("span");
  title.className = "entry-title";
  title.textContent = entry.title || hostOf(entry.url);
  const host = document.createElement("span");
  host.className = "entry-host";
  host.textContent = hostOf(entry.url);
  text.append(title, host);
  text.title = entry.finalUrl ? `${entry.url}\n→ ${entry.finalUrl}` : entry.url;

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "remove";
  remove.textContent = "×";
  remove.title = "Quitar del grupo";
  remove.setAttribute("aria-label", `Quitar ${title.textContent} del grupo`);
  remove.disabled = state.busy;
  remove.addEventListener("click", () =>
    run(async () => {
      await setGroup(state.group.filter((_, i) => i !== index));
    }),
  );

  li.append(icon, text, remove);
  return li;
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
    await Promise.all([loadSettings(), loadPinned()]);
  } catch (err) {
    showStatus(err instanceof Error ? err.message : String(err), "error");
  } finally {
    state.busy = false;
    render();
  }
}

els.restore.addEventListener("click", () =>
  run(async () => {
    const res = await chrome.runtime.sendMessage({ type: "restore", windowId: state.windowId });
    if (!res?.ok) throw new Error(res?.error ?? "No hubo respuesta del fondo de la extensión.");
    showStatus(res.text, res.result.failed ? "error" : "ok");
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
    await loadPinned();
    const entries = entriesFromTabs(state.pinned);
    await setGroup(entries);
    showStatus(
      entries.length === 1 ? "Guardada 1 pestaña." : `Guardadas ${entries.length} pestañas.`,
    );
  });
});

// La URL final de una pestaña se registra mientras carga; si el popup está
// abierto, refrescar.
chrome.storage.onChanged.addListener((_changes, area) => {
  if (area !== "sync" || state.busy) return;
  void loadSettings().then(render);
});

init().catch((err) => showStatus(err instanceof Error ? err.message : String(err), "error"));
