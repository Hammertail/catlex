//* Libraries imports
import { Box, Text, useApp, useInput } from "ink";
import { useState } from "react";

//* Local imports
import { theme } from "./theme.ts";

export type MultiSelectOption<T extends string = string> = {
  value: T;
  title: string;
  description: string;
};

type MultiSelectProps<T extends string = string> = {
  message: string;
  options: readonly MultiSelectOption<T>[];
  onResolve: (selected: T[]) => void;
};

export function MultiSelect<T extends string = string>(props: MultiSelectProps<T>) {
  const app = useApp();
  const [answered, setAnswered] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [selectedValues, setSelectedValues] = useState<ReadonlySet<T>>(() => new Set());

  useInput((input, key) => {
    if (answered || props.options.length === 0) {
      return;
    }

    if (key.upArrow) {
      setFocusedIndex((index) => (index <= 0 ? props.options.length - 1 : index - 1));
      return;
    }

    if (key.downArrow) {
      setFocusedIndex((index) => (index >= props.options.length - 1 ? 0 : index + 1));
      return;
    }

    if (input === " ") {
      const focused = props.options[focusedIndex];
      if (!focused) {
        return;
      }

      setSelectedValues((current) => {
        const next = new Set(current);
        if (next.has(focused.value)) {
          next.delete(focused.value);
        } else {
          next.add(focused.value);
        }
        return next;
      });
      return;
    }

    if (key.return) {
      const selected = props.options
        .filter((option) => selectedValues.has(option.value))
        .map((option) => option.value);
      setAnswered(true);
      props.onResolve(selected);
      app.exit();
    }
  });

  return (
    <Box flexDirection="column" paddingY={1}>
      <Text>{props.message}</Text>
      <Box flexDirection="column" paddingTop={1}>
        {props.options.map((option, index) => {
          const focused = index === focusedIndex;
          const selected = selectedValues.has(option.value);
          const marker = selected ? "[x]" : "[ ]";
          const focusMarker = focused ? ">" : " ";

          return (
            <Box key={option.value} flexDirection="column" paddingBottom={1}>
              <Text color={focused ? theme.info : undefined}>
                {focusMarker} {marker} {option.title}
              </Text>
              <Text color={theme.muted}>
                {"    "}
                {option.description}
              </Text>
            </Box>
          );
        })}
      </Box>
      <Text color={theme.info}>Space toggle · Enter confirm</Text>
    </Box>
  );
}
