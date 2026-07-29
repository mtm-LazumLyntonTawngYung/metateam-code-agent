import { Box, Text } from "ink";
import { theme } from "../theme";

type StatusbarProps = {
  mcpCount: number;
  agentName: string;
  agentId: string;
};

export default function Statusbar({ mcpCount, agentName, agentId }: StatusbarProps) {
  return (
    <Box
      width="100%"
      borderStyle="single"
      borderColor={theme.colors.muted}
      paddingX={1}
    >
      <Box flexGrow={1}>
        <Text color={theme.colors.muted}>
          {"\u2699"} {mcpCount} MCP  |  <Text bold>{agentName}</Text>
        </Text>
      </Box>
      <Box>
        <Text color={theme.colors.muted}>v1.0.0</Text>
      </Box>
    </Box>
  );
}
