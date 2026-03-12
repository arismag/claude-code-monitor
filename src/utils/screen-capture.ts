import { isValidTtyPath } from './focus.js';
import { getPlatformProvider } from './platform/index.js';

/**
 * Capture the terminal window associated with a TTY.
 * Delegates to the platform-specific provider.
 *
 * @param tty - The TTY path (e.g., "/dev/ttys001")
 * @returns Base64-encoded PNG string if successful, null otherwise
 */
export async function captureTerminalScreen(tty: string): Promise<string | null> {
  const provider = getPlatformProvider();
  if (!provider.isSupported()) {
    return null;
  }

  if (!tty || !isValidTtyPath(tty)) {
    return null;
  }

  return provider.captureScreen(tty);
}
