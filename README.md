# FixTab

Extensión de Chrome que guarda un grupo de pestañas fijadas y lo vuelve a poner en su sitio
con un botón o, si quieres, cada vez que abres Chrome.

## Qué hace

- **Guardar**: toma las pestañas fijadas de la ventana actual, en su orden, y las guarda como
  _el_ grupo (uno solo). Si ya había uno, pide confirmación antes de reemplazarlo.
- **Restaurar fijadas**: deja las del grupo fijadas a la izquierda, en el orden guardado.
  - Si una ya está fijada, no la toca.
  - Si está abierta pero suelta, la fija en vez de abrir otra.
  - Si falta, la abre (en segundo plano).
  - Las fijadas que no son del grupo quedan después, intactas.
- **Cargar al iniciar Chrome** (encendido por defecto): restaura el grupo en la primera ventana
  al abrir Chrome. Apagado, solo se restaura con el botón. «Abrir Chrome» incluye abrir una
  ventana cuando no había ninguna aunque Chrome siguiera vivo (macOS, o Windows con _Seguir
  ejecutando aplicaciones en segundo plano_). Abrir una segunda ventana no restaura nada.
- **Atajo**: `Alt+Shift+P` restaura sin abrir el popup (se cambia en
  `chrome://extensions/shortcuts`).

El grupo y el switch se guardan en `chrome.storage.sync`: te siguen a otras computadoras con la
misma cuenta de Chrome.

## Instalar

1. `gh repo clone reiterstahl/fixtab` (o `git clone https://github.com/reiterstahl/fixtab.git`)
2. En Chrome, `chrome://extensions` → activar **Modo de desarrollador**.
3. **Cargar descomprimida** → elegir la carpeta `extension/` del repo.
4. Fijar el icono en la barra (menú de extensiones → chincheta).

Para actualizar: `git pull` y pulsar ↻ en la tarjeta de FixTab en `chrome://extensions`.

## Cómo evita duplicados

- Compara URLs sin el `#fragmento` y sin la `/` final.
- Muchas URLs redirigen (`gmail.com` → `mail.google.com/mail/u/0/`). La primera vez que FixTab
  abre una pestaña anota a dónde terminó (`finalUrl`) y a partir de ahí la reconoce por
  cualquiera de las dos. Pasa el mouse por una entrada del popup para ver ambas.
- Al arrancar, si Chrome está en «Continuar donde lo dejaste», él mismo reabre pestañas. FixTab
  espera a que el número de pestañas deje de cambiar (1,5 s estable, máximo 10 s) antes de
  restaurar, para no duplicar las que Chrome acaba de abrir.

## Límites conocidos

- Si una pestaña guardada lleva a un login, la `finalUrl` anotada puede ser la del login. Se
  corrige sola la próxima vez que se restaure con la sesión iniciada.
- Las URLs `file://` requieren activar «Permitir acceso a URLs de archivo» en la tarjeta de la
  extensión.

## Desarrollo

Sin build: el código de `extension/` es lo que carga Chrome.

```sh
pnpm install
pnpm exec playwright install chromium   # solo la primera vez, para el e2e
pnpm verify                             # formato + tipos + unitarios + e2e
```

- `extension/lib/plan.js` — la lógica pura (qué abrir, fijar o dejar); `test/plan.test.js`.
- `extension/background.js` — service worker: arranque, restauración, URL final, atajo.
- `extension/popup.*` — el popup.
- `test/e2e/run.mjs` — Chromium real con la extensión cargada y un servidor HTTP local.
  Una extensión cargada con `--load-extension` se reinstala en cada arranque y nunca recibe
  `onStartup`, así que el e2e llama directamente a la función de arranque
  (`fixtabStartupForTests`) y simula la sesión que Chrome reabre tarde.
- `scripts/make_icons.py` — regenera los íconos (Pillow).
