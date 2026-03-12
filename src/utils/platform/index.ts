import { DarwinPlatformProvider } from './darwin.js';
import { LinuxPlatformProvider } from './linux.js';
import { NullPlatformProvider } from './null.js';
import type { PlatformProvider } from './types.js';

let cachedProvider: PlatformProvider | null = null;

/**
 * Get the platform-specific provider.
 * Returns a singleton instance based on the current platform.
 */
export function getPlatformProvider(): PlatformProvider {
  if (cachedProvider) return cachedProvider;

  switch (process.platform) {
    case 'darwin':
      cachedProvider = new DarwinPlatformProvider();
      break;
    case 'linux':
      cachedProvider = new LinuxPlatformProvider();
      break;
    default:
      cachedProvider = new NullPlatformProvider();
      break;
  }

  return cachedProvider;
}

/**
 * Reset the cached provider (for testing).
 * @internal
 */
export function resetPlatformProvider(): void {
  cachedProvider = null;
}

export type { PlatformProvider } from './types.js';
