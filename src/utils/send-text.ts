import { isValidTtyPath } from './focus.js';
import { getPlatformProvider } from './platform/index.js';

/**
 * Maximum text length allowed for sending to terminal.
 * This is a security measure to prevent accidental or malicious large inputs.
 */
const MAX_TEXT_LENGTH = 10000;

/**
 * Validate text input for sending to terminal.
 * @internal
 */
export function validateTextInput(text: string): { valid: boolean; error?: string } {
  if (!text || text.trim().length === 0) {
    return { valid: false, error: 'Text cannot be empty' };
  }

  if (text.length > MAX_TEXT_LENGTH) {
    return { valid: false, error: `Text exceeds maximum length of ${MAX_TEXT_LENGTH} characters` };
  }

  return { valid: true };
}

/**
 * Allowed keys for permission prompt responses.
 */
export const ALLOWED_KEYS = new Set([
  'y',
  'n',
  'a',
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  'escape',
  'up',
  'down',
  'left',
  'right',
  'enter',
]);

/**
 * macOS key codes for arrow keys.
 */
export const ARROW_KEY_CODES = {
  up: 126,
  down: 125,
  left: 123,
  right: 124,
} as const;

/**
 * macOS key code for Enter/Return key.
 */
export const ENTER_KEY_CODE = 36;

/**
 * Send text to a terminal session and execute it (press Enter).
 * Delegates to the platform-specific provider.
 *
 * @param tty - The TTY path of the target terminal session
 * @param text - The text to send to the terminal
 * @returns Result object with success status
 */
export function sendTextToTerminal(
  tty: string,
  text: string
): { success: boolean; error?: string } {
  const provider = getPlatformProvider();
  if (!provider.isSupported()) {
    return { success: false, error: 'Terminal control is not supported on this platform' };
  }

  if (!isValidTtyPath(tty)) {
    return { success: false, error: 'Invalid TTY path' };
  }

  const validation = validateTextInput(text);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  return provider.sendText(tty, text);
}

/**
 * Send a single keystroke to a terminal session.
 * Used for responding to permission prompts (y/n/a), Ctrl+C to abort, or Escape to cancel.
 *
 * @param tty - The TTY path of the target terminal session
 * @param key - Single character key to send (y, n, a, 1-9, escape, etc.)
 * @param useControl - If true, send with Control modifier (for Ctrl+C)
 * @returns Result object with success status
 */
export function sendKeystrokeToTerminal(
  tty: string,
  key: string,
  useControl = false
): { success: boolean; error?: string } {
  const provider = getPlatformProvider();
  if (!provider.isSupported()) {
    return { success: false, error: 'Terminal control is not supported on this platform' };
  }

  if (!isValidTtyPath(tty)) {
    return { success: false, error: 'Invalid TTY path' };
  }

  const lowerKey = key.toLowerCase();
  const isEscapeKey = lowerKey === 'escape';
  const isArrowKey = lowerKey in ARROW_KEY_CODES;
  const isEnterKey = lowerKey === 'enter';
  const isSpecialKey = isEscapeKey || isArrowKey || isEnterKey;

  // Validate key input (special keys are allowed, others must be single character)
  if (!isSpecialKey && (!key || key.length !== 1)) {
    return { success: false, error: 'Key must be a single character or "escape"' };
  }

  // Only allow specific keys for security
  if (!useControl && !ALLOWED_KEYS.has(lowerKey)) {
    return { success: false, error: 'Invalid key. Allowed: y, n, a, 1-9, escape' };
  }

  // For Ctrl+C, only allow 'c'
  if (useControl && lowerKey !== 'c') {
    return { success: false, error: 'Only Ctrl+C is supported' };
  }

  return provider.sendKeystroke(tty, key, { useControl });
}
