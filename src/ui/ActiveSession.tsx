import { useState, useCallback } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { theme } from "./theme";

type ActiveSessionProps = {
  query: string;
  onBack: () => void;
  activeAgentId: string;
  agentName: string;
  mcpCount: number;
};

type StreamBlock = {
  kind: "markdown" | "bullet" | "code" | "path" | "text";
  content: string;
  highlight?: string;
};

export default function ActiveSession({
  query,
  onBack,
  activeAgentId,
  agentName,
  mcpCount,
}: ActiveSessionProps) {
  const [input, setInput] = useState("");
  const [logs] = useState<StreamBlock[]>([
    { kind: "text", content: query },
    { kind: "markdown", content: "2. Multimodal Spatial Coding — " },
    { kind: "text", content: "Frame extraction from screen recordings → vision-language captioning..." },
    { kind: "markdown", content: "3. Reinforcement Learning from Code Execution (RLCE) — " },
    { kind: "text", content: "Captures prompt/code/test-outcome triples from daily sessions..." },
    { kind: "text", content: "Linked from " },
    { kind: "path", content: "docs/internal/README.md", highlight: "green" },
    { kind: "text", content: " under a new " },
    { kind: "markdown", content: "R&D & Future Direction", highlight: "orange" },
    { kind: "text", content: " section." },
  ]);

  const handleSubmit = useCallback((value: string) => {
    setInput("");
  }, []);

  useInput((_input, key) => {
    if (key.escape) onBack();
  });

  return (
    <Box flexDirection="column" flexGrow={1}>
      {/* Main split layout */}
      <Box flexDirection="row" flexGrow={1} paddingX={1} paddingY={1}>
        {/* LEFT PANE: Stream & Input */}
        <Box flexDirection="column" flexGrow={1} paddingRight={2}>
          {/* Stream content */}
          <Box flexDirection="column" flexGrow={1} marginBottom={1}>
            {logs.map((block, i) => {
              if (block.kind === "markdown") {
                return (
                  <Text key={i} bold color={block.highlight ?? "orange"}>
                    {block.content}
                  </Text>
                );
              }
              if (block.kind === "path") {
                return (
                  <Text key={i} color={block.highlight ?? "green"}>
                    {block.content}
                  </Text>
                );
              }
              if (block.kind === "code") {
                return (
                  <Box key={i} backgroundColor="#1a1a2e" paddingX={1}>
                    <Text color="yellow">{block.content}</Text>
                  </Box>
                );
              }
              return (
                <Text key={i} color={theme.colors.text}>
                  {block.content}
                </Text>
              );
            })}
          </Box>

          {/* Agent pill */}
          <Box marginBottom={1}>
            <Text color={theme.colors.secondary}>▣ {agentName}</Text>
            <Text color={theme.colors.muted}> · DeepSeek V4 Flash Free · 58.7s</Text>
          </Box>

          {/* Input box */}
          <Box
            flexDirection="column"
            backgroundColor="#1e1e1e"
            paddingX={2}
            paddingY={1}
          >
            <Box>
              <Text color="white">█ </Text>
              <TextInput
                value={input}
                onChange={setInput}
                onSubmit={handleSubmit}
                placeholder="Ask a follow-up or command..."
              />
            </Box>
            <Box marginTop={1} gap={1}>
              <Text color="cyan" bold>{agentName}</Text>
              <Text color={theme.colors.muted}>•</Text>
              <Text bold>DeepSeek V4 Flash Free</Text>
              <Text color={theme.colors.muted}>MetaTeam Zen</Text>
            </Box>
          </Box>
        </Box>

        {/* RIGHT PANE: Sidebar */}
        <Box
          flexDirection="column"
          width={32}
          borderStyle="single"
          borderColor={theme.colors.muted}
          paddingX={1}
          paddingY={1}
        >
          <Text bold>IP & Patent Strategy</Text>

          <Box flexDirection="column" marginTop={1}>
            <Text bold color={theme.colors.muted}>Context</Text>
            <Text color={theme.colors.muted}>62,047 tokens</Text>
            <Text color={theme.colors.muted}>31% used</Text>
            <Text color={theme.colors.muted}>$0.00 spent</Text>
          </Box>

          <Box flexDirection="column" marginTop={1}>
            <Text bold color={theme.colors.muted}>MCP</Text>
            <Text color="green">● <Text color={theme.colors.muted}>pencil Connected</Text></Text>
          </Box>

          <Box flexDirection="column" marginTop={1}>
            <Text bold color={theme.colors.muted}>LSP</Text>
            <Text color={theme.colors.muted}>LSPs are disabled</Text>
          </Box>

          <Box flexDirection="column" marginTop={2}>
            <Text color={theme.colors.muted} wrap="truncate-end">
              D:\Github\metateam-code-agent:feature/#26-Long-Term-R&D
            </Text>
          </Box>

          <Box marginTop={1}>
            <Text color="green">● </Text>
            <Text color={theme.colors.muted}>MetaCode 1.0.0</Text>
          </Box>
        </Box>
      </Box>

      {/* Global status bar */}
      <Box
        width="100%"
        borderStyle="single"
        borderColor={theme.colors.muted}
        paddingX={1}
      >
        <Box flexGrow={1}>
          <Text color={theme.colors.muted}>D:\Github\metateam-code-agent</Text>
        </Box>
        <Box>
          <Text color={theme.colors.muted}>
            62.0K (31%)  <Text bold>ctrl+p</Text> commands
          </Text>
        </Box>
      </Box>
    </Box>
  );
}
