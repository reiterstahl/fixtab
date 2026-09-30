// Genera las imágenes del README y de la Chrome Web Store a partir del popup
// real, en inglés y español.
//
//   docs/images/popup-{en,es}-{light,dark}.png   capturas del popup (README)
//   store/{en,es}/screenshot-{1,2,3}.png          1280×800 para la ficha
//   store/{en,es}/promo-small.png                 440×280 (tile promocional)
//
// Uso: pnpm assets   (necesita red: abre sitios públicos para tener sus favicons)

import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium } from "playwright";

const ROOT = resolve(import.meta.dirname, "..");
const EXT = join(ROOT, "extension");
const DOCS = join(ROOT, "docs/images");
const STORE = join(ROOT, "store");

// Sitios públicos que cargan sin iniciar sesión, para que los favicons sean reales.
const GROUP = [
  { url: "https://github.com/", title: "GitHub" },
  { url: "https://www.youtube.com/", title: "YouTube" },
  { url: "https://en.wikipedia.org/wiki/Main_Page", title: "Wikipedia" },
  { url: "https://open.spotify.com/", title: "Spotify" },
  { url: "https://news.ycombinator.com/", title: "Hacker News" },
];

// Pestañas abiertas sin fijar, para mostrar «fijar esta pestaña» y la lista.
const LOOSE = ["https://developer.mozilla.org/en-US/", "https://www.typescriptlang.org/"];

const COPY = {
  en: {
    hero: "Your pinned tabs,<br />back in one click.",
    heroSub:
      "Save the tabs you always keep pinned. Bring them back with a button, a keyboard shortcut, or automatically when your browser starts.",
    bullets: [
      "No duplicates — reuses tabs that are already open",
      "Keeps your order, even after redirects",
      "Collects no data. Nothing leaves your browser",
    ],
    second: "Open them at startup —<br />or only when you ask.",
    secondSub:
      "One switch decides. Close every window and open a new one: your pinned tabs are back.",
    secondBullets: [
      "Alt+Shift+P restores them without opening the popup",
      "Syncs with your browser account",
    ],
    third: "Pin a tab and<br />it joins the group.",
    thirdSub:
      "Pin any open tab from FixTab and it is remembered for next time. Tabs you pinned by hand can join with one click too.",
    thirdBullets: [
      "One button for the tab you are on",
      "Also from the right-click menu or Alt+Shift+F",
    ],
    tile: "Pinned tabs, back in one click",
  },
  es: {
    hero: "Tus pestañas fijadas,<br />de vuelta con un clic.",
    heroSub:
      "Guarda las pestañas que siempre tienes fijadas. Recupéralas con un botón, un atajo de teclado o solas al abrir el navegador.",
    bullets: [
      "Sin duplicados: reutiliza las que ya están abiertas",
      "Respeta tu orden, incluso con redirecciones",
      "No recopila datos. Nada sale de tu navegador",
    ],
    second: "Al iniciar, o solo<br />cuando las pidas.",
    secondSub:
      "Un switch lo decide. Cierra todas las ventanas y abre una nueva: tus fijadas vuelven.",
    secondBullets: [
      "Alt+Shift+P las restaura sin abrir el popup",
      "Se sincroniza con tu cuenta del navegador",
    ],
    third: "Fija una pestaña<br />y entra al grupo.",
    thirdSub:
      "Fija cualquier pestaña abierta desde FixTab y queda recordada para la próxima vez. Las que fijaste a mano también se suman con un clic.",
    thirdBullets: [
      "Un botón para la pestaña en la que estás",
      "También con clic derecho o Alt+Shift+F",
    ],
    tile: "Tus fijadas, de vuelta con un clic",
  },
};

const iconData = `data:image/png;base64,${readFileSync(join(EXT, "icons/icon128.png")).toString("base64")}`;

