//* Libraries imports
import { render } from "ink";

//* Local imports
import { Confirm } from "./Confirm.tsx";
import { assertInteractiveTerminal } from "./interactive.ts";

export type ConfirmFn = (message: string) => Promise<boolean>;

/**
 * Prompts the user with an Ink Y/n confirm dialog.
 */
export async function promptConfirm(message: string): Promise<boolean> {
  assertInteractiveTerminal();

  return new Promise((resolve) => {
    let settled = false;

    const instance = render(
      <Confirm
        message={message}
        onResolve={(accepted) => {
          if (settled) {
            return;
          }
          settled = true;
          instance.unmount();
          resolve(accepted);
        }}
      />,
    );
  });
}
