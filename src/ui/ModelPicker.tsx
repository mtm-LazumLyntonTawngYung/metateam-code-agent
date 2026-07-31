import { useState } from "react";
import { Box, Text, useInput } from "ink";
import { KNOWN_MODELS, type ModelConfig } from "../llm/types";
import { saveLlmConfig, loadLlmConfig } from "../llm/config";
import { saveConfig } from "../config";
import { useTheme } from "./theme";

type ModelPickerProps = {
  currentModelId: string;
  onSelect: (modelId: string) => void;
};

export default function ModelPicker({ currentModelId, onSelect }: ModelPickerProps) {
  const theme = useTheme();
  const [selectedIndex, setSelectedIndex] = useState(0);

  const models = KNOWN_MODELS;

  useInput((_input, key) => {
    if (key.upArrow) setSelectedIndex((i) => (i > 0 ? i - 1 : models.length - 1));
    if (key.downArrow) setSelectedIndex((i) => (i < models.length - 1 ? i + 1 : 0));
    if (key.return) {
      const model = models[selectedIndex];
      const cfg = loadLlmConfig();
      saveLlmConfig({ ...cfg, routing: { ...cfg.routing, defaultModel: model.id } });
      saveConfig({ selectedModel: model.id });
      onSelect(model.id);
    }
  });

  return (
    <Box flexGrow={1} flexDirection="column" alignItems="center" justifyContent="center">
      <Box flexDirection="column" borderStyle="round" borderColor={theme.colors.warning} paddingX={2} paddingY={1} width={55}>
        <Box marginBottom={1}>
          <Text bold color={theme.colors.warning}>Models</Text>
        </Box>
        {models.map((m, i) => {
          const isCurrent = m.id === currentModelId;
          const isSelected = i === selectedIndex;
          return (
            <Box key={m.id + m.tier}>
              <Text color={isSelected ? theme.colors.primary : theme.colors.muted}>
                {isSelected ? "\u276f " : "  "}
              </Text>
              <Text bold={isSelected} color={isCurrent ? theme.colors.success : isSelected ? theme.colors.text : theme.colors.muted}>
                {m.displayName}
              </Text>
              <Text color={theme.colors.muted}>
                {" "}({m.provider}, {m.tier})
              </Text>
              {isCurrent && <Text color={theme.colors.warning}>  \u2713</Text>}
            </Box>
          );
        })}
        <Box marginTop={1}>
          <Text color={theme.colors.muted}>
            {"\u2191\u2193"} navigate  {"\u23ce"} select  <Text bold>esc</Text> cancel
          </Text>
        </Box>
      </Box>
    </Box>
  );
}
