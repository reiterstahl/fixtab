// Service worker de FixTab: restaura el grupo de pestañas fijadas al arrancar
// Chrome (si el switch está encendido), desde el popup o con el atajo.

import { t } from "./lib/i18n.js";
import { addToGroup, canAdd, describeResult, planRestore, urlKey } from "./lib/plan.js";
import { getSettings, setGroup } from "./lib/store.js";

// Al arrancar, Chrome puede seguir reabriendo la sesión anterior ("Continuar
// donde lo dejaste") cuando nos llega onStartup. Esperamos a que el número de
// pestañas deje de cambiar para no duplicar las que él mismo restaura.
const SETTLE_INTERVAL_MS = 500;
const SETTLE_STABLE_CHECKS = 3;
const SETTLE_MAX_MS = 10_000;
// El service worker muere a los ~30 s sin actividad; quedarse por debajo.
const WINDOW_WAIT_MAX_MS = 20_000;

/** @type {Promise<RestoreResult> | null} */
let running = null;

/** @typedef {{ opened: number, pinned: number, kept: number, failed: number }} RestoreResult */

const sleep = (/** @type {number} */ ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Restaura el grupo en una ventana. Una sola a la vez: el arranque y un clic
 * simultáneo abrirían todo dos veces.
 * @param {number} windowId
 * @returns {Promise<RestoreResult>}
 */
async function restore(windowId) {
  if (running) throw new Error(t("restoreBusy"));
  running = doRestore(windowId);
  try {
    const result = await running;
    await showBadge(result.failed ? t("badgeFailed", [result.failed]) : null);
    return result;
  } catch (err) {
    await showBadge(t("badgeError", [errorText(err)]));
    throw err;
  } finally {
    running = null;
  }
}

/** @param {number} windowId */
async function doRestore(windowId) {
  const { group } = await getSettings();
  const tabs = await chrome.tabs.query({ windowId });
  const steps = planRestore(group, tabs);
  const result = { opened: 0, pinned: 0, kept: 0, failed: 0 };

  // Las del grupo van primero, en el orden guardado. Las fijadas que no son
  // del grupo quedan después, sin tocarlas.
  for (const [position, step] of steps.entries()) {
    try {
      if (step.kind === "open") {
        const tab = await chrome.tabs.create({
          windowId,
          url: step.url,
          pinned: true,
          index: position,
          active: false,
        });
        if (tab.id !== undefined) await trackFinalUrl(tab.id, step.url);
        result.opened++;
      } else {
        if (step.kind === "pin") await chrome.tabs.update(step.tabId, { pinned: true });
        await chrome.tabs.move(step.tabId, { index: position });
        result[step.kind === "pin" ? "pinned" : "kept"]++;
      }
    } catch (err) {
      console.warn("FixTab: no se pudo restaurar", group[step.entryIndex]?.url, err);
      result.failed++;
    }
  }
  console.info("FixTab:", describeResult(result, t));
  return result;
}

// --- URL final ------------------------------------------------------------
// Muchas URLs redirigen (gmail.com → mail.google.com/mail/u/0/). Guardamos a
// dónde terminó cada pestaña abierta por nosotros para reconocerla la próxima
// vez y no duplicarla. El mapa vive en storage.session porque el service
// worker puede dormirse mientras la página carga.

/**
 * @param {number} tabId
 * @param {string} entryUrl
 */
async function trackFinalUrl(tabId, entryUrl) {
  await chrome.storage.session.set({ [`track:${tabId}`]: entryUrl });
  // Una página rápida puede haber terminado antes de que registráramos el id.
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (tab?.status === "complete" && tab.url) await recordFinalUrl(tabId, tab.url);
}

// Varias cosas leen y reescriben el grupo (URL final de pestañas que terminan
// de cargar casi a la vez, fijar desde el popup, el atajo…): van en fila para
// no pisarse.
/** @type {Promise<unknown>} */
let groupQueue = Promise.resolve();

/**
 * @param {(group: import("./lib/plan.js").Entry[]) => import("./lib/plan.js").Entry[] | undefined} change
 *   devuelve el grupo nuevo, o undefined si no hay nada que guardar
 */
function updateGroup(change) {
  const run = groupQueue.then(async () => {
    const { group } = await getSettings();
    const next = change(group);
    if (next) await setGroup(next);
  });
  groupQueue = run.catch(() => {});
  return run;
}

/**
 * @param {number} tabId
 * @param {string} finalUrl
 */
async function recordFinalUrl(tabId, finalUrl) {
  const key = `track:${tabId}`;
  const { [key]: entryUrl } = await chrome.storage.session.get(key);
  if (!entryUrl) return;
  await chrome.storage.session.remove(key);

  await updateGroup((group) => {
    const entry = group.find((e) => e.url === entryUrl);
    if (!entry) return undefined;
    const next = urlKey(finalUrl) === urlKey(entry.url) ? undefined : finalUrl;
    if (next === entry.finalUrl) return undefined;
    if (next) entry.finalUrl = next;
    else delete entry.finalUrl;
    return group;
  }).catch((err) => console.warn("FixTab: URL final", err));
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.url) void recordFinalUrl(tabId, tab.url);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  void chrome.storage.session.remove(`track:${tabId}`);
});

