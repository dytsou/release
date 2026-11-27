import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), "registry-publish.sh");

// Runs the publish script with fake npm/pnpm that only log their arguments.
function publish({ kind = "npmjs", token = "", oidc = false, version = "1.0.0" } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), "registry-publish-"));
  try {
    const bin = path.join(dir, "bin");
    const log = path.join(dir, "calls.log");
    const output = path.join(dir, "github-output");
    mkdirSync(bin);
    writeFileSync(output, "");
    const fake = (name, body) => {
      const file = path.join(bin, name);
      writeFileSync(file, `#!/usr/bin/env bash\necho "${name} $*" >> "${log}"\n${body}\n`);
      chmodSync(file, 0o755);
    };
    fake("npm", '[[ "$1" == "view" ]] && exit 1\nexit 0');
    fake("pnpm", "exit 0");
    const env = {
      PATH: `${bin}:${path.dirname(process.execPath)}:/usr/bin:/bin`,
      HOME: dir,
      GITHUB_OUTPUT: output,
      INPUT_REGISTRY_KIND: kind,
      INPUT_PACKAGE_NAME: "immerslides",
      INPUT_PACKAGE_VERSION: version,
      INPUT_SKIP_IF_EXISTS: "true",
      INPUT_INSTALL_DEPS: "false",
      INPUT_VERIFY_PACK: "false",
      NODE_AUTH_TOKEN: token,
    };
    if (oidc) env.ACTIONS_ID_TOKEN_REQUEST_URL = "https://oidc.example.invalid/token";
    const result = spawnSync("/bin/bash", [script], { env, encoding: "utf8" });
    const calls = existsSync(log) ? readFileSync(log, "utf8") : "";
    return { status: result.status, stderr: result.stderr, calls };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("npmjs with trusted publishing publishes without writing a token", () => {
  const result = publish({ oidc: true });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.calls, /^pnpm publish .*--tag latest/m);
  assert.doesNotMatch(result.calls, /_authToken/, "no token may be written for OIDC");
});

test("npmjs with a token writes the token and publishes", () => {
  const result = publish({ token: "npm_example_token" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.calls, /npm config set \/\/registry\.npmjs\.org\/:_authToken/);
  assert.match(result.calls, /^pnpm publish /m);
});

test("npmjs without a token and without OIDC fails with a clear message", () => {
  const result = publish({});
  assert.equal(result.status, 1);
  assert.match(result.stderr, /id-token: write/);
  assert.doesNotMatch(result.calls, /^pnpm publish /m);
});

test("GitHub Packages still requires a token", () => {
  const result = publish({ kind: "github-packages", oidc: true });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /token is required for github-packages/);
});
