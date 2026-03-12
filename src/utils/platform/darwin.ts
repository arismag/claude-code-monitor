import { execFile, execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile, unlink } from 'node:fs/promises';
import { promisify } from 'node:util';
import { executeAppleScript } from '../applescript.js';
import { generateTitleTag, sanitizeForAppleScript, setTtyTitle } from '../focus.js';
import { executeWithTerminalFallback } from '../terminal-strategy.js';
import type { PlatformProvider } from './types.js';

const execFileAsync = promisify(execFile);

// ============================================
// Focus
// ============================================

function buildITerm2FocusScript(tty: string): string {
  const safeTty = sanitizeForAppleScript(tty);
  return `
tell application "iTerm2"
  repeat with aWindow in windows
    repeat with aTab in tabs of aWindow
      repeat with aSession in sessions of aTab
        if tty of aSession is "${safeTty}" then
          select aSession
          select aTab
          tell aWindow to select
          activate
          return true
        end if
      end repeat
    end repeat
  end repeat
  return false
end tell
`;
}

function buildTerminalAppFocusScript(tty: string): string {
  const safeTty = sanitizeForAppleScript(tty);
  return `
tell application "Terminal"
  repeat with aWindow in windows
    repeat with aTab in tabs of aWindow
      if tty of aTab is "${safeTty}" then
        set selected of aTab to true
        set index of aWindow to 1
        activate
        return true
      end if
    end repeat
  end repeat
  return false
end tell
`;
}

function buildGhosttyActivateScript(): string {
  return `
tell application "Ghostty"
  activate
end tell
return true
`;
}

function buildGhosttyFocusByTitleScript(titleTag: string): string {
  const safeTag = sanitizeForAppleScript(titleTag);
  return `
-- Activate Ghostty first (required when called from Web UI with Ghostty in background)
tell application "Ghostty" to activate
delay 0.1

tell application "System Events"
  if not (exists process "Ghostty") then
    return false
  end if
  tell process "Ghostty"
    -- Search Window menu for the title tag (uses "name" attribute, not "title")
    try
      set windowMenu to menu "Window" of menu bar 1
      set menuItems to every menu item of windowMenu whose name contains "${safeTag}"
      if (count of menuItems) > 0 then
        -- Ghostty quirk: first click selects the tab, second click brings the window to front
        click item 1 of menuItems
        delay 0.05
        click item 1 of menuItems
        delay 0.05
        -- Raise the correct window (overrides initial activate which may have raised wrong window)
        try
          perform action "AXRaise" of window 1
        end try
        return true
      end if
    end try
  end tell
end tell
return false
`;
}

function focusGhostty(tty: string): boolean {
  const titleTag = generateTitleTag(tty);
  const titleSet = setTtyTitle(tty, titleTag);

  if (titleSet) {
    const waitScript = 'delay 0.2';
    executeAppleScript(waitScript);
  }

  const success = executeAppleScript(buildGhosttyFocusByTitleScript(titleTag));

  if (titleSet) {
    setTtyTitle(tty, '');
  }

  if (success) return true;
  return executeAppleScript(buildGhosttyActivateScript());
}

// ============================================
// Send Text
// ============================================

function buildITerm2SendTextScript(tty: string, text: string): string {
  const safeTty = sanitizeForAppleScript(tty);
  const safeText = sanitizeForAppleScript(text);
  return `
set the clipboard to "${safeText}"
tell application "iTerm2"
  repeat with aWindow in windows
    repeat with aTab in tabs of aWindow
      repeat with aSession in sessions of aTab
        if tty of aSession is "${safeTty}" then
          select aSession
          select aTab
          tell aWindow to select
          activate
          delay 0.3
          tell application "System Events"
            set frontmost of process "iTerm2" to true
            delay 0.1
            tell process "iTerm2"
              keystroke "v" using command down
              delay 0.1
              keystroke return
            end tell
          end tell
          return true
        end if
      end repeat
    end repeat
  end repeat
  return false
end tell
`;
}

function buildTerminalAppSendTextScript(tty: string, text: string): string {
  const safeTty = sanitizeForAppleScript(tty);
  const safeText = sanitizeForAppleScript(text);
  return `
set the clipboard to "${safeText}"
tell application "Terminal"
  repeat with aWindow in windows
    repeat with aTab in tabs of aWindow
      if tty of aTab is "${safeTty}" then
        set selected of aTab to true
        set index of aWindow to 1
        activate
        delay 0.2
        tell application "System Events"
          tell process "Terminal"
            keystroke "v" using command down
            delay 0.1
            keystroke return
          end tell
        end tell
        return true
      end if
    end repeat
  end repeat
  return false
end tell
`;
}

