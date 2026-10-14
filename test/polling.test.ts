import { describe, expect, it } from "vitest";
import {
  PollingTracker,
  pollingSnapshot,
  pollingTarget,
} from "../src/polling.js";
import { harness } from "./helpers.js";

const pending = JSON.stringify({ status: "in_progress", conclusion: null });

describe("polling detection", () => {
  it("recognizes explicit JSON checks but not watchers, scripts, or unknown tools", () => {
    expect(
      pollingTarget("bash", {
        command: "gh run view 42 --json status,conclusion",
      }),
    ).toBe("run:42");
    for (const command of [
      "gh run watch 42 --exit-status",
      "sleep 10; gh run view 42 --json status,conclusion",
      "gh run view 42",
      "gh pr checks --watch",
    ]) {
      expect(pollingTarget("bash", { command })).toBeUndefined();
    }
    expect(
      pollingTarget("custom", {
        command: "gh run view 42 --json status,conclusion",
      }),
    ).toBeUndefined();
  });
  it("ignores completion, failures, empty output, and malformed JSON", () => {
    expect(pollingSnapshot("run:42", pending)).toBeDefined();
    for (const text of [
      "",
      "not json",
      JSON.stringify({ status: "completed", conclusion: "success" }),
      "x".repeat(9000),
    ]) {
      expect(pollingSnapshot("run:42", text)).toBeUndefined();
    }
    expect(
      pollingSnapshot(
        "pr:1",
        JSON.stringify([{ name: "tests", state: "FAILURE" }]),
      ),
    ).toBeUndefined();
  });
  it("normalizes PR check order but resets when state changes", () => {
    const rows = [
      { name: "a", state: "PENDING" },
      { name: "b", state: "SUCCESS" },
    ];
    expect(pollingSnapshot("pr:1", JSON.stringify(rows))).toEqual(
      pollingSnapshot("pr:1", JSON.stringify([...rows].reverse())),
    );
    const t = new PollingTracker();
    const s = pollingSnapshot("run:42", pending)!;
    expect(t.record(s.target, s, 0)).toBe(false);
    expect(t.record(s.target, s, 1)).toBe(false);
    expect(t.record(s.target, s, 2)).toBe(true);
    expect(t.record(s.target, s, 3)).toBe(false);
    const changed = pollingSnapshot(
      "run:42",
      JSON.stringify({ status: "queued", conclusion: null }),
    )!;
    expect(t.record(changed.target, changed, 4)).toBe(false);
    expect(t.record(changed.target, changed, 5)).toBe(false);
    expect(t.record(changed.target, changed, 6)).toBe(true);
  });
  it("separates targets and expires stale sequences", () => {
    const t = new PollingTracker();
    const s = pollingSnapshot("run:42", pending)!;
    t.record(s.target, s, 0);
    t.record(s.target, s, 1);
    expect(t.record(s.target, s, 600002)).toBe(false);
    expect(t.record("run:43", { ...s, target: "run:43" }, 600003)).toBe(false);
    t.record(s.target, undefined);
    expect(t.record(s.target, s, 600004)).toBe(false);
  });
  it("injects one bounded next-turn hint without requesting another turn", () => {
    const h = harness();
    const event = {
      toolCallId: "check",
      toolName: "bash",
      input: { command: "gh run view 42 --json status,conclusion" },
      isError: false,
      content: [],
      structuredContent: { output: pending, exit_code: 0 },
    };
    for (let i = 0; i < 4; i++) h.handlers.get("tool_result")!(event, h.ctx);
    expect(h.sendMessage).toHaveBeenCalledOnce();
    expect(h.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining("bounded polling script"),
        display: false,
      }),
      { triggerTurn: false },
    );
    expect(h.ctx.compact).not.toHaveBeenCalled();
  });
  it("supports gh pending exit code 8 and explicit opt-out", async () => {
    const h = harness();
    const event = {
      toolCallId: "check",
      toolName: "bash",
      input: { command: "gh pr checks 1 --json name,state" },
      isError: true,
      content: [],
      structuredContent: {
        output: JSON.stringify([{ name: "tests", state: "PENDING" }]),
        exit_code: 8,
      },
    };
    for (let i = 0; i < 3; i++) h.handlers.get("tool_result")!(event, h.ctx);
    expect(h.sendMessage).toHaveBeenCalledOnce();
    await h.command.handler("polling off", h.ctx);
    for (let i = 0; i < 3; i++) h.handlers.get("tool_result")!(event, h.ctx);
    expect(h.sendMessage).toHaveBeenCalledOnce();
  });
});
