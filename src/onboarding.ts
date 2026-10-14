import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { PHASES, ProfileStore, type WorkflowProfile } from "./profile.js";

const STEPS = {
  investigation: {
    title: "Investigation concluded",
    default:
      "A supported conclusion and next step are clear; compact before implementation.",
    example:
      "Root cause identified with evidence; debugging skill completed; findings recorded in the issue.",
  },
  plan: {
    title: "Plan agreed",
    default:
      "You explicitly approve the approach; compact before execution. Agent approval is never enough.",
    example:
      "Our planning skill produced a reviewed plan, acceptance criteria are written, and I explicitly approve it.",
  },
  implementation: {
    title: "Implementation complete",
    default:
      "The planned implementation is ready for review; preserve changes, checks, and unresolved questions.",
    example:
      "TDD skill completed, tests and typecheck pass, and remaining risks are documented.",
  },
  pr: {
    title: "PR ready for review",
    default:
      "The PR is ready for human review; preserve scope and decisions before handling feedback.",
    example:
      "Review skill completed, CI is green, PR description explains scope and checks, and no draft work remains.",
  },
  done: {
    title: "Task complete",
    default:
      "The task is finished; start fresh for unrelated work, saving a handoff if needed.",
    example:
      "Acceptance criteria met, review feedback resolved, issue updated, and follow-ups recorded.",
  },
};

/** UI-only walkthrough; no writes until the final explicit confirmation. */
export async function onboard(
  ctx: ExtensionCommandContext,
  store = new ProfileStore(),
): Promise<boolean> {
  if (!ctx.hasUI) return false;
  await ctx.waitForIdle();
  const session = ctx.sessionManager.getSessionId(),
    cwd = ctx.cwd;
  if (
    !(await ctx.ui.confirm(
      "Context Coach — onboarding",
      [
        "Pricing audit: warns about risky compaction settings, but never changes them or guarantees a billing cap.",
        "Task handoffs: meaningful milestones—not token thresholds or passing commands—can suggest compaction. You always approve compaction.",
        "Polling coach: nudges the agent toward bounded watchers instead of repeated status checks; it never executes or rewrites commands.",
        "Next: define optional completion criteria for five milestones. You may name skills, tools, checks, or artifacts. These supplement the defaults; they are guidance, not independently verified detection.",
        "Keep credentials and sensitive data out of criteria: saved guidance will be sent to your model provider.",
      ].join("\n\n"),
    ))
  )
    return false;
  const scopes = ["Personal — all projects"];
  if (ctx.isProjectTrusted()) scopes.push("Project — this trusted repository");
  const selected = await ctx.ui.select(
    "Where should completion criteria be saved?",
    scopes,
  );
  if (!selected) return false;
  const scope = selected.startsWith("Project") ? "project" : "personal";
  const path = store.path(scope, cwd);
  const loaded = store.load(cwd, scope === "project");
  if (loaded.issues.length) {
    ctx.ui.notify(
      `Fix existing profile errors before onboarding:\n${loaded.issues.join("\n")}`,
      "warning",
    );
    return false;
  }
  const expected = store.snapshot(path);
  const draft: WorkflowProfile = {
    version: 1,
    criteria: { ...loaded.profile.criteria },
  };
  for (const [index, phase] of PHASES.entries()) {
    const step = STEPS[phase];
    const choice = await ctx.ui.select(
      `Step ${index + 1}/5 — ${step.title}\n${step.default}\nCurrent extra criteria: ${draft.criteria[phase] || "none (opinionated default)"}`,
      [
        "Keep current criteria",
        "Add or edit my criteria",
        "Use the default only",
        "Cancel onboarding",
      ],
    );
    if (!choice || choice === "Cancel onboarding") return false;
    if (choice === "Use the default only") draft.criteria[phase] = "";
    if (choice === "Add or edit my criteria") {
      const text = await ctx.ui.input(
        `${step.title}: what additional evidence must exist? (up to 800 characters)`,
        step.example,
      );
      if (text === undefined) return false;
      if (text.length > 800) {
        ctx.ui.notify(
          "Criteria exceed 800 characters. Restart onboarding with a concise definition.",
          "warning",
        );
        return false;
      }
      draft.criteria[phase] = text.trim();
    }
  }
  const preview = PHASES.map(
    (phase) =>
      `${STEPS[phase].title}: ${draft.criteria[phase] || "opinionated default only"}`,
  ).join("\n\n");
  if (
    !(await ctx.ui.confirm(
      "Save this workflow guidance?",
      `${preview}\n\nFile: ${path}\n${scope === "personal" ? "Trusted project criteria may override personal criteria.\n" : "This file may be committed to share the project workflow.\n"}Guidance takes effect on the next run. No Pi settings, skills, or compaction behavior will be changed.`,
    ))
  )
    return false;
  await ctx.waitForIdle();
  if (
    cwd !== ctx.cwd ||
    session !== ctx.sessionManager.getSessionId() ||
    !ctx.isIdle() ||
    ctx.hasPendingMessages() ||
    (scope === "project" && !ctx.isProjectTrusted())
  ) {
    ctx.ui.notify(
      "Session, trust, or pending work changed. Restart onboarding before saving.",
      "warning",
    );
    return false;
  }
  store.save(path, draft, expected);
  ctx.ui.notify(
    `Context Coach onboarding saved to ${path}. Criteria guide milestone reports on the next run. Use /context-coach workflow to inspect or /context-coach onboard to revise.`,
    "info",
  );
  return true;
}