function buildGhosttyFocusScript(titleTag: string): string {
  const safeTag = sanitizeForAppleScript(titleTag);
  return `
-- Activate Ghostty first (required when called from Web UI with Ghostty in background)
tell application "Ghostty" to activate
delay 0.1

tell application "System Events"
  if not (exists process "Ghostty") then
    return false
  end if
  tell process "Ghostty"
    try
      set windowMenu to menu "Window" of menu bar 1
      set menuItems to every menu item of windowMenu whose name contains "${safeTag}"
      if (count of menuItems) > 0 then
        -- Ghostty quirk: first click selects the tab, second click brings the window to front
        click item 1 of menuItems
        delay 0.05
        click item 1 of menuItems
        delay 0.05
        -- Raise the correct window (overrides initial activate which may have raised wrong window)
        try
          perform action "AXRaise" of window 1
        end try
        return true
      end if
    end try
  end tell
end tell
return false
`;
}

function buildGhosttySendTextScript(text: string): string {
  const safeText = sanitizeForAppleScript(text);
  return `
set the clipboard to "${safeText}"
delay 0.1
tell application "System Events"
  tell process "Ghostty"
    keystroke "v" using command down
    delay 0.2
    keystroke return
  end tell
end tell
return true
`;
}

function sendTextToGhostty(tty: string, text: string): boolean {
  const titleTag = generateTitleTag(tty);
  const titleSet = setTtyTitle(tty, titleTag);

  if (titleSet) {
    const waitScript = 'delay 0.2';
    executeAppleScript(waitScript);
  }

  const focusScript = buildGhosttyFocusScript(titleTag);
  executeAppleScript(focusScript);

  if (titleSet) {
    setTtyTitle(tty, '');
  }

  return executeAppleScript(buildGhosttySendTextScript(text));
}

// ============================================
// Send Keystroke
// ============================================

/**
 * macOS key codes for special keys.
 */
const ESCAPE_KEY_CODE = 53;
const ENTER_KEY_CODE = 36;
const ARROW_KEY_CODES = {
  up: 126,
  down: 125,
  left: 123,
  right: 124,
} as const;

function buildITerm2KeystrokeScript(
  tty: string,
  key: string,
  useControl: boolean,
  useKeyCode?: number
): string {
  const safeTty = sanitizeForAppleScript(tty);
  const safeKey = sanitizeForAppleScript(key);
  const modifiers = useControl ? ' using control down' : '';
  const keystrokeCmd =
    useKeyCode !== undefined ? `key code ${useKeyCode}` : `keystroke "${safeKey}"${modifiers}`;
  return `
tell application "iTerm2"
  repeat with aWindow in windows
    repeat with aTab in tabs of aWindow
      repeat with aSession in sessions of aTab
        if tty of aSession is "${safeTty}" then
          select aSession
          select aTab
          tell aWindow to select
          activate
          delay 0.2
          tell application "System Events"
            set frontmost of process "iTerm2" to true
            delay 0.1
            tell process "iTerm2"
              ${keystrokeCmd}
            end tell
          end tell
          return true
        end if
      end repeat
    end repeat
  end repeat
  return false
end tell
`;
}

function buildTerminalAppKeystrokeScript(
  tty: string,
  key: string,
  useControl: boolean,
  useKeyCode?: number
): string {
  const safeTty = sanitizeForAppleScript(tty);
  const safeKey = sanitizeForAppleScript(key);
  const modifiers = useControl ? ' using control down' : '';
  const keystrokeCmd =
    useKeyCode !== undefined ? `key code ${useKeyCode}` : `keystroke "${safeKey}"${modifiers}`;
  return `
tell application "Terminal"
  repeat with aWindow in windows
    repeat with aTab in tabs of aWindow
      if tty of aTab is "${safeTty}" then
        set selected of aTab to true
        set index of aWindow to 1
        activate
        delay 0.2
        tell application "System Events"
          tell process "Terminal"
            ${keystrokeCmd}
          end tell
        end tell
        return true
      end if
    end repeat
  end repeat
  return false
end tell
`;
}

