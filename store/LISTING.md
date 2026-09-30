# Ficha de la Chrome Web Store

**Publicada** (v0.2.0, aprobada el 30 de septiembre de 2026; la 0.3.0 agrega el permiso
`contextMenus`, que hay que justificar al subirla):
<https://chromewebstore.google.com/detail/fixtab/kfehbcfiobolppdoadgjohhbpoppikhf>

ID de la extensión: `kfehbcfiobolppdoadgjohhbpoppikhf`

Todo lo que pide el panel de desarrollador, listo para copiar. La ficha principal va en inglés y
se agrega una traducción al español.

## Pasos

1. Registrarse como desarrollador en <https://chrome.google.com/webstore/devconsole> (pago único
   de USD 5).
2. **Nuevo elemento** → subir `dist/fixtab-<versión>.zip` (`pnpm zip`, o el zip del Release de
   GitHub).
3. Pestaña **Ficha de Play Store**: textos de abajo, ícono, capturas y tile.
4. Pestaña **Prácticas de privacidad**: propósito único, justificación de permisos, uso de datos y
   URL de la política de privacidad.
5. Pestaña **Distribución**: gratis, todas las regiones. Visibilidad **Pública**, o **No listada**
   si prefieres que solo la instale quien tenga el enlace.
6. **Enviar para revisión.** Suele tardar de uno a varios días.

> La URL de la política de privacidad solo funciona si el repo es público.

## Imágenes

| Campo              | Archivo                                         | Tamaño   |
| ------------------ | ----------------------------------------------- | -------- |
| Ícono de la tienda | `extension/icons/icon128.png`                   | 128×128  |
| Capturas (en)      | `store/en/screenshot-1.png`, `-2.png`, `-3.png` | 1280×800 |
| Capturas (es)      | `store/es/screenshot-1.png`, `-2.png`, `-3.png` | 1280×800 |
| Tile promocional   | `store/en/promo-small.png` (y `store/es/…`)     | 440×280  |

Todas son PNG de 24 bits sin transparencia, como pide la tienda. Se regeneran con `pnpm assets`.

## Datos generales

- **Categoría:** Productivity → Workflow & Planning (o la más cercana que ofrezca el panel).
- **Idioma principal:** English.
- **Sitio web:** <https://github.com/reiterstahl/fixtab>
- **Soporte:** <https://github.com/reiterstahl/fixtab/issues>

## Textos — English

**Name:** FixTab

**Summary** (sale del manifest, máx. 132):

> Save a set of pinned tabs and bring them back with one click or when your browser starts.

**Description:**

```
FixTab keeps the tabs you always pin — mail, calendar, chat, music — one click away.

SAVE
Pin your tabs, open FixTab and press "Save this window's pinned tabs". That set becomes your group.

RESTORE
Press "Restore pinned tabs" or use Alt+Shift+P. Missing tabs open pinned, loose tabs that are already open get pinned, the ones already there are left alone, and everything goes back to your saved order. Nothing is ever duplicated.

PIN FROM FIXTAB
One button pins the tab you are on and adds it to your group. You can do the same for any other open tab from the list, from the right-click menu, or with Alt+Shift+F. If you pinned tabs by hand, FixTab tells you they are not in the group yet and adds them with one click.

AT STARTUP
With "Load when the browser starts" on (the default), FixTab restores your group when the browser opens. That includes when the browser kept running in the background and you just open a new window. Turn it off to restore only when you ask.

SMART ABOUT DUPLICATES
• Remembers where each page redirects (gmail.com → mail.google.com/…) and recognizes it either way.
• Waits for the browser to finish restoring your previous session before doing anything.
• Reuses tabs that are already open instead of opening them again.

PRIVATE BY DESIGN
No accounts, no analytics, no network requests. Your group is kept in your browser's own storage and synced by your browser if you have sync on.

Available in English and Spanish. Open source: https://github.com/reiterstahl/fixtab
```

## Textos — Español

**Nombre:** FixTab

**Resumen** (sale de `_locales/es`):

> Guarda un grupo de pestañas fijadas y lo restaura con un clic o al abrir el navegador.

**Descripción:**

```
FixTab mantiene a un clic las pestañas que siempre tienes fijadas: correo, calendario, chat, música.

GUARDAR
Fija tus pestañas, abre FixTab y pulsa «Guardar las fijadas de esta ventana». Ese conjunto queda como tu grupo.

RESTAURAR
Pulsa «Restaurar fijadas» o usa Alt+Shift+P. Las que faltan se abren fijadas, las que ya están abiertas pero sueltas se fijan, las que ya estaban no se tocan, y todo vuelve al orden guardado. Nunca se duplica nada.

FIJAR DESDE FIXTAB
Un botón fija la pestaña en la que estás y la agrega a tu grupo. Puedes hacer lo mismo con cualquier otra pestaña abierta desde la lista, con el clic derecho o con Alt+Shift+F. Si fijaste pestañas a mano, FixTab te avisa que aún no están en el grupo y las agrega con un clic.

AL INICIAR
Con «Cargar al abrir el navegador» encendido (viene así), FixTab restaura tu grupo al abrir el navegador. Eso incluye cuando el navegador siguió corriendo en segundo plano y solo abres una ventana nueva. Apágalo para restaurar solo cuando lo pidas.

SIN DUPLICADOS
• Recuerda a dónde redirige cada página (gmail.com → mail.google.com/…) y la reconoce de cualquiera de las dos formas.
• Espera a que el navegador termine de restaurar tu sesión anterior antes de hacer nada.
• Reutiliza las pestañas que ya están abiertas en vez de abrirlas otra vez.

PRIVADA DE ENTRADA
Sin cuentas, sin analíticas, sin peticiones de red. Tu grupo se guarda en el almacenamiento del propio navegador, que lo sincroniza si tienes la sincronización activada.

Disponible en inglés y español. Código abierto: https://github.com/reiterstahl/fixtab
```

## Prácticas de privacidad

**Single purpose description:**

> FixTab saves a set of pinned tabs and restores them, on demand or when the browser starts.

**Permission justifications:**

- **tabs:** Needed to read the URLs and titles of the tabs in the current window, so the user can save
  their pinned tabs as a group or pin an open tab and add it to the group, and to open, pin and
  reorder tabs when restoring it. Tabs are only read when the popup is open or the user triggers
  an action.
- **storage:** Stores the user's saved group of tabs and the "load at startup" setting in
  chrome.storage.sync, and a temporary list of tabs being loaded in chrome.storage.session.
- **favicon:** Shows each saved site's icon in the popup using the browser's own favicon cache.

- **contextMenus:** Adds a single item, "Pin this tab and add it to FixTab", to the right-click menu
  so the user can pin the current tab and add it to their saved group without opening the popup.

**Remote code:** No, I am not using remote code.

**Data usage:** marcar solo **Web history**. FixTab guarda las URLs que el usuario elige guardar,
aunque nunca salgan del navegador; declararlo es lo prudente. Luego marcar las tres
certificaciones:

- I do not sell or transfer user data to third parties, outside of the approved use cases.
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

**Privacy policy URL:** <https://github.com/reiterstahl/fixtab/blob/main/PRIVACY.md>
