import type { PlatformProvider } from './types.js';

/**
 * No-op platform provider for unsupported platforms.
 * All operations return failure/empty results gracefully.
 */
export class NullPlatformProvider implements PlatformProvider {
  focusTerminalByTty(_tty: string): boolean {
    return false;
  }

  sendText(_tty: string, _text: string): { success: boolean; error?: string } {
    return { success: false, error: 'Terminal control is not supported on this platform' };
  }

  sendKeystroke(
    _tty: string,
    _key: string,
    _options?: { useControl?: boolean }
  ): { success: boolean; error?: string } {
    return { success: false, error: 'Terminal control is not supported on this platform' };
  }

  async captureScreen(_tty: string): Promise<string | null> {
    return null;
  }

  getSupportedTerminals(): string[] {
    return [];
  }

  isSupported(): boolean {
    return false;
  }
}
