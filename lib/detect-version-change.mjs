#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  appendGithubOutput,
  assertSafeRelativePath,
  assertSemverVersion,
} from "./validate.mjs";

const SHA = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i;
const ZERO_SHA = /^0+$/;

// git is run by absolute path, so no PATH lookup can pick a different binary.
export const GIT = "/usr/bin/git";
// Environment PATH for the git child process: root-owned system directories only.
export const TRUSTED_PATH = "/usr/bin:/bin:/usr/sbin:/sbin";

/**
 * Decide whether a run should release.
 *
 * A manual run always releases. A push releases only when the package version
 * differs from the version at the base of the push. A missing base (new branch,
 * first commit, history not fetched) counts as a change.
 */
export function detectVersionChange({
  eventName = "",
  currentVersion,
  previousVersion = null,
} = {}) {
  const current = assertSemverVersion(String(currentVersion ?? ""));
  if (eventName === "workflow_dispatch") {
    return { release: true, reason: `manual run for ${current}` };
  }
  if (previousVersion === null) {
    return { release: true, reason: `no previous version; releasing ${current}` };
  }
  if (previousVersion === current) {
    return { release: false, reason: `version ${current} is unchanged` };
  }
  return {
    release: true,
    reason: `version changed from ${previousVersion} to ${current}`,
  };
}

/**
 * Read the package version at the commit `before` (the base of the push).
 * Returns null when there is no usable base or the file is missing there.
 */
export function readPreviousVersion({
  before = "",
  packageJsonPath = "package.json",
  cwd = process.cwd(),
} = {}) {
  const base = String(before ?? "").trim();
  if (!base || ZERO_SHA.test(base)) return null;
  if (!SHA.test(base)) {
    throw new Error(`before must be a commit SHA (got: ${base})`);
  }
  const rel = assertSafeRelativePath(packageJsonPath, "package-json-path").replaceAll(
    "\\",
    "/",
  );
  if (!fs.existsSync(GIT)) {
    throw new Error(`git not found at ${GIT}`);
  }
  let text;
  try {
    // `<sha>:./path` resolves relative to cwd, so a working-directory works too.
    text = execFileSync(GIT, ["show", `${base}:./${rel}`], {
      cwd,
      encoding: "utf8",
      env: { ...process.env, PATH: TRUSTED_PATH },
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return null;
  }
  const version = JSON.parse(text).version;
  return typeof version === "string" ? version : null;
}

function main() {
  const packageJsonPath = process.env.INPUT_PACKAGE_JSON_PATH || "package.json";
  const abs = path.resolve(
    process.cwd(),
    assertSafeRelativePath(packageJsonPath, "package-json-path"),
  );
  const currentVersion = JSON.parse(fs.readFileSync(abs, "utf8")).version;
  const previousVersion = readPreviousVersion({
    before: process.env.INPUT_BEFORE || "",
    packageJsonPath,
  });
  const result = detectVersionChange({
    eventName: process.env.GITHUB_EVENT_NAME || "",
    currentVersion,
    previousVersion,
  });

  const out = process.env.GITHUB_OUTPUT;
  if (out) appendGithubOutput(out, "release", String(result.release));
  console.log(`${result.release ? "Releasing" : "Skipping release"}: ${result.reason}`);
}

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    main();
  } catch (err) {
    console.error(`::error::${err.message}`);
    process.exit(1);
  }
}