// --- Arranque -------------------------------------------------------------

chrome.runtime.onStartup.addListener(() => {
  void autoRestore();
});

// Cerrar todas las ventanas no siempre cierra Chrome: en macOS sigue vivo, y en
// Windows también si está activo «Seguir ejecutando aplicaciones en segundo
// plano». Al abrir una ventana de nuevo no llega onStartup, pero para la
// persona eso es abrir Chrome: la primera ventana normal cuando no había
// ninguna cuenta como arranque.
chrome.windows.onCreated.addListener(
  (win) => {
    if (win.type !== "normal" || win.incognito || win.id === undefined) return;
    const windowId = win.id;
    void chrome.windows.getAll({ windowTypes: ["normal"] }).then((wins) => {
      if (wins.filter((w) => !w.incognito).length === 1) void autoRestore(windowId);
    });
  },
  { windowTypes: ["normal"] },
);

/** @type {Promise<void> | null} */
let autoRestoreInFlight = null;

/**
 * Restauración automática. Al arrancar de verdad llegan onStartup y la primera
 * ventana casi a la vez: se juntan en una sola ejecución.
 * @param {number} [windowId] ventana destino; si no, la última enfocada
 */
function autoRestore(windowId) {
  autoRestoreInFlight ??= startupRestore(windowId)
    .catch((err) => console.error("FixTab: arranque", err))
    .finally(() => {
      autoRestoreInFlight = null;
    });
  return autoRestoreInFlight;
}

// Para el e2e: una extensión cargada con --load-extension se reinstala en cada
// arranque y nunca recibe onStartup, así que la prueba llama a esto directamente.
// Solo es accesible desde el propio service worker.
Object.assign(globalThis, { fixtabStartupForTests: autoRestore });

/** @param {number} [windowId] */
async function startupRestore(windowId) {
  const { autoLoad, group } = await getSettings();
  if (!autoLoad || group.length === 0) return;
  await waitForNormalWindow();
  await waitForTabsToSettle();
  // Si justo hay una restauración manual en marcha, ella ya se encarga.
  if (running) return;
  const target = await targetWindow(windowId);
  if (target !== undefined) await restore(target);
}

/**
 * La ventana pedida si sigue abierta; si no, la última enfocada.
 * @param {number} [windowId]
 */
async function targetWindow(windowId) {
  if (windowId !== undefined) {
    const win = await chrome.windows.get(windowId).catch(() => null);
    if (win) return windowId;
  }
  return (await chrome.windows.getLastFocused({ windowTypes: ["normal"] })).id;
}

async function waitForNormalWindow() {
  /** @type {(w: chrome.windows.Window) => void} */
  let onCreated = () => {};
  /** @type {Promise<void>} */
  const created = new Promise((resolve) => {
    onCreated = (w) => {
      if (w.type === "normal") resolve();
    };
  });
  // Escuchar antes de consultar, para no perder una ventana creada en medio.
  chrome.windows.onCreated.addListener(onCreated);
  try {
    const wins = await chrome.windows.getAll({ windowTypes: ["normal"] });
    if (wins.length === 0) await Promise.race([created, sleep(WINDOW_WAIT_MAX_MS)]);
  } finally {
    chrome.windows.onCreated.removeListener(onCreated);
  }
}

async function waitForTabsToSettle() {
  const start = Date.now();
  let last = -1;
  let stable = 0;
  while (Date.now() - start < SETTLE_MAX_MS) {
    const count = (await chrome.tabs.query({})).length;
    stable = count === last ? stable + 1 : 0;
    last = count;
    if (stable >= SETTLE_STABLE_CHECKS) return;
    await sleep(SETTLE_INTERVAL_MS);
  }
}

