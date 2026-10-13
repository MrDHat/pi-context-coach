import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const manifest = JSON.parse(readFileSync("package.json", "utf8"));
assert.equal(manifest.name, "pi-context-coach");
assert(manifest.keywords.includes("pi-package"));
assert.deepEqual(manifest.pi.extensions, ["./src/index.ts"]);
assert(
  !manifest.dependencies,
  "Host packages must not be bundled as runtime dependencies",
);
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const [pack] = JSON.parse(
  execFileSync(npm, ["pack", "--dry-run", "--json", "--ignore-scripts"], {
    encoding: "utf8",
  }),
);
const files = pack.files.map((file) => file.path);
for (const path of [
  "package.json",
  "README.md",
  "LICENSE",
  "src/index.ts",
  "src/pricing.ts",
  "src/boundary-state.ts",
  "src/activity.ts",
  "src/polling.ts",
  "src/profile.ts",
  "src/onboarding.ts",
]) {
  assert(files.includes(path), `Missing package file: ${path}`);
}
for (const path of files) {
  assert(
    ["package.json", "README.md", "LICENSE"].includes(path) ||
      /^src\/[\w/-]+\.ts$/.test(path),
    `Unexpected package file: ${path}`,
  );
}
console.log(`Package contents verified (${files.length} files).`);
