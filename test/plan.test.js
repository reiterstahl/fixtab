import { describe, expect, it } from "vitest";
import {
  describeResult,
  entriesFromTabs,
  entryKeys,
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

describe("describeResult", () => {
  it("resume en español con singular y plural", () => {
    expect(describeResult({ opened: 2, pinned: 1, kept: 1, failed: 0 })).toBe(
      "2 abiertas, 1 fijada, 1 ya estaba.",
    );
    expect(describeResult({ opened: 0, pinned: 0, kept: 3, failed: 0 })).toBe("Ya estaban todas.");
    expect(describeResult({ opened: 0, pinned: 0, kept: 0, failed: 0 })).toBe(
      "No hay pestañas guardadas.",
    );
    expect(describeResult({ opened: 1, pinned: 0, kept: 0, failed: 2 })).toBe(
      "1 abierta, 2 con error.",
    );
  });
});
