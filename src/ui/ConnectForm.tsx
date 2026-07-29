import { useState } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { saveConfig } from "../config";
import { theme } from "./theme";

type Step = "apiKey" | "endpoint" | "done";

type ConnectFormProps = {
  onSave: () => void;
};

export default function ConnectForm({ onSave }: ConnectFormProps) {
  const [step, setStep] = useState<Step>("apiKey");
  const [apiKey, setApiKey] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [error, setError] = useState("");

  useInput((_input, key) => {
    if (step === "done") {
      onSave();
      return;
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
    setStep("endpoint");
  };

  const handleEndpointSubmit = (value: string) => {
    const ep = value.trim() || "https://api.deepseek.com/v1";
    try {
      saveConfig({ apiKey: apiKey.trim(), endpoint: ep });
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
          <Text color={theme.colors.text}>API key and endpoint saved.</Text>
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
          {step === "apiKey" ? (
            <Box flexDirection="column">
              <Text color={theme.colors.text}>Enter your API Key:</Text>
              <Box marginTop={1}>
                <Text color="blue">| </Text>
                <TextInput
                  value={apiKey}
                  onChange={setApiKey}
                  onSubmit={handleApiKeySubmit}
                  placeholder="sk-..."
                  mask="*"
                />
              </Box>
            </Box>
          ) : (
            <Box flexDirection="column">
              <Text color={theme.colors.text}>Enter API Endpoint (optional):</Text>
              <Box marginTop={1}>
                <Text color="blue">| </Text>
                <TextInput
                  value={endpoint}
                  onChange={setEndpoint}
                  onSubmit={handleEndpointSubmit}
                  placeholder="https://api.deepseek.com/v1"
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
            <Text bold>enter</Text> confirm  <Text bold>esc</Text> cancel
          </Text>
        </Box>
      </Box>
    </Box>
  );
}
