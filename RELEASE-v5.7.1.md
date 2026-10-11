# AppMenu v5.7.1

- Preferences → Menu Behavior → Search shortcut: record a new combination,
  disable the shortcut, or restore Ctrl+Space. Changes apply immediately (#8).
- Load the optional Dbusmenu 0.4 typelib directly inside a guarded import,
  without depending on a particular GIRepository API. Missing Dbusmenu does
  not prevent startup; GTK action menus and fallback menus remain available (#3).

The screenshot in #3 reports a missing Dbusmenu typelib. Previous issue replies
about missing i18n.js or stale system copies did not explain that screenshot.

On Wayland, log out and back in after upgrading to refresh cached extension code.

QA: 39 runtime checks passed with Dbusmenu present and again with it unavailable;
12 preferences checks passed; 11 GTK integration checks passed on rerun.
See [QA-v5.7.1.md](https://github.com/ChathurangaBW/AppMenu/blob/v5.7.1/QA-v5.7.1.md)
for results and coverage limits.
