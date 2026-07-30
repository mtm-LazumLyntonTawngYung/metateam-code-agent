import { Box, Text } from "ink";
import { useTheme } from "../theme";

type StatusbarProps = {
  mcpCount: number;
  agentName: string;
  agentId: string;
  latestVersion?: string | null;
  activeSkillName?: string | null;
};

export default function Statusbar({ mcpCount, agentName, latestVersion, activeSkillName }: StatusbarProps) {
  const theme = useTheme();
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
          {activeSkillName && (
            <Text color={theme.colors.success}>  |  \u25c9 {activeSkillName}</Text>
          )}
        </Text>
      </Box>
      <Box>
        <Text color={theme.colors.muted}>
          {latestVersion ? (
            <Text color={theme.colors.warning}>{"\u26a1"} {latestVersion}</Text>
          ) : (
            <Text>v1.0.0</Text>
          )}
        </Text>
      </Box>
    </Box>
  );
}
