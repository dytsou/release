import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const actionFiles = [
  "action.yml",
  "bump-patch-version/action.yml",
  "npm-publish/action.yml",
  "github-packages/action.yml",
  "github/action.yml",
  "package-json/action.yml",
  "version-check/action.yml",
];

test("composite actions reference existing lib files", () => {
  let checked = 0;
  for (const rel of actionFiles) {
    const text = readFileSync(join(root, rel), "utf8");
    const refs = [
      ...text.matchAll(
        /\$\{\{\s*github\.action_path\s*\}\}(\/(?:\.\.\/)?lib\/[^\s"']+)/g,
      ),
    ].map((m) => m[1]);
    assert.ok(refs.length > 0, `${rel} has no github.action_path lib refs`);
    const actionDir = join(root, dirname(rel));
    for (const ref of refs) {
      const resolved = join(actionDir, ref);
      assert.ok(existsSync(resolved), `${rel} → missing ${resolved}`);
      checked += 1;
    }
  }
  assert.ok(checked >= 10, `expected many lib refs, got ${checked}`);
});
