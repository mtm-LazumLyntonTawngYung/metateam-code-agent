import { useState, useEffect, useRef } from "react";
import { Box, Text, useInput } from "ink";
import { getConnectedCount, getServerStates, toggleServerAndRefresh, type ServerState } from "../mcp";
import { useTheme } from "./theme";

type McpsViewProps = {
  onClose: () => void;
};

export default function McpsView({ onClose }: McpsViewProps) {
  const [states, setStates] = useState<ServerState[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const mountedRef = useRef(true);
  const theme = useTheme();

  const refresh = async () => {
    setStates(getServerStates());
    setLoading(false);
  };

  useEffect(() => {
    refresh();
    return () => { mountedRef.current = false; };
  }, []);

  useInput(async (input, key) => {
    if (key.escape) { onClose(); return; }
    if (input === " " && !loading && states.length > 0) {
      const server = states[selectedIndex];
      if (server && server.status !== "errored") {
        setRefreshing(true);
        await toggleServerAndRefresh(server.name);
        await refresh();
        setRefreshing(false);
      }
      return;
    }
    if (key.downArrow) {
      setSelectedIndex((i) => Math.min(i + 1, states.length - 1));
    }
    if (key.upArrow) {
      setSelectedIndex((i) => Math.max(i - 1, 0));
    }
  });

  const connected = states.filter((s) => s.status === "connected");
  const disabled = states.filter((s) => s.status === "disabled");
  const errored = states.filter((s) => s.status === "errored");
  const hasServers = states.length > 0;

  const statusColor = (status: ServerState["status"]) => {
    if (status === "connected") return theme.colors.success;
    if (status === "disabled") return theme.colors.muted;
    return theme.colors.error;
  };

  const statusLabel = (s: ServerState) => {
    if (s.status === "connected") return "\u25cf Connected";
    if (s.status === "disabled") return "\u25cb Disabled";
    return "\u25cf Error";
  };

  return (
    <Box flexGrow={1} flexDirection="column">
      {/* Header */}
      <Box borderStyle="round" borderColor={theme.colors.muted} paddingX={2} paddingY={1}>
        <Text bold color={theme.colors.primary}>
          MCP Servers
        </Text>
        <Text color={theme.colors.muted}>
          {"  "}{connected.length} connected
          {disabled.length > 0 && <Text color={theme.colors.muted}>  {disabled.length} disabled</Text>}
          {errored.length > 0 && (
            <Text color={theme.colors.error}>  {errored.length} failed</Text>
          )}
          {"  |  "}total: {states.length}
        </Text>
      </Box>

      {/* Content */}
      <Box flexGrow={1} flexDirection="column" marginTop={1}>
        {loading ? (
          <Box alignItems="center" justifyContent="center">
            <Text color={theme.colors.muted}>Connecting...</Text>
          </Box>
        ) : !hasServers ? (
          <Box flexDirection="column" alignItems="center" justifyContent="center" marginTop={2}>
            <Box borderStyle="round" borderColor={theme.colors.muted} paddingX={3} paddingY={2} width={64}>
              <Box flexDirection="column" alignItems="center">
                <Text bold color={theme.colors.muted}>No MCP Servers Configured</Text>
                <Box marginTop={1}>
                  <Text color={theme.colors.text}>
                    Create a{" "}
                    <Text bold color={theme.colors.primary}>.mtc/mcp.json</Text>
                    {" "}in your project root or
                  </Text>
                </Box>
                <Box>
                  <Text color={theme.colors.text}>
                    add servers to{" "}
                    <Text bold color={theme.colors.primary}>~/.config/mtc/mcp.json</Text>
                  </Text>
                </Box>
                <Box marginTop={1} flexDirection="column" alignItems="center">
                  <Text color={theme.colors.muted}>Example configuration:</Text>
                  <Text color={theme.colors.muted}>
                    {"{ \"mcpServers\": { \"figma\": { \"command\": \"bun\", " +
                      "\"args\": [\"run\", \"src/mcp-plugins/figma-bridge.ts\"] } } }"}
                  </Text>
                </Box>
              </Box>
            </Box>
          </Box>
        ) : (
          <Box flexDirection="column" paddingX={1}>
            {/* Table header */}
            <Box>
              <Box width={22}>
                <Text bold color={theme.colors.muted}>Server</Text>
              </Box>
              <Box width={18}>
                <Text bold color={theme.colors.muted}>Status</Text>
              </Box>
              <Box width={10}>
                <Text bold color={theme.colors.muted}>Tools</Text>
              </Box>
              <Box>
                <Text bold color={theme.colors.muted}>Transport</Text>
              </Box>
            </Box>
            <Box marginBottom={1}>
              <Text color={theme.colors.muted}>
                {"\u2500".repeat(64)}
              </Text>
            </Box>

            {/* Server rows */}
            {states.map((s, i) => {
              const selected = i === selectedIndex;
              const color = statusColor(s.status);
              return (
                <Box key={s.name} flexDirection="column">
                  <Box>
                    <Text color={selected ? theme.colors.primary : theme.colors.text}>
                      {selected ? "\u25b6 " : "  "}
                    </Text>
                    <Box width={20}>
                      <Text bold color={color} wrap="truncate-end">
                        {s.name}
                      </Text>
                    </Box>
                    <Box width={18}>
                      <Text color={color}>
                        {statusLabel(s)}
                      </Text>
                    </Box>
                    <Box width={10}>
                      <Text color={theme.colors.muted}>{s.toolCount}</Text>
                    </Box>
                    <Box>
                      <Text color={theme.colors.muted}>stdio</Text>
                    </Box>
                  </Box>
                  {s.status === "errored" && s.error && (
                    <Box marginLeft={4} marginTop={0}>
                      <Text color={theme.colors.error}>{s.error}</Text>
                    </Box>
                  )}
                </Box>
              );
            })}
          </Box>
        )}
      </Box>

      {/* Footer */}
      <Box borderStyle="single" borderColor={theme.colors.muted} borderTop={false} borderBottom={false}>
        <Box paddingX={1} paddingY={0} justifyContent="space-between" width="100%">
          <Text color={theme.colors.muted}>
            {"\u2191\u2193"} Navigate  <Text bold>Space</Text> Toggle  <Text bold>esc</Text> Close
          </Text>
          <Text color={theme.colors.muted}>
            {refreshing
              ? "Refreshing..."
              : hasServers
                ? `${connected.length} connected, ${disabled.length} disabled`
                : "No servers"}
          </Text>
        </Box>
      </Box>
    </Box>
  );
}
