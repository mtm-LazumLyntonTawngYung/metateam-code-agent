import React from "react";
import { Box, Text } from "ink";
import type { Participant, SessionStatus, SharedSession } from "./types";

type ParticipantListProps = {
  participants: Participant[];
  currentUserId?: string;
};

export function ParticipantList({ participants, currentUserId }: ParticipantListProps) {
  return (
    <Box flexDirection="column">
      <Text bold>Participants ({participants.length})</Text>
      {participants.map((participant) => (
        <Box key={participant.id} marginLeft={1}>
          <Text color={participant.color}>
            {participant.displayName}
            {participant.userId === currentUserId ? " (you)" : ""}
          </Text>
          <Text dimColor> [{participant.role}]</Text>
          <Text dimColor>
            {participant.connectionStatus === "connected" ? " ●" : " ○"}
          </Text>
        </Box>
      ))}
    </Box>
  );
}

type SessionInfoProps = {
  session: SharedSession;
  participantCount: number;
};

export function SessionInfo({ session, participantCount }: SessionInfoProps) {
  const statusColors: Record<SessionStatus, string> = {
    active: "green",
    paused: "yellow",
    ended: "red",
    archived: "gray",
  };

  return (
    <Box flexDirection="column">
      <Text bold>{session.name}</Text>
      {session.description && <Text dimColor>{session.description}</Text>}
      <Box>
        <Text>Status: </Text>
        <Text color={statusColors[session.status]}>{session.status}</Text>
      </Box>
      <Box>
        <Text>Participants: {participantCount}/{session.maxParticipants}</Text>
      </Box>
      {session.isEncrypted && <Text>🔒 Encrypted</Text>}
      {session.isEphemeral && <Text>💨 Ephemeral</Text>}
    </Box>
  );
}

type CursorIndicatorProps = {
  participant: Participant;
  isCurrent: boolean;
};

export function CursorIndicator({ participant, isCurrent }: CursorIndicatorProps) {
  if (!participant.cursor) return null;

  return (
    <Box>
      <Text color={participant.color}>
        {participant.displayName}: {participant.cursor.fileId}:{participant.cursor.line}:{participant.cursor.column}
      </Text>
      {isCurrent && <Text dimColor> (you)</Text>}
    </Box>
  );
}

type SessionStatusProps = {
  status: SessionStatus;
};

export function SessionStatusBadge({ status }: SessionStatusProps) {
  const badges: Record<SessionStatus, { label: string; color: string }> = {
    active: { label: "ACTIVE", color: "green" },
    paused: { label: "PAUSED", color: "yellow" },
    ended: { label: "ENDED", color: "red" },
    archived: { label: "ARCHIVED", color: "gray" },
  };

  const badge = badges[status];

  return (
    <Text color={badge.color} bold>
      [{badge.label}]
    </Text>
  );
}

type ConnectionStatusProps = {
  participantCount: number;
  connectedCount: number;
};

export function ConnectionStatus({ participantCount, connectedCount }: ConnectionStatusProps) {
  return (
    <Box>
      <Text>
        Connected: {connectedCount}/{participantCount}
      </Text>
    </Box>
  );
}
