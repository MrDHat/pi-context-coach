import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { auditPricing, formatAudit } from "./pricing.js";

export default function contextCoach(pi: ExtensionAPI): void {
  const warned = new Set<string>();
  function audit(ctx: ExtensionContext, explicit = false) {
    if (!ctx.hasUI || !ctx.model) return;
    const settings = pi.getSettings();
    const result = auditPricing(ctx.model, settings);
    const key = JSON.stringify([ctx.model.provider, ctx.model.id, result]);
    if (explicit || (result.risky && !warned.has(key))) {
      ctx.ui.notify(
        formatAudit(ctx.model, settings),
        result.risky ? "warning" : "info",
      );
      warned.add(key);
    }
  }
  pi.on("session_start", (_event, ctx) => {
    warned.clear();
    audit(ctx);
  });
  pi.on("model_select", (_event, ctx) => audit(ctx));
  pi.registerCommand("context-coach", {
    description: "Audit context and pricing configuration (read-only)",
    handler: async (_args, ctx) => audit(ctx, true),
  });
}
