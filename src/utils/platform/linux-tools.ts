import { execFileSync } from 'node:child_process';

/**
 * Check if a command is available on the system.
 */
export function isCommandAvailable(command: string): boolean {
  try {
    execFileSync('which', [command], {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Detect the display server type (x11, wayland, or null).
 */
export function getDisplayServerType(): 'x11' | 'wayland' | null {
  const sessionType = process.env.XDG_SESSION_TYPE;
  if (sessionType === 'x11') return 'x11';
  if (sessionType === 'wayland') return 'wayland';

  // Fallback: check if DISPLAY is set (X11)
  if (process.env.DISPLAY) return 'x11';

  // Fallback: check if WAYLAND_DISPLAY is set
  if (process.env.WAYLAND_DISPLAY) return 'wayland';

  return null;
}

/**
 * Check if xdotool is available and X11 is running.
 */
export function hasXdotool(): boolean {
  return getDisplayServerType() === 'x11' && isCommandAvailable('xdotool');
}
