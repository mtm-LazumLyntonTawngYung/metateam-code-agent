import { useState } from "react";
import { Box, Text, useInput } from "ink";
import DiffView from "./DiffView";
import { theme } from "./theme";

type PendingPermission = {
  toolName: string;
  args: Record<string, unknown>;
  onResponse: (response: "accept" | "reject" | "always") => void;
};

type PermissionPromptProps = {
  pending: PendingPermission;
};

export default function PermissionPrompt({ pending }: PermissionPromptProps) {
  const [highlighted, setHighlighted] = useState<string | null>(null);

  useInput((_input) => {
    const lower = _input.toLowerCase();
    if (lower === "y") pending.onResponse("accept");
    else if (lower === "n") pending.onResponse("reject");
    else if (lower === "a") pending.onResponse("always");
    else setHighlighted(lower);
  });

  return (
    <Box
      flexGrow={1}
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
    >
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={theme.colors.warning}
        paddingX={2}
        paddingY={1}
        width={72}
      >
        <Box marginBottom={1}>
          <Text bold color={theme.colors.warning}>
            {"[!]"} Agent wants to{" "}
            {pending.toolName === "run_bash" ? "run" : "modify"}
          </Text>
        </Box>

        {pending.toolName === "run_bash" && (
          <Box marginBottom={1} paddingX={1}>
            <Text color={theme.colors.text}>
              $ {String(pending.args.command ?? "")}
            </Text>
          </Box>
        )}

        {pending.toolName === "edit_file" && (
          <Box marginBottom={1}>
            <DiffView
              filePath={String(pending.args.path ?? "")}
              targetString={String(pending.args.targetString ?? "")}
              replacement={String(pending.args.replacement ?? "")}
            />
          </Box>
        )}

        <Box
          marginTop={1}
          borderStyle="single"
          borderColor={theme.colors.muted}
          paddingX={1}
          paddingY={0}
        >
          <Text color={theme.colors.text}>
            <Text
              bold
              color={highlighted === "y" ? theme.colors.primary : theme.colors.text}
            >
              [Y]
            </Text>{" "}
            Accept{"  "}
            <Text
              bold
              color={highlighted === "n" ? theme.colors.error : theme.colors.text}
            >
              [N]
            </Text>{" "}
            Reject{"  "}
            <Text
              bold
              color={highlighted === "a" ? theme.colors.warning : theme.colors.text}
            >
              [A]
            </Text>{" "}
            Always allow in session
          </Text>
        </Box>
      </Box>
    </Box>
  );
}

export type { PendingPermission };