function buildGhosttyKeystrokeScript(
  key: string,
  useControl: boolean,
  useKeyCode?: number
): string {
  const safeKey = sanitizeForAppleScript(key);
  const modifiers = useControl ? ' using control down' : '';
  const keystrokeCmd =
    useKeyCode !== undefined ? `key code ${useKeyCode}` : `keystroke "${safeKey}"${modifiers}`;
  return `
delay 0.1
tell application "System Events"
  tell process "Ghostty"
    ${keystrokeCmd}
  end tell
end tell
return true
`;
}

function sendKeystrokeToGhostty(
  tty: string,
  key: string,
  useControl: boolean,
  useKeyCode?: number
): boolean {
  const titleTag = generateTitleTag(tty);
  const titleSet = setTtyTitle(tty, titleTag);

  if (titleSet) {
    const waitScript = 'delay 0.2';
    executeAppleScript(waitScript);
  }

  const focusScript = buildGhosttyFocusScript(titleTag);
  executeAppleScript(focusScript);

  if (titleSet) {
    setTtyTitle(tty, '');
  }

  return executeAppleScript(buildGhosttyKeystrokeScript(key, useControl, useKeyCode));
}

function resolveKeyCode(key: string): number | undefined {
  const lowerKey = key.toLowerCase();
  if (lowerKey === 'escape') return ESCAPE_KEY_CODE;
  if (lowerKey === 'enter') return ENTER_KEY_CODE;
  if (lowerKey in ARROW_KEY_CODES) return ARROW_KEY_CODES[lowerKey as keyof typeof ARROW_KEY_CODES];
  return undefined;
}

// ============================================
// Screen Capture
// ============================================

interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

async function captureRegion(bounds: WindowBounds): Promise<string | null> {
  const tempPath = `/tmp/ccm-capture-${randomUUID()}.png`;
  const region = `${bounds.x},${bounds.y},${bounds.width},${bounds.height}`;

  try {
    await execFileAsync('screencapture', ['-R', region, '-x', tempPath], {
      encoding: 'utf-8',
      timeout: 10000,
    });

    const imageBuffer = await readFile(tempPath);
    await unlink(tempPath).catch(() => {});
    return imageBuffer.toString('base64');
  } catch {
    await unlink(tempPath).catch(() => {});
    return null;
  }
}

function executeAppleScriptWithResult(script: string): string | null {
  try {
    const result = execFileSync('osascript', ['-e', script], {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 10000,
    }).trim();
    return result;
  } catch {
    return null;
  }
}

function parseWindowBounds(result: string): WindowBounds | null {
  const parts = result.split(',').map((s) => parseInt(s.trim(), 10));
  if (parts.length !== 4 || parts.some(Number.isNaN)) {
    return null;
  }
  return { x: parts[0], y: parts[1], width: parts[2], height: parts[3] };
}

function buildITerm2WindowBoundsScript(tty: string): string {
  const safeTty = sanitizeForAppleScript(tty);
  return `
tell application "System Events"
  if not (exists process "iTerm2") then return ""
end tell

tell application "iTerm2"
  repeat with aWindow in windows
    repeat with aTab in tabs of aWindow
      repeat with aSession in sessions of aTab
        if tty of aSession is "${safeTty}" then
          tell application "System Events"
            tell process "iTerm2"
              set windowList to windows
              repeat with sysWindow in windowList
                try
                  set pos to position of sysWindow
                  set sz to size of sysWindow
                  return (item 1 of pos as text) & ", " & (item 2 of pos as text) & ", " & (item 1 of sz as text) & ", " & (item 2 of sz as text)
                end try
              end repeat
            end tell
          end tell
        end if
      end repeat
    end repeat
  end repeat
end tell
return ""
`;
}

function buildTerminalAppWindowBoundsScript(tty: string): string {
  const safeTty = sanitizeForAppleScript(tty);
  return `
tell application "System Events"
  if not (exists process "Terminal") then return ""
end tell

tell application "Terminal"
  repeat with aWindow in windows
    repeat with aTab in tabs of aWindow
      if tty of aTab is "${safeTty}" then
        set windowId to id of aWindow
        tell application "System Events"
          tell process "Terminal"
            repeat with sysWindow in windows
              try
                set pos to position of sysWindow
                set sz to size of sysWindow
                return (item 1 of pos as text) & ", " & (item 2 of pos as text) & ", " & (item 1 of sz as text) & ", " & (item 2 of sz as text)
              end try
            end repeat
          end tell
        end tell
      end if
    end repeat
  end repeat
end tell
return ""
`;
}

