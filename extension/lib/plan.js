// Lógica pura de FixTab: decide qué hacer con cada pestaña guardada.
// No toca las APIs de Chrome para poder probarla con vitest.

import { plural } from "./i18n.js";

/**
 * @typedef {{ url: string, finalUrl?: string, title?: string }} Entry
 * @typedef {{ id?: number, url?: string, pendingUrl?: string, pinned: boolean }} TabLike
 * @typedef {{ kind: "open", entryIndex: number, url: string }
 *   | { kind: "pin" | "keep", entryIndex: number, tabId: number }} Step
 */

/**
 * Clave de comparación de una URL: sin #fragmento y sin "/" final.
 * `new URL` ya normaliza el host a minúsculas.
 * @param {string | undefined} raw
 * @returns {string | null}
 */
export function urlKey(raw) {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    u.hash = "";
    const href = u.href;
    return href.endsWith("/") ? href.slice(0, -1) : href;
  } catch {
    return raw;
  }
}

/**
 * Todas las formas con las que puede aparecer una entrada: la URL guardada y la
 * URL final a la que redirigió la última vez (gmail.com → mail.google.com/...).
 * @param {Entry} entry
 */
export function entryKeys(entry) {
  return new Set([urlKey(entry.url), urlKey(entry.finalUrl)].filter(Boolean));
}

/**
 * Formas con las que una pestaña abierta puede coincidir. `pendingUrl` cubre
 * las pestañas que todavía están cargando.
 * @param {TabLike} tab
 */
function tabKeys(tab) {
  return [urlKey(tab.url), urlKey(tab.pendingUrl)].filter(Boolean);
}

/**
 * Plan de restauración para una ventana.
 *
 * Por cada entrada, en el orden guardado:
 * - "keep": ya hay una pestaña fijada que coincide.
 * - "pin":  hay una pestaña abierta sin fijar que coincide; se fija en vez de duplicarla.
 * - "open": no está; hay que abrirla.
 *
 * Cada pestaña se usa una sola vez, así dos entradas con la misma URL abren dos
 * pestañas en lugar de reclamar la misma.
 *
 * @param {Entry[]} entries
 * @param {TabLike[]} tabs pestañas de la ventana destino
 * @returns {Step[]}
 */
export function planRestore(entries, tabs) {
  /** @type {Set<number>} */
  const claimed = new Set();
  return entries.map((entry, entryIndex) => {
    const keys = entryKeys(entry);
    const candidates = tabs.filter(
      (t) => t.id !== undefined && !claimed.has(t.id) && tabKeys(t).some((k) => keys.has(k)),
    );
    const match = candidates.find((t) => t.pinned) ?? candidates[0];
    if (match?.id === undefined) return { kind: "open", entryIndex, url: entry.url };
    claimed.add(match.id);
    return { kind: match.pinned ? "keep" : "pin", entryIndex, tabId: match.id };
  });
}

/**
 * Convierte las pestañas fijadas de una ventana en el grupo a guardar.
 * @param {(TabLike & { index: number, title?: string })[]} tabs
 * @returns {Entry[]}
 */
export function entriesFromTabs(tabs) {
  return tabs
    .filter((t) => t.pinned && (t.url || t.pendingUrl))
    .sort((a, b) => a.index - b.index)
    .map((t) => {
      const url = /** @type {string} */ (t.url || t.pendingUrl);
      return t.title ? { url, title: t.title } : { url };
    });
}

/**
 * Resumen legible del resultado de una restauración, en el idioma del navegador.
 * @param {{ opened: number, pinned: number, kept: number, failed: number }} r
 * @param {import("./i18n.js").Translate} t
 */
export function describeResult(r, t) {
  if (r.opened + r.pinned + r.kept + r.failed === 0) return t("resultNone");
  if (r.opened === 0 && r.pinned === 0 && r.failed === 0) return t("resultAllThere");
  const parts = [];
  if (r.opened) parts.push(plural(t, "resultOpened", r.opened));
  if (r.pinned) parts.push(plural(t, "resultPinned", r.pinned));
  if (r.kept) parts.push(plural(t, "resultKept", r.kept));
  if (r.failed) parts.push(t("resultFailedCount", [r.failed]));
  return parts.join(", ") + ".";
}
