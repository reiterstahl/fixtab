import { describe, expect, it } from "vitest";
import {
  addToGroup,
  canAdd,
  entriesFromTabs,
  entryKeys,
  inGroup,
  planRestore,
  urlKey,
} from "../extension/lib/plan.js";

describe("urlKey", () => {
  it("ignora el #fragmento y la barra final", () => {
    expect(urlKey("https://mail.google.com/mail/u/0/#inbox")).toBe(
      "https://mail.google.com/mail/u/0",
    );
    expect(urlKey("https://github.com/")).toBe("https://github.com");
  });

  it("normaliza el host a minúsculas pero respeta la query", () => {
    expect(urlKey("https://GitHub.com/a?x=1")).toBe("https://github.com/a?x=1");
    expect(urlKey("https://github.com/a?x=1")).not.toBe(urlKey("https://github.com/a?x=2"));
  });

  it("devuelve la cadena tal cual si no es una URL válida, y null si está vacía", () => {
    expect(urlKey("no es url")).toBe("no es url");
    expect(urlKey(undefined)).toBeNull();
    expect(urlKey("")).toBeNull();
  });
});

describe("entryKeys", () => {
  it("incluye la URL guardada y la final", () => {
    const keys = entryKeys({
      url: "https://gmail.com/",
      finalUrl: "https://mail.google.com/mail/u/0/#inbox",
    });
    expect([...keys]).toEqual(["https://gmail.com", "https://mail.google.com/mail/u/0"]);
  });
});

describe("planRestore", () => {
  const A = { url: "https://a.com/" };
  const B = { url: "https://b.com/x" };
  const C = { url: "https://c.com/" };

  it("abre todo si la ventana está vacía, en el orden guardado", () => {
    expect(planRestore([A, B], [])).toEqual([
      { kind: "open", entryIndex: 0, url: "https://a.com/" },
      { kind: "open", entryIndex: 1, url: "https://b.com/x" },
    ]);
  });

  it("no duplica las que ya están fijadas", () => {
    const tabs = [{ id: 7, url: "https://a.com/", pinned: true }];
    expect(planRestore([A, B], tabs)).toEqual([
      { kind: "keep", entryIndex: 0, tabId: 7 },
      { kind: "open", entryIndex: 1, url: "https://b.com/x" },
    ]);
  });

  it("fija una pestaña abierta sin fijar en vez de abrir otra", () => {
    const tabs = [{ id: 3, url: "https://b.com/x#algo", pinned: false }];
    expect(planRestore([B], tabs)).toEqual([{ kind: "pin", entryIndex: 0, tabId: 3 }]);
  });

  it("prefiere la fijada cuando hay una fijada y otra suelta con la misma URL", () => {
    const tabs = [
      { id: 1, url: "https://a.com/", pinned: false },
      { id: 2, url: "https://a.com/", pinned: true },
    ];
    expect(planRestore([A], tabs)).toEqual([{ kind: "keep", entryIndex: 0, tabId: 2 }]);
  });

  it("reconoce la pestaña por la URL a la que redirigió", () => {
    const gmail = {
      url: "https://gmail.com/",
      finalUrl: "https://mail.google.com/mail/u/0/#inbox",
    };
    const tabs = [{ id: 9, url: "https://mail.google.com/mail/u/0/#label/x", pinned: true }];
    expect(planRestore([gmail], tabs)).toEqual([{ kind: "keep", entryIndex: 0, tabId: 9 }]);
  });

  it("reconoce una pestaña que todavía está cargando por su pendingUrl", () => {
    const tabs = [{ id: 4, url: "", pendingUrl: "https://c.com/", pinned: true }];
    expect(planRestore([C], tabs)).toEqual([{ kind: "keep", entryIndex: 0, tabId: 4 }]);
  });

  it("dos entradas iguales no reclaman la misma pestaña", () => {
    const tabs = [{ id: 5, url: "https://a.com/", pinned: true }];
    expect(planRestore([A, A], tabs)).toEqual([
      { kind: "keep", entryIndex: 0, tabId: 5 },
      { kind: "open", entryIndex: 1, url: "https://a.com/" },
    ]);
  });

  it("ignora pestañas sin id", () => {
    const tabs = [{ url: "https://a.com/", pinned: true }];
    expect(planRestore([A], tabs)).toEqual([
      { kind: "open", entryIndex: 0, url: "https://a.com/" },
    ]);
  });

  it("no confunde rutas distintas del mismo sitio", () => {
    const tabs = [{ id: 6, url: "https://b.com/otra", pinned: true }];
    expect(planRestore([B], tabs)[0].kind).toBe("open");
  });
});

