import React from 'react';
import { Box, Text } from 'ink';
import { version } from '../../../package.json';

interface McpServerInfo {
  name: string;
  status: 'connected' | 'disconnected';
}

interface LspStatusInfo {
  enabled: boolean;
  activeCount: number;
}

interface SidebarProps {
  sessionTitle?: string;
  tokenCount: number;
  maxContextTokens: number;
  costSpent: number;
  mcpServers: McpServerInfo[];
  lspStatus: LspStatusInfo;
  currentPath: string;
  gitBranch?: string;
  authEmail?: string;
  authName?: string;
  activeSkillName?: string | null;
}

export const Sidebar: React.FC<SidebarProps> = ({
  sessionTitle = 'New Session',
  tokenCount,
  maxContextTokens,
  costSpent,
  mcpServers,
  lspStatus,
  currentPath,
  gitBranch,
  authEmail,
  authName,
  activeSkillName,
}) => {
  const contextPercent = Math.round((tokenCount / maxContextTokens) * 100) || 0;

  return (
    <Box flexDirection="column" width={32} flexShrink={0} paddingLeft={1}>
      <Text bold color="white" wrap="truncate-end">
        {sessionTitle}
      </Text>

      {authEmail && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold color="gray">User</Text>
          <Text color="green">● {authName || authEmail}</Text>
          {authName && <Text color="gray">{authEmail}</Text>}
        </Box>
      )}

      <Box flexDirection="column" marginTop={1}>
        <Text bold color="gray">Context</Text>
        <Text color="gray">{tokenCount.toLocaleString()} tokens</Text>
        <Text color="gray">{contextPercent}% used</Text>
        <Text color="gray">${costSpent.toFixed(2)} spent</Text>
      </Box>

      <Box flexDirection="column" marginTop={1}>
        <Text bold color="gray">MCP</Text>
        {mcpServers.length > 0 ? (
          mcpServers.map((server) => (
            <Text key={server.name} color={server.status === 'connected' ? 'green' : 'red'}>
              ● {server.name} <Text color="gray">{server.status}</Text>
            </Text>
          ))
        ) : (
          <Text color="gray">No MCP connected</Text>
        )}
      </Box>

      {activeSkillName && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold color="gray">Active Skill</Text>
          <Text color="green">● {activeSkillName}</Text>
        </Box>
      )}

      <Box flexDirection="column" marginTop={1}>
        <Text bold color="gray">LSP</Text>
        <Text color="gray">
          {lspStatus.enabled ? `${lspStatus.activeCount} LSPs active` : 'LSPs are disabled'}
        </Text>
      </Box>

      <Box flexDirection="column" marginTop={2}>
        <Text color="gray" wrap="truncate-end">
          {currentPath}{gitBranch ? `:${gitBranch}` : ''}
        </Text>
      </Box>

      <Box marginTop={1}>
        <Text color="green">● </Text>
        <Text color="gray">MetaCode v{version}</Text>
      </Box>
    </Box>
  );
};