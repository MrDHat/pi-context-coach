import { describe, expect, it } from "vitest";
import {
  canSuggest,
  effectiveMinimum,
  initialState,
  parseState,
} from "../src/boundary-state.js";
import { harness } from "./helpers.js";

function usage(h: ReturnType<typeof harness>, tokens: number) {
  h.ctx.getContextUsage = () => ({
    tokens,
    contextWindow: 272000,
    percent: 90,
  });
}

describe("task-boundary controls, without context-size nudges", () => {
  it("does not notify or set a status hint at any context size without a boundary", () => {
    const h = harness();
    for (const tokens of [120000, 180000, 240000, 270000]) {
      usage(h, tokens);
      h.handlers.get("agent_settled")!({}, h.ctx);
    }
    expect(h.ctx.ui.notify).not.toHaveBeenCalled();
    expect(h.ctx.ui.setStatus).not.toHaveBeenCalled();
    expect(h.appendEntry).not.toHaveBeenCalled();
    expect(h.sendMessage).not.toHaveBeenCalled();
  });
  it("uses context only as a gate and adapts to small budgets", () => {
    const state = initialState("m");
    expect(canSuggest(119999, 200000, state)).toBe(false);
    expect(canSuggest(120000, 200000, state)).toBe(true);
    expect(effectiveMinimum(state, 100000)).toBe(60000);
    expect(canSuggest(null, 200000, state)).toBe(false);
    expect(canSuggest(NaN, 200000, state)).toBe(false);
  });
  it("persists boundary cooldowns and validates saved state", () => {
    const state = { ...initialState("m"), lastSuggestedAt: 130000 };
    expect(canSuggest(140000, 200000, state)).toBe(false);
    expect(canSuggest(150000, 200000, state)).toBe(true);
    expect(parseState(state, "m")).toEqual(state);
    expect(parseState(state, "other")).toBeUndefined();
    expect(parseState({ ...state, minimumTokens: -1 }, "m")).toBeUndefined();
  });
  it("respects snoozing and dismissal for actual checkpoints", async () => {
    const h = harness();
    usage(h, 130000);
    await h.command.handler("snooze", h.ctx);
    await h.command.handler("checkpoint implementation", h.ctx);
    expect(h.ctx.ui.notify).not.toHaveBeenCalledWith(
      expect.stringContaining("Implementation complete"),
      "info",
    );
    usage(h, 150000);
    h.handlers.get("agent_settled")!({}, h.ctx);
    expect(h.ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("Implementation complete"),
      "info",
    );
    await h.command.handler("dismiss", h.ctx);
    usage(h, 180000);
    await h.command.handler("checkpoint plan", h.ctx);
    expect(h.ctx.ui.notify).not.toHaveBeenCalledWith(
      expect.stringContaining("Plan agreed"),
      "info",
    );
  });
  it("restores dismissal from the active branch", async () => {
    const h = harness();
    h.ctx.sessionManager.getBranch = () =>
      [
        {
          type: "custom",
          customType: "context-coach-boundary-state",
          data: { ...initialState("openai/example"), dismissed: true },
        },
      ] as any;
    h.handlers.get("session_start")!({}, h.ctx);
    usage(h, 200000);
    await h.command.handler("checkpoint implementation", h.ctx);
    expect(h.ctx.ui.notify).not.toHaveBeenCalled();
  });
  it("customizes only the task-boundary minimum", async () => {
    const h = harness();
    await h.command.handler("minimum 90000", h.ctx);
    expect(h.appendEntry).toHaveBeenCalledWith(
      "context-coach-boundary-state",
      expect.objectContaining({ minimumTokens: 90000 }),
    );
    await h.command.handler("minimum -1", h.ctx);
    expect(h.appendEntry).toHaveBeenCalledOnce();
  });
});
