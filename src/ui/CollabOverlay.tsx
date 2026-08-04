import React, { useState, useEffect, useRef, useCallback } from "react";
import { Box, Text, useInput } from "ink";
import { spawn } from "child_process";
import { useTheme } from "./theme";
import {
  ParticipantList,
  SessionInfo,
  CursorIndicator,
  SessionStatusBadge,
  ConnectionStatus,
} from "../shared-sessions/ui-components";
import type { Participant, SessionStatus, SharedSession } from "../shared-sessions/types";

type CollabOverlayProps = {
  session: SharedSession;
  participants: Participant[];
  currentUserId: string;
  sessionToken?: string;
  onClose: () => void;
  onLeave: () => void;
};

export default function CollabOverlay({
  session,
  participants,
  currentUserId,
  sessionToken,
  onClose,
  onLeave,
}: CollabOverlayProps) {
  const theme = useTheme();
  const [copied, setCopied] = useState(false);
  const copiedRef = useRef(false);

  const copyToClipboard = useCallback((text: string, onFail: () => void) => {
    const [cmd, args] =
      process.platform === "win32"
        ? (["clip", [] as string[]] as const)
        : process.platform === "darwin"
          ? (["pbcopy", [] as string[]] as const)
          : (["xclip", ["-selection", "clipboard"]] as const);
    const child = spawn(cmd, args);
    child.on("error", onFail);
    child.stdin.write(text.trim());
    child.stdin.end();
  }, []);

  const handleCopy = useCallback(() => {
    if (!sessionToken) return;
    const onFail = () => {
      copiedRef.current = false;
      setCopied(false);
    };
    try {
      copyToClipboard(sessionToken, onFail);
      copiedRef.current = true;
      setCopied(true);
    } catch {
      onFail();
    }
  }, [copyToClipboard, sessionToken]);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  useInput((_input, key) => {
    if (key.escape) {
      onClose();
      return;
    }
    if (_input.toLowerCase() === "x" && sessionToken) {
      handleCopy();
    }
    if (_input.toLowerCase() === "l") {
      onLeave();
    }
  });

  const connectedCount = participants.filter((p) => p.connectionStatus === "connected").length;

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
            Collaboration
          </Text>
        </Box>

        <Box marginBottom={1}>
          <SessionStatusBadge status={session.status as SessionStatus} />
        </Box>

        <SessionInfo session={session} participantCount={participants.length} />
        <ConnectionStatus participantCount={participants.length} connectedCount={connectedCount} />

        <Box marginTop={1}>
          <ParticipantList participants={participants} currentUserId={currentUserId} />
        </Box>

        {participants.some((p) => p.cursor) && (
          <Box marginTop={1} flexDirection="column">
            <Text bold color={theme.colors.secondary}>
              Cursors
            </Text>
            {participants
              .filter((p) => p.cursor)
              .map((p) => (
                <CursorIndicator key={p.id} participant={p} isCurrent={p.userId === currentUserId} />
              ))}
          </Box>
        )}

        {sessionToken && (
          <Box marginTop={1} flexDirection="column">
            <Text bold color={theme.colors.secondary}>
              Session Link
            </Text>
            <Box>
              <Text color={theme.colors.text}>{sessionToken}</Text>
            </Box>
            <Box marginTop={1}>
              <Text color={theme.colors.muted}>Share this token; others can join with </Text>
              <Text color={theme.colors.primary} bold>/join &lt;token&gt;</Text>
            </Box>
            <Box marginTop={1}>
              <Text color={theme.colors.muted}>
                {"\u23ce"} copy to clipboard  <Text bold>x</Text>
              </Text>
              {copied && <Text color="green"> Copied!</Text>}
            </Box>
          </Box>
        )}

        <Box marginTop={1}>
          <Text color={theme.colors.muted}>
            {"\u2191\u2193"} navigate  {"\u23ce"} leave  <Text bold>esc</Text> back  <Text bold>l</Text> leave session
          </Text>
        </Box>
      </Box>
    </Box>
  );
}
