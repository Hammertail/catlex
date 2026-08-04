/**
 * Message thrown when an Ink prompt would hang because the process is not attached
 * to an interactive terminal (e.g. `catlex ci < /dev/null` or CI without `--yes`).
 */
export const NON_INTERACTIVE_ERROR_MESSAGE =
  "confirmation is required, but stdin is not interactive.\nUse --yes to run this command in CI.";

/**
 * Ensures stdin and stdout are TTYs before opening an interactive Ink prompt.
 * Without this check, Ink's raw-mode failure leaves the prompt Promise unsettled
 * and the CLI hangs until killed.
 */
export function assertInteractiveTerminal(): void {
  if (process.stdin.isTTY === true && process.stdout.isTTY === true) {
    return;
  }

  throw new Error(NON_INTERACTIVE_ERROR_MESSAGE);
}
