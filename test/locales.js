// Emula chrome.i18n.getMessage sobre los messages.json reales, para los tests.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export const LOCALES_DIR = resolve(import.meta.dirname, "../extension/_locales");

/** @param {string} lang */
export function loadMessages(lang) {
  return JSON.parse(readFileSync(resolve(LOCALES_DIR, lang, "messages.json"), "utf8"));
}

/** @param {string} lang */
export function translator(lang) {
  const messages = loadMessages(lang);
  return (/** @type {string} */ key, /** @type {(string|number)[]} */ subs = []) => {
    const m = messages[key];
    if (!m) throw new Error(`[${lang}] falta la clave ${key}`);
    return m.message.replace(/\$([A-Za-z0-9_]+)\$/g, (/** @type {string} */ _, name) => {
      const ph = m.placeholders?.[name.toLowerCase()];
      if (!ph) throw new Error(`[${lang}] ${key}: placeholder ${name} sin definir`);
      return ph.content.replace(/\$(\d)/, (/** @type {string} */ _, i) =>
        String(subs[Number(i) - 1]),
      );
    });
  };
}
