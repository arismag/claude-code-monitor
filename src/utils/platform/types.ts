export interface PlatformProvider {
  focusTerminalByTty(tty: string): boolean;
  sendText(tty: string, text: string): { success: boolean; error?: string };
  sendKeystroke(
    tty: string,
    key: string,
    options?: { useControl?: boolean }
  ): { success: boolean; error?: string };
  captureScreen(tty: string): Promise<string | null>;
  getSupportedTerminals(): string[];
  isSupported(): boolean;
}
