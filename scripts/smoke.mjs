import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { createInterface } from "node:readline";
import assert from "node:assert/strict";

const root = mkdtempSync(join(tmpdir(), "context-coach-smoke-"));
const cwd = join(root, "project");
mkdirSync(cwd);
const entry = resolve(process.argv[2] ?? "src/index.ts");
const cli = resolve(
  "node_modules/@earendil-works/pi-coding-agent/dist/bundle/cli.js",
);
const child = spawn(
  process.execPath,
  [
    cli,
    "--mode",
    "rpc",
    "--no-session",
    "--no-extensions",
    "--no-mcp",
    "-e",
    entry,
  ],
  {
    cwd,
    env: { ...process.env, PI_CODING_AGENT_DIR: join(root, "agent") },
    stdio: ["pipe", "pipe", "pipe"],
  },
);
// Never issue a prompt/model request; only inspect registered commands.
const lines = createInterface({ input: child.stdout });
let stderr = "";
child.stderr.on("data", (data) => {
  stderr = (stderr + data.toString()).slice(-4096);
});
try {
  await new Promise((accept, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Pi load timed out. ${stderr}`)),
      30000,
    );
    const finish = (error) => {
      clearTimeout(timer);
      if (error) reject(error);
      else accept();
    };
    child.once("error", finish);
    child.once("exit", (code) =>
      finish(new Error(`Pi exited before registration (${code}). ${stderr}`)),
    );
    lines.on("line", (line) => {
      let response;
      try {
        response = JSON.parse(line);
      } catch {
        return;
      }
      if (response.id !== "context-coach-smoke") return;
      try {
        assert.equal(response.success, true, JSON.stringify(response));
        assert(
          response.data.commands.some(
            (command) => command.name === "context-coach",
          ),
        );
        finish();
      } catch (error) {
        finish(error);
      }
    });
    child.stdin.write(
      JSON.stringify({ id: "context-coach-smoke", type: "get_commands" }) +
        "\n",
    );
  });
  console.log("Pi load smoke test passed; no model request sent.");
} finally {
  lines.close();
  child.kill("SIGTERM");
  if (child.exitCode === null && child.signalCode === null) {
    await new Promise((accept) => {
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
      }, 5000);
      child.once("exit", () => {
        clearTimeout(timer);
        accept();
      });
    });
  }
  rmSync(root, { recursive: true, force: true });
}
