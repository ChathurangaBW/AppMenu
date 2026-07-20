import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import * as Logger from '../logger.js';

const HOME = GLib.get_home_dir();
const specialDir = (d) => GLib.get_user_special_dir(d) || `${HOME}/${d === GLib.UserDirectory.DIRECTORY_DOCUMENTS ? 'Documents' : d === GLib.UserDirectory.DIRECTORY_DESKTOP ? 'Desktop' : 'Downloads'}`;

/**
 * Create a new folder on the Desktop.
 * Note: For in-Nautilus folder creation, use the virtual keyboard shortcut Ctrl+Shift+N.
 */
function createNewFolder() {
    const timestamp = Date.now();
    GLib.spawn_command_line_async(`mkdir -p "${HOME}/Desktop/Untitled Folder ${timestamp}"`);
}

/**
 * Get list of removable drives/block devices using udisks2.
 * Returns array of {device, name, size, isRemovable, mountPoints}
 */
async function getRemovableDrives() {
    return new Promise((resolve) => {
        try {
            const subprocess = Gio.Subprocess.new(
                ['udisksctl', 'dump', '--object-info'],
                Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE
            );

            let stdout = '';
            subprocess.get_stdout_pipe().read_bytes_async(65536, GLib.PRIORITY_DEFAULT, null, (source, result) => {
                try {
                    const bytes = source.read_bytes_finish(result);
                    stdout = new TextDecoder().decode(bytes.get_data());
                } catch (e) {
                    // ignore
                }

                subprocess.wait_check_async(null, (source, result) => {
                    const drives = [];
                    try {
                        source.finish(result);
                        // Parse udisksctl output for removable drives
                        const lines = stdout.split('\n');
                        let currentDrive = null;

                        for (const line of lines) {
                            if (line.startsWith('/org/freedesktop/UDisks2/Block_devices/')) {
                                if (currentDrive && currentDrive.isRemovable) {
                                    drives.push(currentDrive);
                                }
                                currentDrive = {
                                    device: line.trim().split('/').pop(),
                                    name: '',
                                    size: 0,
                                    isRemovable: false,
                                    mountPoints: []
                                };
                            } else if (currentDrive) {
                                if (line.includes('IdUsage=') && line.includes('filesystem')) {
                                    currentDrive.name = currentDrive.device;
                                }
                                if (line.includes('HintSystem=true')) {
                                    currentDrive.isRemovable = false;
                                }
                                if (line.includes('Size=') && !line.includes('PartitionSize')) {
                                    const match = line.match(/Size=(\d+)/);
                                    if (match) currentDrive.size = parseInt(match[1], 10);
                                }
                                if (line.includes('MountPoints=[') && line.includes('/')) {
                                    const mountMatch = line.match(/MountPoints=\[(.*?)\]/);
                                    if (mountMatch) {
                                        currentDrive.mountPoints = mountMatch[1]
                                            .split(',')
                                            .map(s => s.trim().replace(/'/g, ''))
                                            .filter(s => s.length > 0);
                                    }
                                }
                            }
                        }
                        // Don't forget the last drive
                        if (currentDrive && currentDrive.isRemovable) {
                            drives.push(currentDrive);
                        }
                    } catch (e) {
                        Logger.error(`Failed to parse udisksctl output: ${e}`);
                    }
                    resolve(drives);
                });
            });
        } catch (e) {
            Logger.error(`Failed to run udisksctl: ${e}`);
            resolve([]);
        }
    });
}

/**
 * Eject/unmount a block device.
 */
async function ejectDevice(device) {
    return new Promise((resolve) => {
        try {
            // First unmount if mounted
            const subprocess = Gio.Subprocess.new(
                ['udisksctl', 'unmount', '-b', `/dev/${device}`],
                Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE
            );

            subprocess.wait_check_async(null, (source, result) => {
                try {
                    source.finish(result);
                    // Then power off the drive
                    const powerOff = Gio.Subprocess.new(
                        ['udisksctl', 'power-off', '-b', `/dev/${device}`],
                        Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE
                    );
                    powerOff.wait_check_async(null, (source, result) => {
                        try {
                            source.finish(result);
                            resolve(true);
                        } catch (e) {
                            Logger.error(`Failed to power off device: ${e}`);
                            resolve(false);
                        }
                    });
                } catch (e) {
                    Logger.error(`Failed to unmount device: ${e}`);
                    resolve(false);
                }
            });
        } catch (e) {
            Logger.error(`Failed to eject device: ${e}`);
            resolve(false);
        }
    });
}

export const fileActions = {
    // Apple Menu
    'about-this-mac': () => GLib.spawn_command_line_async('gnome-control-center about'),
    'system-settings': () => GLib.spawn_command_line_async('gnome-control-center'),
    'app-store': () => GLib.spawn_command_line_async('gnome-software'),
    'recent-items': () => GLib.spawn_command_line_async('xdg-open recent:///'),
    'force-quit': () => GLib.spawn_command_line_async('gnome-system-monitor'),
    'sleep': () => GLib.spawn_command_line_async('systemctl suspend'),
    'restart': () => GLib.spawn_command_line_async('gnome-session-quit --reboot'),
    'shut-down': () => GLib.spawn_command_line_async('gnome-session-quit --power-off'),
    'lock-screen': () => GLib.spawn_command_line_async('loginctl lock-session'),
    'log-out': () => GLib.spawn_command_line_async('gnome-session-quit'),

    // Finder Menu
    'open-settings-ext': () => GLib.spawn_command_line_async('gnome-extensions prefs appmenu@ChathurangaBW.github.io'),
    // hide-app, hide-others, show-all — moved to windowActions.js (direct JS eval)

    // File Menu
    'open-finder': () => GLib.spawn_command_line_async(`xdg-open ${HOME}`),
    'new-finder-win': () => GLib.spawn_command_line_async(`xdg-open ${HOME}`),
    'new-folder': () => createNewFolder(),

    'open-settings': () => GLib.spawn_command_line_async('gnome-control-center'),
    'empty-bin': () => GLib.spawn_command_line_async('gio trash --empty'),

    'eject': async () => {
        // Eject - show list of removable drives and eject them
        const drives = await getRemovableDrives();
        if (drives.length === 0) {
            Logger.debug('No removable drives found');
            return;
        }

        // Eject all removable drives
        for (const drive of drives) {
            if (drive.mountPoints.length > 0 || drive.size > 0) {
                await ejectDevice(drive.device);
            }
        }
    },

    // Go Menu
    'go-home': () => GLib.spawn_command_line_async(`xdg-open ${HOME}`),
    'go-recents': () => GLib.spawn_command_line_async('xdg-open recent:///'),
    'go-documents': () => GLib.spawn_command_line_async(`xdg-open "${specialDir(GLib.UserDirectory.DIRECTORY_DOCUMENTS)}"`),
    'go-desktop': () => GLib.spawn_command_line_async(`xdg-open "${specialDir(GLib.UserDirectory.DIRECTORY_DESKTOP)}"`),
    'go-downloads': () => GLib.spawn_command_line_async(`xdg-open "${specialDir(GLib.UserDirectory.DIRECTORY_DOWNLOAD)}"`),
    'go-computer': () => GLib.spawn_command_line_async('xdg-open computer:///'),
    'go-network': () => GLib.spawn_command_line_async('xdg-open network:///'),
    'go-applications': () => GLib.spawn_command_line_async('xdg-open /usr/share/applications'),
    'go-utilities': () => GLib.spawn_command_line_async('xdg-open /usr/bin'),

    // Help
    'open-system-help': () => GLib.spawn_command_line_async('yelp'),

    // Window — tile-left, tile-right, bring-all-front moved to windowActions.js

    // Feedback
    'send-feedback': () => {
        Gio.AppInfo.launch_default_for_uri(
            'https://github.com/ChathurangaBW/AppMenu',
            global.create_app_launch_context(0, -1)
        );
    },

    'app-details': (ctx, appId) => {
        if (appId) GLib.spawn_command_line_async(`gnome-software --details=${appId}`);
    },

    'about-appmenu': () => {
        Gio.AppInfo.launch_default_for_uri(
            'https://github.com/ChathurangaBW/AppMenu',
            global.create_app_launch_context(0, -1)
        );
    },
};
