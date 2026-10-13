import { describe, expect, it } from "vitest";
import { auditPricing, compactionLimit, formatAudit } from "../src/pricing.js";
import { model } from "./helpers.js";

const priced = () => ({
  ...model(),
  cost: { ...model().cost, tiers: [{ inputTokensAbove: 272000, input: 4 }] },
});

describe("pricing audit", () => {
  it("uses defaults and independent per-model overrides", () => {
    expect(compactionLimit(model(), {})).toBe(255616);
    expect(
      compactionLimit(model(), {
        compaction: {
          reserveTokens: 30000,
          modelOverrides: {
            "openai/example": { keepRecentTokens: 10000 },
          },
        },
      }),
    ).toBe(242000);
    expect(
      compactionLimit(model(), {
        compaction: {
          modelOverrides: { "openai/example": { reserveTokens: 72000 } },
        },
      }),
    ).toBe(200000);
  });
  it("flags insufficient headroom and disabled compaction", () => {
    expect(auditPricing(priced(), {}).risky).toBe(true);
    expect(
      auditPricing(priced(), { compaction: { reserveTokens: 72000 } }).risky,
    ).toBe(false);
    expect(
      auditPricing(priced(), {
        compaction: { enabled: false, reserveTokens: 72000 },
      }).risky,
    ).toBe(true);
  });
  it("never invents pricing boundaries", () => {
    expect(auditPricing(model(), {}).boundary).toBeUndefined();
    expect(
      auditPricing(
        {
          ...model(),
          cost: {
            ...model().cost,
            tiers: [{ inputTokensAbove: 100000, input: 1 }],
          },
        },
        {},
      ).boundary,
    ).toBeUndefined();
  });
  it("chooses the earliest surcharge including output-only changes", () => {
    const m = priced();
    m.cost.tiers.push({ inputTokensAbove: 100000, input: 3 });
    expect(auditPricing(m, {}).boundary).toBe(100000);
    expect(
      auditPricing(
        {
          ...model(),
          cost: {
            ...model().cost,
            tiers: [{ inputTokensAbove: 100000, output: 20 }],
          },
        },
        {},
      ).boundary,
    ).toBe(100000);
  });
  it("rejects invalid ordinary reserves even with a valid override", () => {
    expect(() =>
      compactionLimit(model(), {
        compaction: {
          reserveTokens: -1,
          modelOverrides: { "openai/example": { reserveTokens: 72000 } },
        },
      }),
    ).toThrow("Invalid");
  });
  it("previews a model-specific change without mutating settings", () => {
    const settings = { compaction: { enabled: false } };
    const before = JSON.stringify(settings);
    const text = formatAudit(priced(), settings);
    expect(text).toContain("openai/example");
    expect(text).toContain("No settings changed");
    expect(JSON.stringify(settings)).toBe(before);
  });
});
