import { afterEach, describe, expect, it } from 'vitest';
import { resetPlatformProvider } from '../src/utils/platform/index.js';
import {
  ALLOWED_KEYS,
  ARROW_KEY_CODES,
  ENTER_KEY_CODE,
  sendKeystrokeToTerminal,
  sendTextToTerminal,
  validateTextInput,
} from '../src/utils/send-text.js';

describe('send-text', () => {
  describe('validateTextInput', () => {
    it('should reject empty string', () => {
      const result = validateTextInput('');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Text cannot be empty');
    });

    it('should reject whitespace-only string', () => {
      const result = validateTextInput('   ');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Text cannot be empty');
    });

    it('should reject string with only newlines', () => {
      const result = validateTextInput('\n\n');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Text cannot be empty');
    });

    it('should accept valid text', () => {
      const result = validateTextInput('echo hello');
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should accept text with leading/trailing spaces', () => {
      const result = validateTextInput('  npm run build  ');
      expect(result.valid).toBe(true);
    });

    it('should accept multiline text', () => {
      const result = validateTextInput('line1\nline2\nline3');
      expect(result.valid).toBe(true);
    });

    it('should reject text exceeding maximum length', () => {
      const longText = 'a'.repeat(10001);
      const result = validateTextInput(longText);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('exceeds maximum length');
    });

    it('should accept text at exactly maximum length', () => {
      const maxText = 'a'.repeat(10000);
      const result = validateTextInput(maxText);
      expect(result.valid).toBe(true);
    });

    it('should accept text with special characters', () => {
      const result = validateTextInput('echo "hello world" | grep hello');
      expect(result.valid).toBe(true);
    });

    it('should accept text with unicode characters', () => {
      const result = validateTextInput('echo "こんにちは"');
      expect(result.valid).toBe(true);
    });
  });

  describe('sendTextToTerminal', () => {
    const originalPlatform = process.platform;

    afterEach(() => {
      Object.defineProperty(process, 'platform', {
        value: originalPlatform,
      });
      resetPlatformProvider();
    });

    it('should return error for unsupported platform', () => {
      Object.defineProperty(process, 'platform', {
        value: 'win32',
      });
      resetPlatformProvider();
      const result = sendTextToTerminal('/dev/pts/0', 'test');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Terminal control is not supported on this platform');
    });

    it('should return error for invalid tty path', () => {
      const result = sendTextToTerminal('/invalid/path', 'test');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid TTY path');
    });

    it('should return error for empty text', () => {
      const result = sendTextToTerminal('/dev/ttys001', '');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Text cannot be empty');
    });

    it('should return error for text exceeding max length', () => {
      const longText = 'a'.repeat(10001);
      const result = sendTextToTerminal('/dev/ttys001', longText);
      expect(result.success).toBe(false);
      expect(result.error).toContain('exceeds maximum length');
    });
  });

  describe('ALLOWED_KEYS', () => {
    it('should include arrow keys (up, down, left, right)', () => {
      expect(ALLOWED_KEYS.has('up')).toBe(true);
      expect(ALLOWED_KEYS.has('down')).toBe(true);
      expect(ALLOWED_KEYS.has('left')).toBe(true);
      expect(ALLOWED_KEYS.has('right')).toBe(true);
    });

    it('should include enter key', () => {
      expect(ALLOWED_KEYS.has('enter')).toBe(true);
    });
  });

  describe('ARROW_KEY_CODES', () => {
    it('should define correct macOS key codes for arrow keys', () => {
      expect(ARROW_KEY_CODES.up).toBe(126);
      expect(ARROW_KEY_CODES.down).toBe(125);
      expect(ARROW_KEY_CODES.left).toBe(123);
      expect(ARROW_KEY_CODES.right).toBe(124);
    });
  });

  describe('ENTER_KEY_CODE', () => {
    it('should be 36 (macOS key code for Return/Enter key)', () => {
      expect(ENTER_KEY_CODE).toBe(36);
    });
  });

  describe('sendKeystrokeToTerminal', () => {
    const originalPlatform = process.platform;

    afterEach(() => {
      Object.defineProperty(process, 'platform', {
        value: originalPlatform,
      });
      resetPlatformProvider();
    });

    it('should not reject arrow keys as invalid input', () => {
      // These should not return "Invalid key" error or "Key must be a single character" error
      // They may fail for other reasons (terminal not found, etc.)
      const keys = ['up', 'down', 'left', 'right', 'enter'];
      for (const key of keys) {
        const result = sendKeystrokeToTerminal('/dev/ttys001', key);
        expect(result.error).not.toBe('Invalid key. Allowed: y, n, a, 1-9, escape');
        expect(result.error).not.toBe('Key must be a single character or "escape"');
      }
    });

    it('should return error for unsupported platform', () => {
      Object.defineProperty(process, 'platform', {
        value: 'win32',
      });
      resetPlatformProvider();
      const result = sendKeystrokeToTerminal('/dev/pts/0', 'y');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Terminal control is not supported on this platform');
    });

    it('should return error for invalid tty path', () => {
      const result = sendKeystrokeToTerminal('/invalid/path', 'y');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid TTY path');
    });
  });
});
