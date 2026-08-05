import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { prop, randInt, randStr } from "./prop";
import {
  createSession,
  getSession,
  deleteSession,
  listSessions,
  updateSession,
  endSession,
  archiveSession,
  getActiveSessions,
} from "../../src/shared-sessions/session-service";
import {
  joinSession,
  leaveSession,
  getSessionParticipants,
  countParticipants,
  updateParticipantRole,
  updateConnectionStatus,
  updateCursorPosition,
} from "../../src/shared-sessions/participant-service";
import {
  grantPermission,
  revokePermission,
  validateAccess,
  canPerformAction,
  getEffectiveAccessLevel,
  cleanupExpiredPermissions,
} from "../../src/shared-sessions/permission-engine";
import {
  createSessionLink,
  validateSessionLink,
  invalidateSessionLink,
  getSessionLinks,
} from "../../src/shared-sessions/session-link-service";
import {
  applyOperation,
  getSessionOperations,
  getCurrentVersion,
  createSnapshot,
  getLatestSnapshot,
  transformOperation,
} from "../../src/shared-sessions/collaboration-service";
import {
  detectConflicts,
  resolveConflict,
  autoResolveConflicts,
  getUnresolvedConflicts,
} from "../../src/shared-sessions/conflict-resolver";
import {
  captureContext,
  getLatestContextSnapshot,
  addBreakpoint,
  removeBreakpoint,
  addVariableWatch,
  removeVariableWatch,
} from "../../src/shared-sessions/context-sharing-service";
import { getDb, closeDb, useInMemoryDb } from "../../src/shared-sessions/db";
import { clearAllHandlers } from "../../src/shared-sessions/event-bus";

