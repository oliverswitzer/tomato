/**
 * "Take me back" — app-level foreground restore only. Given the app name
 * Tomato last saw in focus before drift, decide the best-effort OS command
 * to bring that app forward. This is a pure decision function so it can be
 * unit-tested on a headless build machine; the actual process spawn lives in
 * main.ts's IPC handler.
 *
 * Scope note: this restores the app window, not an exact cursor position /
 * editor line / browser tab inside it. Deeper per-app restore needs
 * Accessibility APIs or per-app deep links and is a documented follow-up
 * (see KNOWN-GAPS.md).
 */
export interface ForegroundCommand {
  command: string;
  args: string[];
}

export type TakeMeBackResult = { success: true } | { success: false; error: string };

/**
 * `open -a <app>` asks macOS's Launch Services to bring the named app to the
 * foreground (launching it if it isn't running). It's best-effort: it can't
 * guarantee a specific window, tab, or cursor position — see the module doc.
 */
export function buildForegroundCommand(appName: string): ForegroundCommand {
  return { command: 'open', args: ['-a', appName] };
}

export function isValidAppName(appName: string): boolean {
  return typeof appName === 'string' && appName.trim().length > 0;
}
