import { useState } from "react";
import { Box, Text, useInput } from "ink";
import { useTheme } from "./theme";
import type { AgentDefinition } from "../agents/types";

type AgentSelectorProps = {
  agents: AgentDefinition[];
  currentId: string;
  onSelect: (id: string) => void;
};

export default function AgentSelector({
  agents,
  currentId,
  onSelect,
}: AgentSelectorProps) {
  const theme = useTheme();
  const startIndex = Math.max(0, agents.findIndex((a) => a.id === currentId));
  const [selectedIndex, setSelectedIndex] = useState(startIndex);

  useInput((_input, key) => {
    if (key.upArrow) {
      setSelectedIndex((i) => (i > 0 ? i - 1 : agents.length - 1));
    }
    if (key.downArrow) {
      setSelectedIndex((i) => (i < agents.length - 1 ? i + 1 : 0));
    }
    if (key.return) {
      onSelect(agents[selectedIndex].id);
    }
  });

  const primaryAgents = agents.filter((a) => a.mode === "primary");
  const subagents = agents.filter((a) => a.mode === "subagent");

  return (
    <Box flexGrow={1} flexDirection="column" alignItems="center" justifyContent="center">
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={theme.colors.secondary}
        paddingX={2}
        paddingY={1}
        width={60}
      >
        <Box marginBottom={1}>
          <Text bold color={theme.colors.secondary}>
            Select Agent Mode
          </Text>
        </Box>

        <Box marginBottom={1}>
          <Text color={theme.colors.muted}>Primary Modes</Text>
        </Box>
        {primaryAgents.map((agent, i) => {
          const globalIndex = agents.indexOf(agent);
          const isSelected = globalIndex === selectedIndex;
          return (
            <Box key={agent.id}>
              <Text
                color={isSelected ? theme.colors.primary : theme.colors.muted}
              >
                {isSelected ? "\u276f " : "  "}
              </Text>
              <Text
                bold={isSelected}
                color={isSelected ? theme.colors.text : theme.colors.muted}
              >
                {agent.name}
              </Text>
              <Text color={theme.colors.muted}>
                {" "}
                {agent.permissions.edit === "deny" ? "(read-only) " : ""}
              </Text>
            </Box>
          );
        })}

        {subagents.length > 0 && (
          <>
            <Box marginTop={1} marginBottom={1}>
              <Text color={theme.colors.muted}>Subagents</Text>
            </Box>
            {subagents.map((agent, i) => {
              const globalIndex = agents.indexOf(agent);
              const isSelected = globalIndex === selectedIndex;
              return (
                <Box key={agent.id}>
                  <Text
                    color={
                      isSelected ? theme.colors.primary : theme.colors.muted
                    }
                  >
                    {isSelected ? "\u276f " : "  "}
                  </Text>
                  <Text
                    bold={isSelected}
                    color={
                      isSelected ? theme.colors.text : theme.colors.muted
                    }
                  >
                    {agent.name}
                  </Text>
                </Box>
              );
            })}
          </>
        )}

        <Box marginTop={1}>
          <Text color={theme.colors.muted}>
            {"\u2191\u2193"} navigate  {"\u23ce"} select  <Text bold>esc</Text>{" "}
            cancel
          </Text>
        </Box>
      </Box>
    </Box>
  );
}
