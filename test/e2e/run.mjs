// Prueba de extremo a extremo en un Chromium real con la extensión cargada.
// Levanta un servidor HTTP local (sin red externa) y recorre: guardar desde el
// popup, restaurar sin duplicar, redirecciones, arranque con el switch
// encendido y apagado (incluida la carrera con la sesión que Chrome reabre).
//
// Uso: pnpm test:e2e   (la primera vez: pnpm exec playwright install chromium)

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium } from "playwright";

const EXT = process.env.FIXTAB_EXT ?? resolve(import.meta.dirname, "../../extension");
const SCREENSHOTS = process.env.FIXTAB_SCREENSHOTS; // carpeta opcional para capturas del popup

// --- Servidor local ---------------------------------------------------------

const server = createServer((req, res) => {
  if (req.url === "/redir") {
    res.writeHead(302, { Location: "/final#bandeja" });
    return res.end();
  }
  const name = (req.url ?? "/").slice(1) || "inicio";
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(`<!doctype html><title>Página ${name}</title><h1>${name}</h1>`);
});
await new Promise((r) => server.listen(0, "127.0.0.1", () => r(undefined)));
const addr = server.address();
assert(addr && typeof addr === "object");
const base = `http://127.0.0.1:${addr.port}`;
const U = (/** @type {string} */ p) => `${base}/${p}`;

// --- Utilidades -------------------------------------------------------------

const profile = mkdtempSync(join(tmpdir(), "fixtab-e2e-"));

/** @param {string} lang idioma de la interfaz del navegador (elige el de la extensión) */
async function launch(lang = "es", dir = profile) {
  const context = await chromium.launchPersistentContext(dir, {
    channel: "chromium",
    headless: true,
    locale: lang,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, `--lang=${lang}`],
  });
  const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
  const extId = new URL(sw.url()).host;
  return { context, sw, extId };
}

/**
 * Ejecuta código en el service worker de la extensión (tiene `chrome.*`).
 * @template T
 * @param {import("playwright").Worker} sw
 * @param {(arg: any) => Promise<T>} fn
 * @param {any} [arg]
 */
const inSW = (sw, fn, arg) => sw.evaluate(fn, arg);

/** Pestañas de todas las ventanas normales: [{url, pinned}] en orden. */
async function allTabs(/** @type {import("playwright").Worker} */ sw) {
  return inSW(sw, async () =>
    (await chrome.tabs.query({ windowType: "normal" }))
      .sort((a, b) => a.windowId - b.windowId || a.index - b.index)
      .map((t) => ({ url: t.url || t.pendingUrl, pinned: t.pinned })),
  );
}

async function pinnedUrls(/** @type {import("playwright").Worker} */ sw) {
  return (await allTabs(sw)).filter((t) => t.pinned).map((t) => t.url);
}

/**
 * @param {() => Promise<boolean>} cond
 * @param {string} what
 */
async function waitFor(cond, what, timeoutMs = 15_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await cond()) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Tiempo agotado esperando: ${what}`);
}

async function openPopup(/** @type {import("playwright").BrowserContext} */ context, extId) {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extId}/popup.html`);
  await page.locator("#save").waitFor();
  return page;
}

const steps = [];
/** @param {string} name @param {() => Promise<void>} fn */
async function step(name, fn) {
  process.stdout.write(`• ${name} … `);
  await fn();
  steps.push(name);
  console.log("ok");
}

// --- Escenarios -------------------------------------------------------------

