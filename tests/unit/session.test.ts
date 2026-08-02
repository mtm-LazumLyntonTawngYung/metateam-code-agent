import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  createSession,
  addMessage,
  getMessages,
  deleteSession,
  listSessions,
  countSessionTokens,
} from "../../src/session/history";
import { buildContext, rotateIfNeeded, getSummaries } from "../../src/session/summary";
import { getDb, closeDb } from "../../src/session/db";
import { countTokens } from "../../src/session/tokens";
import { prop, randInt, randStr } from "./prop";

describe("Property 8: Session State Management", () => {
  beforeAll(() => {
    getDb();
  });

  afterAll(() => {
    closeDb();
  });

  test("addMessage is content-additive and ordered by insertion", () => {
    prop(50, (rand) => {
      const sid = createSession("prop");
      const contents: string[] = [];
      const n = 1 + randInt(rand, 10);
      for (let i = 0; i < n; i++) {
        const content = `msg-${randStr(rand, 8, "abc123")}`;
        addMessage(sid, "user", content);
        contents.push(content);
      }
      const rows = getMessages(sid, true);
      expect(rows.length).toBe(n);
      for (let i = 0; i < n; i++) {
        expect(rows[i].content).toBe(contents[i]);
      }
      deleteSession(sid);
    });
  });

  test("token counts are additive across messages", () => {
    prop(50, (rand) => {
      const sid = createSession("prop");
      let expected = 0;
      const n = 1 + randInt(rand, 8);
      for (let i = 0; i < n; i++) {
        const content = randStr(rand, 20, "abc 123");
        addMessage(sid, "assistant", content);
        expected += countTokens(content);
      }
      expect(countSessionTokens(sid)).toBe(expected);
      deleteSession(sid);
    });
  });

  test("deleteSession removes all traces for any session", () => {
    prop(50, (rand) => {
      const sid = createSession("prop");
      const n = 1 + randInt(rand, 5);
      for (let i = 0; i < n; i++) {
        addMessage(sid, "user", randStr(rand, 10, "xyz"));
      }
      deleteSession(sid);
      expect(getMessages(sid, true).length).toBe(0);
      expect(getSummaries(sid).length).toBe(0);
      expect(countSessionTokens(sid)).toBe(0);
    });
  });

  test("buildContext is stable and includes all non-pruned messages", () => {
    prop(50, (rand) => {
      const sid = createSession("prop");
      const n = 1 + randInt(rand, 6);
      for (let i = 0; i < n; i++) {
        addMessage(sid, i % 2 === 0 ? "user" : "assistant", randStr(rand, 10, "abc"));
      }
      const ctx = buildContext(sid, "system-prompt");
      expect(ctx.messages.length).toBe(n);
      expect(ctx.systemMessages[0]).toBe("system-prompt");
      expect(ctx.usage.totalTokens).toBe(countSessionTokens(sid));
      deleteSession(sid);
    });
  });

  test("rotateIfNeeded is idempotent when context is small", () => {
    prop(50, (rand) => {
      const sid = createSession("prop");
      const n = 1 + randInt(rand, 4);
      for (let i = 0; i < n; i++) {
        addMessage(sid, "user", randStr(rand, 5, "ab"));
      }
      const first = rotateIfNeeded(sid);
      const second = rotateIfNeeded(sid);
      expect(second.rotated).toBe(false);
      expect(second.pruned).toBe(0);
      deleteSession(sid);
    });
  });

  test("session ids are unique across creations", () => {
    prop(50, (rand) => {
      const ids = new Set<string>();
      const n = 1 + randInt(rand, 20);
      for (let i = 0; i < n; i++) ids.add(createSession("prop"));
      expect(ids.size).toBe(n);
      for (const id of ids) deleteSession(id);
    });
  });

  test("listSessions returns newest-updated first", () => {
    const a = createSession("order-a");
    const b = createSession("order-b");
    addMessage(a, "user", "touch a");
    addMessage(b, "user", "touch b");
    const rows = listSessions(50);
    const idxA = rows.findIndex((r) => r.id === a);
    const idxB = rows.findIndex((r) => r.id === b);
    expect(idxA).toBeGreaterThanOrEqual(0);
    expect(idxB).toBeGreaterThanOrEqual(0);
    expect(rows[idxA].updated_at >= rows[idxB].updated_at).toBe(true);
    deleteSession(a);
    deleteSession(b);
  });
});
