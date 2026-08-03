import { describe, test, expect } from "bun:test";
import { generateLicenseKey, parseLicenseKey } from "../../src/enterprise/license";
import type { Tier } from "../../src/enterprise/types";
import { prop, randInt, randStr } from "./prop";

describe("license system", () => {
  test("round-trip with configured secret", () => {
    process.env.MTC_LICENSE_SECRET = "test-secret";
    const key = generateLicenseKey("enterprise", "Acme", "2030-01-01T00:00:00.000Z", 50);
    const parsed = parseLicenseKey(key);
    expect(parsed).not.toBeNull();
    expect(parsed!.tier).toBe("enterprise");
    expect(parsed!.organization).toBe("Acme");
    expect(parsed!.maxSeats).toBe(50);
    expect(parsed!.expiresAt).toBe("2030-01-01T00:00:00.000Z");
  });

  test("enterprise-plus tier (dash in tier) round-trips", () => {
    process.env.MTC_LICENSE_SECRET = "test-secret";
    const key = generateLicenseKey("enterprise-plus", "Acme", "2030-01-01T00:00:00.000Z", 500);
    expect(parseLicenseKey(key)?.tier).toBe("enterprise-plus");
  });

  test("rejects tampered key", () => {
    process.env.MTC_LICENSE_SECRET = "test-secret";
    const key = generateLicenseKey("enterprise", "Acme", "2030-01-01T00:00:00.000Z", 50);
    const tampered = key.slice(0, -4) + (key.endsWith("aaaa") ? "bbbb" : "aaaa");
    expect(parseLicenseKey(tampered)).toBeNull();
  });

  test("rejects expired key at read time", () => {
    process.env.MTC_LICENSE_SECRET = "test-secret";
    const key = generateLicenseKey("enterprise", "Acme", "2020-01-01T00:00:00.000Z", 50);
    expect(parseLicenseKey(key)).toBeNull();
  });

  test("fails closed when no secret configured", () => {
    delete process.env.MTC_LICENSE_SECRET;
    const key = generateLicenseKey("enterprise", "Acme", "2030-01-01T00:00:00.000Z", 50);
    expect(parseLicenseKey(key)).toBeNull();
  });

  test("rejects wrong secret", () => {
    process.env.MTC_LICENSE_SECRET = "secret-a";
    const key = generateLicenseKey("enterprise", "Acme", "2030-01-01T00:00:00.000Z", 50);
    process.env.MTC_LICENSE_SECRET = "secret-b";
    expect(parseLicenseKey(key)).toBeNull();
  });
});

describe("Property 3: License System Integrity", () => {
  const tiers: Tier[] = ["community", "enterprise", "enterprise-plus"];

  test("round-trip for any valid parameters", () => {
    process.env.MTC_LICENSE_SECRET = "prop-secret";
    prop(100, (rand) => {
      const tier = tiers[randInt(rand, tiers.length)];
      const org = randStr(rand, 10, "ABC012");
      const expires = new Date(Date.now() + 1000 * 60 * 60 * 24 * (1 + randInt(rand, 3650))).toISOString();
      const seats = 1 + randInt(rand, 500);
      const parsed = parseLicenseKey(generateLicenseKey(tier, org, expires, seats));
      expect(parsed).not.toBeNull();
      expect(parsed!.tier).toBe(tier);
      expect(parsed!.organization).toBe(org);
      expect(parsed!.maxSeats).toBe(seats);
      expect(parsed!.expiresAt).toBe(expires);
    });
  });

  test("any single-character tamper is rejected", () => {
    process.env.MTC_LICENSE_SECRET = "prop-secret";
    prop(100, (rand) => {
      const key = generateLicenseKey("enterprise-plus", "Acme", "2030-01-01T00:00:00.000Z", 50);
      const pos = 4 + randInt(rand, key.length - 4);
      const c = key[pos];
      const flipped = key.slice(0, pos) + (c === "a" ? "b" : "a") + key.slice(pos + 1);
      expect(parseLicenseKey(flipped)).toBeNull();
    });
  });

  test("expired keys are always rejected", () => {
    process.env.MTC_LICENSE_SECRET = "prop-secret";
    prop(100, (rand) => {
      const expires = new Date(Date.now() - 1000 * 60 * 60 * 24 * randInt(rand, 3650)).toISOString();
      expect(parseLicenseKey(generateLicenseKey("enterprise", "Acme", expires, 50))).toBeNull();
    });
  });

  test("fails closed without a secret for any key", () => {
    process.env.MTC_LICENSE_SECRET = "prop-secret";
    const key = generateLicenseKey("enterprise", "Acme", "2030-01-01T00:00:00.000Z", 50);
    delete process.env.MTC_LICENSE_SECRET;
    prop(50, () => {
      expect(parseLicenseKey(key)).toBeNull();
    });
  });
});
