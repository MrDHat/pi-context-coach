import { createHash } from "node:crypto";

interface Snapshot {
  target: string;
  fingerprint: string;
}
const PENDING = new Set([
  "pending",
  "queued",
  "in_progress",
  "waiting",
  "requested",
  "expected",
]);
const SUCCESS = new Set(["success", "completed", "skipped", "neutral"]);

/** Only documented, machine-readable gh status checks are understood. */
export function pollingTarget(
  tool: string,
  input: Record<string, unknown>,
): string | undefined {
  if (tool !== "bash" || typeof input.command !== "string") return;
  const command = input.command.trim();
  const run =
    /^gh run view (\d+) --json (?:status,conclusion|conclusion,status)$/.exec(
      command,
    );
  if (run) return `run:${run[1]}`;
  const pr = /^gh pr checks (\d+) --json (?:name,state|state,name)$/.exec(
    command,
  );
  if (pr) return `pr:${pr[1]}`;
  return;
}

export function pollingSnapshot(
  target: string,
  text: string,
): Snapshot | undefined {
  if (text.length > 8192) return;
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return;
  }
  let normalized: string;
  if (target.startsWith("run:")) {
    if (
      !data ||
      typeof data !== "object" ||
      !("status" in data) ||
      !("conclusion" in data)
    )
      return;
    const status = String(data.status).toLowerCase();
    if (
      !PENDING.has(status) ||
      (data.conclusion !== null && data.conclusion !== "")
    )
      return;
    normalized = status;
  } else {
    if (!Array.isArray(data) || data.length === 0 || data.length > 100) return;
    const rows: string[] = [];
    let pending = false;
    for (const row of data) {
      if (
        !row ||
        typeof row !== "object" ||
        typeof row.name !== "string" ||
        typeof row.state !== "string"
      )
        return;
      const state = row.state.toLowerCase();
      if (!PENDING.has(state) && !SUCCESS.has(state)) return;
      pending ||= PENDING.has(state);
      rows.push(JSON.stringify([row.name, state]));
    }
    if (!pending) return;
    normalized = rows.sort().join("\n");
  }
  return {
    target,
    fingerprint: createHash("sha256").update(normalized).digest("hex"),
  };
}

export class PollingTracker {
  private targets = new Map<
    string,
    { fingerprint: string; count: number; lastAt: number; warned: boolean }
  >();
  reset() {
    this.targets.clear();
  }
  record(
    target: string,
    snapshot: Snapshot | undefined,
    now = Date.now(),
  ): boolean {
    if (!snapshot) {
      this.targets.delete(target);
      return false;
    }
    const previous = this.targets.get(target);
    const entry =
      previous &&
      previous.fingerprint === snapshot.fingerprint &&
      now - previous.lastAt < 600000
        ? { ...previous, count: previous.count + 1, lastAt: now }
        : {
            fingerprint: snapshot.fingerprint,
            count: 1,
            lastAt: now,
            warned: false,
          };
    const coach = entry.count >= 3 && !entry.warned;
    if (coach) entry.warned = true;
    this.targets.delete(target);
    this.targets.set(target, entry);
    if (this.targets.size > 32)
      this.targets.delete(this.targets.keys().next().value!);
    return coach;
  }
}

export const POLLING_HINT =
  "Context Coach: three recognized status checks for the same GitHub target returned unchanged pending state. Avoid another model-level check/sleep loop. Prefer a supported watcher (for example gh run watch <run-id> --exit-status) or a bounded polling script that waits inside one tool call and returns only completion, actionable failure, or timeout. Respect cancellation and set a finite timeout. Do not compact merely to fix polling. This is advisory; do not blindly substitute a command for a different target.";
