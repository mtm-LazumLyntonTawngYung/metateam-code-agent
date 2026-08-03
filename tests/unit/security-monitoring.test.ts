import { describe, test, expect } from "bun:test";
import {
  SECURITY_SEVERITIES,
  SEVERITY_WEIGHT,
  classifyThreatSeverity,
  detectThreats,
  severityRank,
  isSecuritySeverity,
  computeComplianceStatus,
  defaultSecurityPolicies,
} from "../../src/enterprise/security";
import type { SecurityEvent, SecuritySeverity } from "../../src/enterprise/security";
import {
  buildAuditChain,
  verifyAuditChain,
  computeAuditHash,
} from "../../src/enterprise/audit";
import { prop, randInt, randStr } from "./prop";

function randomEvents(rand: () => number, count: number, maxSeverity: SecuritySeverity = "critical"): SecurityEvent[] {
  const out: SecurityEvent[] = [];
  const cats = ["auth", "access", "integrity", "network", "data"];
  for (let i = 0; i < count; i++) {
    const sev = SECURITY_SEVERITIES[randInt(rand, SEVERITY_WEIGHT[maxSeverity] + 1)];
    out.push({
      id: `e${i}-${randStr(rand, 4, "abc012")}`,
      timestamp: `2026-01-${String(1 + randInt(rand, 28)).padStart(2, "0")}T00:00:00Z`,
      category: cats[randInt(rand, cats.length)],
      severity: sev,
      actor: randStr(rand, 6, "abc"),
      action: randStr(rand, 8, "abc.012"),
      resource: `res/${randInt(rand, 10)}`,
      detail: randStr(rand, 10, "abc 012"),
    });
  }
  return out;
}