const { context, sw, extId } = await launch();
try {
  await step("guardar desde el popup toma las fijadas en orden", async () => {
    await inSW(
      sw,
      async (urls) => {
        for (const url of urls) await chrome.tabs.create({ url, pinned: true, active: false });
      },
      [U("a"), U("b"), U("c")],
    );
    await waitFor(async () => (await pinnedUrls(sw)).length === 3, "3 fijadas");

    const popup = await openPopup(context, extId);
    assert.equal(
      await popup.locator("#save").textContent(),
      "Guardar las 3 fijadas de esta ventana",
    );
    assert.equal(
      await popup.locator("#restore").isDisabled(),
      true,
      "sin grupo, Restaurar deshabilitado",
    );
    assert.equal(await popup.locator("#restore-hint").isVisible(), true, "y dice por qué");
    await popup.locator("#save").click();
    await popup.locator("#status").getByText("Guardadas 3 pestañas.").waitFor();

    const { group, autoLoad } = await inSW(sw, () => chrome.storage.sync.get(null));
    assert.deepEqual(
      group.map((e) => e.url),
      [U("a"), U("b"), U("c")],
    );
    assert.equal(group[0].title, "Página a");
    assert.equal(autoLoad ?? true, true, "el switch arranca encendido");
    assert.equal(await popup.locator("#autoload").isChecked(), true);
    assert.equal(await popup.locator("#group li").count(), 3);
    if (SCREENSHOTS) {
      await popup.setViewportSize({ width: 320, height: 520 });
      await popup.screenshot({ path: join(SCREENSHOTS, "popup-claro.png") });
      await popup.emulateMedia({ colorScheme: "dark" });
      await popup.screenshot({ path: join(SCREENSHOTS, "popup-oscuro.png") });
      await popup.emulateMedia({ colorScheme: "light" });
    }
    await popup.close();
  });

  await step("guardar de nuevo pide confirmación antes de reemplazar", async () => {
    const popup = await openPopup(context, extId);
    await popup.locator("#save").click();
    assert.equal(await popup.locator("#save").textContent(), "Confirmar: reemplazar el grupo");
    assert.match((await popup.locator("#save-hint").textContent()) ?? "", /Pulsa de nuevo/);
    await popup.close();
  });

  await step("restaurar: abre la que falta, fija la suelta, no duplica", async () => {
    await inSW(
      sw,
      async ([a, b]) => {
        const tabs = await chrome.tabs.query({});
        await chrome.tabs.update(/** @type {number} */ (tabs.find((t) => t.url === a)?.id), {
          pinned: false,
        });
        await chrome.tabs.remove(/** @type {number} */ (tabs.find((t) => t.url === b)?.id));
      },
      [U("a"), U("b")],
    );
    await waitFor(async () => (await pinnedUrls(sw)).length === 1, "solo c fijada");

    const popup = await openPopup(context, extId);
    await popup.locator("#restore").click();
    await popup.locator("#status").getByText("1 abierta, 1 fijada, 1 ya estaba.").waitFor();

    assert.deepEqual(await pinnedUrls(sw), [U("a"), U("b"), U("c")], "orden guardado");
    const urls = (await allTabs(sw)).map((t) => t.url);
    assert.equal(urls.filter((u) => u === U("a")).length, 1, "a no se duplicó");

    await popup.locator("#restore").click();
    await popup.locator("#status").getByText("Ya estaban todas.").waitFor();
    assert.equal((await pinnedUrls(sw)).length, 3, "restaurar dos veces no duplica");
    await popup.close();
  });

  await step("recuerda a dónde redirige y no la duplica la próxima vez", async () => {
    await inSW(sw, (g) => chrome.storage.sync.set({ group: g }), [{ url: U("redir") }]);
    const popup = await openPopup(context, extId);
    await popup.locator("#restore").click();
    await popup.locator("#status").getByText("1 abierta.").waitFor();

    await waitFor(async () => {
      const { group } = await inSW(sw, () => chrome.storage.sync.get("group"));
      return group[0].finalUrl === `${U("final")}#bandeja`;
    }, "finalUrl registrada");

    await popup.locator("#restore").click();
    await popup.locator("#status").getByText("Ya estaban todas.").waitFor();
    const finals = (await allTabs(sw)).filter((t) => t.url?.startsWith(U("final")));
    assert.equal(finals.length, 1, "la pestaña redirigida no se duplicó");
    await popup.close();
  });

  // --- Arranque ---
  // Una extensión cargada con --load-extension se reinstala en cada arranque y
  // nunca recibe onStartup, así que se llama a la misma función que ese evento.

  /** Cierra todas las pestañas salvo una en blanco, y fija el grupo [a, b]. */
  async function resetForStartup(autoLoad) {
    await inSW(
      sw,
      async ([g, auto]) => {
        const keep = await chrome.tabs.create({ url: "about:blank" });
        const others = (await chrome.tabs.query({})).filter((t) => t.id !== keep.id);
        await chrome.tabs.remove(others.map((t) => /** @type {number} */ (t.id)));
        await chrome.storage.sync.set({ group: g, autoLoad: auto });
      },
      [
        [
          { url: U("a"), title: "Página a" },
          { url: U("b"), title: "Página b" },
        ],
        autoLoad,
      ],
    );
    await waitFor(async () => (await allTabs(sw)).length === 1, "ventana limpia");
  }

  await step("arranque con el switch encendido: las carga solas", async () => {
    await resetForStartup(true);
    await inSW(sw, () => globalThis.fixtabStartupForTests());
    assert.deepEqual(await pinnedUrls(sw), [U("a"), U("b")]);
  });

  await step("arranque mientras Chrome reabre la sesión: espera y no duplica", async () => {
    await resetForStartup(true);
    // Chrome restaura una pestaña de la sesión anterior 700 ms después de que
    // la extensión ya empezó su arranque.
    await inSW(
      sw,
      async (a) => {
        const startup = globalThis.fixtabStartupForTests();
        await new Promise((r) => setTimeout(r, 700));
        await chrome.tabs.create({ url: a, active: false });
        await startup;
      },
      U("a"),
    );
    const urls = (await allTabs(sw)).map((t) => t.url);
    assert.equal(
      urls.filter((u) => u === U("a")).length,
      1,
      `a duplicada: ${JSON.stringify(urls)}`,
    );
    assert.deepEqual(await pinnedUrls(sw), [U("a"), U("b")]);
  });

  await step("Chrome sigue vivo: cerrar todas las ventanas y abrir otra las carga", async () => {
    await resetForStartup(true);
    // Sin salir de Chrome (macOS, o Windows en segundo plano): no llega
    // onStartup; la primera ventana nueva tiene que bastar.
    const windowId = await inSW(sw, async () => {
      const wins = await chrome.windows.getAll({ windowTypes: ["normal"] });
      for (const w of wins) await chrome.windows.remove(/** @type {number} */ (w.id));
      await new Promise((r) => setTimeout(r, 500));
      return (await chrome.windows.create({ url: "about:blank" })).id;
    });
    const pinnedIn = (/** @type {number} */ id) =>
      inSW(
        sw,
        async (wid) =>
          (await chrome.tabs.query({ windowId: wid, pinned: true })).map(
            (t) => t.url || t.pendingUrl,
          ),
        id,
      );
    await waitFor(
      async () => (await pinnedIn(windowId)).length === 2,
      "fijadas en la ventana nueva",
    );
    assert.deepEqual(await pinnedIn(windowId), [U("a"), U("b")]);

    // Con una ventana ya abierta, abrir otra no es arranque: queda sin fijadas.
    const second = await inSW(
      sw,
      async () => (await chrome.windows.create({ url: "about:blank" })).id,
    );
    await new Promise((r) => setTimeout(r, 4000)); // más que la espera de asentamiento
    assert.deepEqual(await pinnedIn(second), []);
    assert.deepEqual(await pinnedIn(windowId), [U("a"), U("b")], "la primera sigue igual");
  });

  await step("el switch se apaga desde el popup", async () => {
    const popup = await openPopup(context, extId);
    await popup.locator(".switch-row").click(); // clic en la fila, como una persona
    await popup.getByText("Solo se cargan cuando pulsas «Restaurar».").waitFor();
    const { autoLoad } = await inSW(sw, () => chrome.storage.sync.get("autoLoad"));
    assert.equal(autoLoad, false);
    await popup.close();
  });

  await step("arranque con el switch apagado: no carga nada, el botón sí", async () => {
    await resetForStartup(false);
    await inSW(sw, () => globalThis.fixtabStartupForTests());
    assert.deepEqual(await pinnedUrls(sw), []);

    const popup = await openPopup(context, extId);
    await popup.locator("#restore").click();
    await popup.locator("#status").getByText("2 abiertas.").waitFor();
    assert.deepEqual(await pinnedUrls(sw), [U("a"), U("b")]);
    await popup.close();
  });

  await step("en inglés: el navegador en inglés muestra la extensión en inglés", async () => {
    const dir = mkdtempSync(join(tmpdir(), "fixtab-e2e-en-"));
    const en = await launch("en", dir);
    try {
      await inSW(en.sw, (g) => chrome.storage.sync.set({ group: g }), [
        { url: U("a") },
        { url: U("b") },
      ]);
      const popup = await openPopup(en.context, en.extId);
      assert.equal(await popup.locator("#restore").textContent(), "Restore pinned tabs (2)");
      assert.equal(
        await popup.locator(".switch-title").textContent(),
        "Load when the browser starts",
      );
      await popup.locator("#restore").click();
      await popup.locator("#status").getByText("2 opened.").waitFor();
    } finally {
      await en.context.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  console.log(`\n${steps.length} escenarios OK`);
} finally {
  await context.close().catch(() => {});
  server.close();
  rmSync(profile, { recursive: true, force: true });
}
