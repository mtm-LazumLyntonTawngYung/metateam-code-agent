import { useState, useMemo } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { useTheme } from "./theme";

const BUILTIN_COMMANDS = [
  { id: "connect", label: "/connect - Add an AI provider", category: "config" },
  { id: "clear", label: "Clear conversation", category: "chat" },
  { id: "agents", label: "/agents - Switch agent", category: "chat" },
  { id: "diff", label: "/diff - Open diff viewer", category: "tools" },
  { id: "editor", label: "/editor - Open editor", category: "tools" },
  { id: "help", label: "/help - Show help", category: "info" },
  { id: "init", label: "/init - AI-guided AGENTS.md setup", category: "config" },
  { id: "mcps", label: "/mcps - Toggle MCP servers", category: "tools" },
  { id: "models", label: "/models - Switch model", category: "chat" },
  { id: "move", label: "/move - Move to another project dir", category: "nav" },
  { id: "new", label: "/new - New session", category: "chat" },
  { id: "review", label: "/review - Review changes", category: "tools" },
  { id: "sessions", label: "/sessions - Switch session", category: "chat" },
  { id: "skills", label: "/skills - Skills", category: "info" },
  { id: "status", label: "/status - View status", category: "info" },
  { id: "themes", label: "/themes - Switch theme", category: "config" },
  { id: "variants", label: "/variants - Switch model variant", category: "chat" },
  { id: "exit", label: "/exit - Exit mtc", category: "system" },
  { id: "logout", label: "/logout - Log out of MetaTeam SSO", category: "system" },
  { id: "share", label: "/share - Share current session", category: "collab" },
  { id: "join", label: "/join <token> - Join a shared session", category: "collab" },
  { id: "leave", label: "/leave - Leave shared session", category: "collab" },
  { id: "participants", label: "/participants - View participants", category: "collab" },
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
  const theme = useTheme();
  const [query, setQuery] = useState(initialFilter);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const allCommands = useMemo(() => {
    return BUILTIN_COMMANDS;
  }, []);

  const filtered = useMemo(
    () =>
      query.trim()
        ? allCommands.filter((c) => fuzzyMatch(c.label, query))
        : allCommands,
    [query, allCommands],
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
