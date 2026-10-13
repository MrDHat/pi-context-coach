import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import contextCoach from "../src/index.js";

type CommandOptions = Parameters<ExtensionAPI["registerCommand"]>[1];
type CommandContext = Parameters<CommandOptions["handler"]>[1];

function registerExtension() {
  const registerCommand = vi.fn<ExtensionAPI["registerCommand"]>();
  // Only this API is needed; accessing another API causes the test to fail.
  contextCoach({ registerCommand } as unknown as ExtensionAPI);
  const command = registerCommand.mock.calls[0]?.[1];
  if (!command) throw new Error("Context Coach did not register its command");
  return { registerCommand, command };
}

describe("Context Coach scaffold", () => {
  it("registers one command without starting background work", () => {
    const { registerCommand } = registerExtension();
    expect(registerCommand).toHaveBeenCalledExactlyOnceWith(
      "context-coach",
      expect.objectContaining({ description: "Show Context Coach status" }),
    );
  });

  it("reports scaffold status through the UI", async () => {
    const { command } = registerExtension();
    const notify = vi.fn();
    const ctx = { hasUI: true, ui: { notify } } as unknown as CommandContext;
    await command.handler("", ctx);
    expect(notify).toHaveBeenCalledExactlyOnceWith(
      "Context Coach is loaded. Coaching features are not enabled in this scaffold.",
      "info",
    );
  });

  it("does not require UI or print unsolicited output in headless mode", async () => {
    const { command } = registerExtension();
    const ctx = { hasUI: false } as CommandContext;
    await expect(command.handler("", ctx)).resolves.toBeUndefined();
  });
});
