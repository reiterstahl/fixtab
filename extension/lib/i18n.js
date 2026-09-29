// Traducciones con chrome.i18n (extension/_locales). El idioma lo elige el
// navegador; si no hay traducción para él, se usa el inglés (default_locale).

/** @typedef {(key: string, subs?: (string | number)[]) => string} Translate */

/** @type {Translate} */
export const t = (key, subs) => chrome.i18n.getMessage(key, subs?.map(String)) || key;

/**
 * Elige la variante singular ("…One") o plural ("…Count", con $COUNT$).
 * Suficiente para inglés y español; otros idiomas pueden necesitar más formas.
 * @param {Translate} translate
 * @param {string} base
 * @param {number} n
 */
export function plural(translate, base, n) {
  return n === 1 ? translate(`${base}One`) : translate(`${base}Count`, [n]);
}
