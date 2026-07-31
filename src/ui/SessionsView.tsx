import { useState, useMemo } from "react";
import { Box, Text, useInput } from "ink";
import { useTheme } from "./theme";
import { listSessions, countSessionTokens } from "../session/history";
import type { SessionRow } from "../session/history";

type SessionsViewProps = {
  onClose: () => void;
  currentSessionId: string | null;
  onSelect: (sessionId: string) => void;
};

function formatTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${days[d.getDay()]} ${months[d.getMonth()]} ${d.getDate()} ${d.getFullYear()}`;
}

export default function SessionsView({
  onClose,
  currentSessionId,
  onSelect,
}: SessionsViewProps) {
  const theme = useTheme();
  const sessions = useMemo(() => listSessions(50), []);
  const [selectedIndex, setSelectedIndex] = useState(() => {
    const idx = sessions.findIndex((s) => s.id === currentSessionId);
    return idx >= 0 ? idx : 0;
  });

  useInput((_input, key) => {
    if (key.escape) {
      onClose();
    }
    if (key.upArrow) {
      setSelectedIndex((i) => (i > 0 ? i - 1 : sessions.length - 1));
    }
    if (key.downArrow) {
      setSelectedIndex((i) => (i < sessions.length - 1 ? i + 1 : 0));
    }
    if (key.return && sessions[selectedIndex]) {
      onSelect(sessions[selectedIndex].id);
    }
  });

  if (sessions.length === 0) {
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
          <Text color={theme.colors.muted}>No sessions yet.</Text>
          <Box marginTop={1}>
            <Text color={theme.colors.muted}>
              <Text bold>esc</Text> back
            </Text>
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
        borderColor={theme.colors.secondary}
        paddingX={2}
        paddingY={1}
        width={72}
      >
        <Box marginBottom={1}>
          <Text bold color={theme.colors.secondary}>
            Sessions
          </Text>
        </Box>

        {sessions.map((session, i) => {
          const isSelected = i === selectedIndex;
          const isCurrent = session.id === currentSessionId;
          const label = session.label ?? "(untitled)";
          const tokens = countSessionTokens(session.id);
          const ts = formatDate(session.updated_at);

          return (
            <Box key={session.id}>
              <Text
                color={isSelected ? theme.colors.primary : theme.colors.muted}
              >
                {isSelected ? "\u25b6 " : "  "}
              </Text>
              <Text
                bold={isSelected}
                color={isSelected ? theme.colors.text : theme.colors.muted}
              >
                {label}
              </Text>
              <Text color={theme.colors.muted}>{"  "}</Text>
              <Text color={theme.colors.muted}>
                {ts}
              </Text>
              <Text color={theme.colors.muted}>{"  "}</Text>
              <Text color={theme.colors.muted}>
                {formatTokens(tokens)} tok
              </Text>
              {isCurrent && (
                <Text color={theme.colors.muted}>{"  "}(current)</Text>
              )}
            </Box>
          );
        })}

        <Box marginTop={1}>
          <Text color={theme.colors.muted}>
            {"\u2191\u2193"} navigate  {"\u23ce"} switch  <Text bold>esc</Text> back
          </Text>
        </Box>
      </Box>
    </Box>
  );
}
