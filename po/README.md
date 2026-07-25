# Translating AppMenu

Thank you for helping translate AppMenu! This extension brings a macOS-style
global menu bar to GNOME Shell with 82 user-visible strings.

## Quick start

1. **Get the template**

   `po/appmenu.pot` is the master template. Copy it to start a new language:

   ```
   cp po/appmenu.pot po/fr.po    # French
   cp po/appmenu.pot po/de.po    # German
   cp po/appmenu.pot po/es.po    # Spanish
   ```

2. **Edit the .po file**

   Fill in each `msgstr ""` with the translation. Example:

   ```
   msgid "File"
   msgstr "Fichier"
   ```

3. **Compile and test**

   ```
   python3 build-locale.py compile
   ```

   This creates `locale/fr/LC_MESSAGES/appmenu.mo`.

4. **Install**

   Copy the `locale/` directory into your extension install path:

   ```
   cp -r locale/* ~/.local/share/gnome-shell/extensions/appmenu@ChathurangaBW.github.io/locale/
   ```

   Restart GNOME Shell (Alt+F2 → `r` on X11, or log out/in on Wayland).

## Regenerating the template

After any code changes that add/remove strings:

```
python3 build-locale.py extract
```

This scans all `.js` files and updates `po/appmenu.pot`.

## File layout

```
po/
  appmenu.pot          ← master template (82 strings)
  en.po                ← English reference (identical to template)
  fr.po, de.po, ...    ← your translations

locale/
  en/LC_MESSAGES/appmenu.mo
  fr/LC_MESSAGES/appmenu.mo
  ...
```
