// Configuración en chrome.storage.sync: te sigue a otras computadoras con la
// misma cuenta de Chrome.

/** @typedef {import("./plan.js").Entry} Entry */

const DEFAULTS = {
  /** @type {Entry[]} */
  group: [],
  autoLoad: true,
};

/** @returns {Promise<{ group: Entry[], autoLoad: boolean }>} */
export async function getSettings() {
  return /** @type {any} */ (await chrome.storage.sync.get(DEFAULTS));
}

/** @param {Entry[]} group */
export async function setGroup(group) {
  await chrome.storage.sync.set({ group });
}

/** @param {boolean} autoLoad */
export async function setAutoLoad(autoLoad) {
  await chrome.storage.sync.set({ autoLoad });
}
