# FixTab privacy policy

_Last updated: September 30, 2026_ · [Español abajo](#política-de-privacidad-de-fixtab)

FixTab does not collect, sell, share or transmit any personal data. It has no servers, no
accounts, no analytics and no tracking, and it makes no network requests of its own.

## What FixTab stores, and where

| Data                                                               | Where                    | Why                                                             |
| ------------------------------------------------------------------ | ------------------------ | --------------------------------------------------------------- |
| URLs and titles of the tabs you save, and where they redirected to | `chrome.storage.sync`    | To restore your group.                                          |
| The "Load when the browser starts" switch                          | `chrome.storage.sync`    | To remember your choice.                                        |
| IDs of tabs that FixTab just opened and are still loading          | `chrome.storage.session` | To record where they redirect. Cleared when the browser closes. |

`chrome.storage.sync` belongs to your browser. If you have browser sync turned on, your browser
syncs this data with your browser account (for example, your Google account in Chrome) under that
vendor's own privacy policy. FixTab never sees or receives it anywhere else.

Site icons in the popup come from your browser's local favicon cache. FixTab does not download
them.

## Permissions

- `tabs`: read the URLs and titles of the tabs in the current window so you can save or pin them,
  and open, pin and move tabs to restore them.
- `storage`: keep the data described above.
- `favicon`: show site icons from the browser's cache.
- `contextMenus`: add one item to the right-click menu to pin the current tab and add it to your
  group.

## Removing your data

Remove tabs from the group in the popup, or uninstall FixTab: the browser deletes all of its
stored data.

## Contact

Open an issue at <https://github.com/reiterstahl/fixtab/issues>.

---

# Política de privacidad de FixTab

_Última actualización: 30 de septiembre de 2026_

FixTab no recopila, vende, comparte ni transmite datos personales. No tiene servidores, cuentas,
analíticas ni rastreo, y no hace peticiones de red propias.

## Qué guarda FixTab, y dónde

| Dato                                                               | Dónde                    | Para qué                                                   |
| ------------------------------------------------------------------ | ------------------------ | ---------------------------------------------------------- |
| URLs y títulos de las pestañas que guardas, y a dónde redirigieron | `chrome.storage.sync`    | Restaurar tu grupo.                                        |
| El switch «Cargar al abrir el navegador»                           | `chrome.storage.sync`    | Recordar tu elección.                                      |
| IDs de las pestañas que FixTab acaba de abrir y siguen cargando    | `chrome.storage.session` | Anotar a dónde redirigen. Se borra al cerrar el navegador. |

`chrome.storage.sync` es del navegador. Si tienes la sincronización activada, el navegador
sincroniza estos datos con tu cuenta (por ejemplo, tu cuenta de Google en Chrome) bajo la política
de privacidad de ese proveedor. FixTab no los ve ni los recibe en ningún otro lugar.

Los íconos de los sitios en el popup salen de la caché local de favicons del navegador. FixTab no
los descarga.

## Permisos

- `tabs`: leer las URLs y títulos de las pestañas de la ventana actual para guardarlas o fijarlas,
  y abrir, fijar y mover pestañas para restaurarlas.
- `storage`: guardar los datos descritos arriba.
- `favicon`: mostrar los íconos de los sitios desde la caché del navegador.
- `contextMenus`: agregar una opción al menú del clic derecho para fijar la pestaña actual y
  sumarla a tu grupo.

## Borrar tus datos

Quita pestañas del grupo desde el popup, o desinstala FixTab: el navegador borra todo lo que tenía
guardado.

## Contacto

Abre un issue en <https://github.com/reiterstahl/fixtab/issues>.
