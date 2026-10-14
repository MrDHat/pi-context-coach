import {
  defineTool,
  type ExtensionAPI,
  type ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { ProfileStore, PHASES, workflowGuidance } from "./profile.js";
import { onboard } from "./onboarding.js";
import { auditPricing, formatAudit } from "./pricing.js";
import { ActivityTracker, COMPACT_INSTRUCTIONS, exitCode } from "./activity.js";
import {
  PollingTracker,
  pollingTarget,
  pollingSnapshot,
  POLLING_HINT,
} from "./polling.js";
import {
  initialState,
  canSuggest,
  parseState,
  STATE_TYPE,
  effectiveMinimum,
} from "./boundary-state.js";

export default function contextCoach(pi: ExtensionAPI): void {
  const warned = new Set<string>();
  const profiles = new ProfileStore();
  const activity = new ActivityTracker();
  const polling = new PollingTracker();
  let pollingEnabled = true;
  let state = initialState("");
  const modelKey = (ctx: ExtensionContext) =>
    ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : "";
  function restore(ctx: ExtensionContext) {
    activity.reset();
    polling.reset();
    pollingEnabled = true;
    const key = modelKey(ctx);
    state = initialState(key);
    for (const entry of ctx.sessionManager.getBranch()) {
      if (
        entry.type === "custom" &&
        entry.customType === "context-coach-polling" &&
        entry.data &&
        typeof entry.data === "object" &&
        "enabled" in entry.data &&
        typeof entry.data.enabled === "boolean"
      )
        pollingEnabled = entry.data.enabled;
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
    const candidate = activity.peek();
    if (!candidate || !canSuggest(tokens, budget(ctx), state)) return;
    activity.consume();
    state.lastSuggestedAt = tokens!;
    persist();
    const action =
      candidate.phase === "done"
        ? "/new · /context-coach snooze"
        : "/context-coach compact · /context-coach snooze";
    ctx.ui.notify(`Context Coach — ${candidate.message}\n${action}`, "info");
  }
  pi.registerTool(
    defineTool({
      name: "context_coach_checkpoint",
      label: "Report task checkpoint",
      description:
        "Report a meaningful stopping point: investigation concluded with a finding, implementation complete and ready for review, PR ready for human review, or task finished. Report only when evidence supports the milestone and no further work in that phase is planned before settling. Edits, a passing command, or a commit alone are NOT milestones. Give a concise factual explanation, including unresolved or unrun checks. Do not claim user plan approval; users mark plan agreement with /context-coach checkpoint plan. Follow applicable completion criteria in the Context Coach workflow guidance and attest criteriaSatisfied only when evidence supports them. This tool only nominates a boundary; it never compacts or starts a session.",
      parameters: Type.Object({
        phase: Type.Union([
          Type.Literal("investigation"),
          Type.Literal("implementation"),
          Type.Literal("pr"),
          Type.Literal("done"),
        ]),
        evidence: Type.String({ minLength: 1, maxLength: 400 }),
        criteriaSatisfied: Type.Optional(
          Type.Boolean({
            description:
              "True only when observed evidence satisfies applicable custom workflow criteria.",
          }),
        ),
      }),
      async execute(_id, params, _signal, _onUpdate, ctx) {
        if (!params.evidence.trim())
          throw new Error(
            "Checkpoint evidence must explain the meaningful outcome.",
          );
        const profile = profiles.load(ctx.cwd, ctx.isProjectTrusted()).profile;
        if (
          profile.criteria[params.phase] &&
          params.criteriaSatisfied !== true
        ) {
          throw new Error(
            "Custom completion criteria require an explicit evidence-backed criteriaSatisfied attestation.",
          );
        }
        activity.checkpoint(params.phase);
        return {
          content: [
            {
              type: "text",
              text: "Checkpoint noted. Context Coach may suggest a handoff when the agent settles. No compaction or session change performed.",
            },
          ],
          details: { phase: params.phase },
        };
      },
    }),
  );
  pi.on("before_agent_start", (event, ctx) => {
    const loaded = profiles.load(ctx.cwd, ctx.isProjectTrusted());
    const guidance = workflowGuidance(loaded.profile);
    if (guidance)
      event.systemPromptOptions.sections.context_coach_workflow = guidance;
    else delete event.systemPromptOptions.sections.context_coach_workflow;
    if (loaded.issues.length && ctx.hasUI) {
      const key = loaded.issues.join("\n");
      if (!warned.has(key)) {
        ctx.ui.notify(
          `Context Coach profile errors; invalid files ignored:\n${key}`,
          "warning",
        );
        warned.add(key);
      }
    }
  });
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
  pi.on("tool_call", (event) => {
    activity.start(event.toolCallId);
  });
  pi.on("tool_result", (event) => {
    activity.finish(
      event.toolCallId,
      event.toolName,
      event.input,
      event.isError,
      event.structuredContent,
    );
    const target = pollingTarget(event.toolName, event.input);
    if (!target || !pollingEnabled) return;
    const structured = event.structuredContent;
    const text =
      structured &&
      typeof structured === "object" &&
      "output" in structured &&
      typeof structured.output === "string"
        ? structured.output
        : event.content
            .filter((part) => part.type === "text")
            .map((part) => part.text)
            .join("\n");
    const snapshot =
      event.isError && exitCode(structured) !== 8
        ? undefined
        : pollingSnapshot(target, text);
    if (polling.record(target, snapshot))
      pi.sendMessage(
        {
          customType: "context-coach-polling-hint",
          content: POLLING_HINT,
          display: false,
          details: undefined,
        },
        // Pi appends this after tool results; it reaches the current run without requesting a turn.
        { triggerTurn: false },
      );
  });
  pi.on("session_compact", (_event, ctx) => {
    activity.reset();
    polling.reset();
    state = {
      ...initialState(modelKey(ctx)),
      dismissed: state.dismissed,
      minimumTokens: state.minimumTokens,
    };
    persist();
  });
  pi.on("agent_settled", (_event, ctx) => observe(ctx));
  pi.registerCommand("context-coach", {
    description:
      "Context coaching: onboard, workflow, status, audit, compact, checkpoint, snooze, dismiss, resume, minimum",
    handler: async (args, ctx) => {
      if (!ctx.hasUI) return;
      const [action = "status", first] = args
        .trim()
        .split(/\s+/)
        .filter(Boolean);
      if (action === "onboard") {
        try {
          await onboard(ctx, profiles);
        } catch (error) {
          ctx.ui.notify(
            `Context Coach onboarding not saved: ${(error as Error).message}`,
            "error",
          );
        }
        return;
      }
      if (action === "workflow") {
        const loaded = profiles.load(ctx.cwd, ctx.isProjectTrusted());
        ctx.ui.notify(
          PHASES.map(
            (phase) =>
              `${phase}: ${loaded.profile.criteria[phase] || "opinionated default"}`,
          ).join("\n") +
            (loaded.issues.length
              ? `\nProfile errors:\n${loaded.issues.join("\n")}`
              : ""),
          "info",
        );
        return;
      }
      if (action === "audit") {
        audit(ctx, true);
        return;
      }
      if (action === "polling") {
        if (first !== "on" && first !== "off") {
          ctx.ui.notify("Usage: /context-coach polling on|off", "info");
          return;
        }
        pollingEnabled = first === "on";
        polling.reset();
        pi.appendEntry("context-coach-polling", { enabled: pollingEnabled });
        ctx.ui.notify(
          `Context Coach: agent polling coaching ${first}.`,
          "info",
        );
        return;
      }
      if (action === "compact") {
        await ctx.waitForIdle();
        const identity = () =>
          JSON.stringify([
            ctx.sessionManager.getSessionId(),
            modelKey(ctx),
            ctx.sessionManager.getLeafId(),
          ]);
        const snapshot = identity();
        if (
          !(await ctx.ui.confirm(
            "Compact current context?",
            "This makes a model request and replaces older live context with a lossy summary. Original history remains saved.",
          ))
        )
          return;
        await ctx.waitForIdle();
        if (
          identity() !== snapshot ||
          !ctx.isIdle() ||
          ctx.hasPendingMessages()
        ) {
          ctx.ui.notify(
            "Session, model, or history changed, or work is queued. Retry compaction after it settles.",
            "warning",
          );
          return;
        }
        ctx.compact({
          customInstructions: COMPACT_INSTRUCTIONS,
          onComplete: () =>
            ctx.ui.notify("Context Coach: compaction completed.", "info"),
          onError: (error) =>
            ctx.ui.notify(
              `Context Coach: compaction failed: ${error.message}`,
              "error",
            ),
        });
        return;
      }
      if (action === "checkpoint") {
        if (!activity.checkpoint(first ?? "")) {
          ctx.ui.notify(
            "Usage: /context-coach checkpoint investigation|plan|implementation|pr|done",
            "info",
          );
          return;
        }
        if (ctx.isIdle() && !ctx.hasPendingMessages()) observe(ctx);
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
      } else if (action === "dismiss") state.dismissed = true;
      else if (action === "resume") {
        state.dismissed = false;
        state.snoozeUntil = 0;
        state.lastSuggestedAt = 0;
      } else if (action === "minimum") {
        const minimumTokens = Number(first);
        if (!Number.isSafeInteger(minimumTokens) || minimumTokens <= 0) {
          ctx.ui.notify(
            "Usage: /context-coach minimum <positive integer tokens>",
            "warning",
          );
          return;
        }
        state.minimumTokens = minimumTokens;
      } else if (action !== "status") {
        ctx.ui.notify(
          "Usage: /context-coach [onboard|workflow|status|audit|compact|checkpoint <phase>|snooze|dismiss|resume|minimum <tokens>|polling on|off]",
          "info",
        );
        return;
      }
      if (action !== "status") persist();
      const minimum = effectiveMinimum(state, budget(ctx));
      ctx.ui.notify(
        `Context Coach: ${ctx.getContextUsage()?.tokens ?? "unknown"} estimated context tokens. Task-boundary suggestions require at least ${minimum} tokens; context size alone never triggers a reminder. ${state.dismissed ? "Dismissed for this model/session." : `Snoozed until ${state.snoozeUntil} tokens.`} Polling coaching: ${pollingEnabled ? "on" : "off"}. Commands: onboard, workflow, audit, compact, checkpoint, snooze, dismiss, resume, minimum, polling.`,
        "info",
      );
    },
  });
}
