import { Box, Text, useInput } from "ink";
import { theme } from "./theme";

type ChatViewProps = {
  query: string;
  onBack: () => void;
};

export default function ChatView({ query, onBack }: ChatViewProps) {
  useInput((_input, key) => {
    if (key.escape) onBack();
  });

  return (
    <Box flexDirection="column" flexGrow={1} paddingX={2} paddingY={1}>
      <Box marginBottom={1}>
        <Text bold color={theme.colors.primary}>
          {"\u25b6"} {query}
        </Text>
      </Box>
      <Box borderStyle="round" borderColor={theme.colors.muted} paddingX={1} paddingY={1}>
        <Text color={theme.colors.muted}>{"\u25b0"} streaming...</Text>
      </Box>
      <Box marginTop={1}>
        <Text color={theme.colors.muted}>
          Press <Text bold>esc</Text> to return
        </Text>
      </Box>
    </Box>
  );
}
