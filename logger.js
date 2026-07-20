let _settings = null;

export function setLoggerSettings(settings) {
    _settings = settings;
}

function _debugEnabled() {
    try {
        return _settings?.get_boolean('debug-logging') ?? false;
    } catch (_e) {
        return false;
    }
}

export function debug(message) {
    if (_debugEnabled())
        console.log(`[appmenu] ${message}`);
}

export function warn(message) {
    if (_debugEnabled())
        console.warn(`[appmenu] ${message}`);
}

export function error(message) {
    if (_debugEnabled())
        console.error(`[appmenu] ${message}`);
}
