//* Libraries imports
import { Box, Text, useApp, useInput } from "ink";
import { useState } from "react";

//* Local imports
import { theme } from "./theme.ts";

type ConfirmProps = {
  message: string;
  onResolve: (accepted: boolean) => void;
};

export function Confirm(props: ConfirmProps) {
  const app = useApp();
  const [answered, setAnswered] = useState(false);

  useInput((input, key) => {
    if (answered) {
      return;
    }

    let accepted: boolean | null = null;

    if (key.return || input.toLowerCase() === "y") {
      accepted = true;
    } else if (input.toLowerCase() === "n") {
      accepted = false;
    }

    if (accepted === null) {
      return;
    }

    setAnswered(true);
    props.onResolve(accepted);
    app.exit();
  });

  return (
    <Box flexDirection="column" paddingY={1}>
      <Text>
        {props.message} <Text color={theme.muted}>(Y/n)</Text>
      </Text>
      <Text color={theme.info}>Press Y to confirm, N to cancel.</Text>
    </Box>
  );
}
