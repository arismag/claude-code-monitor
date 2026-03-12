import { execFileSync } from 'node:child_process';
import {
  accessSync,
  constants,
  readdirSync,
  readFileSync,
  readlinkSync,
  writeFileSync,
} from 'node:fs';
import { generateOscTitleSequence, isValidTtyPath } from '../focus.js';
import { hasXdotool } from './linux-tools.js';
import type { PlatformProvider } from './types.js';

/**
 * xdotool key name mapping from our key names.
 */
const XDOTOOL_KEY_MAP: Record<string, string> = {
  escape: 'Escape',
  enter: 'Return',
  up: 'Up',
  down: 'Down',
  left: 'Left',
  right: 'Right',
};

/**
 * Read the parent PID from /proc/<pid>/stat.
 * Field 4 (0-indexed: 3) is the ppid. The comm field (2) is in parens and may contain spaces.
 */
function getParentPid(pid: string): string | null {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf-8');
    // Format: pid (comm) state ppid ...
    // comm can contain spaces/parens, so find the last ')' first
    const closeParen = stat.lastIndexOf(')');
    if (closeParen === -1) return null;
    const rest = stat.slice(closeParen + 2); // skip ") "
    const fields = rest.split(' ');
    // fields[0] = state, fields[1] = ppid
    const ppid = fields[1];
    return ppid && ppid !== '0' && ppid !== '1' ? ppid : null;
  } catch {
    return null;
  }
}

/**
 * Try xdotool search --pid for the given PID, returning the first window ID or null.
 */
function findWindowByPid(pid: string): string | null {
  try {
    const output = execFileSync('xdotool', ['search', '--pid', pid], {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 5000,
    }).trim();
    const firstWindow = output.split('\n')[0];
    return firstWindow || null;
  } catch {
    return null;
  }
}

/**
 * Find the X11 window ID for a process attached to the given TTY.
 * Searches /proc/{pid}/fd/0 symlinks to find processes connected to the TTY,
 * then walks up the process tree to find the terminal emulator window.
 */
function findWindowByTty(tty: string): string | null {
  try {
    const procDirs = readdirSync('/proc').filter((d) => /^\d+$/.test(d));

    for (const pid of procDirs) {
      try {
        const fdTarget = readlinkSync(`/proc/${pid}/fd/0`);
        if (fdTarget === tty) {
          // Found a process on this TTY — walk up the process tree
          let currentPid: string | null = pid;
          for (let depth = 0; depth < 10 && currentPid; depth++) {
            const windowId = findWindowByPid(currentPid);
            if (windowId) return windowId;
            currentPid = getParentPid(currentPid);
          }
        }
      } catch {
        // Can't read this /proc entry, skip
      }
    }
  } catch {
    // /proc not available or unreadable
  }

  return null;
}

/**
 * Write directly to a TTY device.
 */
function writeTty(tty: string, data: string): boolean {
  try {
    accessSync(tty, constants.W_OK);
    writeFileSync(tty, data);
    return true;
  } catch {
    return false;
  }
}

export class LinuxPlatformProvider implements PlatformProvider {
  private readonly xdotoolAvailable: boolean;

  constructor() {
    this.xdotoolAvailable = hasXdotool();
  }

  focusTerminalByTty(tty: string): boolean {
    if (!isValidTtyPath(tty)) return false;

    if (this.xdotoolAvailable) {
      const windowId = findWindowByTty(tty);
      if (windowId) {
        try {
          execFileSync('xdotool', ['windowactivate', windowId], {
            encoding: 'utf-8',
            stdio: ['pipe', 'pipe', 'pipe'],
            timeout: 5000,
          });
          return true;
        } catch {
          // Fall through to OSC flash
        }
      }
    }

    // Fallback: flash the terminal title via OSC to draw attention
    return writeTty(tty, generateOscTitleSequence('>>> CCM FOCUS <<<'));
  }

  sendText(tty: string, text: string): { success: boolean; error?: string } {
    if (!isValidTtyPath(tty)) {
      return { success: false, error: 'Invalid TTY path' };
    }

    // Direct TTY write - writes text followed by newline (simulates Enter)
    const success = writeTty(tty, `${text}\n`);

    return success ? { success: true } : { success: false, error: 'Could not write to TTY' };
  }

  sendKeystroke(
    tty: string,
    key: string,
    options?: { useControl?: boolean }
  ): { success: boolean; error?: string } {
    if (!isValidTtyPath(tty)) {
      return { success: false, error: 'Invalid TTY path' };
    }

    const useControl = options?.useControl ?? false;
    const lowerKey = key.toLowerCase();

    // For Ctrl+C, write the interrupt character directly to TTY
    if (useControl && lowerKey === 'c') {
      const success = writeTty(tty, '\x03');
      return success ? { success: true } : { success: false, error: 'Could not write to TTY' };
    }

    // Try xdotool for keystroke sending (requires focus first)
    if (this.xdotoolAvailable) {
      const windowId = findWindowByTty(tty);
      if (windowId) {
        try {
          // Focus the window first
          execFileSync('xdotool', ['windowactivate', '--sync', windowId], {
            encoding: 'utf-8',
            stdio: ['pipe', 'pipe', 'pipe'],
            timeout: 5000,
          });

          // Map key name for xdotool
          const xdotoolKey = XDOTOOL_KEY_MAP[lowerKey] || key;

          execFileSync('xdotool', ['key', xdotoolKey], {
            encoding: 'utf-8',
            stdio: ['pipe', 'pipe', 'pipe'],
            timeout: 5000,
          });
          return { success: true };
        } catch {
          // Fall through to direct TTY write
        }
      }
    }

    // Fallback: write the character directly to TTY
    // This works for simple keys but not for special keys like arrows
    if (key.length === 1) {
      const success = writeTty(tty, key);
      return success ? { success: true } : { success: false, error: 'Could not write to TTY' };
    }

    // Map special keys to escape sequences for direct TTY write
    const escapeSequences: Record<string, string> = {
      escape: '\x1b',
      enter: '\n',
      up: '\x1b[A',
      down: '\x1b[B',
      right: '\x1b[C',
      left: '\x1b[D',
    };

    const sequence = escapeSequences[lowerKey];
    if (sequence) {
      const success = writeTty(tty, sequence);
      return success ? { success: true } : { success: false, error: 'Could not write to TTY' };
    }

    return { success: false, error: `Unsupported key: ${key}` };
  }

  async captureScreen(_tty: string): Promise<string | null> {
    // Screen capture on Linux is deferred to Phase 2
    return null;
  }

  getSupportedTerminals(): string[] {
    // Linux support is terminal-agnostic (uses TTY/X11 directly)
    return ['Any X11 terminal (via xdotool)', 'Any terminal (via TTY)'];
  }

  isSupported(): boolean {
    return true;
  }
}