describe("Shared Sessions", () => {
  beforeAll(() => {
    clearAllHandlers();
    useInMemoryDb();
    getDb();
  });

  afterAll(() => {
    closeDb();
  });

  describe("Session Management", () => {
    test("createSession creates a session with unique ID", () => {
      prop(20, (rand) => {
        const name = randStr(rand, 10, "abcdefghijklmnopqrstuvwxyz");
        const session = createSession({ name, ownerId: "owner-1" });
        expect(session.id).toBeTruthy();
        expect(session.name).toBe(name);
        expect(session.status).toBe("active");
        expect(session.ownerId).toBe("owner-1");
        deleteSession(session.id);
      });
    });

    test("getSession retrieves a session by ID", () => {
      const session = createSession({ name: "test-session", ownerId: "owner-1" });
      const retrieved = getSession(session.id);
      expect(retrieved).toBeTruthy();
      expect(retrieved?.id).toBe(session.id);
      deleteSession(session.id);
    });

    test("listSessions returns sessions for a user", () => {
      const session1 = createSession({ name: "session-list-1", ownerId: "user-list-1" });
      const session2 = createSession({ name: "session-list-2", ownerId: "user-list-1" });
      const session3 = createSession({ name: "session-list-3", ownerId: "user-list-2" });

      const user1Sessions = listSessions("user-list-1");
      const createdSessions = user1Sessions.filter(
        (s) => s.id === session1.id || s.id === session2.id || s.id === session3.id,
      );
      expect(createdSessions.length).toBe(2);

      deleteSession(session1.id);
      deleteSession(session2.id);
      deleteSession(session3.id);
    });

    test("updateSession updates session properties", () => {
      const session = createSession({ name: "original", ownerId: "owner-1" });
      const updated = updateSession(session.id, { name: "updated" });
      expect(updated?.name).toBe("updated");
      deleteSession(session.id);
    });

    test("endSession changes status to ended", () => {
      const session = createSession({ name: "to-end", ownerId: "owner-1" });
      const ended = endSession(session.id);
      expect(ended?.status).toBe("ended");
      deleteSession(session.id);
    });

    test("archiveSession changes status to archived", () => {
      const session = createSession({ name: "to-archive", ownerId: "owner-1" });
      const archived = archiveSession(session.id);
      expect(archived?.status).toBe("archived");
      deleteSession(session.id);
    });

    test("deleteSession removes session completely", () => {
      const session = createSession({ name: "to-delete", ownerId: "owner-1" });
      const deleted = deleteSession(session.id);
      expect(deleted).toBe(true);
      expect(getSession(session.id)).toBeNull();
    });
  });

  describe("Participant Management", () => {
    test("joinSession adds a participant to a session", () => {
      const session = createSession({ name: "participant-test", ownerId: "owner-1" });
      const participant = joinSession({
        sessionId: session.id,
        userId: "user-1",
        displayName: "User 1",
        role: "editor",
        accessLevel: "edit",
      });
      expect(participant).toBeTruthy();
      expect(participant?.userId).toBe("user-1");
      expect(participant?.role).toBe("editor");

      const participants = getSessionParticipants(session.id);
      expect(participants.length).toBe(2); // owner + new participant

      deleteSession(session.id);
    });

    test("leaveSession removes a participant", () => {
      const session = createSession({ name: "leave-test", ownerId: "owner-1" });
      const participant = joinSession({
        sessionId: session.id,
        userId: "user-1",
        displayName: "User 1",
      });
      expect(participant).toBeTruthy();

      const left = leaveSession(session.id, "user-1");
      expect(left).toBe(true);

      const participants = getSessionParticipants(session.id);
      expect(participants.length).toBe(1); // only owner

      deleteSession(session.id);
    });

    test("countParticipants returns correct count", () => {
      const session = createSession({ name: "count-test", ownerId: "owner-1" });
      expect(countParticipants(session.id)).toBe(1);

      joinSession({ sessionId: session.id, userId: "user-1", displayName: "User 1" });
      joinSession({ sessionId: session.id, userId: "user-2", displayName: "User 2" });

      expect(countParticipants(session.id)).toBe(3);

      deleteSession(session.id);
    });

    test("updateParticipantRole changes role and access level", () => {
      const session = createSession({ name: "role-test", ownerId: "owner-1" });
      const participant = joinSession({
        sessionId: session.id,
        userId: "user-1",
        displayName: "User 1",
        role: "viewer",
        accessLevel: "read-only",
      });

      const updated = updateParticipantRole(session.id, participant!.id, "admin", "edit");
      expect(updated?.role).toBe("admin");
      expect(updated?.accessLevel).toBe("edit");

      deleteSession(session.id);
    });
  });

  describe("Permission Engine", () => {
    test("validateAccess checks participant permissions", () => {
      const session = createSession({ name: "permission-test", ownerId: "owner-1" });
      const participant = joinSession({
        sessionId: session.id,
        userId: "user-1",
        displayName: "User 1",
        role: "viewer",
        accessLevel: "read-only",
      });

      expect(validateAccess(session.id, "user-1", "read-only")).toBe(true);
      expect(validateAccess(session.id, "user-1", "edit")).toBe(false);

      deleteSession(session.id);
    });

    test("canPerformAction validates role-based access", () => {
      const session = createSession({ name: "action-test", ownerId: "owner-1" });
      const participant = joinSession({
        sessionId: session.id,
        userId: "user-1",
        displayName: "User 1",
        role: "editor",
        accessLevel: "edit",
      });

      expect(canPerformAction(session.id, "user-1", "read")).toBe(true);
      expect(canPerformAction(session.id, "user-1", "comment")).toBe(true);
      expect(canPerformAction(session.id, "user-1", "edit")).toBe(true);
      expect(canPerformAction(session.id, "user-1", "manage")).toBe(false);

      deleteSession(session.id);
    });

    test("getEffectiveAccessLevel returns highest access", () => {
      const session = createSession({ name: "access-test", ownerId: "owner-1" });
      const participant = joinSession({
        sessionId: session.id,
        userId: "user-1",
        displayName: "User 1",
        role: "editor",
        accessLevel: "read-only",
      });

      const access = getEffectiveAccessLevel(session.id, "user-1");
      expect(access).toBe("edit"); // editor role overrides access level

      deleteSession(session.id);
    });
  });

  describe("Session Links", () => {
    test("createSessionLink creates a valid link", () => {
      const session = createSession({ name: "link-test", ownerId: "owner-1" });
      const link = createSessionLink({
        sessionId: session.id,
        accessLevel: "edit",
        createdBy: "owner-1",
      });

      expect(link).toBeTruthy();
      expect(link?.token).toBeTruthy();
      expect(link?.accessLevel).toBe("edit");

      deleteSession(session.id);
    });

    test("validateSessionLink validates and increments usage", () => {
      const session = createSession({ name: "link-validate", ownerId: "owner-1" });
      const link = createSessionLink({
        sessionId: session.id,
        accessLevel: "edit",
        createdBy: "owner-1",
        maxUses: 5,
      });

      const result = validateSessionLink(link!.token);
      expect(result).toBeTruthy();
      expect(result?.sessionId).toBe(session.id);

      const updatedLink = getSessionLinks(session.id)[0];
      expect(updatedLink.currentUses).toBe(1);

      deleteSession(session.id);
    });

    test("invalidateSessionLink invalidates a link", () => {
      const session = createSession({ name: "link-invalidate", ownerId: "owner-1" });
      const link = createSessionLink({
        sessionId: session.id,
        accessLevel: "edit",
        createdBy: "owner-1",
      });

      const invalidated = invalidateSessionLink(link!.id);
      expect(invalidated).toBe(true);

      const result = validateSessionLink(link!.token);
      expect(result).toBeNull();

      deleteSession(session.id);
    });
  });

  describe("Collaboration Service", () => {
    test("applyOperation applies an operation", () => {
      const session = createSession({ name: "op-test", ownerId: "owner-1" });
      const participant = joinSession({
        sessionId: session.id,
        userId: "user-1",
        displayName: "User 1",
        role: "editor",
        accessLevel: "edit",
      });

      const operation = applyOperation({
        sessionId: session.id,
        participantId: participant!.id,
        type: "insert",
        fileId: "file-1",
        position: 0,
        content: "Hello",
      });

      expect(operation).toBeTruthy();
      expect(operation?.type).toBe("insert");
      expect(operation?.content).toBe("Hello");

      deleteSession(session.id);
    });

    test("getCurrentVersion returns version number", () => {
      const session = createSession({ name: "version-test", ownerId: "owner-1" });
      const participant = joinSession({
        sessionId: session.id,
        userId: "user-1",
        displayName: "User 1",
        role: "editor",
        accessLevel: "edit",
      });

      expect(getCurrentVersion(session.id)).toBe(0);

      applyOperation({
        sessionId: session.id,
        participantId: participant!.id,
        type: "insert",
        fileId: "file-1",
        position: 0,
        content: "Hello",
      });

      expect(getCurrentVersion(session.id)).toBe(1);

      deleteSession(session.id);
    });

    test("createSnapshot creates a snapshot", () => {
      const session = createSession({ name: "snapshot-test", ownerId: "owner-1" });
      const snapshot = createSnapshot(session.id, "owner-1", { "file-1": "content" });

      expect(snapshot).toBeTruthy();
      expect(snapshot.files["file-1"]).toBe("content");

      const latest = getLatestSnapshot(session.id);
      expect(latest?.id).toBe(snapshot.id);

      deleteSession(session.id);
    });
  });

  describe("Conflict Resolution", () => {
    test("detectConflicts detects conflicting operations", () => {
      const session = createSession({ name: "conflict-test", ownerId: "owner-1" });
      const participant1 = joinSession({
        sessionId: session.id,
        userId: "user-1",
        displayName: "User 1",
        role: "editor",
        accessLevel: "edit",
      });
      const participant2 = joinSession({
        sessionId: session.id,
        userId: "user-2",
        displayName: "User 2",
        role: "editor",
        accessLevel: "edit",
      });

      applyOperation({
        sessionId: session.id,
        participantId: participant1!.id,
        type: "insert",
        fileId: "file-1",
        position: 5,
        content: "Hello",
      });

      applyOperation({
        sessionId: session.id,
        participantId: participant2!.id,
        type: "insert",
        fileId: "file-1",
        position: 6,
        content: "World",
      });

      const conflicts = detectConflicts(session.id, "file-1");
      expect(conflicts.length).toBeGreaterThan(0);

      deleteSession(session.id);
    });

    test("resolveConflict resolves a conflict", () => {
      const session = createSession({ name: "resolve-test", ownerId: "owner-1" });
      const participant1 = joinSession({
        sessionId: session.id,
        userId: "user-1",
        displayName: "User 1",
        role: "editor",
        accessLevel: "edit",
      });
      const participant2 = joinSession({
        sessionId: session.id,
        userId: "user-2",
        displayName: "User 2",
        role: "editor",
        accessLevel: "edit",
      });

      applyOperation({
        sessionId: session.id,
        participantId: participant1!.id,
        type: "insert",
        fileId: "file-1",
        position: 5,
        content: "Hello",
      });

      applyOperation({
        sessionId: session.id,
        participantId: participant2!.id,
        type: "insert",
        fileId: "file-1",
        position: 6,
        content: "World",
      });

      const conflicts = detectConflicts(session.id, "file-1");
      if (conflicts.length > 0) {
        const resolved = resolveConflict(conflicts[0].id, "last-write-wins", "owner-1");
        expect(resolved?.resolution).toBe("last-write-wins");
        expect(resolved?.resolvedAt).toBeTruthy();
      }

      deleteSession(session.id);
    });
  });

  describe("Context Sharing", () => {
    test("captureContext captures context snapshot", () => {
      const session = createSession({ name: "context-test", ownerId: "owner-1" });
      const snapshot = captureContext(
        session.id,
        [{ path: "src/index.ts", type: "file" }],
        { NODE_ENV: "development" },
        ["npm start"],
        [{ id: "bp-1", fileId: "file-1", line: 10, enabled: true, participantId: "user-1" }],
        [{ id: "vw-1", expression: "x", participantId: "user-1", enabled: true }],
      );

      expect(snapshot).toBeTruthy();
      expect(snapshot.fileTree.length).toBe(1);
      expect(snapshot.environment.NODE_ENV).toBe("development");

      const latest = getLatestContextSnapshot(session.id);
      expect(latest?.id).toBe(snapshot.id);

      deleteSession(session.id);
    });

    test("addBreakpoint adds a breakpoint to context", () => {
      const session = createSession({ name: "breakpoint-test", ownerId: "owner-1" });
      captureContext(session.id, [], {}, [], [], []);

      const updated = addBreakpoint(session.id, {
        fileId: "file-1",
        line: 10,
        enabled: true,
        participantId: "user-1",
      });

      expect(updated.breakpoints.length).toBe(1);
      expect(updated.breakpoints[0].fileId).toBe("file-1");

      deleteSession(session.id);
    });

    test("removeBreakpoint removes a breakpoint", () => {
      const session = createSession({ name: "remove-bp", ownerId: "owner-1" });
      const snapshot = captureContext(
        session.id,
        [],
        {},
        [],
        [{ id: "bp-1", fileId: "file-1", line: 10, enabled: true, participantId: "user-1" }],
        [],
      );

      const updated = removeBreakpoint(session.id, "bp-1");
      expect(updated.breakpoints.length).toBe(0);

      deleteSession(session.id);
    });
  });

  describe("Property Tests", () => {
    test("Property 1: Unique Session Identification", () => {
      prop(50, (rand) => {
        const ids = new Set<string>();
        const n = 1 + randInt(rand, 10);
        for (let i = 0; i < n; i++) {
          const session = createSession({
            name: randStr(rand, 8, "abcdefghijklmnopqrstuvwxyz"),
            ownerId: "owner-1",
          });
          ids.add(session.id);
        }
        expect(ids.size).toBe(n);
        for (const id of ids) deleteSession(id);
      });
    });

    test("Property 4: Complete Participant Tracking", () => {
      prop(20, (rand) => {
        const session = createSession({ name: "tracking-test", ownerId: "owner-1" });
        const participantCount = 1 + randInt(rand, 5);

        for (let i = 0; i < participantCount; i++) {
          joinSession({
            sessionId: session.id,
            userId: `user-${i}`,
            displayName: `User ${i}`,
          });
        }

        expect(countParticipants(session.id)).toBe(participantCount + 1); // +1 for owner

        const participants = getSessionParticipants(session.id);
        const userIds = new Set(participants.map((p) => p.userId));
        expect(userIds.size).toBe(participantCount + 1);

        deleteSession(session.id);
      });
    });

    test("Property 10: Dynamic Permission Enforcement", () => {
      prop(20, (rand) => {
        const session = createSession({ name: "perm-test", ownerId: "owner-1" });
        const participant = joinSession({
          sessionId: session.id,
          userId: "user-1",
          displayName: "User 1",
          role: "viewer",
          accessLevel: "read-only",
        });

        expect(canPerformAction(session.id, "user-1", "read")).toBe(true);
        expect(canPerformAction(session.id, "user-1", "edit")).toBe(false);

        updateParticipantRole(session.id, participant!.id, "editor", "edit");

        expect(canPerformAction(session.id, "user-1", "edit")).toBe(true);

        deleteSession(session.id);
      });
    });

    test("Property 2: Permission-Aware Session Links", () => {
      prop(20, (rand) => {
        const session = createSession({ name: "link-perm-test", ownerId: "owner-1" });
        const accessLevels: Array<"read-only" | "comment-only" | "edit"> = [
          "read-only",
          "comment-only",
          "edit",
        ];

        for (const level of accessLevels) {
          const link = createSessionLink({
            sessionId: session.id,
            accessLevel: level,
            createdBy: "owner-1",
          });
          expect(link?.accessLevel).toBe(level);
        }

        const links = getSessionLinks(session.id);
        expect(links.length).toBe(accessLevels.length);

        deleteSession(session.id);
      });
    });

    test("Property 6: Operational Transformation Consistency", () => {
      prop(20, (rand) => {
        const session = createSession({ name: "ot-test", ownerId: "owner-1" });
        const participant1 = joinSession({
          sessionId: session.id,
          userId: "user-1",
          displayName: "User 1",
          role: "editor",
          accessLevel: "edit",
        });
        const participant2 = joinSession({
          sessionId: session.id,
          userId: "user-2",
          displayName: "User 2",
          role: "editor",
          accessLevel: "edit",
        });

        const op1 = applyOperation({
          sessionId: session.id,
          participantId: participant1!.id,
          type: "insert",
          fileId: "file-1",
          position: 0,
          content: "Hello",
        });

        const op2 = applyOperation({
          sessionId: session.id,
          participantId: participant2!.id,
          type: "insert",
          fileId: "file-1",
          position: 5,
          content: " World",
        });

        const transformed = transformOperation(op1!, op2!);
        expect(transformed).toBeTruthy();

        deleteSession(session.id);
      });
    });

    test("Property 7: Conflict Detection and Resolution", () => {
      prop(20, (rand) => {
        const session = createSession({ name: "conflict-prop", ownerId: "owner-1" });
        const participant1 = joinSession({
          sessionId: session.id,
          userId: "user-1",
          displayName: "User 1",
          role: "editor",
          accessLevel: "edit",
        });
        const participant2 = joinSession({
          sessionId: session.id,
          userId: "user-2",
          displayName: "User 2",
          role: "editor",
          accessLevel: "edit",
        });

        applyOperation({
          sessionId: session.id,
          participantId: participant1!.id,
          type: "insert",
          fileId: "file-1",
          position: 5,
          content: "Hello",
        });

        applyOperation({
          sessionId: session.id,
          participantId: participant2!.id,
          type: "insert",
          fileId: "file-1",
          position: 6,
          content: "World",
        });

        const conflicts = detectConflicts(session.id, "file-1");
        const unresolved = getUnresolvedConflicts(session.id);

        expect(unresolved.length).toBe(conflicts.length);

        if (unresolved.length > 0) {
          const resolved = resolveConflict(unresolved[0].id, "last-write-wins", "owner-1");
          expect(resolved?.resolvedAt).toBeTruthy();
        }

        deleteSession(session.id);
      });
    });

    test("Property 15: Complete Context Capture and Sharing", () => {
      prop(20, (rand) => {
        const session = createSession({ name: "context-prop", ownerId: "owner-1" });
        const fileTree = [
          { path: "src/index.ts", type: "file" as const },
          { path: "src/utils.ts", type: "file" as const },
        ];
        const environment = { NODE_ENV: "test", DEBUG: "true" };
        const commandHistory = ["npm start", "npm test"];

        const snapshot = captureContext(
          session.id,
          fileTree,
          environment,
          commandHistory,
          [],
          [],
        );

        expect(snapshot.fileTree).toEqual(fileTree);
        expect(snapshot.environment).toEqual(environment);
        expect(snapshot.commandHistory).toEqual(commandHistory);

        const latest = getLatestContextSnapshot(session.id);
        expect(latest?.id).toBe(snapshot.id);

        deleteSession(session.id);
      });
    });

    test("Property 18: Debug State Synchronization", () => {
      prop(20, (rand) => {
        const session = createSession({ name: "debug-prop", ownerId: "owner-1" });
        captureContext(session.id, [], {}, [], [], []);

        const breakpoints = [
          { fileId: "file-1", line: 10, enabled: true, participantId: "user-1" },
          { fileId: "file-2", line: 20, enabled: false, participantId: "user-2" },
        ];

        let updated = addBreakpoint(session.id, breakpoints[0]);
        updated = addBreakpoint(session.id, breakpoints[1]);

        expect(updated.breakpoints.length).toBe(2);

        updated = removeBreakpoint(session.id, updated.breakpoints[0].id);
        expect(updated.breakpoints.length).toBe(1);

        deleteSession(session.id);
      });
    });

    test("Property 12: Ephemeral Session Cleanup", () => {
      prop(20, (rand) => {
        const session = createSession({
          name: "ephemeral-test",
          ownerId: "owner-1",
          isEphemeral: true,
        });

        expect(session.isEphemeral).toBe(true);

        const deleted = deleteSession(session.id);
        expect(deleted).toBe(true);
        expect(getSession(session.id)).toBeNull();
      });
    });
  });
});
