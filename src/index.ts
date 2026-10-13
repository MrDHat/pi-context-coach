import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/** Register the extension without changing tools, context, or user settings. */
export default function contextCoach(pi: ExtensionAPI): void {
  pi.registerCommand("context-coach", {
    description: "Show Context Coach status",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) return;

      ctx.ui.notify(
        "Context Coach is loaded. Coaching features are not enabled in this scaffold.",
        "info",
      );
    },
  });
}
