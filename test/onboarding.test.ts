import {
  existsSync,
  mkdtempSync,
  rmSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { onboard } from "../src/onboarding.js";
import { ProfileStore } from "../src/profile.js";
import { harness } from "./helpers.js";

const roots: string[] = [];
function setup() {
  const root = mkdtempSync(join(tmpdir(), "coach-onboard-test-"));
  roots.push(root);
  const h = harness(),
    store = new ProfileStore(root);
  h.ctx.cwd = root;
  h.ctx.ui.confirm = vi.fn(async () => true);
  let selection = 0;
  h.ctx.ui.select = vi.fn(async () =>
    selection++ === 0 ? "Personal — all projects" : "Keep current criteria",
  );
  return { h, store, root, path: store.path("personal", root) };
}
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

describe("onboarding walkthrough", () => {
  it("explains features, previews defaults, and saves only after confirmation", async () => {
    const { h, store, path } = setup();
    await expect(onboard(h.ctx, store)).resolves.toBe(true);
    expect(h.ctx.ui.select).toHaveBeenCalledTimes(6);
    expect(h.ctx.ui.confirm).toHaveBeenCalledTimes(2);
    expect(h.ctx.ui.confirm).toHaveBeenLastCalledWith(
      "Save this workflow guidance?",
      expect.stringContaining("Plan agreed: opinionated default only"),
    );
    expect(JSON.parse(readFileSync(path, "utf8"))).toEqual({
      version: 1,
      criteria: {},
    });
    expect(h.ctx.compact).not.toHaveBeenCalled();
    expect(h.sendMessage).not.toHaveBeenCalled();
  });
  it("saves user skill/check requirements as guidance", async () => {
    const { h, store, path } = setup();
    let selection = 0;
    h.ctx.ui.select = vi.fn(async () => {
      const step = selection++;
      return step === 0
        ? "Personal — all projects"
        : step === 3
          ? "Add or edit my criteria"
          : "Keep current criteria";
    });
    h.ctx.ui.input = vi.fn(
      async () =>
        "Use /skill:tdd; tests and typecheck pass; reviewer findings addressed.",
    );
    await onboard(h.ctx, store);
    expect(
      JSON.parse(readFileSync(path, "utf8")).criteria.implementation,
    ).toContain("/skill:tdd");
  });
  it("writes nothing if the walkthrough or final preview is cancelled", async () => {
    const { h, store, path } = setup();
    h.ctx.ui.confirm = vi.fn(async () => false);
    await expect(onboard(h.ctx, store)).resolves.toBe(false);
    expect(existsSync(path)).toBe(false);
    h.ctx.ui.confirm = vi
      .fn()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    await expect(onboard(h.ctx, store)).resolves.toBe(false);
    expect(existsSync(path)).toBe(false);
  });
  it("never offers a project write without trust", async () => {
    const { h, store } = setup();
    await onboard(h.ctx, store);
    expect(h.ctx.ui.select).toHaveBeenNthCalledWith(
      1,
      "Where should completion criteria be saved?",
      ["Personal — all projects"],
    );
  });
  it("rejects a session change during the walkthrough", async () => {
    const { h, store, path } = setup();
    let confirmation = 0;
    h.ctx.ui.confirm = vi.fn(async () => {
      if (++confirmation === 2)
        h.ctx.sessionManager.getSessionId = () => "new-session";
      return true;
    });
    await expect(onboard(h.ctx, store)).resolves.toBe(false);
    expect(existsSync(path)).toBe(false);
  });
  it("requires no UI in headless mode", async () => {
    const { h, store } = setup();
    await expect(onboard({ ...h.ctx, hasUI: false }, store)).resolves.toBe(
      false,
    );
    expect(h.ctx.ui.confirm).not.toHaveBeenCalled();
  });
  it("does not overwrite concurrent edits", async () => {
    const { h, store, path } = setup();
    let confirmation = 0;
    h.ctx.ui.confirm = vi.fn(async () => {
      if (++confirmation === 2) writeFileSync(path, "user edit");
      return true;
    });
    await expect(onboard(h.ctx, store)).rejects.toThrow("changed");
    expect(readFileSync(path, "utf8")).toBe("user edit");
  });
});
