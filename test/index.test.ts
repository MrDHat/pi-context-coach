import { describe, expect, it } from "vitest";
import { harness } from "./helpers.js";

describe("Context Coach registration", () => {
  it("registers one command without requesting a model turn", () => {
    const h = harness();
    expect(h.registerCommand).toHaveBeenCalledOnce();
    expect(h.registerCommand.mock.calls[0]![0]).toBe("context-coach");
    expect(h.sendMessage).not.toHaveBeenCalled();
  });
  it("reports unknown pricing honestly", async () => {
    const h = harness();
    await h.command.handler("audit", h.ctx);
    expect(h.ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("boundary unknown"),
      "info",
    );
  });
  it("does not require UI in headless mode", async () => {
    const h = harness();
    await h.command.handler("", { ...h.ctx, hasUI: false });
    expect(h.ctx.ui.notify).not.toHaveBeenCalled();
  });
});