/** @param {"en" | "es"} lang */
async function popupShots(lang) {
  const dir = mkdtempSync(join(tmpdir(), `fixtab-assets-${lang}-`));
  const context = await chromium.launchPersistentContext(dir, {
    channel: "chromium",
    headless: true,
    locale: lang,
    deviceScaleFactor: 2,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, `--lang=${lang}`],
  });
  try {
    const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
    const extId = new URL(sw.url()).host;

    // Visitar los sitios una vez para que el navegador guarde sus favicons.
    const warm = await Promise.all(GROUP.map(() => context.newPage()));
    await Promise.all(
      warm.map((p, i) =>
        p.goto(GROUP[i].url, { waitUntil: "load", timeout: 45_000 }).catch(() => {}),
      ),
    );
    await new Promise((r) => setTimeout(r, 1500));
    await Promise.all(warm.map((p) => p.close()));

    // Dos ya fijadas; al restaurar se abren las otras tres.
    await sw.evaluate(async (group) => {
      await chrome.storage.sync.set({ group, autoLoad: true });
      for (const e of group.slice(0, 2))
        await chrome.tabs.create({ url: e.url, pinned: true, active: false });
    }, GROUP);

    // Dos pestañas sueltas: una hace de «esta pestaña» y la otra queda en la
    // lista plegable de abiertas.
    const loose = [];
    for (const url of LOOSE) {
      const page = await context.newPage();
      await page.goto(url, { waitUntil: "load", timeout: 45_000 }).catch(() => {});
      loose.push(page);
    }
    await new Promise((r) => setTimeout(r, 1000));
    const currentId = await sw.evaluate(
      async (host) =>
        (await chrome.tabs.query({})).find((tab) => tab.url?.includes(host) && !tab.pinned)?.id,
      new URL(LOOSE[0]).host,
    );

    const popup = await context.newPage();
    await popup.setViewportSize({ width: 320, height: 700 });
    await popup.goto(`chrome-extension://${extId}/popup.html?tab=${currentId}`);
    await popup.locator("#restore").click();
    await popup.locator("#status").filter({ hasText: /\S/ }).waitFor();
    await popup.waitForFunction(() =>
      [...document.images].every((img) => img.complete && img.naturalWidth > 0),
    );
    await popup.mouse.move(0, 0);
    // Chromium cargado con --load-extension no asigna atajos; en una instalación
    // normal quedan los sugeridos y el popup muestra estos mismos mensajes.
    await popup.evaluate(() => {
      const el = document.getElementById("shortcut");
      if (el)
        el.textContent = [
          chrome.i18n.getMessage("shortcutRestore", ["Alt+Shift+P"]),
          chrome.i18n.getMessage("shortcutPin", ["Alt+Shift+F"]),
        ].join(" · ");
    });

    const shots = {};
    for (const scheme of /** @type {const} */ (["light", "dark"])) {
      await popup.emulateMedia({ colorScheme: scheme });
      const height = await popup.evaluate(() => document.body.scrollHeight);
      await popup.setViewportSize({ width: 320, height });
      const path = join(DOCS, `popup-${lang}-${scheme}.png`);
      await popup.screenshot({ path });
      shots[scheme] = path;
    }

    // Tercera captura: la lista de otras pestañas abiertas, desplegada.
    await popup.emulateMedia({ colorScheme: "dark" });
    await popup.locator("#others-title").click();
    await popup.waitForFunction(() =>
      [...document.images].every((img) => img.complete && img.naturalWidth > 0),
    );
    await popup.mouse.move(0, 0);
    await popup.setViewportSize({
      width: 320,
      height: await popup.evaluate(() => document.body.scrollHeight),
    });
    shots.others = join(DOCS, `popup-${lang}-others.png`);
    await popup.screenshot({ path: shots.others });
    return shots;
  } finally {
    await context.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

/** @param {string} path */
const dataUrl = (path) => `data:image/png;base64,${readFileSync(path).toString("base64")}`;

const FONT = `<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700;800&display=swap" rel="stylesheet">`;

const BASE_CSS = `
  * { box-sizing: border-box; margin: 0; }
  body { font-family: Inter, system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
`;

/**
 * @param {{ title: string, sub: string, bullets: string[], popup: string, dark: boolean }} o
 */
function screenshotHtml(o) {
  const bg = o.dark ? "#141416" : "#fbf7f4";
  const text = o.dark ? "#f4f4f5" : "#18181b";
  const muted = o.dark ? "#a1a1aa" : "#52525b";
  const glow = o.dark ? "rgba(252,97,33,.28)" : "rgba(252,97,33,.18)";
  return `<!doctype html><html><head><meta charset="utf-8">${FONT}<style>${BASE_CSS}
    body { width: 1280px; height: 800px; background: ${bg}; color: ${text}; overflow: hidden;
      display: grid; grid-template-columns: minmax(0, 1fr) 420px; align-items: center; gap: 64px; padding: 0 96px; position: relative; }
    body::before { content: ""; position: absolute; right: -120px; top: 80px; width: 720px; height: 720px;
      background: radial-gradient(circle, ${glow}, transparent 65%); }
    .brand { display: flex; align-items: center; gap: 12px; font-weight: 700; font-size: 22px; margin-bottom: 40px; }
    .brand img { width: 44px; height: 44px; }
    h1 { font-size: 56px; line-height: 1.08; font-weight: 800; letter-spacing: -0.025em; }
    p { margin-top: 24px; font-size: 21px; line-height: 1.5; color: ${muted}; max-width: 560px; }
    ul { list-style: none; padding: 0; margin-top: 32px; display: grid; gap: 14px; }
    li { font-size: 19px; font-weight: 500; display: flex; gap: 12px; align-items: center; }
    li::before { content: ""; width: 10px; height: 10px; border-radius: 3px; background: #fc6121; flex: none; }
    .shot { position: relative; justify-self: center; }
    .shot img { height: 700px; border-radius: 14px; display: block;
      box-shadow: 0 30px 80px rgba(0,0,0,${o.dark ? ".55" : ".18"}), 0 0 0 1px rgba(${o.dark ? "255,255,255,.08" : "0,0,0,.08"}); }
  </style></head><body>
    <div>
      <div class="brand"><img src="${iconData}" alt="">FixTab</div>
      <h1>${o.title}</h1>
      <p>${o.sub}</p>
      <ul>${o.bullets.map((b) => `<li>${b}</li>`).join("")}</ul>
    </div>
    <div class="shot"><img src="${o.popup}" alt=""></div>
  </body></html>`;
}

/** @param {string} tagline */
function tileHtml(tagline) {
  return `<!doctype html><html><head><meta charset="utf-8">${FONT}<style>${BASE_CSS}
    body { width: 440px; height: 280px; overflow: hidden; background: #141416; color: #f4f4f5;
      display: grid; place-content: center; justify-items: center; gap: 18px; text-align: center; position: relative; }
    body::before { content: ""; position: absolute; inset: -40% -20% auto; height: 420px;
      background: radial-gradient(circle, rgba(252,97,33,.35), transparent 60%); }
    img { width: 88px; height: 88px; position: relative; }
    h1 { font-size: 34px; font-weight: 800; letter-spacing: -0.02em; position: relative; }
    p { font-size: 17px; color: #d4d4d8; position: relative; font-weight: 500; }
  </style></head><body>
    <img src="${iconData}" alt=""><h1>FixTab</h1><p>${tagline}</p>
  </body></html>`;
}

/**
 * La tienda pide PNG de 24 bits sin canal alfa; `pnpm assets` los aplana
 * después con scripts/flatten_png.py.
 * @param {import("playwright").Browser} browser
 * @param {string} html
 * @param {number} width
 * @param {number} height
 * @param {string} path
 */
async function render(browser, html, width, height, path) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path });
  await page.close();
}

