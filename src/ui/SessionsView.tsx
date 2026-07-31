import { useState, useMemo } from "react";
import { Box, Text, useInput } from "ink";
import { useTheme } from "./theme";
import { listSessions, countSessionTokens, deleteSession } from "../session/history";
import type { SessionRow } from "../session/history";

type SessionsViewProps = {
  onClose: () => void;
  currentSessionId: string | null;
  onSelect: (sessionId: string) => void;
  onNewSession: () => void;
  onDelete: (sessionId: string) => void;
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

const NEW_SESSION_ID = "__new__";

export default function SessionsView({
  onClose,
  currentSessionId,
  onSelect,
  onNewSession,
  onDelete,
}: SessionsViewProps) {
  const theme = useTheme();
  const [version, setVersion] = useState(0);
  const sessions = useMemo(() => listSessions(50), [version]);
  const entries: (SessionRow | { id: string })[] = [...sessions, { id: NEW_SESSION_ID }];
  const [selectedIndex, setSelectedIndex] = useState(() => {
    const idx = sessions.findIndex((s) => s.id === currentSessionId);
    return idx >= 0 ? idx : 0;
  });

  useInput((_input, key) => {
    if (key.escape) {
      onClose();
    }
    if (key.upArrow) {
      setSelectedIndex((i) => (i > 0 ? i - 1 : entries.length - 1));
    }
    if (key.downArrow) {
      setSelectedIndex((i) => (i < entries.length - 1 ? i + 1 : 0));
    }
    if (key.return) {
      const entry = entries[selectedIndex];
      if (!entry) return;
      if (entry.id === NEW_SESSION_ID) {
        onNewSession();
      } else {
        onSelect(entry.id);
      }
    }
    if (_input?.toLowerCase() === "d" && selectedIndex < sessions.length) {
      const session = sessions[selectedIndex];
      if (session) {
        deleteSession(session.id);
        setVersion((v) => v + 1);
        setSelectedIndex((i) => Math.max(0, i - 1));
        onDelete(session.id);
      }
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
        width={72}
      >
        <Box marginBottom={1}>
          <Text bold color={theme.colors.secondary}>
            Sessions
          </Text>
        </Box>

        {entries.map((entry, i) => {
          const isSelected = i === selectedIndex;
          if (entry.id === NEW_SESSION_ID) {
            return (
              <Box key={NEW_SESSION_ID}>
                <Text color={isSelected ? theme.colors.primary : theme.colors.muted}>
                  {isSelected ? "\u25b6 " : "  "}
                </Text>
                <Text bold={isSelected} color={isSelected ? theme.colors.success : theme.colors.muted}>
                  + New Session
                </Text>
              </Box>
            );
          }
          const session = entry as SessionRow;
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
            {"\u2191\u2193"} navigate  {"\u23ce"} switch  <Text bold>d</Text> delete  <Text bold>esc</Text> back
          </Text>
        </Box>
      </Box>
    </Box>
  );
}
