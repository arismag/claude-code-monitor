import { accessSync, constants, writeFileSync } from 'node:fs';
import { getPlatformProvider } from './platform/index.js';

/**
 * Sanitize a string for safe use in AppleScript.
 * Escapes backslashes, double quotes, control characters, and AppleScript special chars.
 * @internal
 */
export function sanitizeForAppleScript(str: string): string {
  return str
    .replace(/\\/g, '\\\\') // Backslash (must be first)
    .replace(/"/g, '\\"') // Double quote
    .replace(/\n/g, '\\n') // Newline
    .replace(/\r/g, '\\r') // Carriage return
    .replace(/\t/g, '\\t') // Tab
    .replace(/\$/g, '\\$') // Dollar sign (variable reference in some contexts)
    .replace(/`/g, '\\`'); // Backtick
}

/**
 * TTY path pattern for validation.
 * Matches:
 *   - macOS: /dev/ttys000, /dev/tty000
 *   - Linux: /dev/pts/0
 * @internal
 */
const TTY_PATH_PATTERN = /^\/dev\/(ttys?\d+|pts\/\d+)$/;

/**
 * Validate TTY path format.
 * @internal
 */
export function isValidTtyPath(tty: string): boolean {
  return TTY_PATH_PATTERN.test(tty);
}

/**
 * Generate a title tag for a TTY path.
 * Used to identify terminal windows/tabs by their title.
 * @example generateTitleTag('/dev/ttys001') => 'ccm:ttys001'
 * @example generateTitleTag('/dev/pts/0') => 'ccm:pts-0'
 * @internal
 */
export function generateTitleTag(tty: string): string {
  const match = tty.match(/\/dev\/(ttys?\d+|pts\/\d+)$/);
  if (!match) return '';
  const ttyId = match[1].replace('/', '-');
  return `ccm:${ttyId}`;
}

/**
 * Generate an OSC (Operating System Command) escape sequence to set terminal title.
 * OSC 0 sets both icon name and window title.
 * @internal
 */
export function generateOscTitleSequence(title: string): string {
  return `\x1b]0;${title}\x07`;
}

/**
 * Set the terminal title by writing an OSC sequence to the TTY.
 * Returns true if successful, false if the TTY is not writable.
 * @internal
 */
export function setTtyTitle(tty: string, title: string): boolean {
  if (!isValidTtyPath(tty)) return false;
  try {
    accessSync(tty, constants.W_OK);
    writeFileSync(tty, generateOscTitleSequence(title));
    return true;
  } catch {
    return false;
  }
}

export function isMacOS(): boolean {
  return process.platform === 'darwin';
}

export function focusSession(tty: string): boolean {
  const provider = getPlatformProvider();
  if (!provider.isSupported()) return false;
  if (!isValidTtyPath(tty)) return false;

  return provider.focusTerminalByTty(tty);
}

export function getSupportedTerminals(): string[] {
  return getPlatformProvider().getSupportedTerminals();
}
