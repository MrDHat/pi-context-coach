import { describe, expect, it, vi } from "vitest";
import { ActivityTracker, category } from "../src/activity.js";
import { harness } from "./helpers.js";

describe("opinionated task boundaries", () => {
  it("never nominates a boundary from edits, tests, or commits alone", () => {
    const t = new ActivityTracker();
    t.finish("e", "edit", {}, false, undefined);
    t.finish("v", "bash", { command: "npm test" }, false, { exit_code: 0 });
    t.finish("c", "bash", { command: "git commit -m fix" }, false, {
      exit_code: 0,
    });
    expect(t.peek()).toBeUndefined();
  });
  it("supports only blog-inspired milestones, not generic activity", () => {
    const t = new ActivityTracker();
    for (const phase of [
      "investigation",
      "plan",
      "implementation",
      "pr",
      "done",
    ]) {
      expect(t.checkpoint(phase)).toBe(true);
      expect(t.peek()?.phase).toBe(phase);
    }
    for (const phase of [
      "test_passed",
      "edited",
      "commit",
      "review",
      "unknown",
    ]) {
      expect(t.checkpoint(phase)).toBe(false);
    }
  });
  it("waits for in-flight tools and consumes a milestone only once", () => {
    const t = new ActivityTracker();
    t.start("sibling");
    t.checkpoint("implementation");
    expect(t.peek()).toBeUndefined();
    t.finish("sibling", "read", {}, false, undefined);
    expect(t.consume()?.message).toContain("Compact before review");
    expect(t.peek()).toBeUndefined();
  });
  it("invalidates a checkpoint when edits continue or verification contradicts readiness", () => {
    const t = new ActivityTracker();
    t.checkpoint("implementation");
    t.finish("e", "write", {}, false, undefined);
    expect(t.peek()).toBeUndefined();
    t.checkpoint("pr");
    t.finish("v", "bash", { command: "npm test" }, true, { exit_code: 1 });
    expect(t.peek()).toBeUndefined();
    t.checkpoint("investigation");
    t.finish("v", "bash", { command: "npm test" }, true, { exit_code: 1 });
    expect(t.peek()?.phase).toBe("investigation");
  });
  it("does not pretend to parse arbitrary shell commands", () => {
    expect(category("bash", { command: "npm test || true" })).toBe("other");
    expect(category("bash", { command: "echo ok; npm test" })).toBe("other");
    expect(category("mcp__tests", {})).toBe("other");
  });
  it("provides an agent reporting tool but requires meaningful evidence", async () => {
    const h = harness();
    const tool = h.registerTool.mock.calls[0]![0];
    await expect(
      tool.execute(
        "id",
        { phase: "implementation", evidence: " " },
        undefined,
        undefined,
        h.ctx as any,
      ),
    ).rejects.toThrow("evidence");
    h.ctx.getContextUsage = () => ({
      tokens: 142000,
      contextWindow: 272000,
      percent: 52,
    });
    await tool.execute(
      "id",
      {
        phase: "implementation",
        evidence: "Implementation complete; unit tests passed, review is next.",
      },
      undefined,
      undefined,
      h.ctx as any,
    );
    expect(h.ctx.ui.notify).not.toHaveBeenCalled();
    h.handlers.get("agent_settled")!({}, h.ctx);
    expect(h.ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("Implementation complete\nCompact before review"),
      "info",
    );
    expect(h.ctx.compact).not.toHaveBeenCalled();
  });
});

describe("approved compaction action", () => {
  it("does nothing when confirmation is declined", async () => {
    const h = harness();
    h.ctx.ui.confirm = vi.fn(async () => false);
    await h.command.handler("compact", h.ctx);
    expect(h.ctx.compact).not.toHaveBeenCalled();
  });
  it("compacts with focused instructions after approval", async () => {
    const h = harness();
    h.ctx.ui.confirm = vi.fn(async () => true);
    await h.command.handler("compact", h.ctx);
    expect(h.ctx.waitForIdle).toHaveBeenCalledTimes(2);
    expect(h.ctx.compact).toHaveBeenCalledWith(
      expect.objectContaining({
        customInstructions: expect.stringContaining("unrun checks"),
      }),
    );
  });
  it("rejects stale history or pending work after confirmation", async () => {
    const h = harness();
    h.ctx.ui.confirm = vi.fn(async () => {
      h.ctx.sessionManager.getLeafId = () => "new-leaf";
      return true;
    });
    await h.command.handler("compact", h.ctx);
    expect(h.ctx.compact).not.toHaveBeenCalled();
    h.ctx.hasPendingMessages = () => true;
    await h.command.handler("compact", h.ctx);
    expect(h.ctx.compact).not.toHaveBeenCalled();
  });
  it("offers a phase-specific suggestion without diagnostic noise", async () => {
    const h = harness();
    h.ctx.getContextUsage = () => ({
      tokens: 142000,
      contextWindow: 272000,
      percent: 52,
    });
    await h.command.handler("checkpoint implementation", h.ctx);
    expect(h.ctx.ui.notify).toHaveBeenCalledWith(
      "Context Coach — Implementation complete\nCompact before review to preserve the changed files, verification results, unresolved questions, and next step.\n/context-coach compact · /context-coach snooze",
      "info",
    );
    expect(h.ctx.compact).not.toHaveBeenCalled();
  });
});
