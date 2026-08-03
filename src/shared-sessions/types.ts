export type SessionStatus = "active" | "paused" | "ended" | "archived";
export type ParticipantRole = "owner" | "admin" | "editor" | "viewer" | "guest";
export type AccessLevel = "read-only" | "comment-only" | "edit";
export type ConnectionStatus = "connected" | "disconnected" | "reconnecting";
export type ConflictResolution = "auto-merge" | "manual" | "last-write-wins";
export type OperationType = "insert" | "delete" | "replace" | "move" | "format";

export type Participant = {
  id: string;
  sessionId: string;
  userId: string;
  displayName: string;
  role: ParticipantRole;
  accessLevel: AccessLevel;
  connectionStatus: ConnectionStatus;
  joinedAt: string;
  lastActiveAt: string;
  cursor?: CursorPosition;
  selection?: SelectionRange;
  color: string;
};

export type CursorPosition = {
  fileId: string;
  line: number;
  column: number;
};

export type SelectionRange = {
  fileId: string;
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
};

export type SharedSession = {
  id: string;
  name: string;
  description?: string;
  status: SessionStatus;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
  maxParticipants: number;
  isEncrypted: boolean;
  isEphemeral: boolean;
  metadata: Record<string, unknown>;
};

export type SessionOperation = {
  id: string;
  sessionId: string;
  participantId: string;
  type: OperationType;
  fileId: string;
  position: number;
  content?: string;
  timestamp: string;
  version: number;
  applied: boolean;
};

export type SessionSnapshot = {
  id: string;
  sessionId: string;
  version: number;
  files: Record<string, string>;
  createdAt: string;
  createdBy: string;
};

export type SessionLink = {
  id: string;
  sessionId: string;
  token: string;
  accessLevel: AccessLevel;
  expiresAt?: string;
  maxUses?: number;
  currentUses: number;
  createdBy: string;
  createdAt: string;
  isValid: boolean;
};

export type Permission = {
  id: string;
  sessionId: string;
  participantId: string;
  accessLevel: AccessLevel;
  domain?: string;
  grantedAt: string;
  grantedBy: string;
  expiresAt?: string;
};

export type Conflict = {
  id: string;
  sessionId: string;
  operationIds: string[];
  fileId: string;
  detectedAt: string;
  resolvedAt?: string;
  resolution?: ConflictResolution;
  resolvedBy?: string;
};

export type ContextSnapshot = {
  id: string;
  sessionId: string;
  fileTree: FileTreeNode[];
  environment: Record<string, string>;
  commandHistory: string[];
  breakpoints: Breakpoint[];
  variableWatches: VariableWatch[];
  createdAt: string;
};

export type FileTreeNode = {
  path: string;
  type: "file" | "directory";
  size?: number;
  modifiedAt?: string;
  children?: FileTreeNode[];
};

export type Breakpoint = {
  id: string;
  fileId: string;
  line: number;
  enabled: boolean;
  condition?: string;
  participantId: string;
};

export type VariableWatch = {
  id: string;
  expression: string;
  fileId?: string;
  line?: number;
  participantId: string;
  enabled: boolean;
};

export type SessionEvent = {
  type: "participant_joined" | "participant_left" | "operation" | "conflict" | "snapshot" | "permission_changed" | "session_created" | "session_updated" | "session_deleted";
  sessionId: string;
  participantId?: string;
  timestamp: string;
  data: Record<string, unknown>;
};

export type CreateSessionInput = {
  name: string;
  description?: string;
  ownerId: string;
  maxParticipants?: number;
  isEncrypted?: boolean;
  isEphemeral?: boolean;
  expiresAt?: string;
  metadata?: Record<string, unknown>;
};

export type JoinSessionInput = {
  sessionId: string;
  userId: string;
  displayName: string;
  role?: ParticipantRole;
  accessLevel?: AccessLevel;
};

export type OperationInput = {
  sessionId: string;
  participantId: string;
  type: OperationType;
  fileId: string;
  position: number;
  content?: string;
};

export type PermissionInput = {
  sessionId: string;
  participantId: string;
  accessLevel: AccessLevel;
  domain?: string;
  grantedBy: string;
  expiresAt?: string;
};

export type SessionLinkInput = {
  sessionId: string;
  accessLevel: AccessLevel;
  expiresAt?: string;
  maxUses?: number;
  createdBy: string;
};
