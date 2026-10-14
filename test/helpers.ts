import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import { vi } from "vitest";
import contextCoach from "../src/index.js";

export function harness() {
  const handlers = new Map<string, (event: any, ctx: any) => any>();
  const registerCommand = vi.fn<ExtensionAPI["registerCommand"]>();
  const registerTool = vi.fn<ExtensionAPI["registerTool"]>();
  const appendEntry = vi.fn();
  const sendMessage = vi.fn();
  const pi = {
    registerCommand,
    registerTool,
    on: (event: string, handler: (event: any, ctx: any) => any) => {
      handlers.set(event, handler);
      return () => handlers.delete(event);
    },
    getSettings: () => ({}),
    appendEntry,
    sendMessage,
  } as unknown as ExtensionAPI;
  contextCoach(pi);
  const ctx = {
    hasUI: true,
    cwd: "/context-coach-test-project-not-present",
    isProjectTrusted: () => false,
    model: model(),
    ui: {
      notify: vi.fn(),
      setStatus: vi.fn(),
      select: vi.fn(),
      confirm: vi.fn(),
      input: vi.fn(),
    },
    getContextUsage: () => ({
      tokens: 1000,
      contextWindow: 272000,
      percent: 1,
    }),
    sessionManager: {
      getSessionId: () => "session-1",
      getBranch: () => [],
      getLeafId: () => "leaf-1",
    },
    isIdle: () => true,
    hasPendingMessages: () => false,
    waitForIdle: vi.fn(async () => {}),
    compact: vi.fn(),
  } as unknown as ExtensionCommandContext;
  const command = registerCommand.mock.calls[0]![1];
  return {
    pi,
    ctx,
    command,
    handlers,
    appendEntry,
    sendMessage,
    registerCommand,
    registerTool,
  };
}

export function model() {
  return {
    provider: "openai",
    id: "example",
    contextWindow: 272000,
    cost: { input: 2, output: 10, cacheRead: 0.1, cacheWrite: 0 },
  };
}