mkdirSync(DOCS, { recursive: true });
const browser = await chromium.launch({ channel: "chromium", headless: true });
try {
  for (const lang of /** @type {const} */ (["en", "es"])) {
    const shots = await popupShots(lang);
    const c = COPY[lang];
    const out = join(STORE, lang);
    mkdirSync(out, { recursive: true });
    await render(
      browser,
      screenshotHtml({
        title: c.hero,
        sub: c.heroSub,
        bullets: c.bullets,
        popup: dataUrl(shots.dark),
        dark: true,
      }),
      1280,
      800,
      join(out, "screenshot-1.png"),
    );
    await render(
      browser,
      screenshotHtml({
        title: c.second,
        sub: c.secondSub,
        bullets: c.secondBullets,
        popup: dataUrl(shots.light),
        dark: false,
      }),
      1280,
      800,
      join(out, "screenshot-2.png"),
    );
    await render(
      browser,
      screenshotHtml({
        title: c.third,
        sub: c.thirdSub,
        bullets: c.thirdBullets,
        popup: dataUrl(shots.others),
        dark: true,
      }),
      1280,
      800,
      join(out, "screenshot-3.png"),
    );
    await render(browser, tileHtml(c.tile), 440, 280, join(out, "promo-small.png"));
    console.log(`${lang}: listo`);
  }
} finally {
  await browser.close();
}
