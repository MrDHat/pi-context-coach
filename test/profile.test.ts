import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  emptyProfile,
  parseProfile,
  ProfileStore,
  workflowGuidance,
} from "../src/profile.js";
import { harness } from "./helpers.js";

const roots: string[] = [];
function setup() {
  const root = mkdtempSync(join(tmpdir(), "coach-profile-test-"));
  roots.push(root);
  const cwd = join(root, "project"),
    agent = join(root, "agent");
  mkdirSync(join(cwd, ".pi"), { recursive: true });
  mkdirSync(agent);
  return { cwd, agent, store: new ProfileStore(agent) };
}
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

describe("workflow profiles", () => {
  it("validates version, phases, and bounded criteria", () => {
    expect(
      parseProfile({ version: 1, criteria: { implementation: " TDD done " } })
        .criteria.implementation,
    ).toBe("TDD done");
    for (const value of [
      { version: 2, criteria: {} },
      { version: 1, criteria: { unknown: "x" } },
      { version: 1, criteria: { plan: "x".repeat(801) } },
    ])
      expect(() => parseProfile(value)).toThrow();
  });
  it("merges trusted project criteria over personal and supports explicit defaults", () => {
    const { store, cwd } = setup();
    store.save(
      store.path("personal", cwd),
      {
        version: 1,
        criteria: { implementation: "personal TDD", plan: "planning skill" },
      },
      undefined,
    );
    store.save(
      store.path("project", cwd),
      { version: 1, criteria: { implementation: "project TDD", plan: "" } },
      undefined,
    );
    expect(store.load(cwd, true).profile.criteria).toEqual({
      implementation: "project TDD",
      plan: "",
    });
    expect(store.load(cwd, false).profile.criteria).toEqual({
      implementation: "personal TDD",
      plan: "planning skill",
    });
  });
  it("ignores invalid files and refuses stale saves", () => {
    const { store, cwd } = setup();
    const path = store.path("personal", cwd);
    writeFileSync(path, "invalid");
    expect(store.load(cwd, true).issues).toHaveLength(1);
    expect(() => store.save(path, emptyProfile(), undefined)).toThrow(
      "changed",
    );
    expect(readFileSync(path, "utf8")).toBe("invalid");
  });
  it("keeps custom criteria subordinate to milestones and user approval", () => {
    expect(workflowGuidance(emptyProfile())).toBeUndefined();
    const text = workflowGuidance({
      version: 1,
      criteria: {
        plan: "planning skill done",
        implementation: "TDD skill completed",
      },
    })!;
    expect(text).toContain("additional requirements");
    expect(text).toContain("explicit user checkpoint");
    expect(text).toContain("do not claim it ran");
    expect(text).toContain("TDD skill completed");
  });
  it("adds stable prompt guidance and requires an attestation for custom criteria", async () => {
    const { store, cwd, agent } = setup();
    store.save(
      store.path("personal", cwd),
      { version: 1, criteria: { implementation: "TDD skill complete" } },
      undefined,
    );
    vi.stubEnv("PI_CODING_AGENT_DIR", agent);
    const h = harness();
    h.ctx.cwd = cwd;
    const event = {
      systemPromptOptions: { sections: {} as Record<string, string> },
    };
    h.handlers.get("before_agent_start")!(event, h.ctx);
    expect(event.systemPromptOptions.sections.context_coach_workflow).toContain(
      "TDD skill complete",
    );
    const tool = h.registerTool.mock.calls[0]![0];
    await expect(
      tool.execute(
        "id",
        { phase: "implementation", evidence: "code written" },
        undefined,
        undefined,
        h.ctx as any,
      ),
    ).rejects.toThrow("criteriaSatisfied");
    await expect(
      tool.execute(
        "id",
        {
          phase: "implementation",
          evidence: "TDD skill completed and checks passed",
          criteriaSatisfied: true,
        },
        undefined,
        undefined,
        h.ctx as any,
      ),
    ).resolves.toBeDefined();
    expect(h.sendMessage).not.toHaveBeenCalled();
  });
});
