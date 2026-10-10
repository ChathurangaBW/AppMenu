import Clutter from 'gi://Clutter';

// Parse GTK-style accelerators without importing GTK into GNOME Shell.
export function parseAccelerator(accelerator) {
    const masks = {
        control: Clutter.ModifierType.CONTROL_MASK,
        ctrl: Clutter.ModifierType.CONTROL_MASK,
        primary: Clutter.ModifierType.CONTROL_MASK,
        shift: Clutter.ModifierType.SHIFT_MASK,
        alt: Clutter.ModifierType.MOD1_MASK,
        mod1: Clutter.ModifierType.MOD1_MASK,
        super: Clutter.ModifierType.SUPER_MASK,
        meta: Clutter.ModifierType.META_MASK,
        hyper: Clutter.ModifierType.HYPER_MASK,
    };
    let key = String(accelerator).trim();
    let modifiers = 0;
    while (key.startsWith('<')) {
        const match = /^<([^>]+)>/.exec(key);
        const mask = match ? masks[match[1].toLowerCase()] : undefined;
        if (mask === undefined)
            return [false, 0, 0];
        modifiers |= mask;
        key = key.slice(match[0].length);
    }
    const keyval = Clutter[`KEY_${key}`]
        ?? ([...key].length === 1 ? Clutter.unicode_to_keysym(key.codePointAt(0)) : 0);
    return [Boolean(keyval), keyval, modifiers];
}
