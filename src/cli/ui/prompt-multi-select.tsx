//* Libraries imports
import { render } from "ink";

//* Local imports
import { MultiSelect, type MultiSelectOption } from "./MultiSelect.tsx";

export type MultiSelectFn<T extends string = string> = (
  message: string,
  options: readonly MultiSelectOption<T>[],
) => Promise<T[]>;

/**
 * Prompts the user with an Ink multi-select (Space toggle, Enter confirm).
 */
export async function promptMultiSelect<T extends string = string>(
  message: string,
  options: readonly MultiSelectOption<T>[],
): Promise<T[]> {
  return new Promise((resolve) => {
    let settled = false;

    const instance = render(
      <MultiSelect
        message={message}
        options={options}
        onResolve={(selected) => {
          if (settled) {
            return;
          }
          settled = true;
          instance.unmount();
          resolve(selected);
        }}
      />,
    );
  });
}