describe("Property 16: Security Monitoring Consistency", () => {
  test("severity classification is monotonic non-decreasing in event count", () => {
    prop(200, (rand) => {
      const a = randInt(rand, 40);
      const b = a + randInt(rand, 40);
      const sa = classifyThreatSeverity(a);
      const sb = classifyThreatSeverity(b);
      expect(severityRank(sb)).toBeGreaterThanOrEqual(severityRank(sa));
      expect(severityRank(classifyThreatSeverity(0))).toBeGreaterThanOrEqual(0);
    });
  });

  test("classifyThreatSeverity always returns a valid severity", () => {
    prop(300, (rand) => {
      const s = classifyThreatSeverity(randInt(rand, 200));
      expect(isSecuritySeverity(s)).toBe(true);
    });
  });

  test("threat severity never decreases when events are added to a category", () => {
    prop(100, (rand) => {
      const base = randomEvents(rand, 1 + randInt(rand, 10), "medium");
      const t1 = detectThreats(base);
      const extra = randomEvents(rand, 1 + randInt(rand, 40), "medium");
      const t2 = detectThreats(base.concat(extra));
      const rank = (list: typeof t1, cat: string) => {
        const t = list.find((x) => x.category === cat);
        return t ? severityRank(t.severity) : 0;
      };
      const cats = new Set([...t1, ...t2].map((x) => x.category));
      for (const cat of cats) {
        expect(rank(t2, cat)).toBeGreaterThanOrEqual(rank(t1, cat));
      }
    });
  });

  test("each threat reports the exact event count and severity of its category", () => {
    prop(100, (rand) => {
      const events = randomEvents(rand, 1 + randInt(rand, 30), "high");
      const threats = detectThreats(events);
      for (const t of threats) {
        const count = events.filter((e) => e.category === t.category).length;
        expect(t.eventCount).toBe(count);
        expect(t.severity).toBe(classifyThreatSeverity(count));
      }
    });
  });

  test("detection is deterministic across calls", () => {
    prop(100, (rand) => {
      const events = randomEvents(rand, 1 + randInt(rand, 20));
      const a = detectThreats(events);
      const b = detectThreats(events);
      expect(a).toEqual(b);
    });
  });

  test("emitted security event severities are always valid enum members", () => {
    prop(100, (rand) => {
      const events = randomEvents(rand, 1 + randInt(rand, 20));
      for (const e of events) expect(isSecuritySeverity(e.severity)).toBe(true);
    });
  });

  test("compliance score stays in [0,100] and frameworks match requirements", () => {
    prop(100, (rand) => {
      const policies = defaultSecurityPolicies().map((p) => ({
        ...p,
        enabled: rand() > 0.5,
        value: typeof p.value === "number" ? randInt(rand, 365) : rand() > 0.5,
      }));
      const status = computeComplianceStatus(policies, rand() > 0.5);
      expect(status.score).toBeGreaterThanOrEqual(0);
      expect(status.score).toBeLessThanOrEqual(100);
      const met = status.requirements.filter((r) => r.satisfied).length;
      expect(Math.round((met / status.requirements.length) * 100)).toBe(status.score);
      for (const f of status.frameworks) {
        const list = status.requirements.filter((r) => r.framework === f.framework);
        expect(list.length).toBe(f.total);
        expect(f.met).toBe(list.filter((r) => r.satisfied).length);
      }
    });
  });

  test("audit chain over any event set verifies as valid", () => {
    prop(100, (rand) => {
      const events = randomEvents(rand, 1 + randInt(rand, 30)).map((e) => ({
        id: e.id, timestamp: e.timestamp, actor: e.actor, action: e.action, resource: e.resource, detail: e.detail,
      }));
      const chain = buildAuditChain(events);
      expect(verifyAuditChain(chain).valid).toBe(true);
      expect(chain.length).toBe(events.length);
      expect(chain[0].prevHash).toBeNull();
    });
  });

  test("modifying any field of any chained event breaks verification", () => {
    prop(100, (rand) => {
      const events = randomEvents(rand, 2 + randInt(rand, 20)).map((e) => ({
        id: e.id, timestamp: e.timestamp, actor: e.actor, action: e.action, resource: e.resource, detail: e.detail,
      }));
      const chain = buildAuditChain(events);
      const tampered = chain.map((e) => ({ ...e }));
      const pick = randInt(rand, tampered.length);
      const field = (["actor", "action", "resource", "detail", "timestamp"] as const)[randInt(rand, 5)];
      tampered[pick] = { ...tampered[pick], [field]: tampered[pick][field] + "x" };
      const result = verifyAuditChain(tampered);
      expect(result.valid).toBe(false);
      expect(result.brokenIndex).toBe(pick);
    });
  });

  test("reordering any pair of events breaks verification", () => {
    prop(100, (rand) => {
      const events = randomEvents(rand, 3 + randInt(rand, 15)).map((e) => ({
        id: e.id, timestamp: e.timestamp, actor: e.actor, action: e.action, resource: e.resource, detail: e.detail,
      }));
      const chain = buildAuditChain(events);
      const reordered = chain.map((e) => ({ ...e }));
      const i = randInt(rand, reordered.length);
      const j = randInt(rand, reordered.length);
      if (i !== j) {
        const tmp = reordered[i];
        reordered[i] = reordered[j];
        reordered[j] = tmp;
        expect(verifyAuditChain(reordered).valid).toBe(false);
      }
    });
  });

  test("audit hashing is deterministic and collision-free for distinct events", () => {
    prop(100, (rand) => {
      const a = randomEvents(rand, 1, "high")[0];
      const fields = { id: a.id, timestamp: a.timestamp, actor: a.actor, action: a.action, resource: a.resource, detail: a.detail };
      expect(computeAuditHash("prev", fields)).toBe(computeAuditHash("prev", fields));
      const diff = { ...fields, detail: fields.detail + "!" };
      expect(computeAuditHash("prev", diff)).not.toBe(computeAuditHash("prev", fields));
      expect(computeAuditHash("a", fields)).not.toBe(computeAuditHash("b", fields));
    });
  });
});
