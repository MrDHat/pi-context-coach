export type Checkpoint =
  "investigation" | "plan" | "implementation" | "pr" | "done";
export type Category = "edit" | "verify" | "other";

/** Deliberately not a shell parser: compound commands remain unknown. */
export function category(
  tool: string,
  input: Record<string, unknown>,
): Category {
  if (tool === "edit" || tool === "write") return "edit";
  if (tool !== "bash" || typeof input.command !== "string") return "other";
  const command = input.command.trim();
  if (/[;&|\n\r`$<>]/.test(command)) return "other";
  if (
    /^(?:npm|pnpm|yarn) (?:test|run (?:test|typecheck|check))(?: --[\w-]+)*$/.test(
      command,
    ) ||
    /^(?:pytest|cargo test|go test \.\/\.\.\.|npx tsc --noEmit)$/.test(command)
  )
    return "verify";
  return "other";
}

export function exitCode(value: unknown): number | undefined {
  if (
    value &&
    typeof value === "object" &&
    "exit_code" in value &&
    typeof value.exit_code === "number"
  )
    return value.exit_code;
  return;
}

const SUGGESTIONS: Record<Checkpoint, string> = {
  investigation:
    "Investigation complete\nCompact before implementation to preserve the conclusion, supporting evidence, and next step—not the full search history.",
  plan: "Plan agreed\nCompact before execution to preserve the approved approach, constraints, and acceptance checks.",
  implementation:
    "Implementation complete\nCompact before review to preserve the changed files, verification results, unresolved questions, and next step.",
  pr: "PR ready for review\nCompact before addressing review feedback to preserve the PR scope, key decisions, and checks—not the full development history.",
  done: "Task complete\nStart a fresh session for unrelated work. Save a concise handoff first if important decisions or follow-up work need to carry over.",
};

/** Explicit milestones nominate boundaries; tool activity never creates one. */
export class ActivityTracker {
  private pending = new Set<string>();
  private phase: Checkpoint | undefined;
  reset() {
    this.pending.clear();
    this.phase = undefined;
  }
  start(id: string) {
    this.pending.add(id);
  }
  finish(
    id: string,
    tool: string,
    input: Record<string, unknown>,
    failed: boolean,
    structured: unknown,
  ) {
    this.pending.delete(id);
    const kind = category(tool, input);
    // New edits mean execution is still underway. Failed verification contradicts
    // a reported implementation/PR-ready boundary, but not an investigation outcome.
    if (
      kind === "edit" ||
      (kind === "verify" &&
        (failed || exitCode(structured) !== 0) &&
        (this.phase === "implementation" || this.phase === "pr"))
    )
      this.phase = undefined;
  }
  checkpoint(phase: string): boolean {
    if (!Object.hasOwn(SUGGESTIONS, phase)) return false;
    this.phase = phase as Checkpoint;
    return true;
  }
  peek() {
    return this.pending.size === 0 && this.phase
      ? { phase: this.phase, message: SUGGESTIONS[this.phase] }
      : undefined;
  }
  consume() {
    const candidate = this.peek();
    if (candidate) this.phase = undefined;
    return candidate;
  }
}

export const COMPACT_INSTRUCTIONS =
  "Preserve the goal, agreed approach, constraints, changed files, test results (including failures or unrun checks), unresolved questions, and next step. Summarize completed investigations briefly. Do not invent verification or completion.";
