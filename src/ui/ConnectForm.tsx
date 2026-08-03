import { useState } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { loadLlmConfig, updateProvider, saveLlmConfig } from "../llm/config";
import { useTheme } from "./theme";

const PROVIDERS = [
  { id: "deepseek" as const, label: "DeepSeek", defaultUrl: "https://api.deepseek.com/v1" },
  { id: "openai" as const, label: "OpenAI", defaultUrl: "https://api.openai.com/v1" },
  { id: "anthropic" as const, label: "Anthropic", defaultUrl: "https://api.anthropic.com/v1" },
  { id: "openrouter" as const, label: "OpenRouter", defaultUrl: "https://openrouter.ai/api/v1" },
];

type Step = "provider" | "apiKey" | "done";

type ConnectFormProps = {
  onSave: () => void;
};

export default function ConnectForm({ onSave }: ConnectFormProps) {
  const theme = useTheme();
  const [step, setStep] = useState<Step>("provider");
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState("");

  useInput((_input, key) => {
    if (step === "done") {
      onSave();
      return;
    }
    if (step === "provider") {
      if (key.downArrow) setSelectedIdx((i) => Math.min(i + 1, PROVIDERS.length - 1));
      if (key.upArrow) setSelectedIdx((i) => Math.max(i - 1, 0));
      if (key.return) {
        setStep("apiKey");
        setError("");
      }
    }
    if (key.escape) {
      onSave();
    }
  });

  const handleApiKeySubmit = (value: string) => {
    if (!value.trim()) {
      setError("API key cannot be empty");
      return;
    }
    setError("");
    const selected = PROVIDERS[selectedIdx];
    try {
      updateProvider({
        id: selected.id,
        label: selected.label,
        apiKey: value.trim(),
        baseUrl: selected.defaultUrl,
        models: loadLlmConfig().providers.find((p) => p.id === selected.id)?.models ?? [],
      });
      if (selected.id === "openrouter") {
        const cfg = loadLlmConfig();
        saveLlmConfig({
          routing: {
            simpleModel: "openai/gpt-4o-mini",
            defaultModel: "openai/gpt-4o",
            reasoningModel: "anthropic/claude-sonnet-4",
            reasoningEnabled: false,
          },
        });
      }
      setStep("done");
    } catch {
      setError("Failed to save config");
    }
  };

  if (step === "done") {
    return (
      <Box flexGrow={1} flexDirection="column" alignItems="center" justifyContent="center">
        <Box
          flexDirection="column"
          borderStyle="round"
          borderColor={theme.colors.success}
          paddingX={3}
          paddingY={2}
          alignItems="center"
        >
          <Text color={theme.colors.success} bold>
            {"\u2713"} Provider connected
          </Text>
          <Text color={theme.colors.text}>{PROVIDERS[selectedIdx].label} API key saved.</Text>
          <Box marginTop={1}>
            <Text color={theme.colors.muted}>Press any key to continue</Text>
          </Box>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexGrow={1} flexDirection="column" alignItems="center" justifyContent="center">
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={theme.colors.warning}
        paddingX={2}
        paddingY={1}
        width={60}
      >
        <Text bold color={theme.colors.warning}>
          {"\u2699"} Connect AI Provider
        </Text>
        <Box marginTop={1}>
          {step === "provider" ? (
            <Box flexDirection="column">
              <Text color={theme.colors.text}>Select a provider:</Text>
              <Box marginTop={1} flexDirection="column">
                {PROVIDERS.map((p, i) => (
                  <Text key={p.id} color={i === selectedIdx ? theme.colors.primary : theme.colors.text}>
                    {i === selectedIdx ? "\u25b6 " : "  "}{p.label}
                  </Text>
                ))}
              </Box>
            </Box>
          ) : (
            <Box flexDirection="column">
              <Text color={theme.colors.text}>
                Enter API Key for {PROVIDERS[selectedIdx].label}:
              </Text>
              <Box marginTop={1}>
                <Text color="blue">| </Text>
                <TextInput
                  value={apiKey}
                  onChange={setApiKey}
                  onSubmit={handleApiKeySubmit}
                  placeholder={`${PROVIDERS[selectedIdx].id}-key...`}
                  mask="*"
                />
              </Box>
            </Box>
          )}
        </Box>
        {error && (
          <Box marginTop={1}>
            <Text color={theme.colors.error}>{error}</Text>
          </Box>
        )}
        <Box marginTop={1}>
          <Text color={theme.colors.muted}>
            {step === "provider"
              ? <Text><Text bold>arrows</Text> navigate  <Text bold>enter</Text> select  <Text bold>esc</Text> cancel</Text>
              : <Text><Text bold>enter</Text> confirm  <Text bold>esc</Text> cancel</Text>}
          </Text>
        </Box>
      </Box>
    </Box>
  );
}
