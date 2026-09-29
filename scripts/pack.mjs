// Empaqueta extension/ en dist/fixtab-<versión>.zip, listo para subir a la
// Chrome Web Store. Falla si package.json y manifest.json no coinciden.

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const manifest = JSON.parse(readFileSync(join(ROOT, "extension/manifest.json"), "utf8"));
const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));

if (manifest.version !== pkg.version) {
  console.error(`Versiones distintas: manifest ${manifest.version} vs package.json ${pkg.version}`);
  process.exit(1);
}

const out = join(ROOT, "dist", `fixtab-${manifest.version}.zip`);
mkdirSync(join(ROOT, "dist"), { recursive: true });
rmSync(out, { force: true });
// -X: sin atributos extra; se excluyen archivos ocultos (.DS_Store y similares).
execFileSync("zip", ["-r", "-X", "-q", out, ".", "-x", ".*", "*/.*"], {
  cwd: join(ROOT, "extension"),
  stdio: "inherit",
});
console.log(out);