function buildGhosttyWindowBoundsScript(titleTag: string): string {
  const safeTag = sanitizeForAppleScript(titleTag);
  return `
tell application "System Events"
  if not (exists process "Ghostty") then return ""
  tell process "Ghostty"
    repeat with sysWindow in windows
      try
        set windowTitle to name of sysWindow
        if windowTitle contains "${safeTag}" then
          set pos to position of sysWindow
          set sz to size of sysWindow
          return (item 1 of pos as text) & ", " & (item 2 of pos as text) & ", " & (item 1 of sz as text) & ", " & (item 2 of sz as text)
        end if
      end try
    end repeat
    -- Fallback: return first window
    if (count of windows) > 0 then
      set sysWindow to window 1
      set pos to position of sysWindow
      set sz to size of sysWindow
      return (item 1 of pos as text) & ", " & (item 2 of pos as text) & ", " & (item 1 of sz as text) & ", " & (item 2 of sz as text)
    end if
  end tell
end tell
return ""
`;
}

async function captureITerm2(tty: string): Promise<string | null> {
  const result = executeAppleScriptWithResult(buildITerm2WindowBoundsScript(tty));
  if (!result) return null;
  const bounds = parseWindowBounds(result);
  if (!bounds) return null;
  return await captureRegion(bounds);
}

async function captureTerminalApp(tty: string): Promise<string | null> {
  const result = executeAppleScriptWithResult(buildTerminalAppWindowBoundsScript(tty));
  if (!result) return null;
  const bounds = parseWindowBounds(result);
  if (!bounds) return null;
  return await captureRegion(bounds);
}

async function captureGhosttyWindow(tty: string): Promise<string | null> {
  const titleTag = generateTitleTag(tty);
  const titleSet = setTtyTitle(tty, titleTag);

  if (titleSet) {
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  const result = executeAppleScriptWithResult(buildGhosttyWindowBoundsScript(titleTag));

  if (titleSet) {
    setTtyTitle(tty, '');
  }

  if (!result) return null;
  const bounds = parseWindowBounds(result);
  if (!bounds) return null;
  return await captureRegion(bounds);
}

// ============================================
// Provider
// ============================================

export class DarwinPlatformProvider implements PlatformProvider {
  focusTerminalByTty(tty: string): boolean {
    return executeWithTerminalFallback({
      iTerm2: () => executeAppleScript(buildITerm2FocusScript(tty)),
      terminalApp: () => executeAppleScript(buildTerminalAppFocusScript(tty)),
      ghostty: () => focusGhostty(tty),
    });
  }

  sendText(tty: string, text: string): { success: boolean; error?: string } {
    const success = executeWithTerminalFallback({
      iTerm2: () => executeAppleScript(buildITerm2SendTextScript(tty, text)),
      terminalApp: () => executeAppleScript(buildTerminalAppSendTextScript(tty, text)),
      ghostty: () => sendTextToGhostty(tty, text),
    });

    return success
      ? { success: true }
      : { success: false, error: 'Could not send text to any terminal' };
  }

  sendKeystroke(
    tty: string,
    key: string,
    options?: { useControl?: boolean }
  ): { success: boolean; error?: string } {
    const useControl = options?.useControl ?? false;
    const useKeyCode = resolveKeyCode(key);

    const success = executeWithTerminalFallback({
      iTerm2: () =>
        executeAppleScript(buildITerm2KeystrokeScript(tty, key, useControl, useKeyCode)),
      terminalApp: () =>
        executeAppleScript(buildTerminalAppKeystrokeScript(tty, key, useControl, useKeyCode)),
      ghostty: () => sendKeystrokeToGhostty(tty, key, useControl, useKeyCode),
    });

    return success
      ? { success: true }
      : { success: false, error: 'Could not send keystroke to any terminal' };
  }

  async captureScreen(tty: string): Promise<string | null> {
    const result1 = await captureITerm2(tty);
    if (result1) return result1;

    const result2 = await captureTerminalApp(tty);
    if (result2) return result2;

    const result3 = await captureGhosttyWindow(tty);
    if (result3) return result3;

    return null;
  }

  getSupportedTerminals(): string[] {
    return ['iTerm2', 'Terminal.app', 'Ghostty'];
  }

  isSupported(): boolean {
    return true;
  }
}