describe("entriesFromTabs", () => {
  it("toma solo las fijadas, ordenadas por posición, con título", () => {
    const tabs = [
      { id: 1, index: 2, url: "https://c.com/", title: "C", pinned: true },
      { id: 2, index: 0, url: "https://a.com/", title: "A", pinned: true },
      { id: 3, index: 3, url: "https://z.com/", title: "Z", pinned: false },
      { id: 4, index: 1, url: "", pendingUrl: "https://b.com/", pinned: true },
    ];
    expect(entriesFromTabs(tabs)).toEqual([
      { url: "https://a.com/", title: "A" },
      { url: "https://b.com/" },
      { url: "https://c.com/", title: "C" },
    ]);
  });
});

describe("canAdd", () => {
  const OWN = "chrome-extension://abc/";
  it("acepta páginas normales y rechaza las de la propia extensión o sin URL", () => {
    expect(canAdd({ url: "https://a.com/", pinned: false }, OWN)).toBe(true);
    expect(canAdd({ url: "", pendingUrl: "https://a.com/", pinned: false }, OWN)).toBe(true);
    expect(canAdd({ url: "chrome-extension://abc/popup.html", pinned: false }, OWN)).toBe(false);
    expect(canAdd({ url: "chrome-extension://otra/pagina.html", pinned: false }, OWN)).toBe(true);
    expect(canAdd({ url: "", pinned: false }, OWN)).toBe(false);
  });

  it("no ofrece páginas vacías ni la de nueva pestaña", () => {
    for (const url of [
      "about:blank",
      "chrome://newtab/",
      "chrome://new-tab-page/",
      "edge://newtab/",
      "brave://newtab/",
    ]) {
      expect(canAdd({ url, pinned: false }, OWN), url).toBe(false);
    }
    expect(canAdd({ url: "chrome://settings/", pinned: false }, OWN)).toBe(true);
    expect(canAdd({ url: "https://newtab.example.com/", pinned: false }, OWN)).toBe(true);
  });
});

describe("inGroup", () => {
  const group = [
    { url: "https://a.com/" },
    { url: "https://gmail.com/", finalUrl: "https://mail.google.com/mail/u/0/#inbox" },
  ];
  it("reconoce por la URL guardada, ignorando fragmento y barra final", () => {
    expect(inGroup(group, { url: "https://a.com#x", pinned: true })).toBe(true);
    expect(inGroup(group, { url: "https://a.com/otra", pinned: true })).toBe(false);
  });
  it("reconoce por la URL a la que redirigió", () => {
    expect(inGroup(group, { url: "https://mail.google.com/mail/u/0/#label/x", pinned: true })).toBe(
      true,
    );
  });
});

describe("addToGroup", () => {
  const group = [{ url: "https://a.com/", title: "A" }];

  it("agrega al final, en el orden de la barra, sin tocar el original", () => {
    const tabs = [
      { id: 2, index: 5, url: "https://c.com/", title: "C", pinned: false },
      { id: 1, index: 3, url: "https://b.com/", title: "B", pinned: false },
    ];
    expect(addToGroup(group, tabs)).toEqual([
      { url: "https://a.com/", title: "A" },
      { url: "https://b.com/", title: "B" },
      { url: "https://c.com/", title: "C" },
    ]);
    expect(group).toHaveLength(1);
  });

  it("no duplica las que ya están ni dos pestañas con la misma URL", () => {
    const tabs = [
      { id: 1, index: 0, url: "https://a.com/#algo", title: "A otra vez", pinned: true },
      { id: 2, index: 1, url: "https://b.com/", title: "B", pinned: true },
      { id: 3, index: 2, url: "https://b.com/", title: "B bis", pinned: true },
    ];
    expect(addToGroup(group, tabs)).toEqual([
      { url: "https://a.com/", title: "A" },
      { url: "https://b.com/", title: "B" },
    ]);
  });

  it("recorta los títulos largos y salta las pestañas sin URL", () => {
    const tabs = [
      { id: 1, index: 0, url: "https://b.com/", title: "x".repeat(200), pinned: false },
      { id: 2, index: 1, url: "", pinned: false },
    ];
    const next = addToGroup([], tabs);
    expect(next).toHaveLength(1);
    expect(next[0].title).toHaveLength(80);
  });
});
