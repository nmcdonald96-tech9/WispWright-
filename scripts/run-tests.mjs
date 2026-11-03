import { spawnSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const testFiles = [];

function collectTests(directory) {
  for (const entry of readdirSync(directory)) {
    const fullPath = join(directory, entry);
    const stats = statSync(fullPath);

    if (stats.isDirectory()) {
      collectTests(fullPath);
      continue;
    }

    if (
      entry.endsWith(".test.ts") ||
      entry.endsWith(".test.tsx") ||
      entry.endsWith(".spec.ts") ||
      entry.endsWith(".spec.tsx")
    ) {
      testFiles.push(resolve(fullPath));
    }
  }
}

collectTests(resolve("src"));
testFiles.sort();

if (testFiles.length === 0) {
  console.error("No test files were found.");
  process.exit(1);
}

console.log(`Running ${testFiles.length} test files...`);

const tsxCli = resolve(
  "node_modules",
  "tsx",
  "dist",
  "cli.mjs"
);

const result = spawnSync(
  process.execPath,
  [tsxCli, "--test", ...testFiles],
  {
    stdio: "inherit",
    cwd: process.cwd(),
    env: process.env
  }
);

if (result.error) {
  console.error("Unable to start the test runner:");
  console.error(result.error);
  process.exit(1);
}

process.exit(result.status ?? 1);
