# AppMenu v5.7.0 — GNOME 51 compatibility

- Add GNOME Shell 51 to extension metadata (extension version 16).
- Use orientation-based St layouts on newer shells with a legacy fallback.
- Update virtual keyboard seat discovery and parse custom accelerators without GTK.
- Fix native GTK menu activation and reject invalid application D-Bus names.
- Fix minimized-window restoration and work-area lookup for tiling.
- Fix unrelated search results, typing focus, and result keyboard navigation.
- Fix user-switcher panel layout and unsupported stylesheet lengths.
- Report the actual extension version in troubleshooting information.

See `QA-v5.7.0.md` for executed checks and remaining coverage limits.

After upgrading on Wayland, log out and back in to load the new JavaScript
modules and metadata. GNOME caches extensions for the lifetime of the session.
