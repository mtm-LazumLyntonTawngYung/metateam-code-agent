import { useState, useMemo } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { theme } from "./theme";

const commands = [
  { id: "connect", label: "/connect - Add an AI provider", category: "config" },
  { id: "clear", label: "Clear conversation", category: "chat" },
  { id: "agent", label: "Switch agent", category: "chat" },
  { id: "help", label: "Show help", category: "info" },
  { id: "exit", label: "Exit mtc", category: "system" },
  { id: "logout", label: "/logout - Log out of MetaTeam SSO", category: "system" },
];

function fuzzyMatch(text: string, query: string): boolean {
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  let qi = 0;
  for (let i = 0; i < lower.length && qi < q.length; i++) {
    if (lower[i] === q[qi]) qi++;
  }
  return qi === q.length;
}

type CommandPaletteProps = {
  onSelect: (id: string) => void;
  initialFilter?: string;
};

export default function CommandPalette({ onSelect, initialFilter = "" }: CommandPaletteProps) {
  const [query, setQuery] = useState(initialFilter);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const filtered = useMemo(
    () =>
      query.trim()
        ? commands.filter((c) => fuzzyMatch(c.label, query))
        : commands,
    [query],
  );

  useInput((_input, key) => {
    if (key.upArrow) {
      setSelectedIndex((i) => (i > 0 ? i - 1 : filtered.length - 1));
    }
    if (key.downArrow) {
      setSelectedIndex((i) => (i < filtered.length - 1 ? i + 1 : 0));
    }
    if (key.return && filtered[selectedIndex]) {
      onSelect(filtered[selectedIndex].id);
    }
  });

  return (
    <Box flexGrow={1} flexDirection="column" alignItems="center" justifyContent="center">
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={theme.colors.warning}
        paddingX={2}
        paddingY={1}
        width={55}
      >
        <Box marginBottom={1}>
          <Text bold color={theme.colors.warning}>
            Commands
          </Text>
        </Box>
        <Box marginBottom={1}>
          <Text color="blue">&gt; </Text>
          <TextInput
            value={query}
            onChange={(v) => {
              setQuery(v);
              setSelectedIndex(0);
            }}
            placeholder="filter commands..."
          />
        </Box>
        {filtered.length === 0 ? (
          <Text color={theme.colors.muted}>No matching commands</Text>
        ) : (
          filtered.map((cmd, i) => (
            <Box key={cmd.id}>
              <Text color={i === selectedIndex ? theme.colors.primary : theme.colors.muted}>
                {i === selectedIndex ? "\u276f " : "  "}
              </Text>
              <Text bold={i === selectedIndex} color={i === selectedIndex ? theme.colors.text : theme.colors.muted}>
                {cmd.label}
              </Text>
            </Box>
          ))
        )}
        <Box marginTop={1}>
          <Text color={theme.colors.muted}>
            {"\u2191\u2193"} navigate  {"\u23ce"} execute  <Text bold>esc</Text> cancel
          </Text>
        </Box>
      </Box>
    </Box>
  );
}
