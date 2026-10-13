import { describe, expect, it } from "vitest";
import {
  initialState,
  nudgeLevel,
  parseState,
  thresholds,
} from "../src/nudges.js";
import { harness } from "./helpers.js";

describe("context nudges", () => {
  it("uses current tokens, deduplicates levels, and adapts to smaller budgets", () => {
    const s = initialState("openai/example");
    expect(nudgeLevel(120000, 200000, s)).toBe(1);
    s.level = 1;
    expect(nudgeLevel(130000, 200000, s)).toBe(0);
    expect(nudgeLevel(180000, 200000, s)).toBe(2);
    expect(thresholds(s, 100000)).toEqual({ soft: 60000, strong: 90000 });
  });
  it("skips unknown usage, dismissed state, and snoozed usage", () => {
    const s = initialState("m");
    expect(nudgeLevel(null, 200000, s)).toBe(0);
    expect(nudgeLevel(NaN, 200000, s)).toBe(0);
    s.snoozeUntil = 190000;
    expect(nudgeLevel(180000, 200000, s)).toBe(0);
    s.dismissed = true;
    expect(nudgeLevel(200000, 200000, s)).toBe(0);
  });
  it("validates persisted state and keeps model identities separate", () => {
    const s = initialState("m");
    expect(parseState(s, "m")).toEqual(s);
    expect(parseState(s, "other")).toBeUndefined();
    expect(parseState({ ...s, strong: -1 }, "m")).toBeUndefined();
    expect(parseState({ ...s, snoozeUntil: Infinity }, "m")).toBeUndefined();
  });
  it("notifies only at settled boundaries and never injects model messages", () => {
    const h = harness();
    h.ctx.getContextUsage = () => ({
      tokens: 180000,
      contextWindow: 272000,
      percent: 66,
    });
    h.handlers.get("agent_settled")!({}, h.ctx);
    h.handlers.get("agent_settled")!({}, h.ctx);
    expect(h.ctx.ui.notify).toHaveBeenCalledOnce();
    expect(h.appendEntry).toHaveBeenCalledOnce();
    expect(h.sendMessage).not.toHaveBeenCalled();
  });
  it("resets warnings only on successful compaction", () => {
    const h = harness();
    h.ctx.getContextUsage = () => ({
      tokens: 180000,
      contextWindow: 272000,
      percent: 66,
    });
    h.handlers.get("agent_settled")!({}, h.ctx);
    expect(h.handlers.has("session_compact_failed")).toBe(false);
    h.handlers.get("agent_settled")!({}, h.ctx);
    expect(h.ctx.ui.notify).toHaveBeenCalledOnce();
    h.handlers.get("session_compact")!({}, h.ctx);
    h.handlers.get("agent_settled")!({}, h.ctx);
    expect(h.ctx.ui.notify).toHaveBeenCalledTimes(2);
  });
  it("persists a snooze and rejects invalid thresholds", async () => {
    const h = harness();
    await h.command.handler("snooze", h.ctx);
    expect(h.appendEntry).toHaveBeenCalledWith(
      "context-coach-state",
      expect.objectContaining({ snoozeUntil: 21000 }),
    );
    await h.command.handler("thresholds 180000 120000", h.ctx);
    expect(h.appendEntry).toHaveBeenCalledOnce();
  });
  it("restores only state on the active branch", () => {
    const h = harness();
    h.ctx.sessionManager.getBranch = () =>
      [
        {
          type: "custom",
          customType: "context-coach-state",
          data: { ...initialState("openai/example"), dismissed: true },
        },
      ] as any;
    h.handlers.get("session_start")!({}, h.ctx);
    h.ctx.getContextUsage = () => ({
      tokens: 200000,
      contextWindow: 272000,
      percent: 73,
    });
    h.handlers.get("agent_settled")!({}, h.ctx);
    expect(h.ctx.ui.notify).not.toHaveBeenCalled();
  });
});
