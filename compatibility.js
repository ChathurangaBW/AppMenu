import Clutter from 'gi://Clutter';
import St from 'gi://St';

// GNOME 51 removed vertical; older supported shells lack orientation.
export function boxLayout(vertical, properties = {}) {
    const direction = 'orientation' in St.BoxLayout.prototype
        ? {orientation: vertical ? Clutter.Orientation.VERTICAL : Clutter.Orientation.HORIZONTAL}
        : {vertical};
    return new St.BoxLayout({...properties, ...direction});
}

export function getSeat() {
    const backend = global.stage.context?.get_backend()
        ?? Clutter.get_default_backend();
    return backend.get_default_seat();
}
