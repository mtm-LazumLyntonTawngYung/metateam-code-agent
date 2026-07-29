import { useState } from "react";
import { Box, Text, useInput } from "ink";
import { theme } from "./theme";

const agents = [
  { id: "deepseek-v4", label: "DeepSeek V4 Flash Free", provider: "DeepSeek" },
  { id: "deepseek-r1", label: "DeepSeek R1", provider: "DeepSeek" },
  { id: "gpt-4o", label: "GPT-4o", provider: "OpenAI" },
  { id: "claude-35", label: "Claude 3.5 Sonnet", provider: "Anthropic" },
  { id: "metateam-zen", label: "MetaTeam Zen", provider: "MetaTeam" },
];

type AgentSelectorProps = {
  onSelect: (id: string) => void;
};

export default function AgentSelector({ onSelect }: AgentSelectorProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);

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

  return (
    <Box flexGrow={1} flexDirection="column" alignItems="center" justifyContent="center">
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={theme.colors.secondary}
        paddingX={2}
        paddingY={1}
        width={50}
      >
        <Box marginBottom={1}>
          <Text bold color={theme.colors.secondary}>
            Select Agent
          </Text>
        </Box>
        {agents.map((agent, i) => (
          <Box key={agent.id}>
            <Text color={i === selectedIndex ? theme.colors.primary : theme.colors.muted}>
              {i === selectedIndex ? "\u276f " : "  "}
            </Text>
            <Text bold={i === selectedIndex} color={i === selectedIndex ? theme.colors.text : theme.colors.muted}>
              {agent.label}
            </Text>
            <Text color={theme.colors.muted}> ({agent.provider})</Text>
          </Box>
        ))}
        <Box marginTop={1}>
          <Text color={theme.colors.muted}>
            {"\u2191\u2193"} navigate  {"\u23ce"} select  <Text bold>esc</Text> cancel
          </Text>
        </Box>
      </Box>
    </Box>
  );
}
