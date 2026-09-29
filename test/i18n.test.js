import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { describeResult } from "../extension/lib/plan.js";
import { LOCALES_DIR, loadMessages, translator } from "./locales.js";

const EXT = resolve(import.meta.dirname, "../extension");
const LANGS = readdirSync(LOCALES_DIR);
const base = loadMessages("en");

/** Claves que usa el código: t("x"), plural(t, "x", …), data-i18n="x", __MSG_x__. */
function keysUsedInCode() {
  const files = ["background.js", "popup.js", "popup.html", "manifest.json"].map((f) =>
    readFileSync(resolve(EXT, f), "utf8"),
  );
  const keys = new Set();
  for (const src of files) {
    for (const [, k] of src.matchAll(/\bt\("([A-Za-z0-9_]+)"/g)) keys.add(k);
    for (const [, k] of src.matchAll(/data-i18n="([A-Za-z0-9_]+)"/g)) keys.add(k);
    for (const [, k] of src.matchAll(/__MSG_([A-Za-z0-9_]+)__/g)) keys.add(k);
    for (const [, k] of src.matchAll(/plural\(t, "([A-Za-z0-9_]+)"/g)) {
      keys.add(`${k}One`);
      keys.add(`${k}Count`);
    }
    // t(cond ? "a" : "b")
    for (const [, a, b] of src.matchAll(/\bt\([^()]*\? "([A-Za-z0-9_]+)" : "([A-Za-z0-9_]+)"\)/g)) {
      keys.add(a);
      keys.add(b);
    }
  }
  return keys;
}

describe("traducciones", () => {
  it("hay inglés (por defecto) y español", () => {
    expect(LANGS.sort()).toEqual(["en", "es"]);
    const manifest = JSON.parse(readFileSync(resolve(EXT, "manifest.json"), "utf8"));
    expect(manifest.default_locale).toBe("en");
  });

  it("todas las claves que usa el código existen", () => {
    const used = keysUsedInCode();
    expect(used.size).toBeGreaterThan(20);
    const missing = [...used].filter((k) => !(k in base));
    expect(missing).toEqual([]);
  });

  it("no sobran claves sin usar", () => {
    const used = keysUsedInCode();
    // plan.js arma estas por prefijo en describeResult.
    const byPrefix = (/** @type {string} */ k) => k.startsWith("result");
    expect(Object.keys(base).filter((k) => !used.has(k) && !byPrefix(k))).toEqual([]);
  });

  for (const lang of LANGS) {
    it(`[${lang}] mismas claves y mismos placeholders que el inglés`, () => {
      const m = loadMessages(lang);
      expect(Object.keys(m).sort()).toEqual(Object.keys(base).sort());
      for (const key of Object.keys(base)) {
        // Mismo nombre → mismo $n: si no, al traducir se cruzarían los valores.
        expect(m[key].placeholders ?? {}, `${lang}.${key}`).toEqual(base[key].placeholders ?? {});
        const used = [...m[key].message.matchAll(/\$([A-Z]+)\$/g)].map((x) => x[1].toLowerCase());
        expect(new Set(used), `${lang}.${key}`).toEqual(
          new Set(Object.keys(base[key].placeholders ?? {})),
        );
      }
    });

    it(`[${lang}] respeta los límites de la Chrome Web Store`, () => {
      const m = loadMessages(lang);
      expect(m.extName.message.length).toBeLessThanOrEqual(75);
      expect(m.extDescription.message.length).toBeLessThanOrEqual(132);
    });
  }
});

describe("describeResult", () => {
  const es = translator("es");
  const en = translator("en");

  it("en español, con singular y plural", () => {
    expect(describeResult({ opened: 2, pinned: 1, kept: 1, failed: 0 }, es)).toBe(
      "2 abiertas, 1 fijada, 1 ya estaba.",
    );
    expect(describeResult({ opened: 0, pinned: 0, kept: 3, failed: 0 }, es)).toBe(
      "Ya estaban todas.",
    );
    expect(describeResult({ opened: 0, pinned: 0, kept: 0, failed: 0 }, es)).toBe(
      "No hay pestañas guardadas.",
    );
    expect(describeResult({ opened: 1, pinned: 0, kept: 0, failed: 2 }, es)).toBe(
      "1 abierta, 2 con error.",
    );
  });

  it("en inglés", () => {
    expect(describeResult({ opened: 2, pinned: 1, kept: 3, failed: 0 }, en)).toBe(
      "2 opened, 1 pinned, 3 already open.",
    );
    expect(describeResult({ opened: 0, pinned: 0, kept: 3, failed: 0 }, en)).toBe(
      "All already open.",
    );
  });
});
