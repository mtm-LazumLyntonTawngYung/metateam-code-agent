import { Box, Text } from "ink";
import { theme } from "../theme";

type StatusbarProps = {
  mcpCount: number;
};

export default function Statusbar({ mcpCount }: StatusbarProps) {
  return (
    <Box
      width="100%"
      borderStyle="single"
      borderColor={theme.colors.muted}
      paddingX={1}
    >
      <Box flexGrow={1}>
        <Text color={theme.colors.muted}>
          ~  {"\u2699"} {mcpCount} MCP connected
        </Text>
      </Box>
      <Box>
        <Text color={theme.colors.muted}>v1.0.0</Text>
      </Box>
    </Box>
  );
}
