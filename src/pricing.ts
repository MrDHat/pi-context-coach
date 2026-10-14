import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export type Settings = ReturnType<ExtensionAPI["getSettings"]>;
export interface PricingModel {
  provider: string;
  id: string;
  contextWindow: number;
  cost: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    tiers?: Array<{
      inputTokensAbove: number;
      input?: number;
      output?: number;
      cacheRead?: number;
      cacheWrite?: number;
    }>;
  };
}

export function compactionLimit(
  model: PricingModel,
  settings: Settings,
): number {
  const ordinary = settings.compaction?.reserveTokens ?? 16384;
  const override =
    settings.compaction?.modelOverrides?.[`${model.provider}/${model.id}`]
      ?.reserveTokens;
  for (const value of [ordinary, override]) {
    if (value !== undefined && (!Number.isSafeInteger(value) || value < 0)) {
      throw new Error("Invalid compaction reserveTokens setting");
    }
  }
  return Math.max(0, model.contextWindow - (override ?? ordinary));
}

export function auditPricing(model: PricingModel, settings: Settings) {
  const limit = compactionLimit(model, settings);
  // No hardcoded model names or claims that missing tiers mean no surcharge.
  const tiers = (model.cost.tiers ?? []).filter(
    (tier) =>
      Number.isSafeInteger(tier.inputTokensAbove) &&
      tier.inputTokensAbove > 0 &&
      (tier.inputTokensAbove < model.contextWindow ||
        tier.inputTokensAbove === model.contextWindow) &&
      (["input", "output", "cacheRead", "cacheWrite"] as const).some(
        (rate) => (tier[rate] ?? model.cost[rate]) > model.cost[rate],
      ),
  );
  const boundary = tiers.length
    ? Math.min(...tiers.map((tier) => tier.inputTokensAbove))
    : undefined;
  const enabled = settings.compaction?.enabled !== false;
  const target =
    boundary === undefined
      ? undefined
      : Math.floor((boundary * 0.75) / (boundary >= 20000 ? 10000 : 1)) *
        (boundary >= 20000 ? 10000 : 1);
  return {
    limit,
    boundary,
    enabled,
    target,
    risky: boundary !== undefined && (!enabled || limit > target!),
  };
}

export function formatAudit(model: PricingModel, settings: Settings): string {
  const audit = auditPricing(model, settings);
  const lines = [
    `${model.provider}/${model.id}: auto-compaction ${audit.enabled ? `above ${audit.limit.toLocaleString("en-US")} estimated tokens` : "disabled"}.`,
  ];
  if (audit.boundary === undefined) {
    lines.push(
      "Long-context pricing boundary unknown in installed model metadata.",
    );
  } else {
    lines.push(
      `Installed model metadata reports higher rates above ${audit.boundary.toLocaleString("en-US")} input tokens. Metadata may be stale; verify provider pricing.`,
    );
    if (audit.risky) {
      lines.push(
        `Suggested trigger: ${audit.target!.toLocaleString("en-US")} tokens (at least 25% headroom). Merge this per-model override into your settings, preserving other values, then /reload:`,
        JSON.stringify(
          {
            compaction: {
              enabled: true,
              modelOverrides: {
                [`${model.provider}/${model.id}`]: {
                  reserveTokens: model.contextWindow - audit.target!,
                },
              },
            },
          },
          null,
          2,
        ),
      );
    } else {
      lines.push(
        "Your configured trigger already provides the suggested headroom.",
      );
    }
  }
  lines.push(
    "Advisory only: auto-compaction is not a hard billing cap. No settings changed.",
  );
  return lines.join("\n");
}