// --- Fijar y agregar al grupo ---------------------------------------------

/** @typedef {{ pinned: boolean, added: number }} AddResult */

const OWN_PREFIX = chrome.runtime.getURL("");

/**
 * Fija una pestaña abierta y la agrega al final del grupo. Si ya estaba fijada
 * o ya estaba en el grupo, hace solo lo que falte.
 * @param {number} tabId
 * @returns {Promise<AddResult>}
 */
async function pinAndAdd(tabId) {
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (!tab) throw new Error(t("tabGone"));
  if (!canAdd(tab, OWN_PREFIX)) throw new Error(t("currentUnavailable"));

  const pinned = !tab.pinned;
  if (pinned) await chrome.tabs.update(tabId, { pinned: true });
  return { pinned, added: await addTabs([tab]) };
}

/**
 * Agrega al grupo las pestañas fijadas de una ventana que todavía no están.
 * @param {number} windowId
 * @returns {Promise<AddResult>}
 */
async function addPinned(windowId) {
  const tabs = await chrome.tabs.query({ windowId, pinned: true });
  return { pinned: false, added: await addTabs(tabs.filter((tab) => canAdd(tab, OWN_PREFIX))) };
}

/**
 * @param {chrome.tabs.Tab[]} tabs
 * @returns {Promise<number>} cuántas se agregaron
 */
async function addTabs(tabs) {
  let added = 0;
  await updateGroup((group) => {
    const next = addToGroup(group, tabs);
    added = next.length - group.length;
    return added ? next : undefined;
  });
  return added;
}

// --- Popup, atajos y menú -------------------------------------------------

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  /** @type {Promise<Record<string, unknown>> | undefined} */
  let work;
  if (msg?.type === "restore") {
    work = restore(msg.windowId).then((result) => ({ result, text: describeResult(result, t) }));
  } else if (msg?.type === "pinAndAdd") {
    work = pinAndAdd(msg.tabId).then((result) => ({ result }));
  } else if (msg?.type === "addPinned") {
    work = addPinned(msg.windowId).then((result) => ({ result }));
  }
  if (!work) return false;
  work.then(
    (payload) => sendResponse({ ok: true, ...payload }),
    (err) => sendResponse({ ok: false, error: errorText(err) }),
  );
  return true; // respuesta asíncrona
});

chrome.commands.onCommand.addListener(async (command, tab) => {
  try {
    if (command === "restore-pinned") {
      const windowId =
        tab?.windowId ?? (await chrome.windows.getLastFocused({ windowTypes: ["normal"] })).id;
      if (windowId !== undefined) await restore(windowId);
    } else if (command === "pin-current") {
      await pinActiveTab(tab);
    }
  } catch (err) {
    console.error("FixTab: atajo", err);
  }
});

/**
 * Sin popup abierto no hay dónde mostrar un error: va al aviso del icono.
 * @param {chrome.tabs.Tab} [tab]
 */
async function pinActiveTab(tab) {
  const target = tab ?? (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0];
  if (target?.id === undefined) return;
  try {
    await pinAndAdd(target.id);
    await showBadge(null);
  } catch (err) {
    await showBadge(errorText(err));
  }
}

// El menú se registra al instalar o actualizar, y de nuevo al arrancar por si
// cambió el idioma del navegador.
const MENU_ID = "pin-add";

function registerMenu() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create(
      { id: MENU_ID, title: t("menuPinAdd"), contexts: ["page", "action"] },
      // Si onInstalled y onStartup coinciden, el segundo create choca con el id
      // ya creado; leer lastError evita el aviso de error sin atender.
      () => void chrome.runtime.lastError,
    );
  });
}

chrome.runtime.onInstalled.addListener(registerMenu);
chrome.runtime.onStartup.addListener(registerMenu);

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === MENU_ID) void pinActiveTab(tab);
});

// --- Aviso en el icono ----------------------------------------------------
// El arranque y el atajo no tienen popup abierto: si algo falla, el icono
// muestra "!" y el motivo al pasar el mouse. Se limpia en la próxima
// restauración correcta.

/** @param {string | null} problem */
async function showBadge(problem) {
  await chrome.action.setBadgeText({ text: problem ? "!" : "" });
  await chrome.action.setBadgeBackgroundColor({ color: "#d93025" });
  await chrome.action.setTitle({ title: problem ? `FixTab — ${problem}` : "FixTab" });
}

/** @param {unknown} err */
function errorText(err) {
  return err instanceof Error ? err.message : String(err);
}
