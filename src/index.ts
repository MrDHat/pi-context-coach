import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { auditPricing, formatAudit } from "./pricing.js";
import {
  initialState,
  nudgeLevel,
  parseState,
  STATE_TYPE,
  thresholds,
  type NudgeState,
} from "./nudges.js";

export default function contextCoach(pi: ExtensionAPI): void {
  const warned = new Set<string>();
  let state = initialState("");
  const modelKey = (ctx: ExtensionContext) =>
    ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : "";
  function restore(ctx: ExtensionContext) {
    const key = modelKey(ctx);
    state = initialState(key);
    for (const entry of ctx.sessionManager.getBranch()) {
      if (entry.type === "custom" && entry.customType === STATE_TYPE) {
        const saved = parseState(entry.data, key);
        if (saved) state = saved;
      }
    }
  }
  const persist = () => pi.appendEntry(STATE_TYPE, { ...state });
  function audit(ctx: ExtensionContext, explicit = false) {
    if (!ctx.hasUI || !ctx.model) return;
    const settings = pi.getSettings();
    const result = auditPricing(ctx.model, settings);
    const key = JSON.stringify([modelKey(ctx), result]);
    if (explicit || (result.risky && !warned.has(key))) {
      ctx.ui.notify(
        formatAudit(ctx.model, settings),
        result.risky ? "warning" : "info",
      );
      warned.add(key);
    }
  }
  function budget(ctx: ExtensionContext) {
    if (!ctx.model) return 0;
    const audit = auditPricing(ctx.model, pi.getSettings());
    return Math.min(
      ctx.model.contextWindow,
      audit.enabled ? audit.limit : ctx.model.contextWindow,
      audit.boundary ?? Infinity,
    );
  }
  function observe(ctx: ExtensionContext) {
    if (!ctx.hasUI || !ctx.model) return;
    const tokens = ctx.getContextUsage()?.tokens;
    const level = nudgeLevel(tokens, budget(ctx), state);
    if (tokens != null)
      ctx.ui.setStatus(
        "context-coach",
        state.dismissed
          ? undefined
          : `Coach: ${Math.round(tokens / 1000)}K context`,
      );
    if (!level) return;
    state.level = level;
    persist();
    ctx.ui.notify(
      level === 2
        ? `Context Coach: ${tokens!.toLocaleString("en-US")} estimated tokens. Consider /compact at a checkpoint, or /new for unrelated work. /context-coach snooze postpones reminders.`
        : "Context Coach: context is growing. Consider compacting at the next task boundary; use /context-coach for options.",
      level === 2 ? "warning" : "info",
    );
  }
  pi.on("session_start", (_event, ctx) => {
    warned.clear();
    restore(ctx);
    audit(ctx);
  });
  pi.on("session_tree", (_event, ctx) => restore(ctx));
  pi.on("model_select", (_event, ctx) => {
    restore(ctx);
    audit(ctx);
  });
  pi.on("session_compact", (_event, ctx) => {
    state = {
      ...initialState(modelKey(ctx)),
      dismissed: state.dismissed,
      soft: state.soft,
      strong: state.strong,
    };
    persist();
    if (ctx.hasUI) ctx.ui.setStatus("context-coach", undefined);
  });
  pi.on("agent_settled", (_event, ctx) => observe(ctx));
  pi.registerCommand("context-coach", {
    description:
      "Context coaching: status, audit, snooze, dismiss, resume, thresholds",
    handler: async (args, ctx) => {
      if (!ctx.hasUI) return;
      const [action = "status", first, second] = args
        .trim()
        .split(/\s+/)
        .filter(Boolean);
      if (action === "audit") {
        audit(ctx, true);
        return;
      }
      if (action === "snooze") {
        const tokens = ctx.getContextUsage()?.tokens;
        if (tokens == null) {
          ctx.ui.notify(
            "Context usage unknown; cannot set a token-based snooze.",
            "warning",
          );
          return;
        }
        state.snoozeUntil = tokens + 20000;
        state.level = 0;
      } else if (action === "dismiss") state.dismissed = true;
      else if (action === "resume") {
        state.dismissed = false;
        state.snoozeUntil = 0;
        state.level = 0;
      } else if (action === "thresholds") {
        const soft = Number(first),
          strong = Number(second);
        if (
          !Number.isSafeInteger(soft) ||
          !Number.isSafeInteger(strong) ||
          soft <= 0 ||
          strong <= soft
        ) {
          ctx.ui.notify(
            "Usage: /context-coach thresholds <soft tokens> <strong tokens>; positive integers with soft < strong.",
            "warning",
          );
          return;
        }
        state.soft = soft;
        state.strong = strong;
        state.level = 0;
      } else if (action !== "status") {
        ctx.ui.notify(
          "Usage: /context-coach [status|audit|snooze|dismiss|resume|thresholds <soft> <strong>]",
          "info",
        );
        return;
      }
      if (action !== "status") persist();
      const limits = thresholds(state, budget(ctx));
      ctx.ui.notify(
        `Context Coach: ${ctx.getContextUsage()?.tokens ?? "unknown"} estimated context tokens. Effective nudges: ${limits.soft}/${limits.strong}. ${state.dismissed ? "Dismissed for this model/session." : `Snoozed until ${state.snoozeUntil} tokens.`} Commands: audit, snooze, dismiss, resume, thresholds.`,
        "info",
      );
    },
  });
}
